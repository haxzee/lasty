import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { SyncTarget, SyncTex } from "../editor/synctex";
import { Icon } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const PAD = 16;
const GAP = 12;
const ZOOM_KEY = "lasty.pdfZoom";
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

type Zoom = "fit" | number;

export interface PdfTarget extends SyncTarget {
  seq: number;
}

interface PdfViewerProps {
  data: string;
  synctex: SyncTex | null;
  target: PdfTarget | null;
  dark: boolean;
  dimmed: boolean;
  onInverse: (file: string, line: number) => void;
  onToggleDark: () => void;
  onExport: () => void;
}

function readZoom(): Zoom {
  try {
    const v = localStorage.getItem(ZOOM_KEY);
    return !v || v === "fit" ? "fit" : Number(v) || "fit";
  } catch {
    return "fit";
  }
}

function decode(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function PdfViewer({ data, synctex, target, dark, dimmed, onInverse, onToggleDark, onExport }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [zoom, setZoomState] = useState<Zoom>(readZoom);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<PdfTarget | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const wrappers = useRef<(HTMLDivElement | null)[]>([]);
  const rendered = useRef(new Map<number, string>());
  const visible = useRef(new Set<number>());
  const docSeq = useRef(0);
  const anchor = useRef<{ ratioY: number; offsetY: number; ratioX: number; offsetX: number } | null>(null);

  const maxWidth = Math.max(1, ...sizes.map((s) => s.w));
  const fitScale = width ? Math.max(MIN_SCALE, (width - PAD * 2) / maxWidth) : 1;
  const scale = zoom === "fit" ? fitScale : zoom;

  function setZoom(next: Zoom, focus?: { x: number; y: number }) {
    const el = scrollRef.current;
    if (el) {
      const fx = focus?.x ?? el.clientWidth / 2;
      const fy = focus?.y ?? el.clientHeight / 2;
      anchor.current = {
        ratioY: (el.scrollTop + fy) / el.scrollHeight,
        offsetY: fy,
        ratioX: (el.scrollLeft + fx) / el.scrollWidth,
        offsetX: fx,
      };
    }
    const clamped = next === "fit" ? next : Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setZoomState(clamped);
    try {
      localStorage.setItem(ZOOM_KEY, String(clamped));
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    let loaded: pdfjs.PDFDocumentProxy | null = null;
    const task = pdfjs.getDocument({ data: decode(data) });
    task.promise
      .then(async (next) => {
        loaded = next;
        const viewports = await Promise.all(
          Array.from({ length: next.numPages }, (_, i) => next.getPage(i + 1).then((p) => p.getViewport({ scale: 1 }))),
        );
        if (cancelled) return next.destroy();
        docSeq.current++;
        setSizes(viewports.map((v) => ({ w: v.width, h: v.height })));
        setDoc((prev) => {
          // Keep the old document alive until its pages have been painted over.
          if (prev) window.setTimeout(() => prev.destroy(), 2000);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (!loaded) task.destroy();
    };
  }, [data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function renderPage(i: number) {
    const canvas = canvases.current[i];
    if (!doc || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const key = `${docSeq.current}:${scale}:${dpr}`;
    if (rendered.current.get(i) === key) return;
    rendered.current.set(i, key);
    try {
      const p = await doc.getPage(i + 1);
      const viewport = p.getViewport({ scale: scale * dpr });
      const off = document.createElement("canvas");
      off.width = Math.ceil(viewport.width);
      off.height = Math.ceil(viewport.height);
      await p.render({ canvas: off, canvasContext: off.getContext("2d")!, viewport }).promise;
      if (rendered.current.get(i) !== key) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
    } catch {
      if (rendered.current.get(i) === key) rendered.current.delete(i);
    }
  }

  useEffect(() => {
    if (!doc) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting) {
            visible.current.add(i);
            renderPage(i);
          } else visible.current.delete(i);
        }
      },
      { root: scrollRef.current, rootMargin: "100% 0px" },
    );
    wrappers.current.slice(0, sizes.length).forEach((w) => w && io.observe(w));
    for (const i of visible.current) renderPage(i);
    return () => io.disconnect();
  }, [doc, sizes, scale]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollTop = a.ratioY * el.scrollHeight - a.offsetY;
    el.scrollLeft = a.ratioX * el.scrollWidth - a.offsetX;
  }, [scale]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setZoom(scale * Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function pageTop(i: number) {
    let top = PAD;
    for (let k = 0; k < i; k++) top += sizes[k].h * scale + GAP;
    return top;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!target || !el || !sizes[target.page - 1]) return;
    const top = pageTop(target.page - 1) + target.y * scale - el.clientHeight / 3;
    el.scrollTo({ top, behavior: "smooth" });
    setFlash(target);
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [target?.seq, sizes.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let top = PAD;
    for (let i = 0; i < sizes.length; i++) {
      top += sizes[i].h * scale + GAP;
      if (top > mid) return setPage(i + 1);
    }
  }

  function inverse(e: React.MouseEvent, i: number) {
    if (!synctex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = synctex.inverse(i + 1, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
    if (hit) onInverse(hit.file, hit.line);
  }

  const zoomLabel = `${Math.round(scale * 100)} %`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`min-h-0 flex-1 overflow-auto transition-opacity duration-300 ${dimmed ? "opacity-40" : ""}`}
      >
        <div className="flex w-max min-w-full flex-col items-center" style={{ padding: PAD, gap: GAP }}>
          {sizes.map((s, i) => (
            <div
              key={i}
              data-page={i}
              ref={(el) => {
                wrappers.current[i] = el;
              }}
              onClick={(e) => (e.metaKey || e.ctrlKey) && inverse(e, i)}
              onDoubleClick={(e) => inverse(e, i)}
              title={synctex ? "Double-click or ⌘-click to jump to the source" : undefined}
              className="relative shrink-0 bg-white shadow-[0_0_0_0.5px_var(--edge),0_2px_8px_var(--lift)]"
              style={{ width: s.w * scale, height: s.h * scale }}
            >
              <canvas
                ref={(el) => {
                  canvases.current[i] = el;
                }}
                className={`block size-full ${dark ? "[filter:invert(0.9)_hue-rotate(180deg)]" : ""}`}
              />
              {flash && flash.page === i + 1 && (
                <div
                  className="pointer-events-none absolute rounded-[3px] bg-[#ffd84d]/45 animate-[sync-flash_1.6s_ease-out_forwards]"
                  style={{
                    left: (flash.x - 2) * scale,
                    top: (flash.y - 2) * scale,
                    width: Math.max(flash.width + 4, 24) * scale,
                    height: (flash.height + 4) * scale,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {sizes.length > 0 && (
        <div className="glass absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-0.5 rounded-full px-1 text-xs tabular-nums">
          <span className="px-2 text-muted">
            {page} / {sizes.length}
          </span>
          <ToolButton title="Zoom Out" onClick={() => setZoom(scale / 1.2)}>
            <path d="M5 12h14" />
          </ToolButton>
          <button
            onClick={() => setZoom(zoom === "fit" ? 1 : "fit")}
            title={zoom === "fit" ? "Actual size" : "Fit width"}
            className="h-7 min-w-14 cursor-default rounded-full px-1.5 font-medium hover:bg-hover"
          >
            {zoom === "fit" ? "Fit" : zoomLabel}
          </button>
          <ToolButton title="Zoom In" onClick={() => setZoom(scale * 1.2)}>
            <path d="M12 5v14M5 12h14" />
          </ToolButton>
          <span className="mx-0.5 h-4 w-px bg-separator" />
          <ToolButton title={dark ? "Light pages" : "Dark pages"} onClick={onToggleDark} active={dark}>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </ToolButton>
          <ToolButton title="Export PDF…" onClick={onExport}>
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </ToolButton>
        </div>
      )}
    </div>
  );
}

function ToolButton({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`grid size-7 cursor-default place-items-center rounded-full hover:bg-hover ${active ? "text-fg" : "text-muted hover:text-fg"}`}
    >
      <Icon className="size-3.5">{children}</Icon>
    </button>
  );
}
