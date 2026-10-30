import React, { useEffect, useRef, useState, useMemo } from "react";
import { ArchiveScene, type ArchiveCardData } from "./scene";
import { ModelViewer } from "./viewer";

const nav = (p: string) => { location.hash = "#/" + p; };

// 编号滚动：各位数字纵向滚动到新值。
function RollingNumber({ value, digits = 3 }: { value: number; digits?: number }) {
  // 滚轮结构完整保留在 DOM，屏幕阅读器只读实际编号。
  const str = String(Math.max(0, value)).padStart(digits, '0');
  return (
    <span className="rnum" aria-label={str}>
      {Array.from({ length: digits }, (_, i) => (
        <span className="rnum-digit" aria-hidden="true" key={i}>
          <span className="rnum-reel" style={{ transform: `translateY(-${Number(str[i] || 0)}em)` }}>
            {Array.from({ length: 10 }, (_, d) => <span key={d}>{d}</span>)}
          </span>
        </span>
      ))}
    </span>
  );
}

// 标题滚动：快切时黑条式文字滚动（direct 模式，各字同时启动）。
function RollingTitle({ text }: { text: string }) {
  return (
    <span className="rtitle" key={text}>
      {text.split("").map((c, i) => <span className="rtitle-ch" style={{ animationDelay: `${i * 12}ms` }} key={i}>{c === " " ? "\u00A0" : c}</span>)}
    </span>
  );
}

