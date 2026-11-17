// src/services/sapiens.service.js
//
// Retrieval-Augmented Generation pipeline for the Sapiens book.
//
// Query-time flow:
//
//   1. Embed the query with conversation history (contextual query)
//   2. Hybrid retrieval  — vector + BM25 over child chunks, return parent text
//   3. Multi-hop         — follow cross-references and entity co-mentions
//   4. Deduplication     — drop sections already covered by direct hits
//   5. Context assembly  — build a ranked, page-sorted context window
//   6. Answer generation — LLM with strict grounding prompt
//   7. Verification      — check evidence sufficiency before returning
//
// Each step maps to one or more of the 10 advanced RAG features.

const aiService          = require("../ai/ai.service");
const documentRepository = require("../repositories/document.repository");
const logger             = require("../utils/logger");

// How many direct hits to retrieve
const TOP_K = 6;
// How many multi-hop neighbours to add
const MAX_HOPS = 3;
// Minimum hybrid score to include a direct hit (filters near-zero matches)
const MIN_SCORE_THRESHOLD = 0.05;

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Answer a question about the Sapiens book using the full RAG pipeline.
 *
 * @param {string} question
 * @param {Array<{question:string, answer:string}>} history
 * @returns {Promise<ChatResult>}
 */
async function chat(question, history = []) {
  const conversation = history
    .map((t) => `User: ${t.question}\nAssistant: ${t.answer}`)
    .join("\n");

  // ── Step 1: Contextual query embedding ────────────────────────────────────
  // Embed the full conversation + current question together so follow-ups
  // resolve correctly ("What did you mean earlier?" still hits the right section)
  const retrievalText = [conversation, `User: ${question}`]
    .filter(Boolean)
    .join("\n");

  logger.info("Generating query embedding", { question });
  const queryEmbedding = await aiService.generateEmbedding(retrievalText);

  // ── Step 2: Hybrid retrieval (vector + BM25) ──────────────────────────────
  // Returns parent-section content as the context window (Feature 3)
  // Each result carries vectorScore, bm25Score, and combined hybrid score
  logger.info("Running hybrid retrieval", { topK: TOP_K });
  const directHits = await documentRepository.findSimilarChunks(
    queryEmbedding,
    retrievalText,   // raw text for BM25 tokenisation
    TOP_K,
    "sapiens"
  );

  if (directHits.length === 0) {
    return _noContextResponse();
  }

  // Drop hits that scored too low across both signals
  const qualifiedHits = directHits.filter((c) => c.score >= MIN_SCORE_THRESHOLD);
  if (qualifiedHits.length === 0) {
    return _noContextResponse();
  }

  logger.info("Hybrid retrieval complete", {
    hits: qualifiedHits.map((c) => ({
      section:  c.sectionTitle,
      chapter:  c.chapterTitle,
      pages:    `${c.pageStart}–${c.pageEnd}`,
      hybrid:   c.score.toFixed(3),
      vector:   c.vectorScore.toFixed(3),
      bm25:     c.bm25Score.toFixed(3),
    })),
  });

  // ── Step 3: Multi-hop retrieval ───────────────────────────────────────────
  // Follow [:REFERENCES] (cross-refs) and shared [:MENTIONS] (entity links)
  // from the top sections to pull in related evidence (Feature 9)
  const seedSectionIds = [...new Set(qualifiedHits.map((c) => c.sectionId))];
  let hopSections = [];

  try {
    const candidates = await documentRepository.findRelatedSections(
      seedSectionIds,
      "sapiens"
    );
    // Keep only the top MAX_HOPS hops by section id (already deduplicated by repo)
    hopSections = candidates.slice(0, MAX_HOPS);
    if (hopSections.length) {
      logger.info("Multi-hop sections found", {
        hops: hopSections.map((s) => ({
          section: s.sectionTitle,
          chapter: s.chapterTitle,
        })),
      });
    }
  } catch (err) {
    // Multi-hop is additive — a failure here should not break the main answer
    logger.warn("Multi-hop retrieval failed, continuing without it", {
      error: err.message,
    });
  }

  // ── Step 4: Deduplicate + merge ───────────────────────────────────────────
  const seenIds      = new Set(seedSectionIds);
  const uniqueHops   = hopSections.filter((s) => !seenIds.has(s.id));

  // ── Step 5: Context assembly ──────────────────────────────────────────────
  // Sort direct hits by page order so the LLM reads the book linearly.
  // Append hops after the direct hits so the LLM sees primary evidence first.
  const sortedHits = [...qualifiedHits].sort(
    (a, b) => (a.pageStart ?? 0) - (b.pageStart ?? 0)
  );

  const contextBlocks = [
    ...sortedHits.map((chunk) => _formatContextBlock(chunk, false)),
    ...uniqueHops.map((hop)   => _formatContextBlock(hop,   true)),
  ];

  const context = contextBlocks.join("\n\n---\n\n");

  // ── Step 6: Answer generation ─────────────────────────────────────────────
  const prompt = _buildPrompt(question, conversation, context);
  logger.debug("Generating answer", { contextBlocks: contextBlocks.length });
  const rawAnswer = await aiService.generateAnswer(prompt);
  const answer    = rawAnswer.trim();

  // ── Step 7: Evidence verification ────────────────────────────────────────
  // Check whether the retrieved evidence is consistent and sufficient.
  // If the LLM itself says it can't find support, pass that back rather than
  // hallucinating. (Feature 10)
  if (_looksLikeInsufficientEvidence(answer)) {
    logger.info("Answer verification: evidence deemed insufficient", { question });
    return {
      answer: "The book passages I found don't contain enough information to answer that question reliably. Try rephrasing or asking about a specific chapter.",
      references: _buildReferences(qualifiedHits),
      relatedTopics: [],
      links: [],
    };
  }

  return {
    answer,
    references: _buildReferences(qualifiedHits),
    relatedTopics: _buildRelatedTopics(qualifiedHits, uniqueHops),
    links: [],
  };
}

