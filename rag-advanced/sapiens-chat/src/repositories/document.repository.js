// src/repositories/document.repository.js
//
// Neo4j persistence and retrieval for document-aware RAG.
//
// ── Graph Schema ──────────────────────────────────────────────────────────────
//
//   (:Document)
//       └──[:HAS_PART]──▶ (:Part)
//                              └──[:HAS_CHAPTER]──▶ (:Chapter)
//                                                        └──[:HAS_SECTION]──▶ (:Section)   ← parent chunk
//                                                                                  └──[:HAS_CHILD]──▶ (:Chunk)  ← child chunks
//                                                                                  └──[:NEXT_CHILD]──▶ (:Chunk) ← sequential sibling
//
//   (:Chunk)──[:IN_SECTION]──▶ (:Section)
//   (:Section)──[:REFERENCES]──▶ (:Chapter | :Section)   ← cross-references
//   (:Chunk | :Section)──[:MENTIONS]──▶ (:Entity)         ← entity links
//
// ── Retrieval Strategy ────────────────────────────────────────────────────────
//
//   1. Vector search   — cosine similarity on stored embeddings (Community edition,
//                        no vector index, so computed in-process)
//   2. BM25 keyword    — TfIdf from `natural`, scored with BM25 normalisation formula
//   3. Hybrid score    — linear combination: α·vector + (1-α)·bm25
//   4. Parent return   — after selecting top-K child chunks, return their parent
//                        Section text as the actual context window
//   5. Multi-hop       — follow [:REFERENCES] and entity co-mention edges from the
//                        top result to pull in related sections

const natural             = require("natural");
const { runQuery }        = require("../config/neo4j");
const { cosineSimilarity} = require("../utils/math.utils");
const logger              = require("../utils/logger");

/**
 * Neo4j integers come back as Neo4j Integer objects, not plain JS numbers.
 * This helper safely converts them so arithmetic and JSON serialisation work.
 */
function toNum(val) {
  if (val === null || val === undefined) return null;
  // Neo4j Integer objects have a .toNumber() method
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  return Number(val);
}

// BM25 tuning knobs (standard defaults from the literature)
const BM25_K1 = 1.5;   // term-frequency saturation
const BM25_B  = 0.75;  // length normalisation strength

// Hybrid weight: how much to favour vector vs BM25 (0 = pure BM25, 1 = pure vector)
const HYBRID_ALPHA = 0.7;

// ─── Initialisation helpers ───────────────────────────────────────────────────

/**
 * Ensure the top-level Document node exists.
 */
async function initDocument(documentId, documentTitle) {
  await runQuery(
    `MERGE (d:Document { id: $documentId })
     SET   d.title = $documentTitle`,
    { documentId, documentTitle }
  );
}

/**
 * Ensure a Part node exists and is linked to its Document.
 */
async function initPart(documentId, part) {
  await runQuery(
    `MATCH  (d:Document { id: $documentId })
     MERGE  (p:Part { id: $partId })
     SET    p.number = $number, p.title = $title, p.documentId = $documentId
     MERGE  (d)-[:HAS_PART]->(p)`,
    {
      documentId,
      partId: `${documentId}:part:${part.number}`,
      number: part.number,
      title:  part.title,
    }
  );
}

/**
 * Ensure a Chapter node exists, linked to its Part and Document.
 */
async function initChapter(documentId, chapter, part) {
  const partId = part ? `${documentId}:part:${part.number}` : null;

  await runQuery(
    `MATCH  (d:Document { id: $documentId })
     MERGE  (c:Chapter { id: $chapterId })
     SET    c.number = $number, c.title = $title, c.documentId = $documentId
     MERGE  (d)-[:HAS_CHAPTER]->(c)
     WITH   c
     OPTIONAL MATCH (p:Part { id: $partId })
     FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
       MERGE (p)-[:HAS_CHAPTER]->(c)
     )`,
    {
      documentId,
      chapterId: `${documentId}:chapter:${chapter.number}`,
      number:    chapter.number,
      title:     chapter.title,
      partId,
    }
  );
}

// ─── Write: Section (parent chunk) ───────────────────────────────────────────

