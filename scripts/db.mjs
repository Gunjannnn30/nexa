#!/usr/bin/env node
/**
 * Local PostgreSQL control for developers without Docker.
 *
 * Uses the embedded PostgreSQL binaries (PostgreSQL 17) shipped as an npm
 * dependency, initialises a UTF-8 cluster in .pgdata, and runs it detached via
 * pg_ctl so the database survives the parent shell. Development convenience
 * only — production should use a managed PostgreSQL instance.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const port = Number(process.env.PG_PORT || 5432);
const dataDir = path.resolve(root, process.env.PG_DATA_DIR || ".pgdata");
const user = process.env.PG_USER || "postgres";
const password = process.env.PG_PASSWORD || "postgres";
const databases = [
  process.env.PG_DATABASE || "nexa",
  process.env.PG_TEST_DATABASE || "nexa_test",
].filter(Boolean);

const binDir = path.join(root, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const pgCtl = path.join(binDir, "pg_ctl.exe");
const initdb = path.join(binDir, "initdb.exe");
const logFile = path.join(dataDir, "postgres.log");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed (${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return result;
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

async function ensureDatabases() {
  const client = new pg.Client({
    host: "127.0.0.1",
    port,
    user,
    password,
    database: "postgres",
  });
  await client.connect();
  try {
    for (const db of databases) {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
      if (exists.rowCount === 0) {
        const escaped = `"${db.replace(/"/g, '""')}"`;
        await client.query(`CREATE DATABASE ${escaped} ENCODING 'UTF8'`);
        console.log(`Created database ${db}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (!existsSync(pgCtl)) {
    throw new Error(
      "Embedded PostgreSQL binaries are missing. Run `npm install` first (package @embedded-postgres/windows-x64).",
    );
  }
  if (!(await isPortOpen())) {
    if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
      mkdirSync(dataDir, { recursive: true });
      console.log(`Initialising UTF-8 PostgreSQL cluster in ${dataDir}`);
      const pwFile = path.join(root, ".pgpass.init");
      writeFileSync(pwFile, `${password}\n`, { encoding: "utf8" });
      try {
        run(initdb, [
          "-D", dataDir,
          "-U", user,
          "-E", "UTF8",
          "--locale=C",
          "--auth-local=trust",
          "--auth-host=scram-sha-256",
          `--pwfile=${pwFile}`,
        ]);
      } finally {
        try {
          unlinkSync(pwFile);
        } catch {
          /* ignore */
        }
      }
    }
    console.log(`Starting PostgreSQL on 127.0.0.1:${port}`);
    run(pgCtl, ["-D", dataDir, "-l", logFile, "-o", `-p ${port}`, "-w", "start"], {
      stdio: "ignore",
      timeout: 60000,
    });
  } else {
    console.log(`PostgreSQL already listening on 127.0.0.1:${port}`);
  }
  await ensureDatabases();
  console.log("PostgreSQL ready.");
}

async function stop() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("No local database cluster found.");
    return;
  }
  if (!(await isPortOpen())) {
    console.log("PostgreSQL is not running.");
    return;
  }
  run(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "stop"], {
    stdio: "ignore",
    timeout: 60000,
  });
  console.log("PostgreSQL stopped.");
}

async function status() {
  const open = await isPortOpen();
  if (open) {
    console.log(`PostgreSQL running on 127.0.0.1:${port}`);
  } else {
    console.log("PostgreSQL not running");
    process.exitCode = 1;
  }
}

async function reset() {
  await stop().catch(() => {});
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  await start();
}

const command = process.argv[2] || "start";
try {
  if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "status") await status();
  else if (command === "reset") await reset();
  else {
    console.error("Usage: node scripts/db.mjs <start|stop|status|reset>");
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
