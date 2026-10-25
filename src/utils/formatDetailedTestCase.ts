const HEADINGS = [
  'Test Case ID', 'Test Case Name', 'Module / Feature', 'Description', 'Preconditions',
  'Test Steps', 'Expected Summary', 'Expected Results', 'Priority', 'Test Type',
  'Test Data Required', 'Estimated Duration',
];
const HEADING_LINE = new RegExp(`^(${HEADINGS.map(h => h.replace(/\//g, '\\/')).join('|')})\\b[^:\\n]*:`, 'i');
const BULLET_SECTIONS = new Set(['preconditions', 'expected summary', 'expected results']);

// Recorded action tags (CLICK, INPUT, ...) become natural sentence-case verbs.
const VERBS: Record<string, string> = {
  CLICK: 'Click', DOUBLE_CLICK: 'Double-click', RIGHT_CLICK: 'Right-click', INPUT: 'Enter', ENTER: 'Enter',
  TYPE: 'Enter', SELECT: 'Select', CHECK: 'Check', UNCHECK: 'Uncheck', INTERACT: 'Interact with',
  VIEW: 'View', NAVIGATE: 'Navigate', SCROLL: 'Scroll', DRAG_DROP: 'Drag and drop', UPLOAD: 'Upload',
  KEYBOARD: 'Press', TOGGLE: 'Toggle', RANGE: 'Adjust', DATE_PICK: 'Select', MULTI_SELECT: 'Select',
  SEARCH: 'Search', EXPAND: 'Expand', COLLAPSE: 'Collapse', SORT: 'Sort', COPY: 'Copy', PASTE: 'Paste',
  PRESS: 'Press', HOVER: 'Hover', OPEN: 'Open', CLOSE: 'Close',
};

function normalizeAction(action: string): string {
  const m = /^([A-Za-z_]+)\b\s*(.*)$/.exec(action);
  if (!m) return action;
  const word = m[1];
  let rest = m[2];
  const upper = word.toUpperCase();
  if (word !== upper && word !== word.toLowerCase()) return action;
  let verb = VERBS[upper] ?? (word === upper ? word[0] + word.slice(1).toLowerCase() : word[0].toUpperCase() + word.slice(1));
  if (upper === 'KEYBOARD') rest = rest.replace(/^(?:press|type)\s+/i, '');
  if (upper === 'NAVIGATE' && /^to\b/i.test(rest)) verb = 'Navigate';
  return `${verb}${rest ? ' ' + rest : ''}`.replace(/\s+\.$/, '.');
}

// Each "Verify:" goes on its own line under its action, verbs are sentence case, and list sections use bullets.
export function formatDetailedTestCase(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').replace(/```[a-z]*\n?/gi, '').split('\n').map(l => l.replace(/\*\*|__|`/g, '').trimEnd());
  const out: string[] = [];
  let section = '';
  let inBlock = false;
  const push = (line: string) => out.push(line);
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };

  for (const original of lines) {
    const line = original.trim();
    if (!line) continue;

    const heading = HEADING_LINE.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      const colon = line.indexOf(':');
      const label = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      const isBlock = BULLET_SECTIONS.has(section) || section === 'test steps';
      if (isBlock || inBlock) blank();
      inBlock = isBlock;
      push(value ? `${label}: ${value}` : `${label}:`);
      continue;
    }

    if (section === 'test steps') {
      const m = /^(\d+)[.)]\s*(.*)$/.exec(line);
      if (m) {
        const [action, ...verifyParts] = m[2].split(/\.?\s*\bVerify\s*:\s*/i);
        const verify = verifyParts.join(' ').trim();
        const cleaned = normalizeAction(action.trim().replace(/\.$/, ''));
        blank();
        push(`${m[1]}. ${cleaned}.`);
        if (verify) push(`   Verify: ${verify.replace(/^[a-z]/, c => c.toUpperCase())}`);
        continue;
      }
      const v = /^Verify\s*:\s*(.*)$/i.exec(line);
      if (v) { push(`   Verify: ${v[1]}`); continue; }
    }

    if (BULLET_SECTIONS.has(section)) {
      push(`• ${line.replace(/^(?:[-*•]|\u2022)\s*/, '')}`);
      continue;
    }
    push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
