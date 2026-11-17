const env = require("../../config/env");
const logger = require("../../utils/logger");

async function chat(messages, format) {
  try {
    const response = await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_CHAT_MODEL,
        messages,
        stream: false,
        ...(format ? { format } : {}),
        options: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama chat failed (${response.status}): ${detail.slice(0, 400)}`);
    }

    const result = await response.json();
    logger.debug("ollama.chat.completed", {
      model: env.OLLAMA_CHAT_MODEL,
      messageCount: messages.length,
      responseLength: result.message?.content?.length || 0,
      structuredOutput: Boolean(format),
    });
    return result.message?.content || "";
  } catch (error) {
    logger.error("ollama.chat.failed", { model: env.OLLAMA_CHAT_MODEL, error: error.message });
    throw error;
  }
}

module.exports = { chat };