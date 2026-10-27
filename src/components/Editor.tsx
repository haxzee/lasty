import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

const extensions = [StreamLanguage.define(stex)];

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: "light" | "dark";
}

export default function Editor({ value, onChange, theme }: EditorProps) {
  return (
    <CodeMirror
      className="editor"
      value={value}
      height="100%"
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
    />
  );
}