export function ArchiveTerminal() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ArchiveScene | null>(null);
  const viewerRef = useRef<ModelViewer | null>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [selected, setSelected] = useState<ArchiveCardData | null>(null);
  const [detail, setDetail] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const columns = useMemo<ArchiveCardData[][]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = cards.filter((c) => !q || (c.name || "").toLowerCase().includes(q) || String(c.booth_id || "").includes(q) || (c.category_name || "").includes(q));
    const byCat = new Map<string, ArchiveCardData[]>();
    for (const c of filtered) {
      const cat = c.category_name || "未分类";
      (byCat.get(cat) || byCat.set(cat, []).get(cat)!).push({
        id: c.id, name: c.name, category: cat,
        boothId: c.booth_id ? String(c.booth_id) : null,
        coverUrl: c.cover_path || null, favorite: !!c.favorite,
      });
    }
    const groups = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).map(([, v]) => v);
    // 保证 5 列：不足用空列补齐
    while (groups.length < 5) groups.push([]);
    return groups.slice(0, 5);
  }, [cards, query]);

  useEffect(() => {
    window.vrc?.galleryCards?.().then((r: any[]) => setCards(r)).catch(() => setError("读取资料库失败"));
  }, []);

  useEffect(() => {
    if (!hostRef.current || !columns.some((c) => c.length)) return;
    if (!sceneRef.current) {
      const scene = new ArchiveScene(hostRef.current);
      sceneRef.current = scene;
      scene.onSelect = (c) => setSelected(c);
      scene.onOpen = () => setDetail(true);
      scene.setTheme(document.documentElement.getAttribute("data-theme") === "dark");
      scene.load().then(() => scene.start()).catch((e) => setError("三维模型载入失败：" + e.message));
    }
    sceneRef.current.setData(columns);
  }, [columns]);

  useEffect(() => () => { sceneRef.current?.dispose(); sceneRef.current = null; }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewerOpen) { if (e.key === "Escape") closeViewer(); return; }
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowUp") { e.preventDefault(); sceneRef.current?.navigate("row", -1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); sceneRef.current?.navigate("row", 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); sceneRef.current?.navigate("lane", -1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); sceneRef.current?.navigate("lane", 1); }
      else if (e.key === "Enter") { detail ? (setDetail(false), sceneRef.current?.closeDetail()) : (setDetail(true), sceneRef.current?.openDetail()); }
      else if (e.key === "Escape" && detail) { setDetail(false); sceneRef.current?.closeDetail(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, viewerOpen]);

  const openViewer = async () => {
    setViewerOpen(true);
    requestAnimationFrame(async () => {
      if (!viewerHostRef.current) return;
      const v = new ModelViewer(viewerHostRef.current);
      viewerRef.current = v;
      v.setTheme(document.documentElement.getAttribute("data-theme") === "dark");
      await v.load().catch(() => {});
      v.start();
    });
  };
  const closeViewer = () => {
    viewerRef.current?.dispose();
    viewerRef.current = null;
    setViewerOpen(false);
  };

  return (
    <section className="aterm">
      <div className="aterm-stage" ref={hostRef} />
      <div className="scene-atmosphere" style={{ opacity: 1 }} />
      <header className="aterm-top">
        <div className="aterm-cat">
          <span className="ef-eyebrow slash">ARCHIVE / 档案终端</span>
          <h1><RollingTitle text={selected?.category || "全部档案"} /></h1>
        </div>
        <div className="aterm-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="检索编号 / 标题 / 分类…" aria-label="检索档案" />
        </div>
      </header>

      <aside className="aterm-hud">
        <div className="aterm-no">X-<RollingNumber value={selected ? Math.abs(selected.id) % 1000 : 0} /></div>
        <div className="aterm-title"><RollingTitle text={selected?.name || "未选择"} /></div>
        {selected?.boothId && <div className="aterm-booth">BOOTH #{selected.boothId}</div>}
        <div className="aterm-perm">PERMISSION AUTHORIZED</div>
      </aside>

      <footer className="aterm-bottom">
        <div className="aterm-colname"><RollingTitle text={selected ? selected.name : "VRC LIBRARY"} /></div>
        <div className="aterm-ticks">
          {columns.map((col, i) => (
            <button key={i} className={"tick" + (selected && selected.category === col[0]?.category ? " on" : "")}
              onClick={() => sceneRef.current?.selectCell({ lane: i, row: 0 })} aria-label={"第" + (i + 1) + "列"}>
              <span>{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <div className="aterm-help"><span>←→ 切列</span><span>↑↓ / 滚轮 翻阅</span><span>双击 / Enter 抽取</span></div>
      </footer>

      {detail && selected && (
        <div className="aterm-detail">
          <div className="ef-panel cut-br">
            <div className="ef-eyebrow slash">RECORD / 档案解密</div>
            <h2>{selected.name}</h2>
            <dl className="ef-dl">
              <div><dt>分类</dt><dd>{selected.category}</dd></div>
              <div><dt>BOOTH</dt><dd>{selected.boothId || "—"}</dd></div>
              <div><dt>编号</dt><dd>X-{String(Math.abs(selected.id) % 1000).padStart(3, "0")}</dd></div>
            </dl>
            <div className="ef-actions">
              <button className="ef-btn go" onClick={openViewer}>360° 结构查看 ↗</button>
              <button className="ef-btn" onClick={() => { window.vrc?.cardTouchOpened?.(selected.id); nav("card/" + selected.id); }}>打开档案</button>
              <button className="ef-btn ghost" onClick={() => { setDetail(false); sceneRef.current?.closeDetail(); }}>返回阵列</button>
            </div>
          </div>
        </div>
      )}

      {viewerOpen && (
        <div className="mviewer" role="dialog" aria-modal="true">
          <div className="mviewer-canvas" ref={viewerHostRef} />
          <header className="mviewer-head">
            <button className="ef-btn ghost" onClick={closeViewer}>← 返回档案 <kbd>ESC</kbd></button>
            <div><span className="ef-eyebrow slash">OBJECT STUDY / 结构研究</span><h2>{selected?.name}</h2></div>
            <span className="mviewer-360">360°</span>
          </header>
          <div className="mviewer-surface">
            <button className="ef-btn small" onClick={() => viewerRef.current?.setClarity(true)}>清晰</button>
            <button className="ef-btn small" onClick={() => viewerRef.current?.setClarity(false)}>磨砂</button>
          </div>
          <aside className="mviewer-parts">
            <div>ASSEMBLY / 装配结构</div>
            {["紧固件", "透明盖板", "折射环组", "光学核心", "信息基板", "背板与框架"].map((p, i) => (
              <p key={p}><span>{String(i + 1).padStart(2, "0")}</span><strong>{p}</strong></p>
            ))}
          </aside>
          <footer className="mviewer-foot">
            <div className="mviewer-help"><span>拖动旋转</span><span>滚轮缩放</span><span>右键平移</span></div>
            <div className="ef-actions">
              <button className="ef-btn go" onClick={() => viewerRef.current?.explode()}>拆解</button>
              <button className="ef-btn" onClick={() => viewerRef.current?.assemble()}>重组</button>
              <button className="ef-btn ghost" onClick={() => viewerRef.current?.resetView()}>复位视角</button>
            </div>
          </footer>
        </div>
      )}
      {error && <div className="notice err aterm-err">{error}</div>}
    </section>
  );
}
