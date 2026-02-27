import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.join(process.cwd(), 'app', 'globals.css');
const css = fs.readFileSync(cssPath, 'utf8');

function extractVars(selector) {
  const blockRe = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const match = css.match(blockRe);
  if (!match) return {};
  const out = {};
  const varRe = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = varRe.exec(match[1]))) out[`--${m[1]}`] = m[2].trim();
  return out;
}

function parseHex(v) {
  const s = v.replace('#', '').trim();
  if (![3, 6].includes(s.length)) return null;
  const hex = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const int = parseInt(hex, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
    a: 1,
  };
}

function parseRgb(v) {
  const m = v.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(',').map((x) => x.trim());
  if (parts.length < 3) return null;
  return {
    r: Number(parts[0]),
    g: Number(parts[1]),
    b: Number(parts[2]),
    a: parts[3] == null ? 1 : Number(parts[3]),
  };
}

function resolveColor(vars, name, stack = new Set()) {
  const raw = vars[name];
  if (!raw) return null;
  if (raw.startsWith('var(')) {
    const ref = raw.match(/var\((--[a-zA-Z0-9-_]+)\)/)?.[1];
    if (!ref || stack.has(ref)) return null;
    stack.add(ref);
    return resolveColor(vars, ref, stack);
  }
  return parseHex(raw) || parseRgb(raw);
}

function relChannel(v) {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function luminance(c) {
  return 0.2126 * relChannel(c.r) + 0.7152 * relChannel(c.g) + 0.0722 * relChannel(c.b);
}

function contrast(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

const root = extractVars(':root');
const dark = { ...root, ...extractVars(":root[data-theme='dark']") };
const light = { ...root, ...extractVars(":root[data-theme='light']") };
const lightVars = Object.keys(light).length > 0 ? light : root;

const pairs = [
  ['--ink', '--bg', 4.5, 'normal text'],
  ['--ink', '--panel', 4.5, 'normal text'],
  ['--ink-2', '--panel', 4.5, 'muted text'],
  ['--brand', '--panel', 3, 'focus/interactive'],
  ['--cc-cluster-hull-stroke', '--cc-graph-bg', 3, 'graphical object'],
];

let failures = 0;
for (const [fg, bg, threshold, label] of pairs) {
  for (const [themeName, vars] of [['light', lightVars], ['dark', dark]]) {
    const c1 = resolveColor(vars, fg);
    const c2 = resolveColor(vars, bg);
    if (!c1 || !c2) {
      console.log(`[warn] ${themeName} missing color for ${fg} vs ${bg}`);
      continue;
    }
    const score = contrast(c1, c2);
    const ok = score >= threshold;
    console.log(`${ok ? '[pass]' : '[fail]'} ${themeName} ${fg} vs ${bg} = ${score.toFixed(2)} (>= ${threshold}, ${label})`);
    if (!ok) failures += 1;
  }
}

if (failures > 0) {
  console.error(`Contrast check failed: ${failures} pair(s) below threshold.`);
  process.exit(1);
}
console.log('Contrast check passed.');
