// seeders/sapiens.seeder.js
//
// Document-aware ingestion pipeline for "Sapiens: A Brief History of Humankind"
//
// What this does (in order):
//   1. Load PDF — one LangChain Document per page
//   2. Structural parsing — detect Parts, Chapters, Sections from page text
//   3. Parent chunks — one per Section (the full section text = parent)
//   4. Child chunks — paragraph-level splits inside each section
//   5. Cross-reference detection — "see Chapter 4", "as noted above", page refs
//   6. Entity extraction — people, places, organisations per chunk (compromise NLP)
//   7. Contextual embedding — embed child with its [Document > Part > Chapter > Section] breadcrumb prepended
//   8. Persist to Neo4j via documentRepository

require("../src/config/env");

const path = require("path");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");

const aiService = require("../src/ai/ai.service");
const documentRepository = require("../src/repositories/document.repository");
const { verifyConnection } = require("../src/config/neo4j");
const logger = require("../src/utils/logger");
const { extractEntities } = require("../src/utils/entity.utils");
const { detectCrossReferences } = require("../src/utils/crossref.utils");

// ─── Constants ───────────────────────────────────────────────────────────────

const PDF_PATH = path.join(
  __dirname,
  "../static/Sapiens A Brief History of Humankind.pdf"
);

const DOCUMENT_ID    = "sapiens";
const DOCUMENT_TITLE = "Sapiens: A Brief History of Humankind";

// Maximum characters a parent (section) chunk may carry before paragraph-splitting
const MAX_PARENT_CHARS = 6000;
// Maximum characters a child chunk may carry
const MAX_CHILD_CHARS  = 1500;

// ─── Book Structure ───────────────────────────────────────────────────────────

const PARTS = [
  { number: 1, title: "The Cognitive Revolution",    chapterRange: [1,  4]  },
  { number: 2, title: "The Agricultural Revolution", chapterRange: [5,  8]  },
  { number: 3, title: "The Unification of Humankind",chapterRange: [9,  13] },
  { number: 4, title: "The Scientific Revolution",   chapterRange: [14, 20] },
];

const CHAPTERS = [
  { number:  1, title: "An Animal of No Significance"       },
  { number:  2, title: "The Tree of Knowledge"              },
  { number:  3, title: "A Day in the Life of Adam and Eve"  },
  { number:  4, title: "The Flood"                          },
  { number:  5, title: "History's Biggest Fraud"            },
  { number:  6, title: "Building Pyramids"                  },
  { number:  7, title: "Memory Overload"                    },
  { number:  8, title: "There is No Justice in History"     },
  { number:  9, title: "The Arrow of History"               },
  { number: 10, title: "The Scent of Money"                 },
  { number: 11, title: "Imperial Visions"                   },
  { number: 12, title: "The Law of Religion"                },
  { number: 13, title: "The Secret of Success"              },
  { number: 14, title: "The Discovery of Ignorance"         },
  { number: 15, title: "The Marriage of Science and Empire" },
  { number: 16, title: "The Capitalist Creed"               },
  { number: 17, title: "The Wheels of Industry"             },
  { number: 18, title: "A Permanent Revolution"             },
  { number: 19, title: "And They Lived Happily Ever After"  },
  { number: 20, title: "The End of Homo Sapiens"            },
];

// ─── Text Normalisation ───────────────────────────────────────────────────────

/**
 * Clean raw PDF page text:
 *   - remove soft hyphens
 *   - rejoin hyphenated line-breaks ("cog-\nnitive" → "cognitive")
 *   - collapse excess blank lines
 *   - trim surrounding whitespace
 */
function normalizePage(raw) {
  return raw
    .replace(/\u00ad/g, "")          // soft-hyphen
    .replace(/-\n/g, "")             // hyphenated line-break
    .replace(/\n{3,}/g, "\n\n")      // 3+ blank lines → 1 blank line
    .replace(/[ \t]+/g, " ")         // collapse horizontal whitespace
    .trim();
}

