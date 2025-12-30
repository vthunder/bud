export function generateMermaidUrl(code: string): string {
  // Handle unicode properly - encode to UTF-8 bytes first
  const utf8Bytes = new TextEncoder().encode(code);
  const base64 = btoa(String.fromCharCode(...utf8Bytes));
  return `https://mermaid.ink/img/${base64}`;
}
