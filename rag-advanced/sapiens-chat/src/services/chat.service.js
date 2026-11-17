// src/services/chat.service.js
// Chat orchestration with knowledge-base routing and callable domain tools.

const aiService = require("../ai/ai.service");
const sapiensService = require("./sapiens.service");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const kbPath = path.join(__dirname, "../config/knowledge_base.json");
const knowledgeBase = JSON.parse(fs.readFileSync(kbPath, "utf-8"));
const MAX_SESSIONS = 100;
const MAX_HISTORY_TURNS = 8;
const sessions = new Map();

const tools = {
  sapiens: {
    name: "search_sapiens_book",
    description: "Retrieve grounded answers from the Sapiens book in Neo4j.",
    execute: (question, history) => sapiensService.chat(question, history),
  },
  movies: {
    name: "recommend_movies",
    description: "Find movies ranked by semantic similarity to the request.",
    execute: recommendMovies,
  },
};

/**
 * Validates and sanitizes user input (Security Check)
 */
function sanitizeInput(question) {
  if (!question || typeof question !== "string") {
    throw new Error("Invalid question format.");
  }
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    throw new Error("Question cannot be empty.");
  }
  if (trimmed.length > 500) {
    throw new Error("Question is too long (max 500 characters).");
  }
  // Basic sanitization
  return trimmed.replace(/[<>]/g, "");
}

async function recommendMovies(question, history) {
  const historyContext = history
    .map((turn) => `User: ${turn.question}\nAssistant: ${turn.answer}`)
    .join("\n");
  const recommendationQuery = [historyContext, `User: ${question}`].filter(Boolean).join("\n");
  const recommendations = await movieService.getRecommendations(recommendationQuery, 3);

  if (recommendations.length === 0) {
    return { answer: "I couldn't find any movie recommendations for that request.", references: [], relatedTopics: [], links: [] };
  }

  const movieContext = recommendations
    .map((movie) => `${movie.movie_name}: ${movie.description}`)
    .join("\n");
  const prompt = `You are a movie recommendation assistant. Use only the movie results below. Conversation context:\n${historyContext || "No earlier turns."}\n\nMovie results:\n${movieContext}\n\nUser request: ${question}\nGive a concise explanation of why the results fit.`;
  const answer = await aiService.generateAnswer(prompt);

  return {
    answer: answer.trim(),
    references: recommendations.map((movie) => ({
      title: movie.movie_name,
      data: movie.description,
      similarity: Math.round(movie.similarity * 1000) / 1000,
    })),
    relatedTopics: [],
    links: recommendations
      .filter((movie) => movie.url)
      .map((movie) => ({ label: "View more", url: movie.url, title: movie.movie_name })),
  };
}

async function answerGeneralQuestion(question, history) {
  const conversation = history
    .map((turn) => `User: ${turn.question}\nAssistant: ${turn.answer}`)
    .join("\n");
  const prompt = `You are a helpful conversational assistant. Answer the user's current message directly and use conversation context to understand follow-ups. You are not limited to the Sapiens book or movie recommendations. If the message is unclear or nonsensical, ask one brief clarifying question. Do not claim to have retrieved sources or invent details from earlier turns.

Conversation context:
${conversation || "No earlier turns."}

Current message: ${question}
Response:`;
  logger.debug("Generating general chat response", { prompt });
  const answer = await aiService.generateAnswer(prompt);
  return { answer: answer.trim(), references: [], relatedTopics: [], links: [] };
}

const generalTool = {
  name: "answer_general_question",
  execute: answerGeneralQuestion,
};

function getSessionId(value) {
  if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  return randomUUID();
}

function getSession(sessionId) {
  if (sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    sessions.delete(sessionId);
    sessions.set(sessionId, existing);
    return existing;
  }

  if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  const session = { history: [] };
  sessions.set(sessionId, session);
  return session;
}

/** Select a tool from the configured knowledge-base topics. */
async function routeQuestion(question, history) {
  const topics = knowledgeBase.topics
    .filter((topic) => tools[topic.id])
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      description: topic.description,
      aliases: topic.aliases,
      scope: topic.scope,
      examples: topic.examples,
      exclude: topic.exclude,
      tool: tools[topic.id].name,
      source: topic.source,
    }));
  const conversation = history
    .map((turn) => `User: ${turn.question}\nAssistant: ${turn.answer}`)
    .join("\n");

  const prompt = `Classify the CURRENT user request into one knowledge-base topic only when the request fits that topic's description and scope. Use exclusions to avoid routing unrelated requests. The current request is the primary signal; use conversation context only to resolve references or clear follow-ups, not to keep routing to an earlier topic when the subject has changed. Return only an exact topic ID from the catalog, or "unknown" when no topic clearly fits.

Knowledge-base topic catalog:
${JSON.stringify(topics, null, 2)}

Conversation context:
${conversation || "No earlier turns."}

Current request: ${question}
Topic ID:`;

  const response = await aiService.generateAnswer(prompt);
  const normalizedResponse = response.trim().toLowerCase();
  const matched = knowledgeBase.topics.find((topic) =>
    tools[topic.id] && new RegExp(`(^|[^a-z0-9_-])${topic.id}($|[^a-z0-9_-])`, "i").test(normalizedResponse)
  );
  logger.debug("Knowledge-base routing result", { prompt, response: response.trim(), topic: matched?.id || "unknown" });
  return matched?.id || "unknown";
}

async function chat(rawQuestion, rawSessionId) {
  const question = sanitizeInput(rawQuestion);
  const sessionId = getSessionId(rawSessionId);
  const session = getSession(sessionId);
  const history = session.history.slice(-MAX_HISTORY_TURNS);

  logger.info("Starting chat turn", { sessionId, question, previousTurns: history.length });
  const targetTopicId = await routeQuestion(question, history);
  const topic = knowledgeBase.topics.find((entry) => entry.id === targetTopicId);
  const isKnowledgeBaseTopic = Boolean(topic && tools[targetTopicId]);
  const selectedTool = isKnowledgeBaseTopic ? tools[targetTopicId] : generalTool;
  const responseTopic = isKnowledgeBaseTopic ? topic.id : "general";

  if (!isKnowledgeBaseTopic) {
    logger.info("No knowledge-base topic matched; using general chat", { sessionId, question });
  }
  logger.info("Calling chat tool", { sessionId, topic: responseTopic, tool: selectedTool.name });
  const result = await selectedTool.execute(question, history);
  session.history.push({ question, answer: result.answer, topic: responseTopic });
  session.history = session.history.slice(-MAX_HISTORY_TURNS);
  logger.info("Completed chat turn", {
    sessionId,
    topic: responseTopic,
    tool: selectedTool.name,
    referenceCount: result.references.length,
    linkCount: result.links.length,
  });

  return {
    schemaVersion: "1.0",
    sessionId,
    topics: [responseTopic],
    answer: result.answer,
    references: result.references,
    relatedTopics: result.relatedTopics,
    links: result.links,
  };
}

module.exports = { chat, routeQuestion };
