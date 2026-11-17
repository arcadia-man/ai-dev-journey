const ollamaProvider = require("./providers/ollama.provider");

async function generateJson(messages) {
  const content = await ollamaProvider.chat(messages, "json");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`The language model returned invalid JSON: ${error.message}`);
  }
}

async function generateText(messages) {
  return ollamaProvider.chat(messages);
}

module.exports = { generateJson, generateText };