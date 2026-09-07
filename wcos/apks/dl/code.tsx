// ─────────────────────────────────────────────────────────────────────────────
// code.tsx — "WCode", a VS Code-like editor for WCOS.
//
// Self-contained: activity bar, file explorer, tabs, syntax-highlighted editor
// with line numbers + minimap, command palette, quick open, search, source
// control, problems, an integrated terminal, and a status bar.
//
// Nothing outside this file is imported or modified.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  CornerDownLeft,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  Files,
  FolderPlus,
  GitBranch,
  Hash,
  Info,
  Layers,
  type LucideIcon,
  Play,
  Puzzle,
  RotateCcw,
  Save,
  Search,
  Settings as SettingsIcon,
  SplitSquareHorizontal,
  Terminal as TerminalIcon,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   virtual workspace
   ═══════════════════════════════════════════════════════════════════════════ */

interface FSNode {
  type: 'file' | 'dir';
  content?: string;
}
type FS = Record<string, FSNode>;

const ROOT = '/wcos-app';

const SEED: FS = {
  [ROOT]: { type: 'dir' },
  [`${ROOT}/src`]: { type: 'dir' },
  [`${ROOT}/src/components`]: { type: 'dir' },
  [`${ROOT}/public`]: { type: 'dir' },
  [`${ROOT}/src/main.ts`]: {
    type: 'file',
    content: `import { createApp } from './app';
import { registerShortcuts } from './shortcuts';

// Boot the WCOS shell. Everything below runs in the browser —
// no database, no server round-trips.
const app = createApp({
  name: 'WCOS',
  version: '1.0',
  volume: '../WCOSData',
});

registerShortcuts(app);

app.on('ready', () => {
  console.log(\`\${app.name} \${app.version} ready\`);
});

export default app;
`,
  },
  [`${ROOT}/src/app.ts`]: {
    type: 'file',
    content: `export interface AppOptions {
  name: string;
  version: string;
  volume: string;
}

type Handler = (payload?: unknown) => void;

export function createApp(options: AppOptions) {
  const listeners = new Map<string, Handler[]>();

  function on(event: string, handler: Handler) {
    const list = listeners.get(event) ?? [];
    list.push(handler);
    listeners.set(event, list);
  }

  function emit(event: string, payload?: unknown) {
    for (const handler of listeners.get(event) ?? []) {
      handler(payload);
    }
  }

  // TODO: persist window layout between sessions
  queueMicrotask(() => emit('ready'));

  return { ...options, on, emit };
}
`,
  },
  [`${ROOT}/src/shortcuts.ts`]: {
    type: 'file',
    content: `const BINDINGS = {
  'mod+p': 'quickOpen',
  'mod+shift+p': 'commandPalette',
  'mod+s': 'save',
  'mod+b': 'toggleSidebar',
} as const;

export function registerShortcuts(app: { emit: (e: string) => void }) {
  window.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;

    const combo = [
      'mod',
      event.shiftKey ? 'shift' : '',
      event.key.toLowerCase(),
    ]
      .filter(Boolean)
      .join('+');

    const command = BINDINGS[combo as keyof typeof BINDINGS];
    if (command) {
      event.preventDefault();
      app.emit(command);
    }
  });
}
`,
  },
  [`${ROOT}/src/components/Window.tsx`]: {
    type: 'file',
    content: `interface WindowProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function Window({ title, children, onClose }: WindowProps) {
  return (
    <section className="window">
      <header className="titlebar">
        <span className="title">{title}</span>
        <button onClick={onClose} aria-label="Close">
          x
        </button>
      </header>
      <div className="content">{children}</div>
    </section>
  );
}

// FIXME: keyboard focus escapes the window when tabbing backwards
export default Window;
`,
  },
  [`${ROOT}/src/theme.css`]: {
    type: 'file',
    content: `:root {
  --bg: #1e1e1e;
  --fg: #d4d4d4;
  --accent: #0a7aca;
  --radius: 10px;
}

.window {
  background: var(--bg);
  color: var(--fg);
  border-radius: var(--radius);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}
`,
  },
  [`${ROOT}/package.json`]: {
    type: 'file',
    content: `{
  "name": "wcos-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "19.2.6",
    "react-dom": "19.2.6"
  }
}
`,
  },
  [`${ROOT}/README.md`]: {
    type: 'file',
    content: `# WCOS App

A sample workspace running inside **WCode**, the VS Code-like editor
built for WCOS.

## Try it

- \`Ctrl/Cmd + P\` — quick open a file
- \`Ctrl/Cmd + Shift + P\` — command palette
- \`Ctrl/Cmd + S\` — save the active file
- \`Ctrl/Cmd + B\` — toggle the sidebar
- \`Ctrl/Cmd + \\\`\` — toggle the panel

## Notes

Everything here lives in memory. Edits mark tabs dirty until you save.
`,
  },
  [`${ROOT}/public/index.html`]: {
    type: 'file',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>WCOS App</title>
    <link rel="stylesheet" href="/src/theme.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  },
};

/* ── path helpers ─────────────────────────────────────────────────────────── */

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const dirName = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';

function extName(p: string): string {
  const base = baseName(p);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

type Lang = 'ts' | 'json' | 'css' | 'html' | 'md' | 'plain';

function languageOf(p: string): Lang {
  switch (extName(p)) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'ts';
    case 'json':
      return 'json';
    case 'css':
    case 'scss':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
      return 'md';
    default:
      return 'plain';
  }
}

const LANG_LABEL: Record<Lang, string> = {
  ts: 'TypeScript',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  md: 'Markdown',
  plain: 'Plain Text',
};

function iconFor(p: string): { Icon: LucideIcon; color: string } {
  switch (extName(p)) {
    case 'ts':
    case 'tsx':
      return { Icon: FileCode2, color: '#4ea3e8' };
    case 'js':
    case 'jsx':
    case 'mjs':
      return { Icon: FileCode2, color: '#e5c07b' };
    case 'json':
      return { Icon: FileJson, color: '#e5c07b' };
    case 'css':
    case 'scss':
      return { Icon: Hash, color: '#61afef' };
    case 'html':
      return { Icon: FileCode2, color: '#e06c47' };
    case 'md':
      return { Icon: FileText, color: '#7fb3d5' };
    default:
      return { Icon: FileText, color: '#9aa4b2' };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   tokenizer
   ═══════════════════════════════════════════════════════════════════════════ */

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'extends', 'new', 'import', 'from', 'export', 'default', 'async',
  'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'this',
  'super', 'null', 'undefined', 'true', 'false', 'interface', 'type', 'enum',
  'implements', 'public', 'private', 'readonly', 'static', 'void', 'never',
  'switch', 'case', 'break', 'continue', 'do', 'yield', 'of', 'in', 'delete',
  'as', 'keyof', 'satisfies',
]);

type TokKind = 'kw' | 'str' | 'num' | 'cm' | 'fn' | 'op' | 'tag' | 'attr' | 'prop' | 'head';

interface Tok {
  text: string;
  kind?: TokKind;
}

const TOK_COLOR: Record<TokKind, string> = {
  kw: '#c586c0',
  str: '#ce9178',
  num: '#b5cea8',
  cm: '#6a9955',
  fn: '#dcdcaa',
  op: '#d4d4d4',
  tag: '#569cd6',
  attr: '#9cdcfe',
  prop: '#9cdcfe',
  head: '#569cd6',
};

function tokenizeLine(line: string, lang: Lang, state: { block: boolean }): Tok[] {
  const out: Tok[] = [];
  const push = (text: string, kind?: TokKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };

  if (lang === 'md') {
    if (/^\s{0,3}#{1,6}\s/.test(line)) return [{ text: line, kind: 'head' }];
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const m = /^(\s*(?:[-*+]|\d+\.)\s)(.*)$/.exec(line)!;
      return [{ text: m[1], kind: 'kw' }, { text: m[2] }];
    }
    if (/^\s*>/.test(line)) return [{ text: line, kind: 'cm' }];
    if (/^\s*```/.test(line)) return [{ text: line, kind: 'str' }];
    let rest = line;
    const res: Tok[] = [];
    const re = /(`[^`]+`|\*\*[^*]+\*\*)/;
    let m = re.exec(rest);
    while (m) {
      res.push({ text: rest.slice(0, m.index) });
      res.push({ text: m[0], kind: m[0].startsWith('`') ? 'str' : 'fn' });
      rest = rest.slice(m.index + m[0].length);
      m = re.exec(rest);
    }
    res.push({ text: rest });
    return res;
  }

  let i = 0;

  if (state.block) {
    const end = line.indexOf('*/');
    if (end === -1) return [{ text: line, kind: 'cm' }];
    push(line.slice(0, end + 2), 'cm');
    state.block = false;
    i = end + 2;
  }

  while (i < line.length) {
    const rest = line.slice(i);

    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end === -1) {
        push(rest, 'cm');
        state.block = true;
        break;
      }
      push(rest.slice(0, end + 2), 'cm');
      i += end + 2;
      continue;
    }
    if ((lang === 'ts' || lang === 'css') && rest.startsWith('//')) {
      push(rest, 'cm');
      break;
    }
    if (lang === 'html' && rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      const chunk = end === -1 ? rest : rest.slice(0, end + 3);
      push(chunk, 'cm');
      i += chunk.length;
      continue;
    }

    if (lang === 'html' && rest[0] === '<') {
      const close = rest.indexOf('>');
      const chunk = close === -1 ? rest : rest.slice(0, close + 1);
      const tagMatch = /^<\/?[\w-]+/.exec(chunk);
      if (tagMatch) {
        push(tagMatch[0], 'tag');
        const inner = chunk.slice(tagMatch[0].length);
        const attrRe = /([\w-]+)(=)("[^"]*"|'[^']*')?/g;
        let cursor = 0;
        let am = attrRe.exec(inner);
        while (am) {
          push(inner.slice(cursor, am.index), 'op');
          push(am[1], 'attr');
          push(am[2], 'op');
          if (am[3]) push(am[3], 'str');
          cursor = am.index + am[0].length;
          am = attrRe.exec(inner);
        }
        push(inner.slice(cursor), 'tag');
      } else {
        push(chunk, 'tag');
      }
      i += chunk.length;
      continue;
    }

    const ch = rest[0];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === '\\') j += 2;
        else if (rest[j] === ch) {
          j += 1;
          break;
        } else j += 1;
      }
      push(rest.slice(0, j), 'str');
      i += j;
      continue;
    }

    const num = /^0[xX][0-9a-fA-F]+|^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    if (num) {
      push(num[0], 'num');
      i += num[0].length;
      continue;
    }

    const word = /^[A-Za-z_$@#.-][\w$-]*/.exec(rest);
    if (word) {
      const w = word[0];
      const after = rest.slice(w.length);
      let kind: TokKind | undefined;

      if (lang === 'json') {
        kind = /^\s*:/.test(after) ? 'prop' : undefined;
      } else if (lang === 'css') {
        if (w.startsWith('@') || w.startsWith('.') || w.startsWith('#')) kind = 'tag';
        else if (/^\s*:/.test(after)) kind = 'attr';
      } else if (KEYWORDS.has(w)) {
        kind = 'kw';
      } else if (/^\s*\(/.test(after)) {
        kind = 'fn';
      } else if (/^[A-Z]/.test(w)) {
        kind = 'tag';
      }

      push(w, kind);
      i += w.length;
      continue;
    }

    push(rest[0], /[{}()[\].,;:=+\-*/<>!&|?%]/.test(rest[0]) ? 'op' : undefined);
    i += 1;
  }

  return out;
}

