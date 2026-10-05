# Vector DB — Neo4j Sapiens

## What you learn here

- Why a vector DB exists (cosine over a JSON file doesn't scale)
- Neo4j graph model: nodes, relationships, properties
- Cypher query language — the SQL of graph databases
- Storing and querying embedding arrays in Neo4j
- The driver singleton pattern

## Setup

```bash
# Start Neo4j (Docker is the easiest way)
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/localpassword \
  neo4j:5

cp .env.example .env
npm install
npm run verify    # confirms connection works
```

Open http://localhost:7474 — this is the Neo4j Browser where you run Cypher queries.

## The 20-question Cypher guide

`neo4j-cypher-guide.md` — 20 Cypher queries easy → hard, all based on the
Sapiens graph schema built in the RAG chapters. Run them in the Neo4j Browser.

## File map

```
src/
  config/
    env.js               ← Neo4j credentials
    neo4j.js             ← driver singleton + runQuery() helper
  utils/logger.js
  verify-connection.js   ← quick connectivity test
neo4j-cypher-guide.md    ← 20 Cypher questions to learn the query language
```