/**
 * Persist a Section node (= parent chunk) together with its metadata.
 *
 * Creates:
 *   (:Section) linked to (:Chapter)-[:HAS_SECTION]->(:Section)
 *   (:Section)-[:REFERENCES]->(:Chapter) for each detected cross-reference
 *   (:Entity) nodes + (:Section)-[:MENTIONS]->(:Entity) for each entity
 *
 * @returns {string} sectionId
 */
async function saveSection({
  documentId,
  documentTitle,
  part,
  chapter,
  section,
  pageStart,
  pageEnd,
  content,
  embedding,
  crossRefs,
  entities,
  sectionIndex,
}) {
  const sectionId  = `${documentId}:section:${sectionIndex}`;
  const chapterId  = chapter ? `${documentId}:chapter:${chapter.number}` : null;

  // Upsert the Section node and wire it into the Chapter
  await runQuery(
    `MERGE (s:Section { id: $sectionId })
     SET   s.title        = $title,
           s.documentId   = $documentId,
           s.documentTitle= $documentTitle,
           s.partNumber   = $partNumber,
           s.partTitle    = $partTitle,
           s.chapterNumber= $chapterNumber,
           s.chapterTitle = $chapterTitle,
           s.pageStart    = $pageStart,
           s.pageEnd      = $pageEnd,
           s.content      = $content,
           s.embedding    = $embedding
     WITH  s
     OPTIONAL MATCH (chap:Chapter { id: $chapterId })
     FOREACH (_ IN CASE WHEN chap IS NOT NULL THEN [1] ELSE [] END |
       MERGE (chap)-[:HAS_SECTION]->(s)
     )`,
    {
      sectionId,
      title:         section,
      documentId,
      documentTitle,
      partNumber:    part?.number   ?? null,
      partTitle:     part?.title    ?? null,
      chapterNumber: chapter?.number ?? null,
      chapterTitle:  chapter?.title  ?? null,
      pageStart,
      pageEnd,
      content,
      embedding,
      chapterId,
    }
  );

  // Cross-reference edges  (Feature 5)
  for (const ref of crossRefs) {
    if (ref.type === "chapter") {
      const targetChapterId = `${documentId}:chapter:${ref.target}`;
      await runQuery(
        `MATCH (s:Section { id: $sectionId })
         MATCH (c:Chapter { id: $targetChapterId })
         MERGE (s)-[:REFERENCES { raw: $raw }]->(c)`,
        { sectionId, targetChapterId, raw: ref.raw }
      ).catch(() => {
        // target chapter may not exist (front-matter refs) — skip silently
      });
    }
  }

  // Entity nodes + MENTIONS edges  (Feature 6)
  await _saveEntityLinks("Section", sectionId, entities);

  return sectionId;
}

// ─── Write: Child chunk ───────────────────────────────────────────────────────

/**
 * Persist a Chunk node (= child chunk) under its parent Section.
 *
 * Creates:
 *   (:Chunk)-[:IN_SECTION]->(:Section)
 *   (:Section)-[:HAS_CHILD]->(:Chunk)
 *   (:Chunk)-[:NEXT_CHILD]->(:Chunk)   for sequential sibling linking
 *   (:Chunk)-[:MENTIONS]->(:Entity)
 *
 * @returns {string} chunkId
 */
