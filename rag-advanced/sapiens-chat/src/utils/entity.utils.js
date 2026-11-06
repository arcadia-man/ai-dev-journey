// src/utils/entity.utils.js
//
// Entity extraction using the `compromise` NLP library.
//
// Extracts people, places, and organisations from a chunk of text and returns
// them as a deduplicated, normalised list.  These become Entity nodes in the
// Neo4j graph so that chunks discussing the same person/place are linked
// across distant sections of the book (Feature 6 — entity-aware metadata).

const nlp = require("compromise");

/**
 * Extract named entities from text.
 *
 * @param {string} text
 * @returns {{ people: string[], places: string[], orgs: string[], all: string[] }}
 */
function extractEntities(text) {
  if (!text || typeof text !== "string") {
    return { people: [], places: [], orgs: [], all: [] };
  }

  const doc = nlp(text);

  const people = dedup(doc.people().out("array").map(clean));
  const places = dedup(doc.places().out("array").map(clean));
  const orgs   = dedup(doc.organizations ? doc.organizations().out("array").map(clean) : []);

  // "all" is used when we want to create Entity nodes without caring about type
  const all = dedup([...people, ...places, ...orgs]);

  return { people, places, orgs, all };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clean(str) {
  return str.replace(/[.,:;!?'"()\[\]{}]/g, "").trim();
}

function dedup(arr) {
  return [...new Set(arr.filter(Boolean))];
}

module.exports = { extractEntities };
