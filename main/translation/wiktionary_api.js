/* exported fetchWiktionaryDefinitionsWithErrorHandling */

// Only English Wiktionary serves the REST definition endpoint
// (other subdomains answer 501), so definitions are always in English.
const WIKTIONARY_DEFINITION_ENDPOINT = "https://en.wiktionary.org/api/rest_v1/page/definition/";
const WIKTIONARY_PAGE_URL = "https://en.wiktionary.org/wiki/";
const WIKTIONARY_SOURCE_LANGUAGE = "fi";
const MAX_DEFINITIONS_PER_WORD = 3;

/** @type {Record<string, string>} */
const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * Turn a Wiktionary definition HTML fragment into plain text.
 * Runs in the service worker, where DOMParser is unavailable.
 * @param {string} html
 * @returns {string}
 */
function stripWiktionaryHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => HTML_ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+([),.;:])/g, "$1")
    .trim();
}

/**
 * Extract Finnish definitions from a Wiktionary REST definition response.
 * @param {Record<string, Array<{partOfSpeech: string, definitions: Array<{definition: string}>}>>} data
 * @returns {WiktionaryDefinition[]}
 */
function parseWiktionaryDefinitions(data) {
  const entries = (data && data[WIKTIONARY_SOURCE_LANGUAGE]) || [];

  /** @type {WiktionaryDefinition[]} */
  const definitions = [];
  for (const entry of entries) {
    for (const def of entry.definitions || []) {
      if (definitions.length >= MAX_DEFINITIONS_PER_WORD) {
        return definitions;
      }
      const text = stripWiktionaryHtml(def.definition || "");
      if (text) {
        definitions.push({ partOfSpeech: entry.partOfSpeech || "", text });
      }
    }
  }
  return definitions;
}

/**
 * @param {string} word
 * @returns {Promise<WiktionaryDefinition[]>} empty when the word has no Finnish entry
 */
async function fetchWiktionaryDefinitionsForExactWord(word) {
  const response = await fetch(
    `${WIKTIONARY_DEFINITION_ENDPOINT}${encodeURIComponent(word)}`,
    { headers: { Accept: "application/json" } },
  );
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Wiktionary error: ${response.status}`);
  }
  return parseWiktionaryDefinitions(await response.json());
}

/**
 * Look up Finnish words on Wiktionary.
 * Words are tried lowercased first (subtitle lines start with capitals),
 * then as written to still catch proper nouns.
 * @param {string[]} words
 * @returns {Promise<[true, WiktionaryLookupResult[]] | [false, string]>}
 */
async function fetchWiktionaryDefinitionsWithErrorHandling(words) {
  try {
    const results = await Promise.all(words.map(async (word) => {
      const lowercased = word.toLowerCase();
      let lookedUpWord = lowercased;
      let definitions = await fetchWiktionaryDefinitionsForExactWord(lowercased);
      if (definitions.length === 0 && word !== lowercased) {
        lookedUpWord = word;
        definitions = await fetchWiktionaryDefinitionsForExactWord(word);
      }
      return {
        word,
        definitions,
        url: `${WIKTIONARY_PAGE_URL}${encodeURIComponent(lookedUpWord)}#Finnish`,
      };
    }));
    return [true, results];
  } catch (error) {
    console.error("FinnishStreamingDualSubExtension: Error fetching Wiktionary definitions:", error);
    return [false, error.message || String(error)];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    stripWiktionaryHtml,
    parseWiktionaryDefinitions,
    fetchWiktionaryDefinitionsWithErrorHandling,
  };
}
