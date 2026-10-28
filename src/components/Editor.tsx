import { useEffect, useMemo, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { editorBehavior, enhanceEditor, monaco } from "../editor/monaco";
import { attachSpellCheck, spellBehavior } from "../editor/spell";
import type { Diagnostic } from "../editor/latexText";
import { useSettings } from "../settings";
import type { Theme } from "./ui";

export interface Jump {
  line: number;
  column?: number;
  /** Changes on every request, so jumping to the same line twice still scrolls. */
  seq: number;
}

interface EditorProps {
  file: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onShowInPdf: (line: number) => void;
  onReady: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
  diagnostics: Diagnostic[];
  jump: Jump | null;
  theme: Theme;
}

function languageFor(file: string) {
  const ext = file.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "txt") return "plaintext";
  return "latex";
}

const BASE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  padding: { top: 12, bottom: 12 },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  cursorBlinking: "smooth",
  cursorWidth: 2,
  smoothScrolling: true,
  bracketPairColorization: { enabled: false },
  guides: { bracketPairs: false, indentation: true },
  autoClosingBrackets: "always",
  autoClosingQuotes: "never",
  autoSurround: "languageDefined",
  insertSpaces: true,
  detectIndentation: false,
  quickSuggestions: false,
  tabCompletion: "on",
  snippetSuggestions: "inline",
  wordBasedSuggestions: "off",
  suggest: { preview: true, showWords: false, insertMode: "replace", showStatusBar: false },
  suggestLineHeight: 26,
  unicodeHighlight: { ambiguousCharacters: false },
  renderLineHighlight: "all",
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  overviewRulerBorder: false,
  fixedOverflowWidgets: true,
  lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
};

function wrapSelection(editor: monaco.editor.ICodeEditor, command: string) {
  const model = editor.getModel();
  const selections = editor.getSelections();
  if (!model || !selections) return;
  editor.pushUndoStop();
  editor.executeEdits(
    "wrap",
    selections.map((sel) => ({ range: sel, text: `\\${command}{${model.getValueInRange(sel)}}` })),
    (inverse) =>
      inverse.map(({ range: r }, i) =>
        selections[i].isEmpty()
          ? new monaco.Selection(r.startLineNumber, r.startColumn + command.length + 2, r.startLineNumber, r.startColumn + command.length + 2)
          : new monaco.Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn),
      ),
  );
  editor.pushUndoStop();
}

export default function Editor({ file, value, onChange, onSave, onShowInPdf, onReady, diagnostics, jump, theme }: EditorProps) {
  const { settings: s, update } = useSettings();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const showInPdfRef = useRef(onShowInPdf);
  showInPdfRef.current = onShowInPdf;
  const cleanup = useRef<() => void>(undefined);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const spellRef = useRef<ReturnType<typeof attachSpellCheck> | null>(null);

  useEffect(() => () => cleanup.current?.(), []);
  editorBehavior.autoCloseEnvironments = s.autoCloseEnvironments;
  editorBehavior.typingAnimation = s.typingAnimation;
  spellBehavior.onAddWord = (word) => update({ userWords: [...new Set([...s.userWords, word])] });

  useEffect(() => {
    spellBehavior.language = s.spellCheck;
    spellBehavior.userWords = new Set(s.userWords);
    spellRef.current?.refresh();
  }, [s.spellCheck, s.userWords]);

  const options = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ...BASE_OPTIONS,
      fontFamily: s.editorFontFamily,
      fontSize: s.editorFontSize,
      lineHeight: s.editorLineHeight,
      tabSize: s.tabSize,
      wordWrap: s.wordWrap ? "on" : "off",
      lineNumbers: s.lineNumbers ? "on" : "off",
      minimap: { enabled: s.minimap, renderCharacters: false, maxColumn: 80, showSlider: "mouseover" },
      stickyScroll: { enabled: s.stickyScroll },
      cursorSmoothCaretAnimation: s.smoothCaret ? "on" : "off",
      suggestOnTriggerCharacters: s.autocomplete,
      tabCompletion: s.autocomplete ? "on" : "off",
      suggestFontSize: Math.max(11, s.editorFontSize - 1),
    }),
    [s],
  );

  function applyDiagnostics() {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "latex",
      diagnostics
        .filter((d) => d.line <= model.getLineCount())
        .map((d) => ({
          severity: monaco.MarkerSeverity.Error,
          message: d.message,
          startLineNumber: d.line,
          startColumn: model.getLineFirstNonWhitespaceColumn(d.line) || 1,
          endLineNumber: d.line,
          endColumn: model.getLineMaxColumn(d.line),
        })),
    );
  }

  function applyJump() {
    const editor = editorRef.current;
    if (!editor || !jump) return;
    const position = { lineNumber: jump.line, column: jump.column ?? 1 };
    editor.setPosition(position);
    editor.revealLineInCenterIfOutsideViewport(jump.line, monaco.editor.ScrollType.Smooth);
    editor.focus();
    const flash = editor.createDecorationsCollection([
      { range: new monaco.Range(jump.line, 1, jump.line, 1), options: { isWholeLine: true, className: "line-flash" } },
    ]);
    window.setTimeout(() => flash.clear(), 1200);
  }

  useEffect(applyDiagnostics, [diagnostics]);
  useEffect(applyJump, [jump?.seq]);

  return (
    <MonacoEditor
      height="100%"
      language={languageFor(file)}
      theme={`lasty-${theme}-${s.editorColors}`}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      loading={null}
      onMount={(editor) => {
        editorRef.current = editor;
        const enhance = enhanceEditor(editor);
        const spell = attachSpellCheck(editor);
        spellRef.current = spell;
        const mouse = editor.onMouseDown((e) => {
          if ((e.event.metaKey || e.event.ctrlKey) && e.target.position) {
            e.event.preventDefault();
            showInPdfRef.current(e.target.position.lineNumber);
          }
        });
        cleanup.current = () => {
          enhance();
          spell.dispose();
          mouse.dispose();
          onReady(null);
        };
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
        editor.addAction({
          id: "lasty.bold",
          label: "Bold",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
          run: (ed) => wrapSelection(ed, "textbf"),
        });
        editor.addAction({
          id: "lasty.italic",
          label: "Italic",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
          run: (ed) => wrapSelection(ed, "textit"),
        });
        editor.addAction({
          id: "lasty.showInPdf",
          label: "Show in PDF",
          contextMenuGroupId: "navigation",
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ],
          run: (ed) => showInPdfRef.current(ed.getPosition()?.lineNumber ?? 1),
        });
        onReady(editor);
        applyDiagnostics();
        if (jump) applyJump();
        editor.focus();
      }}
    />
  );
}
