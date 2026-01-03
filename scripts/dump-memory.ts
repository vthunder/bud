#!/usr/bin/env bun
/**
 * Dump L1, L2, L3 memory blocks to stdout for debugging.
 * Usage: bun scripts/dump-memory.ts [--layer N] [--block NAME]
 */

import { Database } from "bun:sqlite";
import { getDbPath } from "../src/config";

const args = process.argv.slice(2);
const layerFilter = args.includes("--layer")
  ? parseInt(args[args.indexOf("--layer") + 1], 10)
  : null;
const blockFilter = args.includes("--block")
  ? args[args.indexOf("--block") + 1]
  : null;

const db = new Database(getDbPath(), { readonly: true });

interface BlockRow {
  name: string;
  value: string;
  layer: number;
  created_at: string;
}

const query = `
  SELECT name, value, layer, created_at
  FROM memory_blocks
  WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
  ORDER BY layer, name
`;

const blocks = db.query(query).all() as BlockRow[];

const layerNames: Record<number, string> = {
  1: "Identity",
  2: "Semantic",
  3: "Working",
  4: "Long-term (should be files)",
};

let currentLayer = -1;

for (const block of blocks) {
  // Apply filters
  if (layerFilter !== null && block.layer !== layerFilter) continue;
  if (blockFilter !== null && block.name !== blockFilter) continue;

  // Only show L1-L3 by default (L4+ should be files)
  if (layerFilter === null && block.layer > 3) continue;

  // Print layer header
  if (block.layer !== currentLayer) {
    currentLayer = block.layer;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`LAYER ${block.layer}: ${layerNames[block.layer] || "Unknown"}`);
    console.log("=".repeat(60));
  }

  console.log(`\n--- ${block.name} ---`);
  console.log(block.value);
}

db.close();
