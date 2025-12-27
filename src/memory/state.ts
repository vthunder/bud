import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_STATE_DIR = "./state";

export async function readState(
  filename: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<string> {
  const filepath = join(stateDir, filename);

  if (!existsSync(filepath)) {
    return "";
  }

  return readFile(filepath, "utf-8");
}

export async function writeState(
  filename: string,
  content: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<void> {
  const filepath = join(stateDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(filepath, content, "utf-8");
}

export async function appendToState(
  filename: string,
  content: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<void> {
  const filepath = join(stateDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await appendFile(filepath, content, "utf-8");
}