function normalizeLine(line) {
  return line.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

// ─── Chapter Detection ────────────────────────────────────────────────────────

/**
 * Determine which Part a chapter belongs to.
 */
function partForChapter(chapterNumber) {
  return PARTS.find(
    (p) => chapterNumber >= p.chapterRange[0] && chapterNumber <= p.chapterRange[1]
  ) || null;
}

/**
 * Try to detect a chapter heading at lines[index].
 * Handles two PDF extraction layouts:
 *   - "1 An Animal of No Significance"   (single line)
 *   - "1\nAn Animal of No Significance"  (number on line N, title on line N+1)
 */
function detectChapterAt(lines, index) {
  const current = normalizeLine(lines[index] || "");
  const next    = normalizeLine(lines[index + 1] || "");

  for (const chapter of CHAPTERS) {
    const num   = String(chapter.number);
    const title = chapter.title.toLowerCase();

    // single-line: "1 An Animal of No Significance"
    const combined = `${current} ${next}`.toLowerCase();
    if (combined === `${num} ${title}` || combined === `${num}. ${title}`) {
      return { chapter, consumedLines: 2 };
    }

    // two-line: number alone, then title alone
    if ((current === num || current === `${num}.`) && next.toLowerCase() === title) {
      return { chapter, consumedLines: 2 };
    }

    // single-line combined
    if (
      current.toLowerCase() === `${num} ${title}` ||
      current.toLowerCase() === `${num}. ${title}`
    ) {
      return { chapter, consumedLines: 1 };
    }
  }

  return null;
}

// ─── Section Heading Detection ────────────────────────────────────────────────

/**
 * Heuristic: a paragraph is a section heading when it looks like a title.
 *
 * Rules:
 *   - ≤ 100 characters
 *   - no sentence-ending punctuation (.!?)
 *   - 2–10 words
 *   - ≥ 60% of words are "title-like" (capitalised, or a common article/prep)
 */
function isSectionHeading(text) {
  if (!text || text.length > 100) return false;
  if (/[.!?]$/.test(text))        return false;
  if (/^\d+$/.test(text))         return false;
  if (/^\d+\./.test(text))        return false;   // figure captions

  const words = text.split(/\s+/);
  if (words.length < 2 || words.length > 10) return false;

  const SMALL_WORDS = /^(the|a|an|of|in|on|and|or|to|for|our|its|by|at|is|are|was|were|been|be|as|with|from|this|that|his|her|their|how|why|what|when|where|who|no|not|so|yet|but)$/i;

  const titleLike = words.filter((w) => {
    const clean = w.replace(/[^A-Za-zÀ-ÿ'-]/g, "");
    if (!clean) return false;
    return /^[A-ZÀ-Ý]/.test(clean) || SMALL_WORDS.test(clean);
  });

  return titleLike.length >= Math.ceil(words.length * 0.6);
}

// ─── Paragraph Splitting ──────────────────────────────────────────────────────

/**
 * Group lines into paragraphs by treating blank lines as separators.
 */
function splitIntoParagraphs(lines) {
  const paragraphs = [];
  let current = [];

  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) {
      if (current.length) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) paragraphs.push(current.join(" "));

  return paragraphs;
}

// ─── Child Chunk Splitting ────────────────────────────────────────────────────

/**
 * Split a section's paragraphs into child chunks.
 *
 * Strategy (in priority order):
 *   1. Paragraph boundaries — never split mid-paragraph
 *   2. MAX_CHILD_CHARS cap — start a new child when adding the next paragraph
 *      would exceed the limit AND we already have content
 *
 * This means child chunks are semantically whole paragraphs, not
 * arbitrary character windows.
 */
function splitIntoChildChunks(paragraphs) {
  const children = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length > MAX_CHILD_CHARS && current) {
      children.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current) children.push(current);
  return children;
}

// ─── Contextual Embedding Text ────────────────────────────────────────────────

/**
 * Feature 7 — Contextual Embeddings
 *
 * Prepend the document/section breadcrumb to the chunk text before embedding.
 * This means the vector encodes *where* the chunk lives in the book, not just
 * what it says in isolation.
 *
 * Example prefix:
 *   "Book: Sapiens | Part 1: The Cognitive Revolution | Chapter 2: The Tree of
 *    Knowledge | Section: The Language of Gossip\n\n"
 */
function buildEmbeddingText({ documentTitle, part, chapter, section, content }) {
  const breadcrumb = [
    `Book: ${documentTitle}`,
    part    ? `Part ${part.number}: ${part.title}`       : null,
    chapter ? `Chapter ${chapter.number}: ${chapter.title}` : null,
    section ? `Section: ${section}`                      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${breadcrumb}\n\n${content}`;
}

// ─── Main Document Chunking ───────────────────────────────────────────────────

/**
 * Parse all PDF pages into a hierarchy:
 *
 *   Document
 *     └── Part (1–4)
 *           └── Chapter (1–20)
 *                 └── Section (heading-based)
 *                       ├── parentChunk  (full section text, ≤ MAX_PARENT_CHARS)
 *                       └── childChunks  (paragraph-level, ≤ MAX_CHILD_CHARS each)
 *
 * Returns an array of section objects.
 */
function buildSectionHierarchy(pages) {
  const sections = [];

  let currentPart    = null;
  let currentChapter = null;
  let currentSection = "Introduction";

  let sectionParagraphs = [];
  let sectionPageStart  = 1;
  let sectionPageEnd    = 1;

  function flushSection() {
    if (!sectionParagraphs.length) return;

    const parentContent = sectionParagraphs.join("\n\n").trim();
    if (!parentContent) return;

    const childTexts = splitIntoChildChunks(sectionParagraphs);

    sections.push({
      documentId:    DOCUMENT_ID,
      documentTitle: DOCUMENT_TITLE,
      part:          currentPart,
      chapter:       currentChapter,
      section:       currentSection,
      pageStart:     sectionPageStart,
      pageEnd:       sectionPageEnd,
      parentContent,
      childTexts,
    });

    sectionParagraphs = [];
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageNumber = pageIndex + 1;
    const rawText    = pages[pageIndex].pageContent || "";
    const text       = normalizePage(rawText);
    if (!text) continue;

    const lines = text.split("\n");
    let   i     = 0;

    while (i < lines.length) {
      const hit = detectChapterAt(lines, i);

      if (hit) {
        flushSection();

        currentChapter = hit.chapter;
        currentPart    = partForChapter(hit.chapter.number);
        currentSection = "Introduction";
        sectionPageStart = pageNumber;

        i += hit.consumedLines;
        continue;
      }

      i++;
    }

    // Detect sections from paragraphs on this page
    const paragraphs = splitIntoParagraphs(lines);

    for (const para of paragraphs) {
      if (isSectionHeading(para)) {
        flushSection();
        currentSection   = para;
        sectionPageStart = pageNumber;
        continue;
      }

      sectionParagraphs.push(para);
      sectionPageEnd = pageNumber;
    }
  }

  flushSection();
  return sections;
}

// ─── Safety Guard ─────────────────────────────────────────────────────────────

/**
 * If a parent chunk is still too large after section detection, split it on
 * paragraph boundaries into multiple parent chunks.  This is a last resort —
 * not the primary strategy.
 */
function safetyGuardSections(sections) {
  const guarded = [];

  for (const section of sections) {
    if (section.parentContent.length <= MAX_PARENT_CHARS) {
      guarded.push(section);
      continue;
    }

    const paragraphs = section.parentContent.split(/\n\n+/);
    let   current    = "";
    let   partIndex  = 0;

    function flush() {
      if (!current.trim()) return;
      guarded.push({
        ...section,
        section:       partIndex === 0 ? section.section : `${section.section} (cont.)`,
        parentContent: current.trim(),
        childTexts:    splitIntoChildChunks(current.trim().split(/\n\n+/)),
      });
      partIndex++;
      current = "";
    }

    for (const para of paragraphs) {
      const candidate = current ? `${current}\n\n${para}` : para;
      if (candidate.length > MAX_PARENT_CHARS && current) {
        flush();
        current = para;
      } else {
        current = candidate;
      }
    }
    flush();
  }

  return guarded;
}

// ─── Seeder Entry Point ───────────────────────────────────────────────────────

async function seed() {
  try {
    logger.info("Connecting to Neo4j...");
    await verifyConnection();

    logger.info(`Loading PDF: ${PDF_PATH}`);
    const loader = new PDFLoader(PDF_PATH, { splitPages: true });
    const pages  = await loader.load();
    logger.info(`Loaded ${pages.length} pages`);

    // ── Step 1: structural parse ──────────────────────────────────────────────
    logger.info("Building section hierarchy...");
    const rawSections = buildSectionHierarchy(pages);
    const sections    = safetyGuardSections(rawSections);
    logger.info(
      `Structure: ${sections.length} sections, ` +
      `${sections.reduce((n, s) => n + s.childTexts.length, 0)} child chunks`
    );

    // ── Step 2: initialise Document + Part + Chapter nodes ───────────────────
    logger.info("Initialising document hierarchy in Neo4j...");
    await documentRepository.initDocument(DOCUMENT_ID, DOCUMENT_TITLE);

    for (const part of PARTS) {
      await documentRepository.initPart(DOCUMENT_ID, part);
    }

    for (const chapter of CHAPTERS) {
      const part = partForChapter(chapter.number);
      await documentRepository.initChapter(DOCUMENT_ID, chapter, part);
    }

    // ── Step 3: embed + persist each section ─────────────────────────────────
    let sectionIndex = 0;
    let totalChildren = 0;

    for (const section of sections) {
      sectionIndex++;
      logger.info(
        `[${sectionIndex}/${sections.length}] ` +
        `Chapter ${section.chapter?.number ?? "?"} › "${section.section}" ` +
        `(${section.childTexts.length} child chunks)`
      );

      // Cross-references in the full section text (Feature 5)
      const crossRefs = detectCrossReferences(section.parentContent);

      // Entities in the section (Feature 6)
      const entities = extractEntities(section.parentContent);

      // Embed the parent with contextual breadcrumb (Feature 7)
      const parentEmbeddingText = buildEmbeddingText({
        documentTitle: section.documentTitle,
        part:    section.part,
        chapter: section.chapter,
        section: section.section,
        content: section.parentContent,
      });
      const parentEmbedding = await aiService.generateEmbedding(parentEmbeddingText);

      const parentId = await documentRepository.saveSection({
        documentId:    section.documentId,
        documentTitle: section.documentTitle,
        part:          section.part,
        chapter:       section.chapter,
        section:       section.section,
        pageStart:     section.pageStart,
        pageEnd:       section.pageEnd,
        content:       section.parentContent,
        embedding:     parentEmbedding,
        crossRefs,
        entities,
        sectionIndex,
      });

      // Child chunks with their own contextual embeddings
      let prevChildId = null;

      for (let ci = 0; ci < section.childTexts.length; ci++) {
        const childContent = section.childTexts[ci];

        const childEmbeddingText = buildEmbeddingText({
          documentTitle: section.documentTitle,
          part:    section.part,
          chapter: section.chapter,
          section: section.section,
          content: childContent,
        });
        const childEmbedding = await aiService.generateEmbedding(childEmbeddingText);

        const childEntities  = extractEntities(childContent);
        const childCrossRefs = detectCrossReferences(childContent);

        prevChildId = await documentRepository.saveChildChunk({
          parentId,
          documentId:    section.documentId,
          documentTitle: section.documentTitle,
          part:          section.part,
          chapter:       section.chapter,
          section:       section.section,
          pageStart:     section.pageStart,
          pageEnd:       section.pageEnd,
          content:       childContent,
          embedding:     childEmbedding,
          entities:      childEntities,
          crossRefs:     childCrossRefs,
          chunkIndex:    totalChildren,
          childIndex:    ci,
          prevChildId,
        });

        totalChildren++;
      }
    }

    logger.info(
      `Done. Saved ${sectionIndex} parent sections and ${totalChildren} child chunks.`
    );
    process.exit(0);
  } catch (err) {
    logger.error("Seeder failed:", err);
    process.exit(1);
  }
}

seed();
