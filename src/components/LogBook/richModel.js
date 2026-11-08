// Sprint 26.1 — the formatted description of a note. It is DATA, never HTML (the server validates the same shape):
//   { v: 1, lines: [ { k: 'p' | 'ul' | 'ol', runs: [ { t, b?, i?, u?, s?, c?, h? } ] } ] }
//   t = text (no line breaks) · b i u s = bold / italic / underline / strike · c = text colour, h = highlight colour (#rrggbb)
// The editor works on the browser's editing DOM; `domToDoc` reads that DOM back into the document and `docToDom` builds it from the document (createElement /
// textContent only — nothing is ever parsed as HTML). The pages draw a document with React elements (RichText), so a stored note can never run anything.

export const EMPTY_DOC = { v: 1, lines: [] };
export const TEXT_COLORS = ['#e53e3e', '#dd6b20', '#b7791f', '#2f855a', '#2b6cb0', '#6b46c1', '#b83280', '#4a5568'];
export const HIGHLIGHTS = ['#fefcbf', '#feebc8', '#fed7d7', '#c6f6d5', '#bee3f8', '#e9d8fd', '#fed7e2', '#e2e8f0'];
const KEYS = ['b', 'i', 'u', 's', 'c', 'h'];
const sameLook = (a, b) => KEYS.every(k => a[k] === b[k]);

/** plain text → a document (one paragraph per line) */
export const docFromPlain = (text) => ({ v: 1, lines: String(text || '').split('\n').map(l => ({ k: 'p', runs: l ? [{ t: l }] : [] })) });
export const docOfNote = (n) => (n && n.bodyRich && n.bodyRich.lines ? n.bodyRich : docFromPlain(n ? n.body : ''));
export const plainLength = (doc) => (doc && doc.lines ? doc.lines.reduce((n, l) => n + l.runs.reduce((m, r) => m + r.t.length, 0), 0) : 0);
export const isBlank = (doc) => plainLength(doc) === 0 || !doc.lines.some(l => l.runs.some(r => r.t.trim()));

/** '#E53E3E' / 'rgb(229, 62, 62)' → '#e53e3e'; anything else → undefined */
export function toHex(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase(); if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m && (m[4] === undefined || Number(m[4]) > 0)) return `#${[m[1], m[2], m[3]].map(x => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
  return undefined;
}

const BLOCKS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
/** the editing DOM → a document */
export function domToDoc(root) {
  const lines = []; let cur = null;
  const start = (k) => { cur = { k, runs: [] }; lines.push(cur); };
  const walk = (node, st, k) => {
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) {
        const t = String(ch.nodeValue).replace(/[\r\n]+/g, ' ').replace(/ /g, ' ').replace(/​/g, '');
        if (t) { if (!cur) start(k); const run = { t }; KEYS.forEach(x => { if (st[x]) run[x] = st[x]; }); cur.runs.push(run); }
        return;
      }
      if (ch.nodeType !== 1) return;
      const tag = ch.tagName;
      if (tag === 'BR') { if (!cur) start(k); cur = null; return; }
      if (tag === 'UL' || tag === 'OL') { cur = null; walk(ch, st, tag === 'UL' ? 'ul' : 'ol'); cur = null; return; }
      if (tag === 'LI') { cur = null; start(k === 'ul' || k === 'ol' ? k : 'ul'); walk(ch, st, k); cur = null; return; }
      if (BLOCKS.has(tag)) { cur = null; start(k === 'ul' || k === 'ol' ? k : 'p'); walk(ch, tag.startsWith('H') ? { ...st, b: true } : st, k); cur = null; return; }
      const next = { ...st };
      if (tag === 'B' || tag === 'STRONG') next.b = true;
      else if (tag === 'I' || tag === 'EM') next.i = true;
      else if (tag === 'U') next.u = true;
      else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.s = true;
      else if (tag === 'FONT') { const c = toHex(ch.getAttribute('color')); if (c) next.c = c; }
      const style = ch.style;
      if (style) {
        const c = toHex(style.color), h = toHex(style.backgroundColor);
        if (c) next.c = c; if (h) next.h = h;
        if (/^(bold|[6-9]00)$/.test(style.fontWeight || '')) next.b = true;
        if (style.fontStyle === 'italic') next.i = true;
        const deco = style.textDecoration || style.textDecorationLine || ''; if (/underline/.test(deco)) next.u = true; if (/line-through/.test(deco)) next.s = true;
      }
      walk(ch, next, k);
    });
  };
  walk(root, {}, 'p');
  const out = lines.map(l => { const runs = []; l.runs.forEach(r => { const p = runs[runs.length - 1]; if (p && sameLook(p, r)) p.t += r.t; else runs.push({ ...r }); }); return { k: l.k, runs }; });
  while (out.length && !out[out.length - 1].runs.length) out.pop();
  return { v: 1, lines: out };
}

/** a document → the editing DOM (replaces what is inside `root`) */
export function docToDom(doc, root) {
  const d = root.ownerDocument;
  while (root.firstChild) root.removeChild(root.firstChild);
  let list = null;
  const fill = (el, runs) => {
    if (!runs.length) { el.appendChild(d.createElement('br')); return; }
    runs.forEach((r) => {
      let node = d.createTextNode(r.t);
      const wrap = (tag) => { const w = d.createElement(tag); w.appendChild(node); node = w; };
      if (r.b) wrap('b'); if (r.i) wrap('i'); if (r.u) wrap('u'); if (r.s) wrap('s');
      if (r.c || r.h) { const sp = d.createElement('span'); if (r.c) sp.style.color = r.c; if (r.h) sp.style.backgroundColor = r.h; sp.appendChild(node); node = sp; }
      el.appendChild(node);
    });
  };
  (doc && doc.lines ? doc.lines : []).forEach((l) => {
    if (l.k === 'ul' || l.k === 'ol') {
      if (!list || list.tagName.toLowerCase() !== l.k) { list = d.createElement(l.k); root.appendChild(list); }
      const li = d.createElement('li'); fill(li, l.runs); list.appendChild(li);
    } else { list = null; const div = d.createElement('div'); fill(div, l.runs); root.appendChild(div); }
  });
}
