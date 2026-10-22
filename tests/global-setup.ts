import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Runs once before the test run. Applies migrations to the dedicated test
 * database so `npm test` is reproducible on a fresh checkout.
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env (or set the variable) and start the database with `npm run db:start`.",
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must point at a separate database from DATABASE_URL.");
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
