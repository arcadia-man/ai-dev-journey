# RAG Basic — Sapiens Chat

## What you learn here

- What RAG (Retrieval-Augmented Generation) is and why it exists
- How to chunk a PDF into pieces and store them with embeddings in Neo4j
- How to retrieve relevant chunks by cosine similarity at query time
- How to expand context by fetching neighbouring chunks ([:NEXT] chain)
- Session memory — carrying conversation history across turns
- LLM-based topic routing — decide which tool to use based on the question

## How it works

```
User question
    ↓
Embed question + conversation history → queryVector
    ↓
findSimilarChunks() → cosine(queryVector, chunkVector) for every chunk in Neo4j
    ↓
Take top 5 → expand context for top 2 (fetch prev + next chunk)
    ↓
Build grounded prompt: "Use ONLY these passages to answer..."
    ↓
LLM generates answer
    ↓
Return answer + references (chapter, page, similarity %)
```

## Setup

```bash
cp .env.example .env
npm install

# Copy the Sapiens PDF into static/
# Then seed — embeds all chunks into Neo4j (takes ~10 min)
npm run seed

# Start the server
npm start
```

Open http://localhost:3000

## File map

```
seeders/
  sapiens.seeder.js         ← flat chunking (500 chars), embeds + saves to Neo4j

src/
  config/
    env.js
    neo4j.js                ← driver singleton
    knowledge_base.json     ← topic routing config
  utils/
    logger.js
    math.utils.js           ← cosineSimilarity()
  ai/
    ai.service.js
    providers/ollama.provider.js
  repositories/
    document.repository.js  ← saveChunk, findSimilarChunks, getExpandedContext ← KEY
  services/
    sapiens.service.js      ← RAG pipeline (embed → retrieve → expand → generate) ← KEY
    chat.service.js         ← session memory + topic routing
  controllers/
    sapiens.controller.js
  routes/
    sapiens.routes.js
    index.js
  app.js
  server.js

static/
  chat.html                 ← chat UI
```

## What RAG Advanced improves

This chapter uses flat character-based chunks. The next chapter replaces:
- `saveChunk` → structural section/paragraph detection
- `findSimilarChunks` → hybrid BM25 + vector search
- Flat chunks → parent-child hierarchy with entity metadata
