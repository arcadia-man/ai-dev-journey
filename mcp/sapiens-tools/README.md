# MCP Learning Lab

A small two-process MCP simulation. One service exposes tools over **Streamable HTTP**; a separate Express app serves one HTML chat page and acts as the MCP client. Ollama plans whether a tool is needed, selects it from the discovered MCP catalog, and writes the response using the conversation and returned data.

```text
Browser (one HTML chat page)
  │ HTTP
  ▼
Express app :3100 ──▶ JSON session store
  ├─ Ollama planner / response composer
  └─ MCP Client ── Streamable HTTP ──▶ MCP server :3101
                                       ├─ 10 utility tools
                                       └─ 7 Sapiens graph tools ──▶ Neo4j
```

## Run

Requires Node.js 18 or newer, Ollama with the configured chat model, and the Neo4j instance used by `rag-advanced/sapiens-chat` for the Sapiens tools.

```sh
npm install
cp .env.example .env
npm start
```
  Pull the configured Ollama model with `ollama pull qwen2.5` if it is not installed.
Open [http://localhost:3100](http://localhost:3100). `npm start` starts both services. To run or inspect them separately, use `npm run start:ui` and `npm run start:mcp` in separate terminals. The MCP endpoint is `http://localhost:3101/mcp`; its health endpoint is `http://localhost:3101/health`.

Set the Neo4j values in `.env` to match the RAG Advanced chapter. Pull the configured Ollama model with `ollama pull llama3` if it is not installed. If the graph has not been seeded yet, run the RAG Advanced chapter's `npm run seed` command first. Utility tools work without Neo4j; Sapiens tools query the seeded `Document`, `Part`, `Chapter`, `Section`, `Chunk`, and `Entity` graph. The Sapiens search tool performs a keyword search over section content; graph tools follow the `HAS_*`, `MENTIONS`, and `REFERENCES` relationships.

## Tools

Utility tools: `calculator`, `unit_converter`, `word_counter`, `current_datetime`, `date_difference`, `tip_calculator`, `bmi_calculator`, `percentage_calculator`, `text_transform`, and `random_integer`.

Sapiens tools: `sapiens_search_sections`, `sapiens_list_chapters`, `sapiens_get_chapter_outline`, `sapiens_find_entity`, `sapiens_related_sections`, `sapiens_graph_overview`, and `sapiens_get_section`.

Each session is stored as a JSON file under `data/sessions/`; the browser keeps its session id and restores the conversation after reload. The tool list and conversation have independent scroll areas. Structured logs report request, planning, tool, response, and persistence stages without logging user message contents. `MCP_URL` is configurable so the client can later point at a separately deployed or authenticated MCP service.