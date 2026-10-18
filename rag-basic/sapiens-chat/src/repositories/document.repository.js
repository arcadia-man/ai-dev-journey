// src/repositories/document.repository.js
//
// RAG Basic — flat document storage and retrieval.
//
// Graph schema (simple version):
//
//   (:Document)
//       └──[:HAS_CHAPTER]──▶ (:Chapter)
//                                 └──[:HAS_CHUNK]──▶ (:Chunk)
//   (:Chunk)-[:NEXT]->(:Chunk)    sequential reading order
//
// Retrieval strategy:
//   Fetch ALL chunks → compute cosine similarity in-process → return top-K.
//   Simple and correct. Gets slow at tens of thousands of chunks but fine
//   for a single book (hundreds of chunks).

const { runQuery }         = require("../config/neo4j");
const { cosineSimilarity } = require("../utils/math.utils");

/**
 * Save a chunk into the graph.
 *
 * Creates:
 *   (:Document) ← MERGE so only one document node exists
 *   (:Chapter)  ← MERGE per chapter title
 *   (:Chunk)    ← new node per chunk
 *   (:Chapter)-[:HAS_CHUNK]->(:Chunk)
 *   (:PrevChunk)-[:NEXT]->(:Chunk)  if previousChunkId is given
 *
 * @param {{ documentTitle, chapterTitle, chunk: { id, text, embedding, page, chunkIndex }, previousChunkId }}
 */
async function saveChunk({ documentTitle, chapterTitle, chunk, previousChunkId }) {
  await runQuery(
    `MERGE (d:Document { title: $documentTitle })
     MERGE (chap:Chapter { title: $chapterTitle, documentTitle: $documentTitle })
     MERGE (chap)-[:IN_DOCUMENT]->(d)
     MERGE (c:Chunk { id: $chunkId })
     SET   c.text       = $text,
           c.embedding  = $embedding,
           c.page       = $page,
           c.chunkIndex = $chunkIndex,
           c.documentTitle = $documentTitle
     MERGE (c)-[:IN_CHAPTER]->(chap)`,
    {
      documentTitle,
      chapterTitle,
      chunkId:    chunk.id,
      text:       chunk.text,
      embedding:  chunk.embedding,
      page:       chunk.page,
      chunkIndex: chunk.chunkIndex,
    }
  );

  if (previousChunkId) {
    await runQuery(
      `MATCH (prev:Chunk { id: $previousChunkId })
       MATCH (curr:Chunk { id: $chunkId })
       MERGE (prev)-[:NEXT]->(curr)`,
      { previousChunkId, chunkId: chunk.id }
    );
  }
}

/**
 * Find the top-K chunks most similar to the query embedding.
 *
 * No vector index available (Neo4j Community edition) so we:
 *   1. Fetch all chunks for the document
 *   2. Compute cosine similarity in JavaScript
 *   3. Sort and slice
 *
 * @param {number[]} queryEmbedding
 * @param {number}   limit
 * @param {string}   documentTitle
 * @returns {Promise<Array<{id, text, page, chapterTitle, similarity}>>}
 */
async function findSimilarChunks(queryEmbedding, limit = 5, documentTitle = null) {
  let cypher = `MATCH (c:Chunk)-[:IN_CHAPTER]->(chap:Chapter)`;
  if (documentTitle) {
    cypher = `MATCH (c:Chunk { documentTitle: $documentTitle })-[:IN_CHAPTER]->(chap:Chapter)`;
  }
  cypher += `
    RETURN c.text AS text, c.page AS page,
           c.embedding AS embedding, chap.title AS chapterTitle, c.id AS id`;

  const records = await runQuery(cypher, { documentTitle });

  return records
    .map((r) => ({
      id:           r.get("id"),
      text:         r.get("text"),
      page:         r.get("page"),
      chapterTitle: r.get("chapterTitle"),
      similarity:   cosineSimilarity(queryEmbedding, r.get("embedding")),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Expand context for a chunk by fetching its previous and next neighbours.
 * Uses the [:NEXT] sequential chain written during seeding.
 *
 * @param {string} chunkId
 * @returns {Promise<string|null>}
 */
async function getExpandedContext(chunkId) {
  const records = await runQuery(
    `MATCH (c:Chunk { id: $chunkId })
     OPTIONAL MATCH (prev)-[:NEXT]->(c)
     OPTIONAL MATCH (c)-[:NEXT]->(next)
     RETURN prev.text AS prevText, c.text AS text, next.text AS nextText`,
    { chunkId }
  );

  if (!records.length) return null;

  const r    = records[0];
  const prev = r.get("prevText") || "";
  const curr = r.get("text")     || "";
  const next = r.get("nextText") || "";

  return [prev, curr, next].filter(Boolean).join("\n\n");
}

module.exports = { saveChunk, findSimilarChunks, getExpandedContext };
