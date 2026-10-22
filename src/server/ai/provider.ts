import { z } from "zod";
import { AppError, aiUnavailable } from "@/lib/errors";
import { env, getAiConfig, getEmbeddingConfig, getSttConfig } from "@/lib/env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiRuntimeStatus = {
  provider: string;
  model: string;
  configured: boolean;
  missing: string[];
  embeddings: { provider: string; model: string; configured: boolean; missing: string[] };
  speechToText: { configured: boolean; model: string | null; missing: string[] };
  timeoutMs: number;
};

export function aiStatus(): AiRuntimeStatus {
  const config = getAiConfig();
  const embeddings = getEmbeddingConfig();
  const stt = getSttConfig();
  return {
    provider: config.provider,
    model: config.model,
    configured: config.configured,
    missing: config.configured ? [] : config.missing,
    embeddings: {
      provider: embeddings.provider,
      model: embeddings.model,
      configured: embeddings.configured,
      missing: embeddings.configured ? [] : embeddings.missing,
    },
    speechToText: {
      configured: stt.configured,
      model: stt.configured ? stt.model : null,
      missing: stt.configured ? [] : stt.missing,
    },
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

function ensureConfigured() {
  const config = getAiConfig();
  if (!config.configured) {
    throw aiUnavailable(
      "AI is not configured yet. Add a provider to your environment to enable summaries, drafting, and semantic search.",
      config.missing,
    );
  }
  return config;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new AppError(504, "AI_TIMEOUT", "The AI provider took too long to respond. Try a shorter request.");
    }
    throw new AppError(
      502,
      "AI_UNREACHABLE",
      "Could not reach the AI provider. Check that Ollama is running or your hosted provider settings are correct.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function providerError(status: number, body: string): never {
  const snippet = body.replace(/\s+/g, " ").slice(0, 300);
  throw new AppError(
    status === 401 || status === 403 ? 502 : 502,
    "AI_PROVIDER_ERROR",
    `The AI provider returned an error (${status}). ${snippet}`,
  );
}

export async function chat(
  messages: ChatMessage[],
  options: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<{ text: string; provider: string; model: string }> {
  const config = ensureConfigured();
  if (config.provider === "ollama") {
    const response = await fetchWithTimeout(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        ...(options.json ? { format: "json" } : {}),
        options: {
          temperature: options.temperature ?? 0.3,
          ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
        },
      }),
    });
    if (!response.ok) providerError(response.status, await response.text().catch(() => ""));
    const data = (await response.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    if (!text) throw new AppError(502, "AI_EMPTY_RESPONSE", "The AI provider returned an empty response.");
    return { text, provider: config.provider, model: config.model };
  }

  const hosted =
    config.provider === "gemini"
      ? { baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY }
      : { baseUrl: env.OPENAI_BASE_URL, apiKey: env.OPENAI_API_KEY };

  const response = await fetchWithTimeout(
    `${hosted.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hosted.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.3,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.json && config.provider === "openai"
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    },
  );
  if (!response.ok) providerError(response.status, await response.text().catch(() => ""));
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError(502, "AI_EMPTY_RESPONSE", "The AI provider returned an empty response.");
  return { text, provider: config.provider, model: config.model };
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return candidate;
  return candidate.slice(start, end + 1);
}

export async function chatJson<S extends z.ZodTypeAny>(
  messages: ChatMessage[],
  schema: S,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<{ data: z.output<S>; provider: string; model: string; raw: string }> {
  const first = await chat(messages, { ...options, json: true });
  let raw = first.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    parsed = null;
  }
  const result = schema.safeParse(parsed);
  if (result.success) {
    return { data: result.data, provider: first.provider, model: first.model, raw };
  }

  const repair = await chat(
    [
      ...messages,
      { role: "assistant", content: raw.slice(0, 4000) },
      {
        role: "user",
        content:
          "That response did not match the required JSON schema. Return corrected JSON only, with no code fences or commentary.",
      },
    ],
    { ...options, json: true, temperature: 0.1 },
  );
  raw = repair.text;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new AppError(502, "AI_INVALID_RESPONSE", "The AI returned a response that could not be parsed.");
  }
  const repaired = schema.safeParse(parsed);
  if (!repaired.success) {
    throw new AppError(
      502,
      "AI_INVALID_RESPONSE",
      "The AI response was missing required fields. Try again or use a stronger model.",
      repaired.error.issues.slice(0, 5),
    );
  }
  return { data: repaired.data, provider: repair.provider, model: repair.model, raw };
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const config = getEmbeddingConfig();
  if (!config.configured) {
    throw aiUnavailable("Embeddings are not configured.", config.missing);
  }
  if (config.provider === "ollama") {
    const response = await fetchWithTimeout(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, input: texts }),
    });
    if (!response.ok) providerError(response.status, await response.text().catch(() => ""));
    const data = (await response.json()) as { embeddings?: number[][] };
    if (!data.embeddings?.length) throw new AppError(502, "AI_EMPTY_RESPONSE", "No embeddings returned.");
    return data.embeddings;
  }
  const response = await fetchWithTimeout(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });
  if (!response.ok) providerError(response.status, await response.text().catch(() => ""));
  const data = (await response.json()) as { data?: { embedding: number[] }[] };
  if (!data.data?.length) throw new AppError(502, "AI_EMPTY_RESPONSE", "No embeddings returned.");
  return data.data.map((item) => item.embedding);
}

export async function transcribeAudio(
  file: Buffer,
  filename: string,
  mimeType: string,
  language?: string,
): Promise<{ text: string; provider: string; model: string }> {
  const config = getSttConfig();
  if (!config.configured) {
    throw aiUnavailable("Speech-to-text is not configured.", config.missing);
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename);
  form.append("model", config.model);
  if (language) form.append("language", language);
  const response = await fetchWithTimeout(
    `${env.STT_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STT_API_KEY}` },
      body: form,
    },
  );
  if (!response.ok) providerError(response.status, await response.text().catch(() => ""));
  const data = (await response.json()) as { text?: string };
  if (!data.text) throw new AppError(502, "AI_EMPTY_RESPONSE", "The transcription service returned no text.");
  return { text: data.text, provider: "openai-compatible", model: config.model };
}
