import { describe, expect, test } from "bun:test";
import { parseReposJson } from "../../src/integrations/github";

describe("parseReposJson", () => {
  test("parses valid JSON array", () => {
    const repos = parseReposJson('["owner/repo1", "owner/repo2"]');
    expect(repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  test("returns empty array for empty string", () => {
    const repos = parseReposJson("");
    expect(repos).toEqual([]);
  });

  test("returns empty array for invalid JSON", () => {
    const repos = parseReposJson("not json");
    expect(repos).toEqual([]);
  });

  test("returns empty array for non-array JSON", () => {
    const repos = parseReposJson('{"key": "value"}');
    expect(repos).toEqual([]);
  });
});
