// seeders/sapiens.seeder.js
//
// RAG Basic seeder — flat chunking using RecursiveCharacterTextSplitter.
//
// Strategy: split the PDF into fixed-size text windows (500 chars, 50 overlap).
// Simple and fast. Every chunk is treated equally — no section awareness.
//
// This is the STARTING POINT. RAG Advanced replaces this with structural chunking.
//
// Usage: npm run seed

require("../src/config/env");

const path = require("path");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { randomUUID } = require("crypto");

const aiService = require("../src/ai/ai.service");
const documentRepository = require("../src/repositories/document.repository");
const { verifyConnection } = require("../src/config/neo4j");
const logger = require("../src/utils/logger");

const PDF_PATH = path.join(__dirname, "../static/Sapiens A Brief History of Humankind.pdf");
const DOCUMENT_TITLE = "Sapiens: A Brief History of Humankind";

async function seed() {
  logger.info("Connecting to Neo4j...");
  await verifyConnection();

  logger.info("Loading PDF...");
  const loader = new PDFLoader(PDF_PATH, { splitPages: true });
  const pages = await loader.load();
  logger.info(`Loaded ${pages.length} pages`);

  // Flat splitting — no structure awareness, just character windows
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const docs = await splitter.splitDocuments(pages);
  logger.info(`Split into ${docs.length} chunks`);

  let saved = 0;
  let prevChunkId = null;

  for (const [index, doc] of docs.entries()) {
    const chunkId = randomUUID();
    const page = doc.metadata?.loc?.pageNumber ?? index + 1;

    const embedding = await aiService.generateEmbedding(doc.pageContent);

    await documentRepository.saveChunk({
      documentTitle: DOCUMENT_TITLE,
      chapterTitle: `Page ${page}`,   // no chapter detection yet
      chunk: {
        id: chunkId,
        text: doc.pageContent,
        embedding,
        page,
        chunkIndex: index,
      },
      previousChunkId: prevChunkId,
    });

    prevChunkId = chunkId;
    saved++;

    if (saved % 20 === 0) {
      logger.info(`Progress: ${saved}/${docs.length} chunks saved`);
    }
  }

  logger.info(`Done. Saved ${saved} chunks.`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error("Seeder failed", { message: err.message });
  process.exit(1);
});