function highlight(text: string, lang: Lang): Tok[][] {
  const state = { block: false };
  return text.split('\n').map((line) => tokenizeLine(line, lang, state));
}

/* ═══════════════════════════════════════════════════════════════════════════
   editor pane
   ═══════════════════════════════════════════════════════════════════════════ */

const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const LINE_H = 19;
const FONT_SIZE = 12.5;

function Editor({
  path,
  value,
  onChange,
  onCursor,
  onSave,
  wrap,
}: {
  path: string;
  value: string;
  onChange: (next: string) => void;
  onCursor: (line: number, col: number, selected: number) => void;
  onSave: () => void;
  wrap: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const onCursorRef = useRef(onCursor);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeLine, setActiveLine] = useState(0);

  const lang = languageOf(path);
  const lines = useMemo(() => highlight(value, lang), [value, lang]);
  const rawLines = useMemo(() => value.split('\n'), [value]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) ta.scrollTop = 0;
  }, [path]);

  // Keep callbacks out of the layout-effect dependency chain. The parent
  // passes an inline handler, so depending on it caused React error #185:
  // report -> parent state update -> new handler -> report, forever.
  useEffect(() => {
    onCursorRef.current = onCursor;
  }, [onCursor]);

  const report = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const upto = ta.value.slice(0, ta.selectionStart);
    const line = upto.split('\n').length;
    const col = upto.length - upto.lastIndexOf('\n');
    setActiveLine((current) => (current === line - 1 ? current : line - 1));
    onCursorRef.current(line, col, ta.selectionEnd - ta.selectionStart);
  }, []);

  useLayoutEffect(report, [value, report]);

  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    setScrollTop(ta.scrollTop);
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
        report();
      });
      return;
    }

    if (e.key === 'Enter') {
      const start = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indentMatch = /^[ \t]*/.exec(value.slice(lineStart, start));
      let indent = indentMatch ? indentMatch[0] : '';
      const prevChar = value[start - 1];
      if (prevChar === '{' || prevChar === '[' || prevChar === '(') indent += '  ';
      if (!indent) return;
      e.preventDefault();
      const next = `${value.slice(0, start)}\n${indent}${value.slice(ta.selectionEnd)}`;
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1 + indent.length;
        report();
      });
    }
  };

  const gutterWidth = Math.max(48, String(rawLines.length).length * 9 + 34);
  const shared: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_H}px`,
    tabSize: 2,
    whiteSpace: wrap ? 'pre-wrap' : 'pre',
    wordBreak: wrap ? 'break-word' : 'normal',
    padding: '8px 16px',
    margin: 0,
    border: 0,
  };

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
      {/* gutter */}
      <div
        ref={gutterRef}
        className="relative shrink-0 select-none overflow-hidden bg-[#1e1e1e] text-right"
        style={{ width: gutterWidth }}
      >
        <div style={{ transform: `translateY(${-scrollTop}px)`, padding: '8px 0' }}>
          {rawLines.map((_, i) => (
            <div
              key={i}
              style={{
                height: LINE_H,
                lineHeight: `${LINE_H}px`,
                fontFamily: FONT,
                fontSize: FONT_SIZE,
                paddingRight: 18,
                color: i === activeLine ? '#c6c6c6' : '#858585',
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* code surface */}
      <div className="relative min-w-0 flex-1">
        <div
          className="pointer-events-none absolute inset-x-0 bg-white/[0.04]"
          style={{ height: LINE_H, top: 8 + activeLine * LINE_H - scrollTop }}
        />
        <pre
          ref={preRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden text-[#d4d4d4]"
          style={shared}
        >
          {lines.map((toks, i) => (
            <div key={i} style={{ height: wrap ? undefined : LINE_H, minHeight: LINE_H }}>
              {toks.length === 0 ? (
                <span> </span>
              ) : (
                toks.map((t, j) => (
                  <span key={j} style={t.kind ? { color: TOK_COLOR[t.kind] } : undefined}>
                    {t.text}
                  </span>
                ))
              )}
            </div>
          ))}
        </pre>
        <textarea
          ref={taRef}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={sync}
          onClick={report}
          onKeyUp={report}
          onSelect={report}
          className="absolute inset-0 resize-none bg-transparent text-transparent caret-white outline-none wc-scroll"
          style={{ ...shared, overflow: 'auto' }}
        />
      </div>

      {/* minimap */}
      <div className="relative hidden w-[76px] shrink-0 overflow-hidden bg-[#1e1e1e] py-2 lg:block">
        <div style={{ transform: `translateY(${-scrollTop * 0.16}px)` }}>
          {lines.map((toks, i) => (
            <div key={i} className="flex h-[3px] items-center gap-[1px] px-2">
              {toks.slice(0, 26).map((t, j) => (
                <span
                  key={j}
                  style={{
                    display: 'inline-block',
                    height: 2,
                    width: Math.min(18, Math.max(1, t.text.trim().length * 1.1)),
                    background: t.kind ? TOK_COLOR[t.kind] : '#6b7280',
                    opacity: t.text.trim() ? 0.55 : 0,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   explorer tree
   ═══════════════════════════════════════════════════════════════════════════ */

function Tree({
  fs,
  dir,
  depth,
  open,
  active,
  onToggle,
  onOpen,
  onDelete,
}: {
  fs: FS;
  dir: string;
  depth: number;
  open: Set<string>;
  active: string | null;
  onToggle: (p: string) => void;
  onOpen: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const prefix = `${dir}/`;
  const entries = Object.keys(fs)
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
    .sort((a, b) => {
      const da = fs[a].type === 'dir';
      const db = fs[b].type === 'dir';
      if (da !== db) return da ? -1 : 1;
      return baseName(a).localeCompare(baseName(b));
    });

  return (
    <>
      {entries.map((p) => {
        const node = fs[p];
        const isOpen = open.has(p);
        const { Icon, color } = iconFor(p);

        return (
          <div key={p}>
            <div
              onClick={() => (node.type === 'dir' ? onToggle(p) : onOpen(p))}
              className={`group flex h-[22px] cursor-pointer items-center gap-1 pr-2 text-[13px] ${
                active === p ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'
              }`}
              style={{ paddingLeft: depth * 12 + 8 }}
            >
              {node.type === 'dir' ? (
                isOpen ? (
                  <ChevronDown size={14} className="shrink-0 text-[#cccccc]" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-[#cccccc]" />
                )
              ) : (
                <Icon size={14} className="ml-[14px] shrink-0" style={{ color }} />
              )}
              <span className="truncate">{baseName(p)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p);
                }}
                className="ml-auto hidden shrink-0 rounded p-0.5 text-[#8b8b8b] hover:bg-white/10 hover:text-white group-hover:block"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
            {node.type === 'dir' && isOpen && (
              <Tree
                fs={fs}
                dir={p}
                depth={depth + 1}
                open={open}
                active={active}
                onToggle={onToggle}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   main component
   ═══════════════════════════════════════════════════════════════════════════ */

type View = 'explorer' | 'search' | 'scm' | 'run' | 'extensions' | 'settings';
type PanelTab = 'terminal' | 'problems' | 'output';

interface Problem {
  path: string;
  line: number;
  text: string;
  severity: 'warning' | 'info';
}

export default function WCode() {
  const [fs, setFs] = useState<FS>(() => ({ ...SEED }));
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set([ROOT, `${ROOT}/src`]),
  );
  const [tabs, setTabs] = useState<string[]>([`${ROOT}/src/main.ts`]);
  const [active, setActive] = useState<string | null>(`${ROOT}/src/main.ts`);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>('explorer');
  const [sidebar, setSidebar] = useState(true);
  const [sidebarW, setSidebarW] = useState(248);
  const [panel, setPanel] = useState(true);
  const [panelH, setPanelH] = useState(180);
  const [panelTab, setPanelTab] = useState<PanelTab>('terminal');
  const [cursor, setCursor] = useState({ line: 1, col: 1, sel: 0 });
  const [palette, setPalette] = useState<'none' | 'command' | 'file'>('none');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [wrap, setWrap] = useState(false);
  const [toast, setToast] = useState('');
  const [termLines, setTermLines] = useState<ReactNode[]>([
    <span key="b" className="text-[#6a9955]">
      WCode integrated terminal — type <span className="text-[#dcdcaa]">help</span> for commands.
    </span>,
  ]);
  const [termInput, setTermInput] = useState('');
  const termEndRef = useRef<HTMLDivElement>(null);

  const dirty = useMemo(
    () => new Set(Object.keys(drafts).filter((p) => drafts[p] !== (fs[p]?.content ?? ''))),
    [drafts, fs],
  );

  const contentOf = useCallback(
    (p: string) => drafts[p] ?? fs[p]?.content ?? '',
    [drafts, fs],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1800);
  }, []);

  /* ── file ops ── */

  const openFile = useCallback((p: string) => {
    setTabs((t) => (t.includes(p) ? t : [...t, p]));
    setActive(p);
    setPalette('none');
  }, []);

  const closeTab = useCallback(
    (p: string) => {
      setTabs((t) => {
        const next = t.filter((x) => x !== p);
        setActive((cur) => (cur === p ? next[next.length - 1] ?? null : cur));
        return next;
      });
    },
    [],
  );

  const save = useCallback(
    (p: string | null) => {
      if (!p) return;
      const draft = drafts[p];
      if (draft === undefined) return;
      setFs((prev) => ({ ...prev, [p]: { type: 'file', content: draft } }));
      flash(`Saved ${baseName(p)}`);
    },
    [drafts, flash],
  );

  const saveAll = useCallback(() => {
    setFs((prev) => {
      const next = { ...prev };
      for (const p of Object.keys(drafts)) {
        if (next[p]?.type === 'file') next[p] = { type: 'file', content: drafts[p] };
      }
      return next;
    });
    flash('All files saved');
  }, [drafts, flash]);

  const createEntry = useCallback(
    (type: 'file' | 'dir') => {
      const parent =
        active && fs[active] ? dirName(active) : `${ROOT}/src`;
      const name = window.prompt(
        type === 'file' ? 'New file name' : 'New folder name',
        type === 'file' ? 'untitled.ts' : 'new-folder',
      );
      if (!name) return;
      const path = `${parent}/${name}`.replace(/\/+/g, '/');
      if (fs[path]) {
        flash('That name already exists');
        return;
      }
      setFs((prev) => ({
        ...prev,
        [path]: type === 'file' ? { type: 'file', content: '' } : { type: 'dir' },
      }));
      setOpenDirs((prev) => new Set(prev).add(parent));
      if (type === 'file') openFile(path);
    },
    [active, fs, flash, openFile],
  );

  const deleteEntry = useCallback(
    (p: string) => {
      if (!window.confirm(`Delete ${baseName(p)}?`)) return;
      setFs((prev) => {
        const next: FS = {};
        for (const key of Object.keys(prev)) {
          if (key !== p && !key.startsWith(`${p}/`)) next[key] = prev[key];
        }
        return next;
      });
      setTabs((t) => t.filter((x) => x !== p && !x.startsWith(`${p}/`)));
      setActive((cur) => (cur && (cur === p || cur.startsWith(`${p}/`)) ? null : cur));
      flash(`Deleted ${baseName(p)}`);
    },
    [flash],
  );

  const revert = useCallback(
    (p: string | null) => {
      if (!p) return;
      setDrafts((d) => {
        const next = { ...d };
        delete next[p];
        return next;
      });
      flash(`Reverted ${baseName(p)}`);
    },
    [flash],
  );

  /* ── derived data ── */

  const allFiles = useMemo(
    () => Object.keys(fs).filter((p) => fs[p].type === 'file').sort(),
    [fs],
  );

  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];
    for (const p of allFiles) {
      contentOf(p)
        .split('\n')
        .forEach((line, i) => {
          if (/\bTODO\b/.test(line)) {
            out.push({ path: p, line: i + 1, text: line.trim(), severity: 'info' });
          } else if (/\bFIXME\b/.test(line)) {
            out.push({ path: p, line: i + 1, text: line.trim(), severity: 'warning' });
          }
        });
    }
    return out;
  }, [allFiles, contentOf]);

  const searchResults = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return [];
    const out: { path: string; line: number; text: string }[] = [];
    for (const p of allFiles) {
      contentOf(p)
        .split('\n')
        .forEach((line, i) => {
          if (line.toLowerCase().includes(needle)) {
            out.push({ path: p, line: i + 1, text: line.trim().slice(0, 140) });
          }
        });
    }
    return out.slice(0, 200);
  }, [searchTerm, allFiles, contentOf]);

  /* ── commands ── */

  const commands = useMemo(
    () => [
      { id: 'save', label: 'File: Save', hint: '⌘S', run: () => save(active) },
      { id: 'saveall', label: 'File: Save All', hint: '', run: saveAll },
      { id: 'newfile', label: 'File: New File', hint: '', run: () => createEntry('file') },
      { id: 'newfolder', label: 'File: New Folder', hint: '', run: () => createEntry('dir') },
      { id: 'revert', label: 'File: Revert Changes', hint: '', run: () => revert(active) },
      { id: 'close', label: 'View: Close Editor', hint: '⌘W', run: () => active && closeTab(active) },
      { id: 'sidebar', label: 'View: Toggle Sidebar', hint: '⌘B', run: () => setSidebar((v) => !v) },
      { id: 'panel', label: 'View: Toggle Panel', hint: '⌃`', run: () => setPanel((v) => !v) },
      { id: 'wrap', label: 'View: Toggle Word Wrap', hint: '', run: () => setWrap((v) => !v) },
      { id: 'explorer', label: 'View: Show Explorer', hint: '', run: () => { setView('explorer'); setSidebar(true); } },
      { id: 'search', label: 'View: Show Search', hint: '', run: () => { setView('search'); setSidebar(true); } },
      { id: 'scm', label: 'View: Show Source Control', hint: '', run: () => { setView('scm'); setSidebar(true); } },
      { id: 'terminal', label: 'Terminal: Focus', hint: '', run: () => { setPanel(true); setPanelTab('terminal'); } },
      { id: 'problems', label: 'View: Problems', hint: '', run: () => { setPanel(true); setPanelTab('problems'); } },
    ],
    [active, save, saveAll, createEntry, revert, closeTab],
  );

  /* ── shortcuts ── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        setPalette('none');
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();

      if (k === 'p') {
        e.preventDefault();
        setQuery('');
        setPalette(e.shiftKey ? 'command' : 'file');
      } else if (k === 's') {
        e.preventDefault();
        e.shiftKey ? saveAll() : save(active);
      } else if (k === 'b') {
        e.preventDefault();
        setSidebar((v) => !v);
      } else if (k === '`') {
        e.preventDefault();
        setPanel((v) => !v);
      } else if (k === 'w') {
        e.preventDefault();
        if (active) closeTab(active);
      } else if (k === 'f') {
        e.preventDefault();
        setView('search');
        setSidebar(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, save, saveAll, closeTab]);

  /* ── resizers ── */

  const dragSidebar = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) =>
      setSidebarW(Math.min(460, Math.max(170, ev.clientX - 48)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragPanel = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) =>
      setPanelH(Math.min(460, Math.max(90, window.innerHeight - ev.clientY - 22)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ── terminal ── */

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ block: 'end' });
  }, [termLines, panelTab]);

  const runCommand = (raw: string) => {
    const cmd = raw.trim();
    const print = (node: ReactNode) => setTermLines((l) => [...l, node]);
    print(
      <span>
        <span className="text-[#4ec9b0]">wcode</span>
        <span className="text-[#6a9955]"> ~/wcos-app</span>
        <span className="text-[#858585]"> $ </span>
        {cmd}
      </span>,
    );
    if (!cmd) return;

    const [name, ...args] = cmd.split(/\s+/);
    switch (name) {
      case 'help':
        print(
          <span className="text-[#9cdcfe]">
            help · ls · cat &lt;file&gt; · open &lt;file&gt; · find &lt;text&gt; · npm run
            &lt;script&gt; · git status · clear
          </span>,
        );
        break;
      case 'ls':
        print(
          <span>
            {allFiles.map((p) => (
              <span key={p} className="text-[#9cdcfe]">
                {p.replace(`${ROOT}/`, '')}{'   '}
              </span>
            ))}
          </span>,
        );
        break;
      case 'cat': {
        const target = allFiles.find((p) => p.endsWith(args[0] ?? ''));
        if (!target) print(<span className="text-[#f48771]">cat: no such file</span>);
        else
          contentOf(target)
            .split('\n')
            .slice(0, 40)
            .forEach((l, i) => print(<span key={i}>{l || ' '}</span>));
        break;
      }
      case 'open': {
        const target = allFiles.find((p) => p.endsWith(args[0] ?? ''));
        if (!target) print(<span className="text-[#f48771]">open: no such file</span>);
        else {
          openFile(target);
          print(<span className="text-[#6a9955]">Opened {baseName(target)}</span>);
        }
        break;
      }
      case 'find': {
        const needle = args.join(' ').toLowerCase();
        let hits = 0;
        for (const p of allFiles) {
          contentOf(p)
            .split('\n')
            .forEach((line, i) => {
              if (needle && line.toLowerCase().includes(needle) && hits < 20) {
                hits += 1;
                print(
                  <span>
                    <span className="text-[#9cdcfe]">{p.replace(`${ROOT}/`, '')}</span>
                    <span className="text-[#858585]">:{i + 1}</span> {line.trim()}
                  </span>,
                );
              }
            });
        }
        if (!hits) print(<span className="text-[#858585]">no matches</span>);
        break;
      }
      case 'npm':
        if (args[0] === 'run') {
          print(<span className="text-[#858585]">&gt; wcos-app@1.0.0 {args[1] ?? ''}</span>);
          print(<span className="text-[#6a9955]">✓ completed in 412ms</span>);
        } else print(<span className="text-[#858585]">usage: npm run &lt;script&gt;</span>);
        break;
      case 'git':
        if (args[0] === 'status') {
          print(<span>On branch <span className="text-[#4ec9b0]">main</span></span>);
          if (dirty.size === 0) print(<span className="text-[#6a9955]">nothing to commit, working tree clean</span>);
          else
            dirty.forEach((p) =>
              print(<span className="text-[#e2c08d]">  modified: {p.replace(`${ROOT}/`, '')}</span>),
            );
        } else print(<span className="text-[#858585]">try: git status</span>);
        break;
      case 'clear':
        setTermLines([]);
        break;
      default:
        print(<span className="text-[#f48771]">command not found: {name}</span>);
    }
  };

  /* ── palette items ── */

  const paletteItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (palette === 'command') {
      return commands
        .filter((c) => !q || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.id, label: c.label, detail: c.hint, run: c.run }));
    }
    return allFiles
      .filter((p) => !q || p.toLowerCase().includes(q))
      .slice(0, 40)
      .map((p) => ({
        key: p,
        label: baseName(p),
        detail: dirName(p).replace(ROOT, '.'),
        run: () => openFile(p),
      }));
  }, [palette, query, commands, allFiles, openFile]);

  const [paletteIdx, setPaletteIdx] = useState(0);
  useEffect(() => setPaletteIdx(0), [query, palette]);

  /* ── activity bar ── */

  const ACTIVITY: { id: View; icon: LucideIcon; label: string; badge?: number }[] = [
    { id: 'explorer', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'scm', icon: GitBranch, label: 'Source Control', badge: dirty.size },
    { id: 'run', icon: Play, label: 'Run and Debug' },
    { id: 'extensions', icon: Puzzle, label: 'Extensions' },
  ];

  const activeContent = active ? contentOf(active) : '';

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* title bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#323233] px-3 text-[12px]">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#4ea3e8]" />
          <span className="font-medium">WCode</span>
          <span className="hidden text-[#8b8b8b] sm:inline">— wcos-app</span>
        </div>
        <div className="hidden items-center gap-1 text-[#8b8b8b] md:flex">
          <button
            onClick={() => { setQuery(''); setPalette('file'); }}
            className="rounded bg-[#2a2a2b] px-14 py-[3px] text-[11px] hover:bg-[#3a3a3b]"
          >
            Search files (⌘P)
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => save(active)}
            disabled={!active || !dirty.has(active)}
            title="Save (⌘S)"
            className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
          >
            <Save size={14} />
          </button>
          <button
            onClick={() => setPanel((v) => !v)}
            title="Toggle panel (⌃`)"
            className="rounded p-1.5 hover:bg-white/10"
          >
            <SplitSquareHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-[#2b2b2b] bg-[#333333] py-1">
          <div className="flex flex-col items-center">
            {ACTIVITY.map((a) => (
              <button
                key={a.id}
                title={a.label}
                onClick={() => {
                  if (view === a.id && sidebar) setSidebar(false);
                  else {
                    setView(a.id);
                    setSidebar(true);
                  }
                }}
                className={`relative flex h-12 w-12 items-center justify-center border-l-2 ${
                  view === a.id && sidebar
                    ? 'border-white text-white'
                    : 'border-transparent text-[#868686] hover:text-white'
                }`}
              >
                <a.icon size={22} strokeWidth={1.5} />
                {a.badge ? (
                  <span className="absolute bottom-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0a7aca] px-1 text-[9px] font-bold text-white">
                    {a.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <button
            title="Settings"
            onClick={() => {
              setView('settings');
              setSidebar(true);
            }}
            className={`flex h-12 w-12 items-center justify-center border-l-2 ${
              view === 'settings' && sidebar
                ? 'border-white text-white'
                : 'border-transparent text-[#868686] hover:text-white'
            }`}
          >
            <SettingsIcon size={22} strokeWidth={1.5} />
          </button>
        </div>

        {/* sidebar */}
        {sidebar && (
          <>
            <aside
              className="flex shrink-0 flex-col overflow-hidden bg-[#252526]"
              style={{ width: sidebarW }}
            >
              <div className="flex h-9 shrink-0 items-center justify-between px-4 text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
                <span>{view === 'scm' ? 'Source Control' : view}</span>
                {view === 'explorer' && (
                  <span className="flex gap-1">
                    <button onClick={() => createEntry('file')} title="New File" className="rounded p-1 hover:bg-white/10">
                      <FilePlus2 size={14} />
                    </button>
                    <button onClick={() => createEntry('dir')} title="New Folder" className="rounded p-1 hover:bg-white/10">
                      <FolderPlus size={14} />
                    </button>
                  </span>
                )}
              </div>

              <div className="wc-scroll min-h-0 flex-1 overflow-y-auto pb-4">
                {view === 'explorer' && (
                  <>
                    <div
                      onClick={() =>
                        setOpenDirs((prev) => {
                          const next = new Set(prev);
                          next.has(ROOT) ? next.delete(ROOT) : next.add(ROOT);
                          return next;
                        })
                      }
                      className="flex h-[22px] cursor-pointer items-center gap-1 px-2 text-[11px] font-bold uppercase tracking-wide text-[#cccccc] hover:bg-[#2a2d2e]"
                    >
                      {openDirs.has(ROOT) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      wcos-app
                    </div>
                    {openDirs.has(ROOT) && (
                      <Tree
                        fs={fs}
                        dir={ROOT}
                        depth={1}
                        open={openDirs}
                        active={active}
                        onToggle={(p) =>
                          setOpenDirs((prev) => {
                            const next = new Set(prev);
                            next.has(p) ? next.delete(p) : next.add(p);
                            return next;
                          })
                        }
                        onOpen={openFile}
                        onDelete={deleteEntry}
                      />
                    )}
                  </>
                )}

                {view === 'search' && (
                  <div className="px-3">
                    <input
                      autoFocus
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search"
                      className="mb-3 h-7 w-full rounded-sm border border-[#3c3c3c] bg-[#3c3c3c] px-2 text-[12px] text-white outline-none focus:border-[#0a7aca]"
                    />
                    <div className="mb-2 text-[11px] text-[#8b8b8b]">
                      {searchTerm.trim()
                        ? `${searchResults.length} results`
                        : 'Type to search the workspace'}
                    </div>
                    {searchResults.map((r, i) => (
                      <button
                        key={`${r.path}${r.line}${i}`}
                        onClick={() => openFile(r.path)}
                        className="mb-0.5 block w-full truncate rounded px-1 py-1 text-left text-[12px] hover:bg-[#2a2d2e]"
                      >
                        <span className="text-[#4ea3e8]">{baseName(r.path)}</span>
                        <span className="text-[#8b8b8b]">:{r.line}</span>
                        <span className="ml-2 text-[#cccccc]">{r.text}</span>
                      </button>
                    ))}
                  </div>
                )}

                {view === 'scm' && (
                  <div className="px-3 text-[12px]">
                    <div className="mb-3 flex items-center gap-2 text-[#cccccc]">
                      <GitBranch size={13} className="text-[#4ec9b0]" /> main
                    </div>
                    {dirty.size === 0 ? (
                      <p className="text-[#8b8b8b]">No changes. Working tree clean.</p>
                    ) : (
                      <>
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-[#8b8b8b]">
                          Changes — {dirty.size}
                        </div>
                        {[...dirty].map((p) => (
                          <div
                            key={p}
                            className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-[#2a2d2e]"
                          >
                            <CircleDot size={12} className="shrink-0 text-[#e2c08d]" />
                            <button
                              onClick={() => openFile(p)}
                              className="min-w-0 flex-1 truncate text-left"
                            >
                              {baseName(p)}
                              <span className="ml-1 text-[#8b8b8b]">
                                {dirName(p).replace(ROOT, '.')}
                              </span>
                            </button>
                            <button
                              onClick={() => revert(p)}
                              title="Discard changes"
                              className="hidden rounded p-0.5 hover:bg-white/10 group-hover:block"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={saveAll}
                          className="mt-3 w-full rounded-sm bg-[#0a7aca] py-1.5 text-[12px] font-medium text-white hover:bg-[#1288db]"
                        >
                          Commit all (save)
                        </button>
                      </>
                    )}
                  </div>
                )}

                {view === 'run' && (
                  <div className="px-3 text-[12px] text-[#cccccc]">
                    <p className="mb-3 text-[#8b8b8b]">Run a package script.</p>
                    {['dev', 'build', 'test'].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setPanel(true);
                          setPanelTab('terminal');
                          runCommand(`npm run ${s}`);
                        }}
                        className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[#2a2d2e]"
                      >
                        <Play size={12} className="text-[#6a9955]" /> npm run {s}
                      </button>
                    ))}
                  </div>
                )}

                {view === 'extensions' && (
                  <div className="px-3 text-[12px]">
                    {[
                      ['WCOS Theme Dark+', 'Built-in', true],
                      ['TypeScript Language Basics', 'Built-in', true],
                      ['Markdown Preview', 'Built-in', true],
                      ['GitLens', 'Marketplace', false],
                    ].map(([name, src, on]) => (
                      <div key={String(name)} className="mb-2 rounded border border-[#3c3c3c] p-2">
                        <div className="flex items-center justify-between">
                          <span className="truncate font-medium text-white">{name}</span>
                          <span
                            className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                              on ? 'bg-[#0a7aca] text-white' : 'bg-[#3c3c3c] text-[#cccccc]'
                            }`}
                          >
                            {on ? 'Enabled' : 'Install'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#8b8b8b]">{src}</div>
                      </div>
                    ))}
                  </div>
                )}

                {view === 'settings' && (
                  <div className="px-3 text-[12px]">
                    <label className="mb-3 flex items-center justify-between">
                      Word wrap
                      <input
                        type="checkbox"
                        checked={wrap}
                        onChange={(e) => setWrap(e.target.checked)}
                        className="accent-[#0a7aca]"
                      />
                    </label>
                    <label className="mb-3 flex items-center justify-between">
                      Show panel
                      <input
                        type="checkbox"
                        checked={panel}
                        onChange={(e) => setPanel(e.target.checked)}
                        className="accent-[#0a7aca]"
                      />
                    </label>
                    <div className="mt-4 border-t border-[#3c3c3c] pt-3 text-[11px] leading-relaxed text-[#8b8b8b]">
                      WCode 1.0 · workspace held in memory
                      <br />
                      {allFiles.length} files · {problems.length} problems
                    </div>
                  </div>
                )}
              </div>
            </aside>
            <div
              onPointerDown={dragSidebar}
              className="w-[3px] shrink-0 cursor-col-resize bg-transparent hover:bg-[#0a7aca]"
            />
          </>
        )}

        {/* editor area */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* tabs */}
          <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-[#2b2b2b] bg-[#252526]">
            {tabs.map((p) => {
              const { Icon, color } = iconFor(p);
              const isActive = p === active;
              const isDirty = dirty.has(p);
              return (
                <div
                  key={p}
                  onClick={() => setActive(p)}
                  className={`group flex min-w-[130px] max-w-[220px] cursor-pointer items-center gap-2 border-r border-[#2b2b2b] px-3 text-[12.5px] ${
                    isActive
                      ? 'bg-[#1e1e1e] text-white'
                      : 'bg-[#2d2d2d] text-[#9d9d9d] hover:text-white'
                  }`}
                >
                  <Icon size={13} className="shrink-0" style={{ color }} />
                  <span className="truncate">{baseName(p)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(p);
                    }}
                    className="ml-auto shrink-0 rounded p-0.5 hover:bg-white/15"
                  >
                    {isDirty ? (
                      <span className="block h-2 w-2 rounded-full bg-white group-hover:hidden" />
                    ) : null}
                    <X size={13} className={isDirty ? 'hidden group-hover:block' : 'block'} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* breadcrumbs */}
          {active && (
            <div className="flex h-6 shrink-0 items-center gap-1 overflow-hidden border-b border-[#2b2b2b] bg-[#1e1e1e] px-4 text-[11px] text-[#8b8b8b]">
              {active
                .replace(`${ROOT}/`, '')
                .split('/')
                .map((seg, i, arr) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={11} />}
                    <span className={i === arr.length - 1 ? 'text-[#cccccc]' : ''}>{seg}</span>
                  </span>
                ))}
            </div>
          )}

          {/* editor / welcome */}
          {active ? (
            <Editor
              key={active}
              path={active}
              value={activeContent}
              wrap={wrap}
              onChange={(next) => setDrafts((d) => ({ ...d, [active]: next }))}
              onCursor={(line, col, sel) => setCursor({ line, col, sel })}
              onSave={() => save(active)}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-[#1e1e1e] px-6">
              <Layers size={64} strokeWidth={1} className="text-[#3c3c3c]" />
              <div className="text-center">
                <h2 className="text-[22px] font-light text-[#cccccc]">WCode</h2>
                <p className="text-[13px] text-[#8b8b8b]">A VS Code-like editor for WCOS</p>
              </div>
              <div className="grid gap-x-10 gap-y-2 text-[12.5px] sm:grid-cols-2">
                {[
                  ['Quick open file', '⌘P'],
                  ['Command palette', '⇧⌘P'],
                  ['Save file', '⌘S'],
                  ['Toggle sidebar', '⌘B'],
                  ['Toggle panel', '⌃`'],
                  ['Close editor', '⌘W'],
                ].map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between gap-6">
                    <span className="text-[#8b8b8b]">{label}</span>
                    <kbd className="rounded border border-[#3c3c3c] bg-[#2d2d2d] px-1.5 py-0.5 text-[11px] text-[#cccccc]">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
              <button
                onClick={() => openFile(`${ROOT}/src/main.ts`)}
                className="rounded-sm bg-[#0a7aca] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#1288db]"
              >
                Open src/main.ts
              </button>
            </div>
          )}

          {/* panel */}
          {panel && (
            <>
              <div
                onPointerDown={dragPanel}
                className="h-[3px] shrink-0 cursor-row-resize bg-transparent hover:bg-[#0a7aca]"
              />
              <section
                className="flex shrink-0 flex-col border-t border-[#2b2b2b] bg-[#1e1e1e]"
                style={{ height: panelH }}
              >
                <div className="flex h-8 shrink-0 items-center gap-4 border-b border-[#2b2b2b] px-4 text-[11px] uppercase tracking-wide">
                  {(['terminal', 'problems', 'output'] as PanelTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPanelTab(t)}
                      className={`border-b-2 pb-1 pt-2 ${
                        panelTab === t
                          ? 'border-[#0a7aca] text-white'
                          : 'border-transparent text-[#8b8b8b] hover:text-white'
                      }`}
                    >
                      {t}
                      {t === 'problems' && problems.length > 0 && (
                        <span className="ml-1.5 rounded-full bg-[#3c3c3c] px-1.5 text-[10px]">
                          {problems.length}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => setPanel(false)}
                    className="ml-auto rounded p-1 text-[#8b8b8b] hover:bg-white/10 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>

                <div className="wc-scroll min-h-0 flex-1 overflow-y-auto px-4 py-2">
                  {panelTab === 'terminal' && (
                    <div
                      onClick={(e) =>
                        (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()
                      }
                      style={{ fontFamily: FONT, fontSize: 12 }}
                      className="min-h-full leading-[1.6] text-[#cccccc]"
                    >
                      {termLines.map((l, i) => (
                        <div key={i} className="whitespace-pre-wrap break-words">
                          {l}
                        </div>
                      ))}
                      <div className="flex">
                        <span className="shrink-0">
                          <span className="text-[#4ec9b0]">wcode</span>
                          <span className="text-[#6a9955]"> ~/wcos-app</span>
                          <span className="text-[#858585]"> $ </span>
                        </span>
                        <input
                          value={termInput}
                          onChange={(e) => setTermInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              runCommand(termInput);
                              setTermInput('');
                            }
                          }}
                          spellCheck={false}
                          className="min-w-0 flex-1 bg-transparent text-[#cccccc] caret-[#0a7aca] outline-none"
                          style={{ fontFamily: FONT, fontSize: 12 }}
                        />
                      </div>
                      <div ref={termEndRef} />
                    </div>
                  )}

                  {panelTab === 'problems' && (
                    <div className="text-[12px]">
                      {problems.length === 0 ? (
                        <p className="text-[#8b8b8b]">No problems have been detected.</p>
                      ) : (
                        problems.map((p, i) => (
                          <button
                            key={i}
                            onClick={() => openFile(p.path)}
                            className="mb-1 flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-[#2a2d2e]"
                          >
                            {p.severity === 'warning' ? (
                              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-[#e2c08d]" />
                            ) : (
                              <Info size={13} className="mt-0.5 shrink-0 text-[#4ea3e8]" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="text-[#cccccc]">{p.text}</span>
                              <span className="ml-2 text-[#8b8b8b]">
                                {baseName(p.path)}:{p.line}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {panelTab === 'output' && (
                    <div style={{ fontFamily: FONT, fontSize: 12 }} className="text-[#8b8b8b]">
                      <div>[workspace] loaded {allFiles.length} files from memory</div>
                      <div>[editor] language services ready</div>
                      <div>[git] branch main · {dirty.size} modified</div>
                      <div>[problems] {problems.length} diagnostics</div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* status bar */}
      <div className="flex h-[22px] shrink-0 items-center justify-between bg-[#0a7aca] px-3 text-[11px] text-white">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <GitBranch size={11} /> main
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle size={11} /> {problems.filter((p) => p.severity === 'warning').length}
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Copy size={11} /> {dirty.size} unsaved
          </span>
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <>
              <span>
                Ln {cursor.line}, Col {cursor.col}
                {cursor.sel > 0 ? ` (${cursor.sel} selected)` : ''}
              </span>
              <span className="hidden sm:inline">Spaces: 2</span>
              <span className="hidden sm:inline">UTF-8</span>
              <span className="flex items-center gap-1">
                <Braces size={11} /> {LANG_LABEL[languageOf(active)]}
              </span>
            </>
          )}
          <button onClick={() => setPanelTab('terminal')} className="flex items-center gap-1">
            <TerminalIcon size={11} /> Terminal
          </button>
        </div>
      </div>

      {/* palette */}
      {palette !== 'none' && (
        <div
          className="absolute inset-0 z-50 flex justify-center bg-black/30 pt-[10vh]"
          onClick={() => setPalette('none')}
        >
          <div
            className="h-fit w-[min(620px,92vw)] overflow-hidden rounded-md border border-[#454545] bg-[#252526] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPaletteIdx((i) => Math.min(i + 1, paletteItems.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPaletteIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    paletteItems[paletteIdx]?.run();
                    setPalette('none');
                  }
                }}
                placeholder={
                  palette === 'command' ? 'Type a command…' : 'Search files by name…'
                }
                className="h-8 w-full rounded-sm border border-[#0a7aca] bg-[#3c3c3c] px-2.5 text-[13px] text-white outline-none"
              />
            </div>
            <div className="wc-scroll max-h-[46vh] overflow-y-auto pb-1">
              {paletteItems.map((item, i) => (
                <button
                  key={item.key}
                  onMouseEnter={() => setPaletteIdx(i)}
                  onClick={() => {
                    item.run();
                    setPalette('none');
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
                    i === paletteIdx ? 'bg-[#04395e] text-white' : 'text-[#cccccc]'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto shrink-0 truncate pl-4 text-[11px] text-[#8b8b8b]">
                    {item.detail}
                  </span>
                  {i === paletteIdx && <CornerDownLeft size={12} className="shrink-0 opacity-60" />}
                </button>
              ))}
              {paletteItems.length === 0 && (
                <div className="px-3 py-3 text-[12.5px] text-[#8b8b8b]">No matching results</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="pointer-events-none absolute bottom-9 right-4 z-50 rounded border border-[#454545] bg-[#252526] px-3 py-2 text-[12px] text-[#cccccc] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
