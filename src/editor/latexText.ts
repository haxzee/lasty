export interface Heading {
  level: number;
  title: string;
  line: number;
}

const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
};

export function outline(text: string): Heading[] {
  const out: Heading[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = stripComment(raw);
    const m = line.match(/\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/);
    if (!m) return;
    const title = readGroup(line, m.index! + m[0].length - 1) ?? "";
    out.push({ level: LEVELS[m[1]], title: cleanTitle(title), line: i + 1 });
  });
  return out;
}

function cleanTitle(title: string) {
  return title.replace(/\\[a-zA-Z]+\*?\s*/g, "").replace(/[{}]/g, "").trim() || "Untitled";
}

function stripComment(line: string) {
  const m = line.match(/(^|[^\\])%/);
  return m ? line.slice(0, m.index! + m[1].length) : line;
}

/** Reads a balanced {…} group starting at `open`, returning its contents. */
function readGroup(text: string, open: number) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

export interface TextWord {
  word: string;
  line: number;
  column: number;
}

/** Commands whose arguments are not prose (keys, paths, package names, …). */
const NON_PROSE = new Set([
  "begin", "end", "label", "ref", "eqref", "pageref", "autoref", "cref", "Cref", "vref", "cite", "citep", "citet",
  "nocite", "autocite", "parencite", "textcite", "footcite", "usepackage", "RequirePackage", "documentclass",
  "input", "include", "includegraphics", "includeonly", "bibliography", "bibliographystyle", "addbibresource",
  "url", "href", "newcommand", "renewcommand", "providecommand", "newenvironment", "renewenvironment", "def",
  "setlength", "addtolength", "setcounter", "usetheme", "usecolortheme", "pagestyle", "thispagestyle",
  "geometry", "hypersetup", "definecolor", "color", "textcolor", "lstinputlisting", "verb", "graphicspath",
  "hspace", "vspace", "newlength",
]);

const MATH_ENVS = /^(equation|align|gather|multline|eqnarray|math|displaymath|flalign|alignat|tikzpicture|verbatim|lstlisting|minted|tabular)\*?$/;

/**
 * Prose words of a LaTeX document with their 1-based positions, skipping commands,
 * comments, math, and non-prose arguments.
 */
export function proseWords(text: string): TextWord[] {
  const out: TextWord[] = [];
  let line = 1;
  let lineStart = 0;
  let i = 0;
  let math: string | null = null;
  let env: string | null = null;
  let skipDepth = 0;
  let braceDepth = 0;
  const n = text.length;

  const isLetter = (c: string) => /\p{L}/u.test(c);

  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      line++;
      lineStart = i + 1;
      i++;
      continue;
    }
    if (c === "%") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "\\") {
      const m = /^\\([a-zA-Z@]+)\*?|^\\./.exec(text.slice(i, i + 40));
      const name = m?.[1];
      const token = m?.[0] ?? "\\";
      if (token === "\\[" || token === "\\(") math = token === "\\[" ? "\\]" : "\\)";
      else if (math && token === math) math = null;
      if (name === "begin" || name === "end") {
        const close = text.indexOf("}", i);
        const envName = text.slice(text.indexOf("{", i) + 1, close);
        if (MATH_ENVS.test(envName)) env = name === "begin" ? envName : env === envName ? null : env;
        i = close > 0 ? close + 1 : i + token.length;
        continue;
      }
      i += token.length;
      if (name && NON_PROSE.has(name) && !skipDepth) {
        // Skip the optional and mandatory arguments that follow.
        while (i < n) {
          while (text[i] === " ") i++;
          if (text[i] === "[") i = Math.max(i + 1, text.indexOf("]", i) + 1);
          else if (text[i] === "{") {
            let depth = 0;
            for (; i < n; i++) {
              if (text[i] === "\\") i++;
              else if (text[i] === "{") depth++;
              else if (text[i] === "}" && --depth === 0) break;
              else if (text[i] === "\n") {
                line++;
                lineStart = i + 1;
              }
            }
            i++;
          } else break;
        }
      }
      continue;
    }
    if (c === "$") {
      const double = text[i + 1] === "$";
      const delim = double ? "$$" : "$";
      if (math === delim) math = null;
      else if (!math) math = delim;
      i += delim.length;
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (!math && !env && isLetter(c)) {
      const start = i;
      while (i < n && (isLetter(text[i]) || ((text[i] === "'" || text[i] === "-") && isLetter(text[i + 1] ?? "")))) i++;
      // A word glued to a backslash command or followed by digits/underscores is likely an identifier.
      if (!/[\d_@]/.test(text[i] ?? "")) {
        let offset = start;
        for (const part of text.slice(start, i).split("-")) {
          if (part.length > 1) out.push({ word: part, line, column: offset - lineStart + 1 });
          offset += part.length + 1;
        }
      }
      continue;
    }
    i++;
  }
  return out;
}

export function wordCount(text: string) {
  const body = text.includes("\\begin{document}") ? text.slice(text.indexOf("\\begin{document}")) : text;
  return proseWords(body).length;
}

export interface Diagnostic {
  file: string;
  line: number;
  message: string;
}

/** Errors in a LaTeX log written with -file-line-error, or Tectonic's "error: file:line:" form. */
export function parseDiagnostics(log: string, root: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = log.split("\n");
  lines.forEach((l, i) => {
    const m = l.match(/^(?:error: )?(.+?\.(?:tex|sty|cls|bib|ltx)):(\d+): (.+)$/);
    if (!m) return;
    let message = m[3].trim();
    const context = lines[i + 1]?.match(/^l\.\d+\s*(.*)$/);
    if (context?.[1]) message += ` — ${context[1].trim()}`;
    out.push({ file: normalizePath(m[1], root), line: Number(m[2]), message });
  });
  return out;
}

export function normalizePath(path: string, root: string) {
  let p = path.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  if (p.startsWith(r + "/")) p = p.slice(r.length + 1);
  return p.replace(/\/\.\//g, "/").replace(/^\.\//, "");
}

export interface ProjectHeading extends Heading {
  file: string;
}

/** Headings of the whole document, following \input and \include from the main file. */
export function projectOutline(main: string, texts: Record<string, string>): ProjectHeading[] {
  const out: ProjectHeading[] = [];
  const seen = new Set<string>();
  const resolve = (name: string) => {
    const clean = name.trim().replace(/^\.\//, "");
    return [clean, `${clean}.tex`].find((f) => f in texts);
  };
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const headings = outline(texts[file]);
    let h = 0;
    texts[file].split("\n").forEach((raw, i) => {
      while (h < headings.length && headings[h].line === i + 1) out.push({ ...headings[h++], file });
      for (const m of stripComment(raw).matchAll(/\\(?:input|include|subfile)\{([^}]+)\}/g)) {
        const target = resolve(m[1]);
        if (target) visit(target);
      }
    });
  };
  if (main in texts) visit(main);
  return out;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  length: number;
  preview: string;
}

export function searchRegex(query: string, { regex, caseSensitive }: { regex: boolean; caseSensitive: boolean }) {
  if (!query) return null;
  try {
    return new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

export function searchTexts(texts: Record<string, string>, re: RegExp, limit = 2000): SearchMatch[] {
  const out: SearchMatch[] = [];
  for (const [file, text] of Object.entries(texts)) {
    text.split("\n").forEach((line, i) => {
      if (out.length >= limit) return;
      for (const m of line.matchAll(re)) {
        if (!m[0].length) continue;
        out.push({ file, line: i + 1, column: m.index! + 1, length: m[0].length, preview: line });
      }
    });
  }
  return out;
}