async function saveChildChunk({
  parentId,
  documentId,
  documentTitle,
  part,
  chapter,
  section,
  pageStart,
  pageEnd,
  content,
  embedding,
  entities,
  crossRefs,
  chunkIndex,
  childIndex,
  prevChildId,
}) {
  const chunkId = `${documentId}:chunk:${chunkIndex}`;

  await runQuery(
    `MERGE (c:Chunk { id: $chunkId })
     SET   c.documentId    = $documentId,
           c.documentTitle = $documentTitle,
           c.partNumber    = $partNumber,
           c.partTitle     = $partTitle,
           c.chapterNumber = $chapterNumber,
           c.chapterTitle  = $chapterTitle,
           c.sectionTitle  = $sectionTitle,
           c.pageStart     = $pageStart,
           c.pageEnd       = $pageEnd,
           c.content       = $content,
           c.embedding     = $embedding,
           c.chunkIndex    = $chunkIndex,
           c.childIndex    = $childIndex
     WITH  c
     MATCH (s:Section { id: $parentId })
     MERGE (s)-[:HAS_CHILD]->(c)
     MERGE (c)-[:IN_SECTION]->(s)`,
    {
      chunkId,
      documentId,
      documentTitle,
      partNumber:    part?.number    ?? null,
      partTitle:     part?.title     ?? null,
      chapterNumber: chapter?.number ?? null,
      chapterTitle:  chapter?.title  ?? null,
      sectionTitle:  section,
      pageStart,
      pageEnd,
      content,
      embedding,
      chunkIndex,
      childIndex,
      parentId,
    }
  );

  // Sequential sibling link  (for context window expansion)
  if (prevChildId) {
    await runQuery(
      `MATCH (prev:Chunk { id: $prevChildId })
       MATCH (curr:Chunk { id: $chunkId })
       MERGE (prev)-[:NEXT_CHILD]->(curr)`,
      { prevChildId, chunkId }
    );
  }

  // Entity links  (Feature 6)
  await _saveEntityLinks("Chunk", chunkId, entities);

  return chunkId;
}

// ─── Entity helper ────────────────────────────────────────────────────────────

/**
 * Create Entity nodes and [:MENTIONS] edges from a source node.
 * Entity id is normalised to lowercase so "Napoleon" and "napoleon" merge.
 */
async function _saveEntityLinks(nodeLabel, nodeId, entities) {
  for (const name of entities.all) {
    const entityId = `entity:${name.toLowerCase()}`;
    await runQuery(
      `MERGE (e:Entity { id: $entityId })
       SET   e.name = $name
       WITH  e
       MATCH (n:${nodeLabel} { id: $nodeId })
       MERGE (n)-[:MENTIONS]->(e)`,
      { entityId, name, nodeId }
    ).catch(() => {
      // non-fatal — skip bad entity strings
    });
  }
}

// ─── Read: hybrid retrieval ───────────────────────────────────────────────────

/**
 * Fetch all child Chunk nodes for the given document.
 * Returns the raw records needed by the hybrid scorer.
 */
async function _fetchAllChunks(documentId) {
  const records = await runQuery(
    `MATCH (c:Chunk { documentId: $documentId })-[:IN_SECTION]->(s:Section)
     RETURN
       c.id            AS id,
       c.content       AS content,
       c.embedding     AS embedding,
       c.pageStart     AS pageStart,
       c.pageEnd       AS pageEnd,
       c.chapterTitle  AS chapterTitle,
       c.chapterNumber AS chapterNumber,
       c.sectionTitle  AS sectionTitle,
       s.id            AS sectionId,
       s.content       AS sectionContent,
       s.embedding     AS sectionEmbedding`,
    { documentId }
  );

  return records.map((r) => ({
    id:              r.get("id"),
    content:         r.get("content"),
    embedding:       r.get("embedding"),
    // Neo4j integers come back as Neo4j Integer objects — coerce to JS number
    pageStart:       toNum(r.get("pageStart")),
    pageEnd:         toNum(r.get("pageEnd")),
    chapterTitle:    r.get("chapterTitle"),
    chapterNumber:   toNum(r.get("chapterNumber")),
    sectionTitle:    r.get("sectionTitle"),
    sectionId:       r.get("sectionId"),
    sectionContent:  r.get("sectionContent"),
    sectionEmbedding:r.get("sectionEmbedding"),
  }));
}

/**
 * BM25 scoring over a corpus of chunks.
 *
 * Uses `natural`'s TfIdf to get term frequencies, then applies the standard
 * Okapi BM25 formula for length-normalised relevance scoring.
 *
 * Returns a Map<chunkId, bm25Score>.
 */
