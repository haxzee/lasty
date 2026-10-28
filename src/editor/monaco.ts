import * as monaco from "./monacoCore";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { loader } from "@monaco-editor/react";
import { COMMANDS, DOCUMENT_CLASSES, ENVIRONMENTS, PACKAGES } from "./latexData";

type Monaco = typeof monaco;

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

let projectLabels: string[] = [];
let projectCitations: string[] = [];

export function setProjectSymbols(labels: string[], citations: string[]) {
  projectLabels = labels;
  projectCitations = citations;
}

export function extractLabels(text: string) {
  return [...text.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1]);
}

export function extractCitationKeys(bib: string) {
  return [...bib.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1]);
}

function registerLanguage(m: Monaco) {
  m.languages.register({ id: "latex", extensions: [".tex", ".sty", ".cls", ".ltx", ".bib"] });

  m.languages.setMonarchTokensProvider("latex", {
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/, ["keyword", "", "delimiter.curly", "type", "delimiter.curly"]],
        [/\\(?:part|chapter|(?:sub)*section|paragraph)\*?/, "keyword"],
        [/\\[a-zA-Z@]+\*?/, "tag"],
        [/\\./, "string.escape"],
        [/\$\$/, { token: "string.math", next: "@displayMath" }],
        [/\$/, { token: "string.math", next: "@inlineMath" }],
        [/\\\[/, { token: "string.math", next: "@bracketMath" }],
        [/[{}()[\]]/, "@brackets"],
        [/[&~^_]/, "operator"],
        [/\d+(?:\.\d+)?/, "number"],
      ],
      inlineMath: [[/\$/, { token: "string.math", next: "@pop" }], { include: "@mathBody" }],
      displayMath: [[/\$\$/, { token: "string.math", next: "@pop" }], { include: "@mathBody" }],
      bracketMath: [[/\\\]/, { token: "string.math", next: "@pop" }], { include: "@mathBody" }],
      mathBody: [
        [/%.*$/, "comment"],
        [/\\[a-zA-Z]+/, "string.math.command"],
        [/\\./, "string.math"],
        [/[{}()[\]]/, "@brackets"],
        [/[^$\\%{}()[\]]+/, "string.math"],
      ],
    },
  });

  m.languages.setLanguageConfiguration("latex", {
    comments: { lineComment: "%" },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$", notIn: ["comment"] },
      { open: "`", close: "'" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    wordPattern: /\\?[a-zA-Z@]+\*?|[^\s\\{}[\]()$%&~^_]+/,
    onEnterRules: [
      { beforeText: /\\begin\{[^}]*\}(\[[^\]]*\]|\{[^}]*\})*\s*$/, action: { indentAction: m.languages.IndentAction.Indent } },
    ],
    indentationRules: {
      increaseIndentPattern: /\\begin\{(?!document\})[^}]*\}/,
      decreaseIndentPattern: /^\s*\\end\{(?!document\})[^}]*\}/,
    },
  });
}

