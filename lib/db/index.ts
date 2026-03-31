import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
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

function tableHasColumn(dbHandle: Database.Database, tableName: string, columnName: string) {
  const rows = dbHandle.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === columnName);
}

function summaryColumnsAlreadyApplied(dbHandle: Database.Database) {
  return (
    tableHasColumn(dbHandle, "threads", "summary_json")
    && tableHasColumn(dbHandle, "threads", "summary_updated_at")
    && tableHasColumn(dbHandle, "workspaces", "summary_json")
    && tableHasColumn(dbHandle, "workspaces", "summary_updated_at")
  );
}

function seedMigrationState(dbHandle: Database.Database, folder: string) {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  dbHandle.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
  `);

  const existing = dbHandle
    .prepare("SELECT created_at FROM __drizzle_migrations")
    .all() as Array<{ created_at?: number }>;
  const existingCreatedAt = new Set(existing.map((row) => Number(row.created_at ?? 0)));
  const insert = dbHandle.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");

  for (const migration of migrations) {
    if (!existingCreatedAt.has(migration.folderMillis)) {
      insert.run(migration.hash, migration.folderMillis);
    }
  }
}

const globalForDb = globalThis as GlobalWithReqAgentDb;
export const sqlite = globalForDb.__reqagentSqlite ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__reqagentSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
const migrationsFolder = path.join(process.cwd(), "drizzle");

if (fs.existsSync(migrationsFolder)) {
  try {
    migrate(db, {
      migrationsFolder,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate column name") && summaryColumnsAlreadyApplied(sqlite)) {
      seedMigrationState(sqlite, migrationsFolder);
    } else {
      throw error;
    }
  }
}

export type ReqAgentDb = typeof db;
