import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

const REQAGENT_DIR = path.join(process.cwd(), ".reqagent");
export const REQAGENT_DB_PATH = path.join(REQAGENT_DIR, "reqagent.db");

type GlobalWithReqAgentDb = typeof globalThis & {
  __reqagentSqlite?: Database.Database;
};

function createDatabase() {
  fs.mkdirSync(REQAGENT_DIR, { recursive: true });

  const sqlite = new Database(REQAGENT_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const globalForDb = globalThis as GlobalWithReqAgentDb;
export const sqlite = globalForDb.__reqagentSqlite ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__reqagentSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });

export type ReqAgentDb = typeof db;

