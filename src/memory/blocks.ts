import { Database } from "bun:sqlite";

let db: Database | null = null;

export function initDatabase(dbPath: string): void {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value TEXT,
      layer INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_name ON memory_blocks(name);
    CREATE INDEX IF NOT EXISTS idx_blocks_layer ON memory_blocks(layer);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabase(): Database {
  if (!db) throw new Error("Database not initialized. Call initDatabase first.");
  return db;
}

export interface MemoryBlock {
  id: number;
  name: string;
  value: string;
  layer: number;
  created_at: string;
}

export function setBlock(name: string, value: string, layer: number = 4): void {
  const database = getDatabase();
  database.prepare(
    "INSERT INTO memory_blocks (name, value, layer) VALUES (?, ?, ?)"
  ).run(name, value, layer);
}

export function getBlock(name: string): string | null {
  const database = getDatabase();
  const row = database.prepare(
    "SELECT value FROM memory_blocks WHERE name = ? ORDER BY id DESC LIMIT 1"
  ).get(name) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllCurrentBlocks(): Record<string, string> {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT name, value FROM memory_blocks
    WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
    ORDER BY layer, name
  `).all() as { name: string; value: string }[];

  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}

export function getBlockHistory(name: string): MemoryBlock[] {
  const database = getDatabase();
  return database.prepare(
    "SELECT * FROM memory_blocks WHERE name = ? ORDER BY id"
  ).all(name) as MemoryBlock[];
}

export function getBlocksByLayer(layer: number): Record<string, string> {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT name, value FROM memory_blocks
    WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
    AND layer = ?
    ORDER BY name
  `).all(layer) as { name: string; value: string }[];

  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}
