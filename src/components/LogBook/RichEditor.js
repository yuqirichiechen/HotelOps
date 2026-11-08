// Sprint 26.1 — formatted text for a note's description: a small toolbar (bold · italic · underline · strike · text colour · highlight · bullets · numbers · clear)
// over a contentEditable box. The value is a DOCUMENT (see richModel.js), not HTML: the box is filled from it with createElement and read back with domToDoc, and
// pasting inserts plain text only — so whatever is typed or pasted ends up as a handful of styled text runs and nothing else.
// `RichText` draws a document read-only with React elements (used on the note cards).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Floating, Ic } from './pickers';
import { docToDom, domToDoc, isBlank, TEXT_COLORS, HIGHLIGHTS } from './richModel';

const Run = ({ r }) => {
  let el = r.t;
  if (r.b) el = <strong>{el}</strong>; if (r.i) el = <em>{el}</em>; if (r.u) el = <u>{el}</u>; if (r.s) el = <s>{el}</s>;
  if (r.c || r.h) el = <span style={{ ...(r.c ? { color: r.c } : {}), ...(r.h ? { backgroundColor: r.h, borderRadius: 3, padding: '0 2px' } : {}) }}>{el}</span>;
  return el;
};

export const RichText = ({ doc }) => {
  const blocks = []; let list = null;
  ((doc && doc.lines) || []).forEach((l, i) => {
    const content = l.runs.length ? l.runs.map((r, j) => <Run key={j} r={r} />) : <br />;
    if (l.k === 'p') { list = null; blocks.push(<p key={i}>{content}</p>); return; }
    if (!list || list.k !== l.k) { list = { k: l.k, key: i, items: [] }; blocks.push(list); }
    list.items.push(<li key={i}>{content}</li>);
  });
  return <div className="lb-rich">{blocks.map(b => (b.items ? React.createElement(b.k, { key: b.key }, b.items) : b))}</div>;
};

const Tool = ({ label, on, onClick, children, btnRef }) => (
  <button type="button" ref={btnRef} className={`lb-tool${on ? ' on' : ''}`} aria-label={label} title={label} aria-pressed={on === undefined ? undefined : !!on} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
);

const RichEditor = ({ value, onChange, ariaLabel = 'Description', placeholder = '' }) => {
  const box = useRef(null), emitted = useRef(null), colorBtn = useRef(null), hiBtn = useRef(null);
  const [pal, setPal] = useState(null);            // 'color' | 'hilite' | null
  const [state, setState] = useState({});
  // fill the box when the document comes from outside (a different note opened); typing emits the document itself, so that case is skipped
  useLayoutEffect(() => { if (box.current && value !== emitted.current) { docToDom(value, box.current); emitted.current = value; } }, [value]);
  const refresh = () => {
    const q = (c) => { try { return !!document.queryCommandState(c); } catch { return false; } };
    setState({ b: q('bold'), i: q('italic'), u: q('underline'), s: q('strikeThrough'), ul: q('insertUnorderedList'), ol: q('insertOrderedList') });
  };
  const sync = () => { const doc = domToDoc(box.current); emitted.current = doc; onChange(doc); refresh(); };
  const exec = (cmd, arg) => {
    box.current.focus();
    if (typeof document.execCommand === 'function') { try { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, arg); } catch { /* an old browser */ } }
    sync();
  };
  useEffect(() => { document.addEventListener('selectionchange', refresh); return () => document.removeEventListener('selectionchange', refresh); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const paste = (e) => {          // plain text only: no foreign HTML ever gets in
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (typeof text !== 'string') return;
    e.preventDefault(); if (typeof document.execCommand === 'function') document.execCommand('insertText', false, text); sync();
  };
  const swatches = (list, cmd, label) => (
    <Floating anchorRef={pal === 'color' ? colorBtn : hiBtn} onClose={() => setPal(null)} height={110} width={184} className="lb-swatchpop">
      <div className="lb-swatches" role="group" aria-label={label}>
        {list.map(c => <button key={c} type="button" className="lb-swatch" style={{ background: c }} aria-label={`${label} ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setPal(null); exec(cmd, c); }} />)}
        {cmd === 'hiliteColor' && <button type="button" className="lb-swatch none" aria-label="No highlight" title="No highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => { setPal(null); exec('hiliteColor', 'transparent'); }}><Ic.X size={12} sw={2.6} /></button>}
      </div>
    </Floating>
  );
  return (
    <div className="lb-richbox">
      <div className="lb-toolbar-rt" role="toolbar" aria-label="Text formatting">
        <Tool label="Bold" on={state.b} onClick={() => exec('bold')}><b>B</b></Tool>
        <Tool label="Italic" on={state.i} onClick={() => exec('italic')}><i>I</i></Tool>
        <Tool label="Underline" on={state.u} onClick={() => exec('underline')}><u>U</u></Tool>
        <Tool label="Strikethrough" on={state.s} onClick={() => exec('strikeThrough')}><s>S</s></Tool>
        <span className="lb-tool-sep" aria-hidden="true" />
        <Tool label="Text colour" btnRef={colorBtn} onClick={() => setPal(p => (p === 'color' ? null : 'color'))}><span className="lb-tool-a">A</span><i className="lb-tool-bar" /></Tool>
        <Tool label="Highlight" btnRef={hiBtn} onClick={() => setPal(p => (p === 'hilite' ? null : 'hilite'))}><span className="lb-tool-hl">ab</span></Tool>
        <span className="lb-tool-sep" aria-hidden="true" />
        <Tool label="Bulleted list" on={state.ul} onClick={() => exec('insertUnorderedList')}>•≡</Tool>
        <Tool label="Numbered list" on={state.ol} onClick={() => exec('insertOrderedList')}>1≡</Tool>
        <span className="lb-tool-sep" aria-hidden="true" />
        <Tool label="Clear formatting" onClick={() => exec('removeFormat')}><Ic.X size={14} sw={2.4} /></Tool>
      </div>
      <div ref={box} className={`lb-editor lb-input${isBlank(value) ? ' is-empty' : ''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={ariaLabel} data-placeholder={placeholder}
        onInput={sync} onBlur={sync} onKeyUp={refresh} onMouseUp={refresh} onPaste={paste} />
      {pal === 'color' && swatches(TEXT_COLORS, 'foreColor', 'Text colour')}
      {pal === 'hilite' && swatches(HIGHLIGHTS, 'hiliteColor', 'Highlight')}
    </div>
  );
};

export default RichEditor;
