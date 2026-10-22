import { z } from "zod";

const boolFromString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  AI_PROVIDER: z.enum(["none", "ollama", "openai", "gemini"]).default("none"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(60000),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  GEMINI_BASE_URL: z.string().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  EMBEDDING_PROVIDER: z.enum(["none", "ollama", "openai"]).default("none"),
  EMBEDDING_MODEL: z.string().default("nomic-embed-text"),

  STT_PROVIDER: z.enum(["none", "openai"]).default("none"),
  STT_BASE_URL: z.string().default("https://api.openai.com/v1"),
  STT_API_KEY: z.string().default(""),
  STT_MODEL: z.string().default("whisper-1"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(25),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromString,
});

function loadEnv() {
  const source = {
    ...process.env,
    // Hosts such as Render expose the public origin automatically. Prefer an
    // explicit APP_URL, then the platform URL, then local development.
    APP_URL: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000",
  };
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export type AiProviderName = "ollama" | "openai" | "gemini";

export function getAiConfig():
  | { configured: true; provider: AiProviderName; model: string; missing: [] }
  | { configured: false; provider: AiProviderName; model: string; missing: string[] } {
  const provider = env.AI_PROVIDER;
  if (provider === "none") {
    return {
      configured: false,
      provider: "ollama",
      model: env.OLLAMA_MODEL,
      missing: ["AI_PROVIDER (set to ollama, openai, or gemini)"],
    };
  }
  if (provider === "ollama") {
    return { configured: true, provider, model: env.OLLAMA_MODEL, missing: [] };
  }
  if (provider === "gemini") {
    const missing = env.GEMINI_API_KEY ? [] : ["GEMINI_API_KEY"];
    return missing.length
      ? { configured: false, provider, model: env.GEMINI_MODEL, missing }
      : { configured: true, provider, model: env.GEMINI_MODEL, missing: [] };
  }
  const missing = env.OPENAI_API_KEY ? [] : ["OPENAI_API_KEY"];
  return missing.length
    ? { configured: false, provider, model: env.OPENAI_MODEL, missing }
    : { configured: true, provider, model: env.OPENAI_MODEL, missing: [] };
}

export function getEmbeddingConfig():
  | { configured: true; provider: AiProviderName; model: string }
  | { configured: false; provider: AiProviderName; model: string; missing: string[] } {
  const provider = env.EMBEDDING_PROVIDER;
  if (provider === "none") {
    return { configured: false, provider: "ollama", model: env.EMBEDDING_MODEL, missing: ["EMBEDDING_PROVIDER"] };
  }
  if (provider === "ollama") {
    return { configured: true, provider, model: env.EMBEDDING_MODEL };
  }
  return env.OPENAI_API_KEY
    ? { configured: true, provider, model: env.EMBEDDING_MODEL }
    : { configured: false, provider, model: env.EMBEDDING_MODEL, missing: ["OPENAI_API_KEY"] };
}

export function getSttConfig():
  | { configured: true; provider: "openai"; model: string }
  | { configured: false; missing: string[] } {
  if (env.STT_PROVIDER === "none") return { configured: false, missing: ["STT_PROVIDER"] };
  if (!env.STT_API_KEY) return { configured: false, missing: ["STT_API_KEY"] };
  return { configured: true, provider: env.STT_PROVIDER, model: env.STT_MODEL };
}
