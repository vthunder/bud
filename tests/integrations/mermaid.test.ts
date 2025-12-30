import { describe, expect, test } from "bun:test";
import { generateMermaidUrl } from "../../src/integrations/mermaid";

describe("generateMermaidUrl", () => {
  test("generates valid mermaid.ink URL", () => {
    const code = "graph TD\n  A --> B";
    const url = generateMermaidUrl(code);
    expect(url).toStartWith("https://mermaid.ink/img/");
  });

  test("base64 encodes the diagram code", () => {
    const code = "graph TD\n  A --> B";
    const url = generateMermaidUrl(code);
    // URL should contain base64 encoded content
    const base64Part = url.replace("https://mermaid.ink/img/", "");
    const decoded = atob(base64Part);
    expect(decoded).toBe(code);
  });

  test("handles special characters", () => {
    const code = 'graph TD\n  A["Hello World"] --> B';
    const url = generateMermaidUrl(code);
    expect(url).toStartWith("https://mermaid.ink/img/");
  });

  test("handles unicode characters", () => {
    const code = 'graph TD\n  A["Hello 世界"] --> B';
    const url = generateMermaidUrl(code);
    expect(url).toStartWith("https://mermaid.ink/img/");
  });
});
