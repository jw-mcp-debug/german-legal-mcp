/**
 * Generic section extraction from Markdown text.
 * Supports heading match and line ranges.
 */
export function extractSection(text: string, section: string): string {
  // Line range: "lines:100-200"
  const lineMatch = section.match(/^lines?:(\d+)-(\d+)$/i);
  if (lineMatch) {
    const lines = text.split('\n');
    return lines.slice(Number(lineMatch[1]) - 1, Number(lineMatch[2])).join('\n');
  }

  // Heading match: find section by text, end at next heading of same/higher level
  const lines = text.split('\n');
  const needle = section.toLowerCase();
  const startIdx = lines.findIndex(l => l.toLowerCase().includes(needle));
  if (startIdx === -1) return `Section "${section}" not found.`;

  const headingMatch = lines[startIdx].match(/^(#{1,6})\s/);
  const level = headingMatch ? headingMatch[1].length : 99;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}
