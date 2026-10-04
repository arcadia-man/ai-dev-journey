# ai-dev-journey

Learning AI engineering from scratch — one self-contained project per topic.

Each folder is independent: its own `package.json`, its own `README.md`, its own example.

---

## Chapters

| Topic | Example project | What you learn |
|---|---|---|
| `llm-and-embeddings/ollama-hello-world` | Call Ollama from Node.js | LLMs, embedding vectors, provider pattern |
| `vector-search/movie-recommendation` | Semantic movie search | Cosine similarity, vector ranking, layered architecture |
| `vector-db/neo4j-sapiens` | Neo4j + Cypher | Graph storage, Cypher queries, storing embeddings in a DB |
| `rag-basic/sapiens-chat` | Chat with a book | RAG pipeline, flat chunking, cosine retrieval, session memory |
| `rag-advanced/sapiens-chat` | Smarter book chat | Structural chunking, BM25+vector hybrid, entity graph, multi-hop |
| `mcp/sapiens-tools` | MCP server | Model Context Protocol, tools, stdio transport, Kiro integration |

---

## How to use

Each chapter builds on the concepts of the previous one.
Start from `llm-and-embeddings` and work down.

Every chapter has its own `README.md` with setup instructions and a file map.

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.com) running locally
- Neo4j (from chapter 3 onwards) — easiest via Docker:
  ```bash
  docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/localpassword neo4j:5
  ```