function _computeBM25Scores(queryTokens, chunks) {
  const tfidf = new natural.TfIdf();

  // Add each chunk as a document
  for (const chunk of chunks) {
    tfidf.addDocument(chunk.content);
  }

  const N   = chunks.length;
  const scores = new Map();

  // Compute average document length for BM25 length normalisation
  const avgDl = chunks.reduce((sum, c) => sum + c.content.split(/\s+/).length, 0) / N;

  for (const term of queryTokens) {
    // df = number of documents containing the term
    // tfidf.tfidf(term, docIndex) returns 0 when the term is absent
    let df = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (tfidf.tfidf(term, i) > 0) df++;
    }
    if (df === 0) continue;

    // IDF (BM25 variant): log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const dl    = chunk.content.split(/\s+/).length;
      // Raw term frequency counted directly from content
      const tf    = (chunk.content.toLowerCase().match(
        new RegExp(`\\b${escapeRegex(term)}\\b`, "g")
      ) || []).length;

      if (tf === 0) continue;

      // Okapi BM25 term score
      const numerator   = tf * (BM25_K1 + 1);
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl));
      const termScore   = idf * (numerator / denominator);

      scores.set(chunk.id, (scores.get(chunk.id) || 0) + termScore);
    }
  }

  return scores;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalise a Map of raw scores to [0, 1] using min-max normalisation.
 */
function _normalise(scoreMap) {
  if (scoreMap.size === 0) return scoreMap;

  const values = [...scoreMap.values()];
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  const normalised = new Map();
  for (const [id, score] of scoreMap) {
    normalised.set(id, (score - min) / range);
  }
  return normalised;
}

/**
 * Hybrid retrieval: vector + BM25, then return parent section as context.
 *
 * Steps:
 *   1. Fetch all child chunks
 *   2. Score each by cosine similarity to the query embedding
 *   3. Score each by BM25 keyword match against the query
 *   4. Combine: hybridScore = α·vector + (1-α)·bm25
 *   5. Take top-K
 *   6. Promote to parent section (return section content, not just child text)
 *
 * @param {number[]} queryEmbedding
 * @param {string}   queryText        — raw query string for BM25
 * @param {number}   limit
 * @param {string}   documentId
 * @returns {Promise<RetrievedChunk[]>}
 */
async function findSimilarChunks(queryEmbedding, queryText, limit = 5, documentId = null) {
  const targetDoc = documentId || "sapiens";
  const chunks    = await _fetchAllChunks(targetDoc);

  if (chunks.length === 0) return [];

  // ── Vector scores ─────────────────────────────────────────────────────────
  const vectorScores = new Map();
  for (const chunk of chunks) {
    const score = chunk.embedding
      ? cosineSimilarity(queryEmbedding, chunk.embedding)
      : 0;
    vectorScores.set(chunk.id, score);
  }
  const normVector = _normalise(vectorScores);

  // ── BM25 scores ───────────────────────────────────────────────────────────
  const tokenizer = new natural.WordTokenizer();
  // Use raw lowercased tokens — no stemming — so they match the stored content
  const queryTokens = tokenizer.tokenize(queryText.toLowerCase());

  const rawBM25  = _computeBM25Scores(queryTokens, chunks);
  const normBM25 = _normalise(rawBM25);

  // ── Hybrid combination ────────────────────────────────────────────────────
  const hybrid = chunks.map((chunk) => ({
    ...chunk,
    vectorScore: normVector.get(chunk.id) || 0,
    bm25Score:   normBM25.get(chunk.id)   || 0,
    score:
      HYBRID_ALPHA       * (normVector.get(chunk.id) || 0) +
      (1 - HYBRID_ALPHA) * (normBM25.get(chunk.id)   || 0),
  }));

  hybrid.sort((a, b) => b.score - a.score);
  const topChunks = hybrid.slice(0, limit);

  logger.debug("Hybrid retrieval scores", {
    topChunks: topChunks.map((c) => ({
      id:      c.id,
      section: c.sectionTitle,
      vector:  c.vectorScore.toFixed(3),
      bm25:    c.bm25Score.toFixed(3),
      hybrid:  c.score.toFixed(3),
    })),
  });

  return topChunks.map((c) => ({
    id:            c.id,
    sectionId:     c.sectionId,
    chapterTitle:  c.chapterTitle,
    chapterNumber: c.chapterNumber,
    sectionTitle:  c.sectionTitle,
    pageStart:     c.pageStart,
    pageEnd:       c.pageEnd,
    // Return the parent section content as the context window  (Feature 3)
    text:          c.sectionContent || c.content,
    childText:     c.content,
    vectorScore:   c.vectorScore,
    bm25Score:     c.bm25Score,
    score:         c.score,
  }));
}

