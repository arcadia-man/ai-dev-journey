// src/test-queries.js
//
// Runs a set of real Cypher queries against the Sapiens graph and prints
// the results so you can confirm data was seeded correctly.
//
// Usage: npm run test-queries
//
// What this tests:
//   1. Node counts  — how many Documents, Parts, Chapters, Sections, Chunks, Entities
//   2. Part list    — the 4 parts of the book
//   3. Chapter list — all 20 chapters with their part
//   4. Sample sections — first 5 sections with page ranges
//   5. Sample chunk  — content preview of chunk 0
//   6. Entity sample — top 10 most-mentioned entities
//   7. Cross-refs   — any [:REFERENCES] edges found

require("./config/env");
const { verifyConnection, runQuery } = require("./config/neo4j");
const logger = require("./utils/logger");

// ── Helper: print a section header ───────────────────────────────────────────
function header(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ── Helper: Neo4j integers → plain JS numbers ─────────────────────────────────
function n(val) {
  if (val && typeof val.toNumber === "function") return val.toNumber();
  return val;
}

async function main() {
  await verifyConnection();

  // ── 1. Node counts ────────────────────────────────────────────────────────
  header("1. Node counts");
  const labels = ["Document", "Part", "Chapter", "Section", "Chunk", "Entity"];
  for (const label of labels) {
    const r = await runQuery(`MATCH (n:${label}) RETURN COUNT(n) AS count`);
    const count = n(r[0].get("count"));
    console.log(`  ${label.padEnd(12)} ${count}`);
  }

  // ── 2. Parts ─────────────────────────────────────────────────────────────
  header("2. Parts of the book");
  const parts = await runQuery(
    `MATCH (p:Part) RETURN p.number AS num, p.title AS title ORDER BY p.number`
  );
  if (parts.length === 0) {
    console.log("  ⚠ No Parts found — have you run npm run seed in rag-advanced?");
  } else {
    parts.forEach((r) => console.log(`  Part ${n(r.get("num"))}: ${r.get("title")}`));
  }

  // ── 3. Chapters ───────────────────────────────────────────────────────────
  header("3. All chapters");
  const chapters = await runQuery(
    `MATCH (c:Chapter) RETURN c.number AS num, c.title AS title ORDER BY c.number`
  );
  if (chapters.length === 0) {
    console.log("  ⚠ No Chapters found.");
  } else {
    chapters.forEach((r) =>
      console.log(`  Ch ${String(n(r.get("num"))).padStart(2)}: ${r.get("title")}`)
    );
  }

  // ── 4. Sample sections ───────────────────────────────────────────────────
  header("4. First 5 sections (with page range)");
  const sections = await runQuery(
    `MATCH (c:Chapter)-[:HAS_SECTION]->(s:Section)
     RETURN c.title AS chapter, s.title AS section,
            s.pageStart AS from, s.pageEnd AS to
     ORDER BY s.pageStart LIMIT 5`
  );
  if (sections.length === 0) {
    console.log("  ⚠ No Sections found.");
  } else {
    sections.forEach((r) =>
      console.log(
        `  [p${n(r.get("from"))}–${n(r.get("to"))}] ${r.get("chapter")} › ${r.get("section")}`
      )
    );
  }

  // ── 5. Sample chunk ──────────────────────────────────────────────────────
  header("5. Sample chunk (chunk:0) content preview");
  const chunk = await runQuery(
    `MATCH (c:Chunk { id: 'sapiens:chunk:0' })
     RETURN c.sectionTitle AS section, c.pageStart AS page,
            substring(c.content, 0, 200) AS preview`
  );
  if (chunk.length === 0) {
    console.log("  ⚠ Chunk sapiens:chunk:0 not found.");
  } else {
    const r = chunk[0];
    console.log(`  Section : ${r.get("section")}`);
    console.log(`  Page    : ${n(r.get("page"))}`);
    console.log(`  Preview : ${r.get("preview")}...`);
  }

  // ── 6. Top entities ──────────────────────────────────────────────────────
  header("6. Top 10 most-mentioned entities");
  const entities = await runQuery(
    `MATCH (chunk)-[:MENTIONS]->(e:Entity)
     RETURN e.name AS name, COUNT(chunk) AS mentions
     ORDER BY mentions DESC LIMIT 10`
  );
  if (entities.length === 0) {
    console.log("  ⚠ No Entity nodes found.");
  } else {
    entities.forEach((r) =>
      console.log(`  ${String(n(r.get("mentions"))).padStart(4)}×  ${r.get("name")}`)
    );
  }

  // ── 7. Cross-references ──────────────────────────────────────────────────
  header("7. Cross-reference edges ([:REFERENCES])");
  const refs = await runQuery(
    `MATCH (s:Section)-[r:REFERENCES]->(c:Chapter)
     RETURN s.chapterTitle AS from, c.title AS to, r.raw AS phrase
     LIMIT 10`
  );
  if (refs.length === 0) {
    console.log("  ⚠ No [:REFERENCES] edges found.");
  } else {
    refs.forEach((r) =>
      console.log(`  "${r.get("phrase")}"  →  ${r.get("to")}`)
    );
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("  All queries ran successfully.");
  console.log("─".repeat(60) + "\n");

  process.exit(0);
}

main().catch((err) => {
  logger.error("Test failed", { message: err.message, stack: err.stack });
  process.exit(1);
});
