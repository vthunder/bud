export function generateMermaidUrl(code: string): string {
  const base64 = btoa(code);
  return `https://mermaid.ink/img/${base64}`;
}