function registerCompletion(m: Monaco) {
  const Kind = m.languages.CompletionItemKind;
  const Snippet = m.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  m.languages.registerCompletionItemProvider("latex", {
    triggerCharacters: ["\\", "{", ","],
    provideCompletionItems(model, position) {
      const before = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const after = model.getLineContent(position.lineNumber).slice(position.column - 1);
      const closingBraceFollows = after.startsWith("}");

      const rangeFor = (typed: string, swallowBrace = false) =>
        new m.Range(
          position.lineNumber,
          position.column - typed.length,
          position.lineNumber,
          position.column + (swallowBrace && closingBraceFollows ? 1 : 0),
        );

      const words = (list: string[], typed: string, kind: monaco.languages.CompletionItemKind, detail: string) => ({
        suggestions: [...new Set(list)].map((label) => ({ label, kind, detail, insertText: label, range: rangeFor(typed) })),
      });

      let match = before.match(/\\begin\{([\w*]*)$/);
      if (match) {
        return {
          suggestions: ENVIRONMENTS.map((env) => ({
            label: env.name,
            kind: Kind.Module,
            detail: env.detail,
            insertText: `${env.name}}${env.arg ?? ""}\n\t${env.body ?? "$0"}\n\\end{${env.name}}`,
            insertTextRules: Snippet,
            range: rangeFor(match![1], true),
          })),
        };
      }

      match = before.match(/\\end\{([\w*]*)$/);
      if (match) {
        const text = model.getValueInRange(new m.Range(1, 1, position.lineNumber, position.column));
        const open: string[] = [];
        for (const t of text.matchAll(/\\(begin|end)\{([^}]*)\}/g)) {
          if (t[1] === "begin") open.push(t[2]);
          else if (open[open.length - 1] === t[2]) open.pop();
        }
        return {
          suggestions: [...open].reverse().map((name, i) => ({
            label: name,
            kind: Kind.Module,
            sortText: String(i).padStart(3, "0"),
            insertText: closingBraceFollows ? name : `${name}}`,
            range: rangeFor(match![1]),
          })),
        };
      }

      match = before.match(/\\(?:ref|eqref|pageref|autoref|cref|Cref|vref)\{([^}]*)$/);
      if (match) {
        const labels = [...extractLabels(model.getValue()), ...projectLabels];
        return words(labels, match[1], Kind.Reference, "Label");
      }

      match = before.match(/\\(?:cite[tp]?|nocite|autocite|parencite|textcite|footcite)(?:\[[^\]]*\])*\{(?:[^}]*,)?\s*([^},\s]*)$/);
      if (match) return words(projectCitations, match[1], Kind.Reference, "Citation");

      match = before.match(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{(?:[^}]*,)?\s*([^},\s]*)$/);
      if (match) return words(PACKAGES, match[1], Kind.Module, "Package");

      match = before.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)$/);
      if (match) return words(DOCUMENT_CLASSES, match[1], Kind.Class, "Document class");

      match = before.match(/\\([a-zA-Z]*)$/);
      if (match) {
        const range = rangeFor("\\" + match[1]);
        const commands = COMMANDS.map((c) => ({
          label: "\\" + c.name,
          kind: c.snippet ? Kind.Snippet : Kind.Function,
          detail: c.detail,
          insertText: c.snippet ?? "\\" + c.name,
          insertTextRules: c.snippet ? Snippet : undefined,
          range,
        }));
        const environments = ENVIRONMENTS.map((env) => ({
          label: `\\begin{${env.name}}`,
          filterText: `\\begin${env.name}`,
          kind: Kind.Snippet,
          detail: env.detail,
          insertText: `\\begin{${env.name}}${env.arg ?? ""}\n\t${env.body ?? "$0"}\n\\end{${env.name}}`,
          insertTextRules: Snippet,
          sortText: "z" + env.name,
          range,
        }));
        return { suggestions: [...commands, ...environments] };
      }

      return { suggestions: [] };
    },
  });
}

type Rules = monaco.editor.ITokenThemeRule[];

