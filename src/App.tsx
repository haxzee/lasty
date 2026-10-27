import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "./components/Editor";
import Preview from "./components/Preview";
import Toolbar, { type Status } from "./components/Toolbar";
import "./App.css";

const DEBOUNCE_MS = 300;

const INITIAL_SOURCE = String.raw`\documentclass{article}
\usepackage{amsmath}

\title{Hello Lasty}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Edit me on the left -- the preview updates automatically.

\[
  e^{i\pi} + 1 = 0
\]

\end{document}
`;

export default function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [pdf, setPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [theme, setTheme] = useState<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  // Only the latest request may update state; older results are discarded.
  const requestId = useRef(0);

  const compile = useCallback(async (code: string) => {
    const id = ++requestId.current;
    setStatus("compiling");
    try {
      const result = await invoke<string>("compile_latex", { sourceCode: code });
      if (id !== requestId.current) return;
      setPdf(result);
      setError(null);
      setStatus("success");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => compile(source), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, compile]);

  return (
    <div className={`app theme-${theme}`}>
      <Toolbar
        status={status}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onCompile={() => compile(source)}
      />
      <main className="split">
        <section className="pane">
          <Editor value={source} onChange={setSource} theme={theme} />
        </section>
        <section className="pane">
          <Preview pdfBase64={pdf} error={error} />
        </section>
      </main>
    </div>
  );
}
