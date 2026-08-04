/**
 * ollamaLLMService
 * ─────────────────────────────────────────────────────────────────
 * Self-hosted LLM gateway backed by an Ollama instance running
 * `qwen2.5:7b`. Mirrors the public surface of `rapidApiLLMService`
 * (`chatCompletion`, `chatJson`, `extractJson`) so call sites can be
 * swapped 1:1 through `llmProvider`.
 *
 *   POST ${OLLAMA_URL}/api/chat
 *   body: { model, messages, stream: false, format?, options }
 */

const axios = require('axios');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://32.192.131.130:11434').replace(/\/+$/, '');
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const DEFAULT_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || '45000', 10);

const JSON_SYSTEM_HINT =
  'You are a strict JSON generator. Respond with one valid JSON object only. ' +
  'No markdown, no code fences, no commentary before or after the JSON.';

async function chatCompletion({
  prompt,
  systemPrompt = '',
  json = false,
  maxTokens = 1500,
  temperature = 0.1,
  topK = 5,
  topP = 0.9,
  timeoutMs = DEFAULT_TIMEOUT,
} = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('ollamaLLMService.chatCompletion: prompt is required');
  }

  const sys = systemPrompt || (json ? JSON_SYSTEM_HINT : '');

  const messages = [];
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: MODEL,
    messages,
    stream: false,
    options: {
      temperature,
      top_k: topK,
      top_p: topP,
      num_predict: maxTokens,
    },
  };
  if (json) body.format = 'json';

  const res = await axios.post(`${OLLAMA_URL}/api/chat`, body, {
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });

  const data = res.data;
  const text =
       data?.message?.content
    || data?.response
    || (typeof data === 'string' ? data : '')
    || '';

  if (!text || typeof text !== 'string') {
    throw new Error(`ollamaLLMService: empty / unrecognized response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return text.trim();
}

function extractJson(text) {
  if (!text) return null;
  if (typeof text === 'object') return text;
  const s = String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(s); } catch (_) { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

async function chatJson(opts) {
  const text = await chatCompletion({ ...opts, json: true });
  return extractJson(text);
}

async function ping(timeoutMs = 5000) {
  const t0 = Date.now();
  const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: timeoutMs });
  const models = (res.data?.models || []).map((m) => m.name || m.model);
  return {
    ok: true,
    url: OLLAMA_URL,
    expected_model: MODEL,
    model_available: models.includes(MODEL),
    models,
    latency_ms: Date.now() - t0,
  };
}

module.exports = {
  chatCompletion,
  chatJson,
  extractJson,
  ping,
  _config: { OLLAMA_URL, MODEL, DEFAULT_TIMEOUT },
};