const SYNTAX: Record<"light" | "dark", Record<"color" | "graphite", Rules>> = {
  dark: {
    color: [
      { token: "", foreground: "c9c9cf" },
      { token: "tag", foreground: "8ec5b4" },
      { token: "keyword", foreground: "e3b780", fontStyle: "bold" },
      { token: "type", foreground: "9db7d6" },
      { token: "comment", foreground: "6b6b74", fontStyle: "italic" },
      { token: "string.math", foreground: "d6b98c" },
      { token: "string.math.command", foreground: "c7a8e0" },
      { token: "string.escape", foreground: "d79a7a" },
      { token: "number", foreground: "b3cf9c" },
      { token: "operator", foreground: "9a9aa3" },
      { token: "delimiter", foreground: "85858e" },
    ],
    graphite: [
      { token: "", foreground: "c4c4ca" },
      { token: "tag", foreground: "f0f0f3" },
      { token: "keyword", foreground: "f0f0f3", fontStyle: "bold" },
      { token: "type", foreground: "a3b1c2" },
      { token: "comment", foreground: "62626b", fontStyle: "italic" },
      { token: "string.math", foreground: "cbbd9f" },
      { token: "string.math.command", foreground: "ddd0b4" },
      { token: "string.escape", foreground: "9a9aa3" },
      { token: "number", foreground: "b4b4bb" },
      { token: "operator", foreground: "85858e" },
      { token: "delimiter", foreground: "7c7c85" },
    ],
  },
  light: {
    color: [
      { token: "", foreground: "33333a" },
      { token: "tag", foreground: "2d7a68" },
      { token: "keyword", foreground: "9a5b14", fontStyle: "bold" },
      { token: "type", foreground: "3c5f86" },
      { token: "comment", foreground: "9c9ca5", fontStyle: "italic" },
      { token: "string.math", foreground: "86652a" },
      { token: "string.math.command", foreground: "7149a0" },
      { token: "string.escape", foreground: "a24e2e" },
      { token: "number", foreground: "4f7d36" },
      { token: "operator", foreground: "7a7a82" },
      { token: "delimiter", foreground: "8a8a92" },
    ],
    graphite: [
      { token: "", foreground: "3d3d43" },
      { token: "tag", foreground: "111114" },
      { token: "keyword", foreground: "111114", fontStyle: "bold" },
      { token: "type", foreground: "4f5d6e" },
      { token: "comment", foreground: "a2a2aa", fontStyle: "italic" },
      { token: "string.math", foreground: "7d6a48" },
      { token: "string.math.command", foreground: "65532f" },
      { token: "string.escape", foreground: "77777f" },
      { token: "number", foreground: "55555c" },
      { token: "operator", foreground: "8a8a92" },
      { token: "delimiter", foreground: "8f8f97" },
    ],
  },
};

const transparent = { "editor.background": "#00000000", "editorGutter.background": "#00000000", "minimap.background": "#00000000" };

const DARK_COLORS: monaco.editor.IColors = {
  ...transparent,
  "editor.lineHighlightBackground": "#ffffff08",
  "editor.lineHighlightBorder": "#00000000",
  "editorLineNumber.foreground": "#48484f",
  "editorLineNumber.activeForeground": "#a8a8b0",
  "editorCursor.foreground": "#f0f0f3",
  "editorError.foreground": "#f0706a",
  "editorInfo.foreground": "#e0736d",
  "editor.selectionBackground": "#ffffff24",
  "editor.inactiveSelectionBackground": "#ffffff12",
  "editor.selectionHighlightBackground": "#ffffff10",
  "editor.wordHighlightBackground": "#ffffff0e",
  "editorBracketMatch.background": "#ffffff14",
  "editorBracketMatch.border": "#ffffff30",
  "editorIndentGuide.background1": "#ffffff0b",
  "editorIndentGuide.activeBackground1": "#ffffff24",
  "editorWidget.background": "#232326",
  "editorWidget.border": "#ffffff12",
  "editorSuggestWidget.background": "#232326",
  "editorSuggestWidget.border": "#00000000",
  "editorSuggestWidget.foreground": "#d4d4da",
  "editorSuggestWidget.selectedBackground": "#ffffff16",
  "editorSuggestWidget.selectedForeground": "#ffffff",
  "editorSuggestWidget.selectedIconForeground": "#ffffff",
  "editorSuggestWidget.highlightForeground": "#ffffff",
  "editorSuggestWidget.focusHighlightForeground": "#ffffff",
  "editorHoverWidget.background": "#232326",
  "editorHoverWidget.border": "#00000000",
  "list.focusOutline": "#00000000",
  "list.activeSelectionBackground": "#ffffff16",
  "list.hoverBackground": "#ffffff0c",
  "editorStickyScroll.background": "#1e1e1e",
  "editorStickyScrollHover.background": "#2a2a2d",
  "scrollbarSlider.background": "#ffffff12",
  "scrollbarSlider.hoverBackground": "#ffffff20",
  "scrollbarSlider.activeBackground": "#ffffff2a",
  "minimapSlider.background": "#ffffff10",
  "editorOverviewRuler.border": "#00000000",
  focusBorder: "#00000000",
  "widget.shadow": "#00000000",
};