// ─── Read: multi-hop neighbours ───────────────────────────────────────────────

/**
 * Feature 9 — Multi-hop retrieval.
 *
 * Given a set of already-retrieved section IDs, follow:
 *   [:REFERENCES]   — explicit cross-references ("see Chapter 4")
 *   shared [:MENTIONS]->(:Entity) — sections that discuss the same entities
 *
 * Returns additional sections not already in the seed set.
 *
 * @param {string[]} sectionIds   — seed section IDs
 * @param {string}   documentId
 * @returns {Promise<HopResult[]>}
 */
async function findRelatedSections(sectionIds, documentId) {
  if (!sectionIds.length) return [];

  const records = await runQuery(
    `UNWIND $sectionIds AS sid
     MATCH (s:Section { id: sid })
     // Hop 1: explicit cross-references
     OPTIONAL MATCH (s)-[:REFERENCES]->(refChap:Chapter)-[:HAS_SECTION]->(related:Section)
     WHERE related.documentId = $documentId
       AND NOT related.id IN $sectionIds
     // Hop 2: shared entities
     OPTIONAL MATCH (s)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(entitySection:Section)
     WHERE entitySection.documentId = $documentId
       AND NOT entitySection.id IN $sectionIds
     WITH collect(DISTINCT related) + collect(DISTINCT entitySection) AS candidates
     UNWIND candidates AS c
     WHERE c IS NOT NULL
     RETURN DISTINCT
       c.id            AS id,
       c.content       AS content,
       c.chapterTitle  AS chapterTitle,
       c.chapterNumber AS chapterNumber,
       c.sectionTitle  AS sectionTitle,
       c.pageStart     AS pageStart,
       c.pageEnd       AS pageEnd`,
    { sectionIds, documentId }
  );

  return records.map((r) => ({
    id:            r.get("id"),
    chapterTitle:  r.get("chapterTitle"),
    chapterNumber: toNum(r.get("chapterNumber")),
    sectionTitle:  r.get("sectionTitle"),
    pageStart:     toNum(r.get("pageStart")),
    pageEnd:       toNum(r.get("pageEnd")),
    text:          r.get("content"),
    isHop:         true,
  }));
}

// ─── Read: sibling context window ────────────────────────────────────────────

/**
 * Expand a child chunk's context by fetching its prev/next siblings.
 * Used when the parent section is too large and the service wants a narrower
 * but contextually connected window.
 *
 * @param {string} chunkId
 * @returns {Promise<string>}
 */
async function getExpandedContext(chunkId) {
  const records = await runQuery(
    `MATCH (c:Chunk { id: $chunkId })
     OPTIONAL MATCH (prev:Chunk)-[:NEXT_CHILD]->(c)
     OPTIONAL MATCH (c)-[:NEXT_CHILD]->(next:Chunk)
     RETURN prev.content AS prevText, c.content AS text, next.content AS nextText`,
    { chunkId }
  );

  if (!records.length) return null;

  const r    = records[0];
  const prev = r.get("prevText") || "";
  const curr = r.get("text")     || "";
  const next = r.get("nextText") || "";

  return [prev, curr, next].filter(Boolean).join("\n\n");
}

// ─── Read: section by id ─────────────────────────────────────────────────────

/**
 * Fetch the full content of a Section node by its id.
 */
async function getSectionById(sectionId) {
  const records = await runQuery(
    `MATCH (s:Section { id: $sectionId })
     RETURN s.content AS content, s.chapterTitle AS chapterTitle,
            s.sectionTitle AS sectionTitle, s.pageStart AS pageStart, s.pageEnd AS pageEnd`,
    { sectionId }
  );
  if (!records.length) return null;
  const r = records[0];
  return {
    content:       r.get("content"),
    chapterTitle:  r.get("chapterTitle"),
    sectionTitle:  r.get("sectionTitle"),
    pageStart:     r.get("pageStart"),
    pageEnd:       r.get("pageEnd"),
  };
}

module.exports = {
  // Init
  initDocument,
  initPart,
  initChapter,
  // Write
  saveSection,
  saveChildChunk,
  // Read
  findSimilarChunks,
  findRelatedSections,
  getExpandedContext,
  getSectionById,
};
