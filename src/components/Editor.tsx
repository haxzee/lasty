import { useEffect, useMemo, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { editorBehavior, enhanceEditor, monaco } from "../editor/monaco";
import { useSettings } from "../settings";
import type { Theme } from "./ui";

interface EditorProps {
  file: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
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
};

export default function Editor({ file, value, onChange, onSave, theme }: EditorProps) {
  const { settings: s } = useSettings();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const cleanup = useRef<() => void>(undefined);

  useEffect(() => () => cleanup.current?.(), []);
  editorBehavior.autoCloseEnvironments = s.autoCloseEnvironments;
  editorBehavior.typingAnimation = s.typingAnimation;

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
        cleanup.current = enhanceEditor(editor);
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
        editor.focus();
      }}
    />
  );
}