const LIGHT_COLORS: monaco.editor.IColors = {
  ...transparent,
  "editor.lineHighlightBackground": "#00000007",
  "editor.lineHighlightBorder": "#00000000",
  "editorLineNumber.foreground": "#c4c4cb",
  "editorLineNumber.activeForeground": "#55555c",
  "editorCursor.foreground": "#111114",
  "editorError.foreground": "#d93a32",
  "editorInfo.foreground": "#d9534c",
  "editor.selectionBackground": "#0000001c",
  "editor.inactiveSelectionBackground": "#0000000f",
  "editor.selectionHighlightBackground": "#0000000c",
  "editor.wordHighlightBackground": "#0000000a",
  "editorBracketMatch.background": "#00000010",
  "editorBracketMatch.border": "#00000028",
  "editorIndentGuide.background1": "#0000000c",
  "editorIndentGuide.activeBackground1": "#00000026",
  "editorWidget.background": "#ffffff",
  "editorWidget.border": "#00000012",
  "editorSuggestWidget.background": "#ffffff",
  "editorSuggestWidget.border": "#00000000",
  "editorSuggestWidget.foreground": "#3d3d43",
  "editorSuggestWidget.selectedBackground": "#0000000f",
  "editorSuggestWidget.selectedForeground": "#000000",
  "editorSuggestWidget.selectedIconForeground": "#000000",
  "editorSuggestWidget.highlightForeground": "#000000",
  "editorSuggestWidget.focusHighlightForeground": "#000000",
  "editorHoverWidget.background": "#ffffff",
  "editorHoverWidget.border": "#00000000",
  "list.focusOutline": "#00000000",
  "list.activeSelectionBackground": "#0000000f",
  "list.hoverBackground": "#00000008",
  "editorStickyScroll.background": "#ffffff",
  "editorStickyScrollHover.background": "#f4f4f6",
  "scrollbarSlider.background": "#00000012",
  "scrollbarSlider.hoverBackground": "#00000020",
  "scrollbarSlider.activeBackground": "#0000002a",
  "minimapSlider.background": "#0000000c",
  "editorOverviewRuler.border": "#00000000",
  focusBorder: "#00000000",
  "widget.shadow": "#00000000",
};

const OLED_COLORS: monaco.editor.IColors = {
  ...DARK_COLORS,
  "editor.lineHighlightBackground": "#ffffff07",
  "editorWidget.background": "#0e0e10",
  "editorSuggestWidget.background": "#0e0e10",
  "editorHoverWidget.background": "#0e0e10",
  "editorStickyScroll.background": "#000000",
  "editorStickyScrollHover.background": "#111113",
};

function registerThemes(m: Monaco) {
  for (const scheme of ["color", "graphite"] as const) {
    m.editor.defineTheme(`lasty-light-${scheme}`, { base: "vs", inherit: false, rules: SYNTAX.light[scheme], colors: LIGHT_COLORS });
    m.editor.defineTheme(`lasty-dark-${scheme}`, { base: "vs-dark", inherit: false, rules: SYNTAX.dark[scheme], colors: DARK_COLORS });
    m.editor.defineTheme(`lasty-oled-${scheme}`, { base: "vs-dark", inherit: false, rules: SYNTAX.dark[scheme], colors: OLED_COLORS });
  }
}

registerLanguage(monaco);
registerCompletion(monaco);
registerThemes(monaco);

export const editorBehavior = { typingAnimation: true, autoCloseEnvironments: true };

