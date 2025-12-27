import { appendFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_LOG_DIR = "./state/logs";

export interface LogEntry {
  timestamp: string;
  type: string;
  content: string;
  [key: string]: unknown;
}

export async function appendLog(
  filename: string,
  entry: LogEntry,
  logDir: string = DEFAULT_LOG_DIR
): Promise<void> {
  const filepath = join(logDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + "\n";
  await appendFile(filepath, line, "utf-8");
}

export async function readLogs(
  filename: string,
  logDir: string = DEFAULT_LOG_DIR
): Promise<LogEntry[]> {
  const filepath = join(logDir, filename);

  if (!existsSync(filepath)) {
    return [];
  }

  const content = await readFile(filepath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as LogEntry);
}
