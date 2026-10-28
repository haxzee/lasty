import { normalizePath } from "./latexText";

/** A SyncTeX record, in PDF points measured from the top-left corner of its page. */
interface Box {
  page: number;
  file: string;
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  /** An hbox/vbox that contains other records (as opposed to a glyph, glue, kern or void box). */
  container: boolean;
}

export interface SyncTarget {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const RECORD = /^([[(vhxkg$])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;
const SP_PER_BP = 65781.76;

export class SyncTex {
  private boxes: Box[] = [];

  constructor(data: string, root: string) {
    const inputs = new Map<string, string>();
    let unit = 1;
    let mag = 1000;
    let xOffset = 0;
    let yOffset = 0;
    let page = 0;
    let content = false;
    const toBp = (v: number) => (v * unit * (mag / 1000)) / SP_PER_BP;

    for (const line of data.split("\n")) {
      if (!content) {
        if (line.startsWith("Input:")) {
          const [, tag, ...path] = line.split(":");
          inputs.set(tag, normalizePath(path.join(":"), root));
        } else if (line.startsWith("Unit:")) unit = Number(line.slice(5)) || 1;
        else if (line.startsWith("Magnification:")) mag = Number(line.slice(14)) || 1000;
        else if (line.startsWith("X Offset:")) xOffset = Number(line.slice(9)) || 0;
        else if (line.startsWith("Y Offset:")) yOffset = Number(line.slice(9)) || 0;
        else if (line.startsWith("Content:")) content = true;
        continue;
      }
      if (line.startsWith("Input:")) {
        const [, tag, ...path] = line.split(":");
        inputs.set(tag, normalizePath(path.join(":"), root));
        continue;
      }
      if (line[0] === "{") {
        page = Number(line.slice(1));
        continue;
      }
      const m = RECORD.exec(line);
      if (!m) continue;
      const file = inputs.get(m[2]);
      if (!file) continue;
      const isBox = "[(vh".includes(m[1]);
      const container = m[1] === "[" || m[1] === "(";
      this.boxes.push({
        page,
        file,
        line: Number(m[3]),
        x: toBp(Number(m[4]) + xOffset),
        y: toBp(Number(m[5]) + yOffset),
        width: isBox ? toBp(Number(m[6] ?? 0)) : 0,
        height: isBox ? toBp(Number(m[7] ?? 0)) : 0,
        depth: isBox ? toBp(Number(m[8] ?? 0)) : 0,
        container,
      });
    }
  }

  /** Source → PDF: where `file:line` ended up in the document. */
  forward(file: string, line: number): SyncTarget | null {
    const inFile = this.boxes.filter((b) => b.file === file && !b.container);
    if (!inFile.length) return null;
    let best = Infinity;
    for (const b of inFile) if (b.line >= line && b.line < best) best = b.line;
    if (best === Infinity) best = Math.max(...inFile.map((b) => b.line));
    const page = inFile.find((b) => b.line === best)!.page;
    const hits = inFile.filter((b) => b.line === best && b.page === page);
    const rows = this.boxes.filter((b) => b.page === page && b.container && b.height > 0);
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const h of hits) {
      const row = rows.find((r) => Math.abs(r.y - h.y) < 0.5 && h.x >= r.x - 0.5 && h.x <= r.x + r.width + 0.5);
      top = Math.min(top, h.y - (row?.height ?? 9));
      bottom = Math.max(bottom, h.y + (row?.depth ?? 3));
      left = Math.min(left, row && hits.length < 2 ? row.x : h.x);
      right = Math.max(right, row && hits.length < 2 ? row.x + row.width : h.x + h.width);
    }
    return { page, x: left, y: top, width: Math.max(right - left, 2), height: bottom - top };
  }

  /** PDF → source: the line that produced the point (x, y) on `page`. */
  inverse(page: number, x: number, y: number): { file: string; line: number } | null {
    const onPage = this.boxes.filter((b) => b.page === page);
    let row: Box | null = null;
    for (const b of onPage) {
      if (!b.container || b.width <= 0) continue;
      const inside = x >= b.x && x <= b.x + b.width && y >= b.y - b.height - 1 && y <= b.y + b.depth + 1;
      if (inside && (!row || b.width * (b.height + b.depth) < row.width * (row.height + row.depth))) row = b;
    }
    const leaves = onPage.filter((b) => !b.container);
    const pool = row ? leaves.filter((b) => Math.abs(b.y - row!.y) < 0.5) : leaves;
    let best: Box | null = null;
    let bestDist = Infinity;
    for (const b of pool.length ? pool : leaves) {
      // Glyph records sit at the end of a word, so a point just left of one belongs to it.
      const dx = x <= b.x ? (b.x - x) * 0.5 : x - b.x;
      const dist = Math.abs(b.y - y) * 4 + dx;
      if (dist < bestDist) {
        best = b;
        bestDist = dist;
      }
    }
    best ??= row;
    return best ? { file: best.file, line: best.line } : null;
  }
}