// ─── Prompt construction ──────────────────────────────────────────────────────

function _buildPrompt(question, conversation, context) {
  return `You answer questions about "Sapiens: A Brief History of Humankind" by Yuval Noah Harari.

Rules:
- Use ONLY the book passages provided below.
- Cite the chapter and section when you use a specific fact.
- If the passages do not contain enough information to answer confidently, say exactly: "I don't have sufficient evidence in the retrieved passages to answer this."
- Do not invent facts, dates, or names not present in the passages.
- Use the conversation context only to resolve pronouns or follow-ups.

Conversation context:
${conversation || "No earlier turns."}

--- BOOK PASSAGES START ---
${context}
--- BOOK PASSAGES END ---

Question: ${question}
Answer:`;
}

// ─── Context block formatting ─────────────────────────────────────────────────

function _formatContextBlock(chunk, isHop) {
  const label   = isHop ? "[Related via cross-reference / shared topic]" : "";
  const header  = [
    chunk.chapterTitle  ? `Chapter: ${chunk.chapterTitle}`  : null,
    chunk.sectionTitle  ? `Section: ${chunk.sectionTitle}`  : null,
    chunk.pageStart     ? `Pages: ${chunk.pageStart}–${chunk.pageEnd ?? chunk.pageStart}` : null,
    label               || null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `[${header}]\n${chunk.text}`;
}

// ─── Reference / related-topic builders ──────────────────────────────────────

function _buildReferences(hits) {
  return hits.map((c) => ({
    title:      [c.chapterTitle, c.sectionTitle].filter(Boolean).join(" › "),
    data:       c.childText
      ? c.childText.substring(0, 200) + (c.childText.length > 200 ? "…" : "")
      : c.text.substring(0, 200) + (c.text.length > 200 ? "…" : ""),
    pageStart:  c.pageStart,
    pageEnd:    c.pageEnd,
    // UI reads `similarity` for the "Match X%" display
    similarity: Math.round(c.score       * 1000) / 1000,
    score:      Math.round(c.score       * 1000) / 1000,
    vectorScore:Math.round(c.vectorScore * 1000) / 1000,
    bm25Score:  Math.round(c.bm25Score   * 1000) / 1000,
    // UI reads `page` for the page display
    page:       c.pageStart,
    pageStart:  c.pageStart,
    pageEnd:    c.pageEnd,
  }));
}

function _buildRelatedTopics(directHits, hopSections) {
  const topics = new Set();

  for (const c of directHits) {
    if (c.chapterTitle)  topics.add(c.chapterTitle);
  }
  for (const s of hopSections) {
    if (s.sectionTitle) topics.add(s.sectionTitle);
  }

  // UI renderDataItems expects objects with a title field
  return [...topics].slice(0, 5).map((t) => ({ title: t }));
}

// ─── Evidence sufficiency check ───────────────────────────────────────────────

/**
 * Feature 10 — Document-level answer verification.
 *
 * Detect when the LLM itself signals that the evidence was insufficient.
 * We look for the exact phrase we instructed it to use, plus common
 * hedge patterns that indicate hallucination risk.
 */
function _looksLikeInsufficientEvidence(answer) {
  const lower = answer.toLowerCase();
  return (
    lower.includes("i don't have sufficient evidence") ||
    lower.includes("passages do not contain") ||
    lower.includes("not mentioned in the") ||
    lower.includes("cannot find this in") ||
    (lower.includes("i don't know") && lower.length < 120)
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function _noContextResponse() {
  return {
    answer:
      "I couldn't find any relevant passages in the book for that question. Try asking about a specific chapter, event, or concept from Sapiens.",
    references:    [],
    relatedTopics: [],
    links:         [],
  };
}

module.exports = { chat };
