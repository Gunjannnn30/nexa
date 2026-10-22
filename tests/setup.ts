import "dotenv/config";

/**
 * Test environment. This file runs before any test module is imported, so the
 * Prisma client is constructed against the dedicated test database.
 */
const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for tests. Add it to .env (see .env.example).",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error("Refusing to run tests against the development database.");
}

const testEnv = process.env as Record<string, string | undefined>;

testEnv.NODE_ENV = "test";
testEnv.DATABASE_URL = testUrl;
testEnv.AI_PROVIDER = "none";
testEnv.EMBEDDING_PROVIDER = "none";
testEnv.STT_PROVIDER = "none";
testEnv.STORAGE_DRIVER = "local";
testEnv.STORAGE_LOCAL_DIR = "./storage/test-uploads";
