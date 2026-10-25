const SECTION_HEADINGS = [
  'Test Case ID',
  'Test Case Name',
  'Module / Feature',
  'Description',
  'Preconditions',
  'Test Steps',
  'Expected Results',
  'Priority',
  'Test Type',
  'Test Data Required',
  'Estimated Duration',
];

const HEADING_LINE = new RegExp(`^(${SECTION_HEADINGS.map(h => h.replace(/[/]/g, '\\/')).join('|')})\\s*:`, 'i');
const LONG_SECTIONS = new Set(['preconditions', 'test steps', 'expected results']);

// Turns Markdown-style model output into plain, readable text with blank lines between sections.
export function formatTestCaseText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z]*\n?/gi, '')
    .split('\n')
    .map(line => {
      let l = line.replace(/\*\*|__|`/g, '').trimEnd();
      l = l.replace(/^\s*#{1,6}\s*/, '');
      l = l.replace(/^\s*(?:[-*•]|\u2022)\s+/, '');
      // Unwrap [placeholder] text but keep checkbox-like or empty brackets out of the result.
      l = l.replace(/\[([^\]\n]+)\]/g, '$1');
      return l;
    });

  const out: string[] = [];
  let step = 0;
  let inNumberedSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const heading = HEADING_LINE.exec(trimmed);
    if (heading) {
      const name = heading[1].toLowerCase();
      const prevIsShortField = out.length > 0 && HEADING_LINE.test(out[out.length - 1]) && !inNumberedSection;
      if (out.length && out[out.length - 1] !== '' && !(prevIsShortField && !LONG_SECTIONS.has(name))) out.push('');
      inNumberedSection = LONG_SECTIONS.has(name);
      step = 0;
      out.push(trimmed);
      continue;
    }
    if (inNumberedSection) {
      const body = trimmed.replace(/^(?:Step\s*)?\d+[.):]\s*/i, '');
      step += 1;
      out.push(`${step}. ${body}`);
    } else {
      out.push(trimmed);
    }
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
