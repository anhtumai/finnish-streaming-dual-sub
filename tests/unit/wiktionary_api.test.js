/**
 * Wiktionary lookup tests
 */

const {
    stripWiktionaryHtml,
    parseWiktionaryDefinitions,
    fetchWiktionaryDefinitionsWithErrorHandling,
} = require('../../main/translation/wiktionary_api.js');

function jsonResponse(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    };
}

describe('stripWiktionaryHtml', () => {
    test('removes tags, decodes entities and tidies whitespace', () => {
        const html = '<span class="usage-label-sense"></span> <a href="/wiki/house">house</a> '
            + '<span>(</span><span>building &amp; home</span><span>)</span>';
        expect(stripWiktionaryHtml(html)).toBe('house (building & home)');
    });

    test('keeps "form of" definitions readable', () => {
        const html = '<span class="form-of-definition"><a>first-person</a> <a>singular</a> '
            + 'of <span><i lang="fi"><a href="/wiki/olla#Finnish">olla</a></i></span></span>';
        expect(stripWiktionaryHtml(html)).toBe('first-person singular of olla');
    });
});

describe('parseWiktionaryDefinitions', () => {
    test('only returns Finnish entries, capped at 3 definitions', () => {
        const data = {
            en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'english sense' }] }],
            fi: [
                {
                    partOfSpeech: 'Noun',
                    definitions: [{ definition: 'house' }, { definition: '' }, { definition: 'building' }],
                },
                {
                    partOfSpeech: 'Verb',
                    definitions: [{ definition: 'to build' }, { definition: 'to construct' }],
                },
            ],
        };
        expect(parseWiktionaryDefinitions(data)).toEqual([
            { partOfSpeech: 'Noun', text: 'house' },
            { partOfSpeech: 'Noun', text: 'building' },
            { partOfSpeech: 'Verb', text: 'to build' },
        ]);
    });

    test('returns empty array when there is no Finnish entry', () => {
        expect(parseWiktionaryDefinitions({ en: [] })).toEqual([]);
        expect(parseWiktionaryDefinitions(null)).toEqual([]);
    });
});

describe('fetchWiktionaryDefinitionsWithErrorHandling', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('looks up lowercased word and falls back to the original casing', async () => {
        global.fetch = jest.fn(async (url) => {
            if (url.endsWith('/helsinki')) {
                return jsonResponse(404, {});
            }
            return jsonResponse(200, {
                fi: [{ partOfSpeech: 'Proper noun', definitions: [{ definition: 'capital of Finland' }] }],
            });
        });

        const [ok, results] = await fetchWiktionaryDefinitionsWithErrorHandling(['Helsinki']);

        expect(ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(results).toEqual([{
            word: 'Helsinki',
            definitions: [{ partOfSpeech: 'Proper noun', text: 'capital of Finland' }],
            url: 'https://en.wiktionary.org/wiki/Helsinki#Finnish',
        }]);
    });

    test('returns empty definitions for unknown words', async () => {
        global.fetch = jest.fn(async () => jsonResponse(404, {}));

        const [ok, results] = await fetchWiktionaryDefinitionsWithErrorHandling(['xyz']);

        expect(ok).toBe(true);
        expect(results[0].definitions).toEqual([]);
    });

    test('reports server errors', async () => {
        global.fetch = jest.fn(async () => jsonResponse(503, {}));

        const [ok, message] = await fetchWiktionaryDefinitionsWithErrorHandling(['talo']);

        expect(ok).toBe(false);
        expect(message).toBe('Wiktionary error: 503');
    });
});
