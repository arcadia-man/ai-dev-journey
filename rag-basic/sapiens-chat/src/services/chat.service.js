// src/services/chat.service.js
//
// Orchestrates the full chat turn:
//   - session memory (last 8 turns, up to 100 sessions)
//   - LLM-based topic routing (sapiens vs general)
//   - dispatches to the right tool

const { randomUUID } = require("crypto");
const fs   = require("fs");
const path = require("path");

const aiService     = require("../ai/ai.service");
const sapiensService = require("./sapiens.service");
const logger        = require("../utils/logger");

const knowledgeBase   = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../config/knowledge_base.json"), "utf-8")
);
const MAX_SESSIONS     = 100;
const MAX_HISTORY_TURNS = 8;
const sessions         = new Map();

// ── Tool registry ────────────────────────────────────────────────────────────

const tools = {
  sapiens: {
    name:    "search_sapiens_book",
    execute: (question, history) => sapiensService.chat(question, history),
  },
};

// ── Input sanitisation ───────────────────────────────────────────────────────

function sanitizeInput(question) {
  if (!question || typeof question !== "string") throw new Error("Invalid question.");
  const trimmed = question.trim();
  if (!trimmed)            throw new Error("Question cannot be empty.");
  if (trimmed.length > 500) throw new Error("Question too long (max 500 chars).");
  return trimmed.replace(/[<>]/g, "");
}

// ── Session management ───────────────────────────────────────────────────────

function getSessionId(value) {
  if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  return randomUUID();
}

function getSession(sessionId) {
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    sessions.delete(sessionId);
    sessions.set(sessionId, s);   // refresh LRU position
    return s;
  }
  if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  const s = { history: [] };
  sessions.set(sessionId, s);
  return s;
}

// ── Routing ──────────────────────────────────────────────────────────────────

async function routeQuestion(question, history) {
  const topics = knowledgeBase.topics
    .filter((t) => tools[t.id])
    .map((t) => ({ id: t.id, title: t.title, description: t.description,
                   examples: t.examples, exclude: t.exclude }));

  const conversation = history
    .map((t) => `User: ${t.question}\nAssistant: ${t.answer}`)
    .join("\n");

  const prompt = `Classify the user request into one topic ID or "unknown".
Topics: ${JSON.stringify(topics)}
Conversation: ${conversation || "none"}
Request: ${question}
Topic ID:`;

  const response = await aiService.generateAnswer(prompt);
  const matched  = knowledgeBase.topics.find(
    (t) => tools[t.id] && new RegExp(`(^|[^a-z])${t.id}($|[^a-z])`, "i").test(response.trim())
  );
  return matched?.id || "unknown";
}

// ── General fallback ─────────────────────────────────────────────────────────

async function answerGeneral(question, history) {
  const conversation = history
    .map((t) => `User: ${t.question}\nAssistant: ${t.answer}`)
    .join("\n");

  const prompt = `You are a helpful assistant. Answer the user's question directly.
Conversation: ${conversation || "none"}
Question: ${question}
Answer:`;

  const answer = await aiService.generateAnswer(prompt);
  return { answer: answer.trim(), references: [], relatedTopics: [], links: [] };
}

// ── Main chat entry point ────────────────────────────────────────────────────

async function chat(rawQuestion, rawSessionId) {
  const question  = sanitizeInput(rawQuestion);
  const sessionId = getSessionId(rawSessionId);
  const session   = getSession(sessionId);
  const history   = session.history.slice(-MAX_HISTORY_TURNS);

  logger.info("Chat turn", { sessionId, question });

  const topicId = await routeQuestion(question, history);
  const tool    = tools[topicId];

  const result = tool
    ? await tool.execute(question, history)
    : await answerGeneral(question, history);

  session.history.push({ question, answer: result.answer, topic: topicId || "general" });
  session.history = session.history.slice(-MAX_HISTORY_TURNS);

  return {
    schemaVersion: "1.0",
    sessionId,
    topics:       [topicId || "general"],
    answer:       result.answer,
    references:   result.references,
    relatedTopics: result.relatedTopics,
    links:        result.links,
  };
}

module.exports = { chat };