// Monaco re-renders the whole line on every keystroke, which restarts CSS animations.
// Each typed character is therefore tagged with an age bucket whose negative
// animation-delay resumes the animation where it left off.
const TYPED_MS = 280;
const TYPED_STEP = 16;
const TYPED_BUCKETS = Math.ceil(TYPED_MS / TYPED_STEP);

const typedStyle = document.createElement("style");
typedStyle.textContent = Array.from(
  { length: TYPED_BUCKETS },
  (_, i) => `.monaco-editor .typed-fade.t${i}{animation-delay:-${i * TYPED_STEP}ms}`,
).join("\n");
document.head.appendChild(typedStyle);

export function enhanceEditor(editor: monaco.editor.IStandaloneCodeEditor) {
  let live: { id: string; born: number }[] = [];
  let clearTimer: number | undefined;

  const refreshTyped = (fresh: monaco.Range[] = []) => {
    const model = editor.getModel();
    if (!model) return;
    const now = performance.now();
    const kept = live.filter((d) => now - d.born < TYPED_MS);
    const entries = [
      ...kept.flatMap((d) => {
        const range = model.getDecorationRange(d.id);
        return range && !range.isEmpty() ? [{ range, born: d.born }] : [];
      }),
      ...fresh.map((range) => ({ range, born: now })),
    ];
    const ids = editor.deltaDecorations(
      live.map((d) => d.id),
      entries.map(({ range, born }) => ({
        range,
        options: {
          inlineClassName: `typed-fade t${Math.min(TYPED_BUCKETS - 1, Math.floor((now - born) / TYPED_STEP))}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    );
    live = ids.map((id, i) => ({ id, born: entries[i].born }));

    clearTimeout(clearTimer);
    if (live.length) {
      const oldest = Math.min(...live.map((d) => d.born));
      clearTimer = window.setTimeout(() => refreshTyped(), Math.max(0, oldest + TYPED_MS - performance.now()) + 1);
    }
  };

  const modelSub = editor.onDidChangeModel(() => {
    live = [];
    clearTimeout(clearTimer);
  });

  const sub = editor.onDidChangeModelContent((e) => {
    if (e.isUndoing || e.isRedoing || e.isFlush) return;
    const model = editor.getModel();
    if (!model) return;

    if (editorBehavior.typingAnimation) {
      const fresh = e.changes
        .filter((c) => c.text.length > 0 && c.text.length <= 3 && c.text.trim() && !c.text.includes("\n"))
        .map((c) => new monaco.Range(
          c.range.startLineNumber,
          c.range.startColumn,
          c.range.startLineNumber,
          c.range.startColumn + c.text.length,
        ));
      if (fresh.length || live.length) refreshTyped(fresh);
    }

    if (!editorBehavior.autoCloseEnvironments) return;
    const change = e.changes.length === 1 ? e.changes[0] : null;
    if (!change || !/^\r?\n\s*$/.test(change.text)) return;
    const line = model.getLineContent(change.range.startLineNumber);
    const begin = line.match(/\\begin\{([^}]+)\}(?:\[[^\]]*\]|\{[^}]*\})*\s*$/);
    if (!begin) return;
    const name = begin[1];
    const full = model.getValue();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const opens = full.match(new RegExp(`\\\\begin\\{${escaped}\\}`, "g"))?.length ?? 0;
    const closes = full.match(new RegExp(`\\\\end\\{${escaped}\\}`, "g"))?.length ?? 0;
    if (closes >= opens) return;

    queueMicrotask(() => {
      const pos = editor.getPosition();
      if (!pos) return;
      const indent = line.match(/^\s*/)![0];
      const endOfLine = model.getLineMaxColumn(pos.lineNumber);
      editor.executeEdits("auto-end", [
        {
          range: new monaco.Range(pos.lineNumber, endOfLine, pos.lineNumber, endOfLine),
          text: `\n${indent}\\end{${name}}`,
        },
      ]);
      editor.setPosition(pos);
    });
  });

  return () => {
    sub.dispose();
    modelSub.dispose();
    clearTimeout(clearTimer);
  };
}

export { monaco };
