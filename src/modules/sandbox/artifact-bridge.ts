/**
 * Bridges sandbox execution results into rich artifacts.
 * When code produces structured output (tables, charts, files),
 * this converts them into displayable artifacts.
 */

export function detectOutputType(stdout: string): 'table' | 'json' | 'csv' | 'text' {
  // CSV detection: lines with consistent comma-separated values
  const lines = stdout.trim().split('\n');
  if (lines.length > 1) {
    const commaCount = (lines[0].match(/,/g) || []).length;
    if (commaCount > 0 && lines.slice(0, 5).every(l => (l.match(/,/g) || []).length === commaCount)) {
      return 'csv';
    }
  }

  // JSON detection
  const trimmed = stdout.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* not valid JSON */ }
  }

  // Table detection: lines with pipes or consistent spacing
  if (lines.some(l => l.includes('|') && l.includes('-'))) return 'table';

  return 'text';
}

export function formatAsTable(csvOrText: string): string {
  // Convert CSV to markdown table
  const lines = csvOrText.trim().split('\n');
  if (lines.length < 2) return csvOrText;

  const headers = lines[0].split(',').map(h => h.trim());
  const separator = headers.map(() => '---').join(' | ');
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()).join(' | '));

  return `${headers.join(' | ')}\n${separator}\n${rows.join('\n')}`;
}
