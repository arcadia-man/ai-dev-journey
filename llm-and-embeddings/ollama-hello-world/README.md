# LLM and Embeddings — Ollama Hello World

## What you learn here

- What an LLM is and how to call one from Node.js
- What an embedding vector is (a number[] that represents meaning)
- How Ollama runs models locally (no API key, no cloud)
- The Provider pattern — swap AI backends without changing anything else

## Prerequisites

1. Install Ollama: https://ollama.com
2. Pull the models:
   ```bash
   ollama pull nomic-embed-text
   ollama pull llama3
   ```

## Setup

```bash
cp .env.example .env
npm install
npm start
```

## What runs

`src/run.js` calls Ollama twice:
1. Embeds a sentence → prints the 768-dimensional vector (first 5 values)
2. Sends a prompt → prints the LLM's answer

## File map

```
src/
  config/env.js                  ← loads .env, exports config
  utils/logger.js                ← winston logger
  ai/
    ai.service.js                ← the only AI entry point for the rest of the app
    providers/
      ollama.provider.js         ← raw HTTP calls to Ollama API
  run.js                         ← demo entry point
```
