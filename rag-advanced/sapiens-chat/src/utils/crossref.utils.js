// src/utils/crossref.utils.js
//
// Cross-reference detection (Feature 5).
//
// Detects phrases like:
//   "see Chapter 4"
//   "as discussed in Part 2"
//   "see page 87"
//   "as mentioned above / below"
//   "refer to Chapter 12"
//
// Returns structured references that the repository can persist as
// (:Chunk)-[:REFERENCES]->(:Chapter|:Section) edges in the graph.
//
// We use simple string matching via the `natural` WordTokenizer rather than
// hand-rolled regex chains so the logic stays readable and testable.

const natural = require("natural");

const tokenizer = new natural.WordTokenizer();

// Patterns expressed as plain objects — easier to read than a wall of regex
const CHAPTER_REF  = /\bchapter\s+(\d+)\b/gi;
const PART_REF     = /\bpart\s+(\d+)\b/gi;
const PAGE_REF     = /\bpage[s]?\s+(\d+(?:[-–]\d+)?)\b/gi;
const ABOVE_BELOW  = /\bas\s+(?:mentioned|discussed|noted|described|shown)\s+(above|below|earlier|later|previously)\b/gi;
const SEE_REFER    = /\b(?:see|refer\s+to|as\s+in)\s+(chapter|part|section|page)\s+(\d+)\b/gi;

/**
 * Detect cross-references in a chunk of text.
 *
 * @param {string} text
 * @returns {Array<{ type: string, target: string, raw: string }>}
 */
function detectCrossReferences(text) {
  if (!text || typeof text !== "string") return [];

  const refs = [];

  for (const match of text.matchAll(CHAPTER_REF)) {
    refs.push({ type: "chapter", target: match[1], raw: match[0] });
  }

  for (const match of text.matchAll(PART_REF)) {
    refs.push({ type: "part", target: match[1], raw: match[0] });
  }

  for (const match of text.matchAll(PAGE_REF)) {
    refs.push({ type: "page", target: match[1], raw: match[0] });
  }

  for (const match of text.matchAll(ABOVE_BELOW)) {
    refs.push({ type: "relative", target: match[1], raw: match[0] });
  }

  for (const match of text.matchAll(SEE_REFER)) {
    refs.push({ type: match[1].toLowerCase(), target: match[2], raw: match[0] });
  }

  // Deduplicate by (type, target)
  const seen = new Set();
  return refs.filter(({ type, target }) => {
    const key = `${type}:${target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { detectCrossReferences };
