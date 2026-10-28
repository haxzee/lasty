import { api } from "../api";
import { proseWords } from "./latexText";
import { monaco } from "./monaco";

const OWNER = "spelling";
const known = new Map<string, Map<string, boolean>>();

export const spellBehavior = {
  language: "off" as string,
  userWords: new Set<string>(),
  onAddWord: (_word: string) => {},
};

function cacheFor(lang: string) {
  let cache = known.get(lang);
  if (!cache) known.set(lang, (cache = new Map()));
  return cache;
}

monaco.editor.registerCommand("lasty.addWord", (_accessor, word: string) => spellBehavior.onAddWord(word));

monaco.languages.registerCodeActionProvider("latex", {
  async provideCodeActions(model, _range, context) {
    const markers = context.markers.filter((m) => m.code === OWNER);
    if (!markers.length || spellBehavior.language === "off") return { actions: [], dispose() {} };
    const actions: monaco.languages.CodeAction[] = [];
    for (const marker of markers) {
      const word = model.getValueInRange(marker);
      const suggestions = await api.spellSuggest(spellBehavior.language, word).catch(() => []);
      for (const s of suggestions) {
        actions.push({
          title: `Change to “${s}”`,
          kind: "quickfix",
          diagnostics: [marker],
          isPreferred: actions.length === 0,
          edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: marker, text: s } }] },
        });
      }
      actions.push({
        title: `Add “${word}” to dictionary`,
        kind: "quickfix",
        diagnostics: [marker],
        command: { id: "lasty.addWord", title: "Add to dictionary", arguments: [word] },
      });
    }
    return { actions, dispose() {} };
  },
});

/** Underlines misspelled prose words in the editor, re-checking shortly after each edit. */
export function attachSpellCheck(editor: monaco.editor.IStandaloneCodeEditor) {
  let timer: number | undefined;
  let run = 0;

  async function check() {
    const model = editor.getModel();
    if (!model) return;
    const lang = spellBehavior.language;
    if (lang === "off" || model.getLanguageId() !== "latex") return monaco.editor.setModelMarkers(model, OWNER, []);
    const id = ++run;
    const version = model.getVersionId();
    const words = proseWords(model.getValue());
    const cache = cacheFor(lang);
    const unknown = [...new Set(words.map((w) => w.word))].filter((w) => !cache.has(w));
    if (unknown.length) {
      try {
        const wrong = new Set(await api.spellCheck(lang, unknown));
        for (const w of unknown) cache.set(w, !wrong.has(w));
      } catch {
        return;
      }
    }
    if (id !== run || model.isDisposed() || model.getVersionId() !== version) return;
    const markers = words
      .filter((w) => cache.get(w.word) === false && !spellBehavior.userWords.has(w.word))
      .map((w) => ({
        code: OWNER,
        severity: monaco.MarkerSeverity.Info,
        message: `“${w.word}” may be misspelled.`,
        startLineNumber: w.line,
        startColumn: w.column,
        endLineNumber: w.line,
        endColumn: w.column + w.word.length,
      }));
    monaco.editor.setModelMarkers(model, OWNER, markers);
  }

  const schedule = (delay = 500) => {
    clearTimeout(timer);
    timer = window.setTimeout(check, delay);
  };
  const sub = editor.onDidChangeModelContent(() => schedule());
  schedule(0);

  return {
    refresh: () => schedule(0),
    dispose() {
      clearTimeout(timer);
      sub.dispose();
    },
  };
}
