// VRC素材整理 renderer（React 19 + 终末地风格）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

declare const window: any;

// ---------- 工具 ----------
function fmtBytes(n: number): string {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + u[i];
}
function fmtInt(n: number): string {
  return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


// 保存视图应用：暂存待应用的查询，Gallery 挂载后读取
let pendingGalleryQuery: any = null;

const MATCH_STATE: Record<string, string> = {
  pending: '待匹配', auto: '已命中', suggested: '有候选', manual: '人工', rejected: '已排除', skipped: '已跳过',
};

type Route = { page: string; id?: string };

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  return { page: page || 'gallery', id };
}
function nav(page: string, id?: string) {
  location.hash = '/' + page + (id ? '/' + id : '');
}

// 把主题/动效设置即时应用到 <html>：data-theme 管明暗，data-ef-motion 管动效变体
function applySettingsToDom(s: any) {
  const root = document.documentElement;
  const theme = s?.theme || 'system';
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else if (theme === 'light') root.setAttribute('data-theme', 'light'); // 阻止系统深色覆盖
  else root.removeAttribute('data-theme'); // system：跟随系统媒体查询
  root.setAttribute('data-ef-motion', (s?.motion || 'full') === 'calm' ? 'calm' : 'full');
}


// ---------- 控制台圆盘（终末地主视觉） ----------
function Dial({ s }: { s: any }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const draw = (window as any).drawDial;
    if (!draw || !ref.current || !s) return;
    const navgo = (page: string) => (e: any) => { e.preventDefault(); nav(page); };
    draw(ref.current, {
      sections: [
        { zh: '图库', en: 'Gallery', href: '#/gallery', big: fmtInt(s.total), unit: '卡', here: true, onClick: navgo('gallery') },
        { zh: '匹配', en: 'Match', href: '#/match', big: fmtInt(s.pending), unit: '待办', alert: s.pending > 0, onClick: navgo('match') },
        { zh: '分类', en: 'Classify', href: '#/classify', big: fmtInt(s.filed), unit: '已分类', onClick: navgo('classify') },
        { zh: '集合', en: 'Collections', href: '#/collections', big: fmtInt(s.collections), unit: '个', onClick: navgo('collections') },
        { zh: 'BOOTH', en: 'Browser', href: '#/booth', big: fmtInt(s.boothItems), unit: '商品', onClick: navgo('booth') },
        { zh: '任务', en: 'Tasks', href: '#/tasks', big: fmtInt(s.netActive), unit: '进行', alert: s.netActive > 0, onClick: navgo('tasks') },
      ],
      gauges: [
        { label: '匹配率', share: s.total > 0 ? s.matched / s.total : 0 },
        { label: '分类率', share: s.total > 0 ? s.filed / s.total : 0 },
      ],
      idle: { label: '已扫描', big: fmtBytes(s.size), unit: '', sub: '扫描于 ' + s.scannedAt },
    });
  }, [s]);
  return <svg className="ef-dial" ref={ref} role="navigation" aria-label="控制台分区导航" />;
}

// ---------- 应用 ----------
function App() {
  const route = useHashRoute();
  const [settings, setSettings] = useState<any>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // 摘除 index.html 里的静态启动画面（React 已挂载，splash 为纯 CSS 动画）
    try { document.getElementById('boot-splash')?.remove(); } catch {}
    window.vrc?.settingsGet?.().then((s: any) => { setSettings(s); applySettingsToDom(s); }).catch(() => {});
  }, []);
  const [upd, setUpd] = useState<any>(null);


  // 启动后静默检查 GitHub 最新发布，有新版本则弹更新提示
  useEffect(() => {
    window.vrc?.updateCheck?.().then((info: any) => {
      if (info?.updateAvailable) setUpd(info);
    }).catch(() => {});
  }, []);


  const page = route.page;

  let content: React.ReactNode;
  switch (page) {
    case 'welcome': content = <Welcome onGo={() => nav('gallery')} />; break;
    case 'card': content = <CardDetail id={route.id!} />; break;
    case 'match': content = <Match />; break;
    case 'classify': content = <Classify />; break;
    case 'keywords': content = <Keywords />; break;
    case 'collections': content = <Collections />; break;
    case 'booth': content = <Booth />; break;
    case 'tasks': content = <Tasks />; break;
    case 'settings': content = <Settings settings={settings} reload={() => window.vrc?.settingsGet?.().then((s: any) => { setSettings(s); applySettingsToDom(s); })} />; break;
    case 'views': content = <Views />; break;
    case 'recents': content = <Recents />; break;
    default: content = <Gallery />;
  }

  return (
    <>
      {booting && <BootSequence done={() => setBooting(false)} />}
      <div className="shell">
        <div className="ef-tri"><i /><i /><i /></div>
        <header className="ef-cmdbar" role="banner">
        <div className="brand"><span className="seal">VRC</span><span className="name">素材整理</span></div>
        <nav aria-label="主导航">
          <NavLink page="gallery" label="图库" en="GALLERY" current={page === 'gallery' || page === 'card'} />
          <NavLink page="match" label="匹配" en="MATCH" current={page === 'match'} />
          <NavLink page="classify" label="分类" en="CLASSIFY" current={page === 'classify'} />
          <NavLink page="keywords" label="关键词" en="KEYWORDS" current={page === 'keywords'} />
          <NavLink page="collections" label="集合" en="COLLECTIONS" current={page === 'collections'} />
          <NavLink page="booth" label="BOOTH" en="BROWSER" current={page === 'booth'} />
          <NavLink page="tasks" label="任务" en="TASKS" current={page === 'tasks'} />
          <NavLink page="settings" label="设置" en="SETTINGS" current={page === 'settings'} />
          <NavLink page="views" label="视图" en="VIEWS" current={page === 'views'} />
          <NavLink page="recents" label="最近" en="RECENT" current={page === 'recents'} />
        </nav>
        <div className="util">
          <button className="ef-btn small go" onClick={() => nav('welcome')}>扫描</button>
        </div>
      </header>
        <main id="ef" className="ef-pad">
          <div className="page-stage" key={page + (route.id ? '/' + route.id : '')}>{content}</div>
        </main>
        {upd?.updateAvailable && <UpdateNotice info={upd} onClose={() => setUpd(null)} />}
      </div>
    </>
  );
}

function NavLink({ page, label, en, current }: { page: string; label: string; en: string; current: boolean }) {
  return (
    <a href={'#/' + page} aria-current={current ? 'page' : undefined} onClick={(e) => { e.preventDefault(); nav(page); }}>
      <span className="en">{en}</span>
      <span className="zh">{label}</span>
    </a>
  );
}

// ---------- 启动序列（极短的机械入场，不拖慢启动） ----------
const BOOT_LINES = [
  '读取本地资料库',
  '载入界面资源',
  '完成',
];

function BootSequence({ done }: { done: () => void }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx >= BOOT_LINES.length) { done(); return; }
    const t = setTimeout(() => setIdx(idx + 1), idx >= BOOT_LINES.length - 1 ? 40 : 22);
    return () => clearTimeout(t);
  }, [idx]);
  return (
    <div className="boot" role="status" aria-label="启动中">
      <div className="boot-inner">
        <div className="boot-head">
          <span className="boot-no">{String(idx).padStart(2, '0')}</span>
          <span className="boot-text">{BOOT_LINES[idx] || '完成'}</span>
        </div>
        <div className="boot-log">
          {BOOT_LINES.slice(0, idx + 1).map((l, i) => (
            <div key={i} className={i === idx ? 'is-now' : ''}><span className="n">{String(i).padStart(2, '0')}</span><span>{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 欢迎 / 扫描 ----------
function Welcome({ onGo }: { onGo: () => void }) {
  const [roots, setRoots] = useState<any[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [drag, setDrag] = useState(false);
  // m04241：拖入/扫描后按文件名自动搜 BOOTH，弹出约 3 条候选供选择
  const [picks, setPicks] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    window.vrc?.rootsList?.().then(setRoots).catch(() => {});
  }, []);

  async function handleDrop(files: File[]) {
    if (!files.length) return;
    const dirs: string[] = [];
    const archives: string[] = [];
    for (const f of files) {
      const p = window.vrc.getFilePath(f);
      if (!p) continue;
      const ext = p.toLowerCase();
      if (/.(zip|rar|7z|unitypackage|vrm|fbx|blend|psd)$/.test(ext)) archives.push(p);
      else dirs.push(p);
    }
    if (dirs.length) {
      setProgress('扫描文件夹…');
      await window.vrc.rootsAdd(dirs);
      await window.vrc.scanFolders(dirs);
    }
    let added = 0;
    const newPicks: any[] = [];
    if (archives.length) {
      setProgress('读取压缩包名称并建卡 ' + archives.length + ' 个…');
      for (const a of archives) {
        const r = await window.vrc.archiveInspect(a);
        if (r?.cardId) {
          added++;
          if (r?.candidates?.length) newPicks.push({ name: r.name || a, cardId: r.cardId, candidates: r.candidates });
        }
      }
    }
    setProgress((dirs.length ? '已扫描 ' + dirs.length + ' 个文件夹' : '') + (archives.length ? '，登记 ' + archives.length + ' 个压缩包并建卡 ' + added + ' 张' : ''));
    if (newPicks.length) { setPicks(newPicks); setPicking(true); }
    else onGo();
  }

  async function pickFolders() {
    const dirs = await window.vrc.pickFolders();
    if (!dirs.length) return;
    setProgress('扫描中…');
    await window.vrc.rootsAdd(dirs);
    const res = await window.vrc.scanFolders(dirs);
    setProgress('完成 ' + (res?.results?.length ?? 0) + ' 个根目录');
    onGo();
  }

  async function pickFiles() {
    const files = await window.vrc.pickFiles();
    if (!files.length) return;
    setProgress('读取压缩包名称并建卡…');
    let added = 0;
    const newPicks: any[] = [];
    for (const f of files) {
      const r = await window.vrc.archiveInspect(f);
      if (r?.cardId) {
        added++;
        if (r?.candidates?.length) newPicks.push({ name: r.name || f, cardId: r.cardId, candidates: r.candidates });
      }
    }
    setProgress('已登记 ' + files.length + ' 个压缩包并建卡 ' + added + ' 张');
    if (newPicks.length) { setPicks(newPicks); setPicking(true); }
  }

  async function choosePick(p: any, boothId: string) {
    try {
      await window.vrc.matchApply(p.cardId, boothId, 'search');
    } catch (e: any) { /* 关联失败忽略，保持候选 */ }
    // 从候选列表移除该条
    setPicks((prev) => prev.filter((x) => x !== p));
  }
  function dismissPick(p: any) {
    setPicks((prev) => prev.filter((x) => x !== p));
  }
  function donePicking() { setPicking(false); setPicks([]); onGo(); }

  return (
    <div
      className={'welcome' + (drag ? ' is-drag' : '')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleDrop(Array.from(e.dataTransfer.files)); }}
    >
      <div className="big"><span className="hollow">VRC</span> 素材整理</div>
      <p className="lines">本地素材库 · BOOTH 商品匹配 · 内置浏览器</p>
      {drag && <div className="ef-notice" data-flag="↓">松开以添加文件夹或压缩包</div>}
      <div className="ef-rows flat" style={{ marginTop: '2rem' }}>
        <li>
          <span className="meta">SCAN / 扫描</span>
          <span className="acts">
            <button className="ef-btn go" onClick={pickFolders}>选择文件夹</button>
            <button className="ef-btn" onClick={pickFiles}>拖入压缩包</button>
          </span>
        </li>
        {roots.map((r) => (
          <li key={r.id}>
            <span className="meta">ROOT / {r.label}</span>
            <span className="acts"><span className="ef-field">{r.path}</span></span>
          </li>
        ))}
      </div>
      {progress && <div className="ef-notice" data-flag="!">{progress}</div>}

      {picking && picks.length > 0 && (
        <div className="stack" style={{ marginTop: '1.5rem' }}>
          <div className="ef-sheet-head">
            <h2>选择 BOOTH 商品</h2>
            <div className="ef-facts"><span className="ef-field">{picks.length} 个待选择</span></div>
          </div>
          {picks.map((p, pi) => (
            <div key={pi} className="mrow">
              <div className="ef-group-head"><span className="nm">{p.name}</span></div>
              <div className="cands">
                {p.candidates.map((c: any) => (
                  <div key={c.boothItemId} className="cand">
                    <div className="thumb">{c.imageUrl ? <img src={c.imageUrl} alt="" /> : <span className="noimg">{c.boothItemId}</span>}</div>
                    <div className="tt">{c.name}<span className="st">{c.shopName}{c.price ? ' · ' + c.price + ' JPY' : ''}</span></div>
                    <div className="acts">
                      <button className="ef-btn small go" onClick={() => choosePick(p, c.boothItemId)}>选定</button>
                    </div>
                  </div>
                ))}
                {p.candidates.length === 0 && <div className="ef-empty">没有搜索到候选。</div>}
              </div>
              <div className="acts" style={{ marginTop: '0.5rem' }}>
                <button className="ef-btn small" onClick={() => dismissPick(p)}>跳过</button>
              </div>
            </div>
          ))}
          <div className="ef-actions">
            <button className="ef-btn small go" onClick={donePicking}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 图库 ----------
// 迷你搜索语法（计划书 §5.9）：#编号 cat:分类 state:状态 tag|kw:词 ext:扩展
function parseMiniSyntax(raw: string) {
  const out: { text: string; boothId: string; category: string; state: string; keyword: string; ext: string } = { text: '', boothId: '', category: '', state: '', keyword: '', ext: '' };
  let text = raw;
  text = text.replace(/#(\d{6,8})\b/g, (_m, id) => { out.boothId = id; return ''; });
  text = text.replace(/\bcat:([^\s]+)/g, (_m, c) => { out.category = c; return ''; });
  text = text.replace(/\bstate:([^\s]+)/g, (_m, s) => { out.state = s; return ''; });
  text = text.replace(/\b(?:tag|kw):([^\s]+)/g, (_m, k) => { out.keyword = k; return ''; });
  text = text.replace(/\bext:([^\s]+)/g, (_m, e) => { out.ext = e; return ''; });
  out.text = text.replace(/\s+/g, ' ').trim();
  return out;
}

function Gallery() {
  const [cards, setCards] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | null>(null);
  const [state, setState] = useState<string>('');
  const [fav, setFav] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bKw, setBKw] = useState('');
  const [bCat, setBCat] = useState<number | null>(null);
  const [msgB, setMsgB] = useState('');
  const [groupBy, setGroupBy] = useState(false);
  const syntax = useMemo(() => parseMiniSyntax(q), [q]);

  useEffect(() => {
    window.vrc?.categoryTree?.().then(setCats).catch(() => {});
    window.vrc?.galleryCards?.().then((r: any[]) => { setCards(r); setLoading(false); window.vrc?.boothHydrateCovers?.().then(() => window.vrc.galleryCards().then(setCards)).catch(() => {}); }).catch(() => setLoading(false));
    if (pendingGalleryQuery) {
      const v = pendingGalleryQuery; pendingGalleryQuery = null;
      if (typeof v.q === 'string') setQ(v.q);
      if (v.category != null) setCat(v.category);
      if (typeof v.matchState === 'string') setState(v.matchState);
      if (v.favorite != null) setFav(!!v.favorite);
    }
  }, []);

  const filtered = useMemo(() => {
    let list = cards;
    const qq = syntax.text.toLowerCase();
    if (qq) list = list.filter((c) => (c.name || '').toLowerCase().includes(qq) || (c.base || '').toLowerCase().includes(qq) || (c.booth_id || '').includes(qq));
    if (syntax.boothId) list = list.filter((c) => (c.booth_id || '') === syntax.boothId);
    if (syntax.category) list = list.filter((c) => (c.category_reason || '').toLowerCase().includes(syntax.category.toLowerCase()) || (c.category_name || '').toLowerCase().includes(syntax.category.toLowerCase()) || (c.category || '').toLowerCase().includes(syntax.category.toLowerCase()));
    if (syntax.state) list = list.filter((c) => c.match_state === syntax.state);
    if (syntax.keyword) list = list.filter((c) => (c.keywords || []).some((k: string) => k.toLowerCase().includes(syntax.keyword.toLowerCase())));
    if (syntax.ext) list = list.filter((c) => ((c.exts || '').toLowerCase().split(',').map((e: string) => e.replace(/^\./, '')).includes(syntax.ext.toLowerCase())));
    if (cat != null) list = list.filter((c) => c.category_id === cat);
    if (state) list = list.filter((c) => c.match_state === state);
    if (fav) list = list.filter((c) => c.favorite);
    return list;
  }, [cards, syntax, cat, state, fav]);

  function toggleSel(id: number) {
    setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function batchKeywords(add: boolean) {
    const parts = bKw.split(/[,\s、，]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) { setMsgB('请输入关键词'); return; }
    const ids = Array.from(sel);
    if (ids.length === 0) { setMsgB('请先勾选素材'); return; }
    const r = await window.vrc.keywordBatch(ids, add ? parts : [], add ? [] : parts);
    setMsgB(add ? ('已为 ' + ids.length + ' 张卡追加关键词') : ('已从 ' + ids.length + ' 张卡移除关键词'));
    setSel(new Set()); setBKw('');
    setCards(await window.vrc.galleryCards());
  }
  async function batchCategory() {
    if (bCat == null) { setMsgB('请选择分类'); return; }
    const ids = Array.from(sel);
    if (ids.length === 0) { setMsgB('请先勾选素材'); return; }
    for (const id of ids) { await window.vrc.categoryAssign(id, bCat, 'manual'); }
    setMsgB('已为 ' + ids.length + ' 张卡归入分类');
    setSel(new Set()); setBCat(null);
    setCards(await window.vrc.galleryCards());
    window.vrc?.categoryTree?.().then(setCats).catch(() => {});
  }
  function selectAllVisible() {
    setSel(new Set(filtered.map((c) => c.id)));
  }

  const groupedCards = useMemo(() => {
    const m = new Map<string, { key: string; boothId: string; boothName: string; items: any[] }>();
    for (const c of filtered) {
      const key = c.booth_id || 'none';
      if (!m.has(key)) m.set(key, { key, boothId: c.booth_id || '', boothName: c.booth_name || '', items: [] });
      m.get(key)!.items.push(c);
    }
    return Array.from(m.values()).sort((a, b) => {
      if (!a.boothId && b.boothId) return 1;
      if (a.boothId && !b.boothId) return -1;
      return (a.boothId || '').localeCompare(b.boothId || '');
    });
  }, [filtered]);

  const totals = useMemo(() => ({
    cards: cards.length,
    matched: cards.filter((c) => c.match_state !== 'pending').length,
    pending: cards.filter((c) => c.match_state === 'pending').length,
    filed: cards.filter((c) => c.category_id != null).length,
    size: cards.reduce((s, c) => s + (c.size || 0), 0),
  }), [cards]);

  const scannedAt = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  const consoleStats = {
    total: totals.cards,
    matched: totals.matched,
    pending: totals.pending,
    filed: totals.filed,
    size: totals.size,
    scannedAt,
    collections: 0,
    boothItems: cards.filter((c) => c.booth_id).length,
    netActive: 0,
  };
  return (
    <div className="stack">
      <div className="ef-sheet-head">
        <h1>图库</h1>
        <div className="ef-facts">
          <span className="ef-field">{fmtInt(totals.cards)} 卡</span>
          <span className="ef-field">{fmtBytes(totals.size)}</span>
          <span className="ef-field">已匹配 {fmtInt(totals.matched)}</span>
          <span className="ef-field">待匹配 {fmtInt(totals.pending)}</span>
        </div>
      </div>
      {!loading && cards.length > 0 && (
        <section className="console-hero" aria-label="总览">
          <div className="console-side">
            <StatPanel title="素材总量" lead="right" value={fmtInt(totals.cards)} unit="卡" />
            <StatPanel title="占用空间" lead="right" value={fmtBytes(totals.size)} unit="" />
            <StatPanel title="待匹配" lead="right" value={fmtInt(totals.pending)} unit="卡" alert={totals.pending > 0} />
          </div>
          <div className="console-dial"><Dial s={consoleStats} /></div>
          <div className="console-side">
            <StatPanel title="已分类" lead="left" value={fmtInt(totals.filed)} unit="卡" />
            <StatPanel title="匹配率" lead="left" value={totals.cards ? Math.round((totals.matched / totals.cards) * 100) + '' : '0'} unit="%" />
            <StatPanel title="分类率" lead="left" value={totals.cards ? Math.round((totals.filed / totals.cards) * 100) + '' : '0'} unit="%" />
          </div>
        </section>
      )}
      <div className="ef-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称 / 编号　#编号 cat:分类 state:状态 kw:词 ext:扩展" aria-label="搜索" />
      </div>
      <div className="chips">
        <button className={'ef-chip' + (state === '' ? ' is-on' : '')} aria-pressed={state === ''} onClick={() => setState('')}>全部</button>
        {Object.entries(MATCH_STATE).map(([k, v]) => (
          <button key={k} className={'ef-chip' + (state === k ? ' is-on' : '')} aria-pressed={state === k} onClick={() => setState(k)}>{v}</button>
        ))}
      </div>
      <div className="chips">
        <button className={'ef-chip' + (cat === null ? ' is-on' : '')} aria-pressed={cat === null} onClick={() => setCat(null)}>全部分类</button>
        {cats.filter((c) => !c.parentId).map((c) => (
          <button key={c.id} className={'ef-chip' + (cat === c.id ? ' is-on' : '')} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}<span className="n">{c.cardCount}</span></button>
        ))}
        <button className={'ef-chip' + (fav ? ' is-on' : '')} aria-pressed={fav} onClick={() => setFav(!fav)}>★ 收藏<span className="n">{cards.filter((c) => c.favorite).length}</span></button>
        <button className={'ef-chip' + (groupBy ? ' is-on' : '')} aria-pressed={groupBy} onClick={() => setGroupBy(!groupBy)}>▦ 按商品分组</button>
      </div>
      <div className="chips" style={{ marginTop: '0.5rem' }}>
        <button className={'ef-chip' + (batchMode ? ' is-on' : '')} aria-pressed={batchMode} onClick={() => { setBatchMode(!batchMode); setSel(new Set()); }}>批量标注</button>
        {batchMode && (
          <>
            <button className="ef-chip" onClick={selectAllVisible}>全选当前 {fmtInt(filtered.length)}</button>
            <span className="ef-field" style={{ alignSelf: 'center' }}>已选 {fmtInt(sel.size)}</span>
          </>
        )}
      </div>
      {batchMode && (
        <div className="ef-rows flat" style={{ marginTop: '0.5rem' }}>
          <li>
            <span className="meta">关键词</span>
            <span className="acts">
              <input value={bKw} onChange={(e) => setBKw(e.target.value)} placeholder="巧克力, 衣装、夏 混合串自动切分" style={{ flex: 1, minWidth: 0 }} />
              <button className="ef-btn small go" onClick={() => batchKeywords(true)}>+ 追加</button>
              <button className="ef-btn small danger" onClick={() => batchKeywords(false)}>- 移除</button>
            </span>
          </li>
          <li>
            <span className="meta">分类</span>
            <span className="acts">
              <select value={bCat ?? ''} onChange={(e) => setBCat(e.target.value ? Number(e.target.value) : null)} style={{ minWidth: 0 }}>
                <option value="">选择分类…</option>
                {cats.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="ef-btn small go" onClick={batchCategory}>归入分类</button>
            </span>
          </li>
        </div>
      )}
      {msgB && <div className="ef-notice" data-flag="!">{msgB}</div>}
      {loading ? <div className="ef-empty">正在读取素材…</div> : (
        groupBy ? (
          <div className="gwall">
            {groupedCards.map((g) => (
              <section key={g.key} className="gblock">
                <div className="ghead"><span className="ef-field">#{g.boothId || '未匹配'}</span><span className="gt">{g.boothName || (g.boothId ? 'BOOTH 商品' : '未匹配商品')}</span><span className="ef-field">{g.items.length} 项</span></div>
                <div className="wall">
                  {g.items.map((c) => <GalleryCard key={c.id} c={c} selected={sel.has(c.id)} onToggle={toggleSel} batchMode={batchMode} />)}
                </div>
              </section>
            ))}
            {groupedCards.length === 0 && <div className="ef-empty">没有符合条件的素材，试试放宽筛选。</div>}
          </div>
        ) : (
          <div className="wall">
            {filtered.map((c) => <GalleryCard key={c.id} c={c} selected={sel.has(c.id)} onToggle={toggleSel} batchMode={batchMode} />)}
            {filtered.length === 0 && <div className="ef-empty">没有符合条件的素材，试试放宽筛选。</div>}
          </div>
        )
      )}
    </div>
  );
}

function GalleryCard({ c, selected, onToggle, batchMode }: { c: any; selected?: boolean; onToggle?: (id: number) => void; batchMode?: boolean }) {
  const cover = c.cover_path || '';
  const catName = c.category_reason ? String(c.category_reason).replace(/^(booth|keyword):/, '') : '';
  if (batchMode) {
    return (
      <button className={'card' + (selected ? ' is-picked' : '')} onClick={() => onToggle?.(c.id)} aria-pressed={!!selected}>
        <div className={'thumb' + (cover ? '' : ' is-empty')}>
          {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="noimg">{c.booth_id || '无封面'}</span>}
        </div>
        <div className="nm">{c.name}</div>
        <div className="meta">
          <span className="ef-field">{fmtBytes(c.size)}</span>
          <span className="ef-state is-draft">{MATCH_STATE[c.match_state] || c.match_state}</span>
        </div>
      </button>
    );
  }
  return (
    <a className="card" href={'#/card/' + c.id} onClick={(e) => { e.preventDefault(); nav('card', String(c.id)); }}>
      <div className={'thumb' + (cover ? '' : ' is-empty')}>
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="noimg">{c.booth_id || '无封面'}</span>}
      </div>
      <div className="nm">{c.name}</div>
      <div className="meta">
        <span className="ef-field">{fmtBytes(c.size)}</span>
        <span className="ef-state is-draft">{MATCH_STATE[c.match_state] || c.match_state}</span>
        {catName && <span className="ef-state">{catName}</span>}
      </div>
    </a>
  );
}

function StatPanel({ title, value, unit, lead, alert }: { title: string; value: string; unit: string; lead?: string; alert?: boolean }) {
  return (
    <div className={'ef-panel cut-' + (lead === 'left' ? 'bl' : 'br')}>
      <h2>{title}</h2>
      <div className={'ef-figs' + (alert ? ' is-alert' : '')}>
        <b>{value}</b><i>{unit}</i>
      </div>
    </div>
  );
}

// ---------- 卡片详情 ----------
const COMPAT_KIND_LABEL: Record<string, string> = { platform: '平台', shader: '着色器', version: '版本', feature: '特性' };

function CompatPanel({ compat }: { compat: any[] | null }) {
  if (!compat || compat.length === 0) {
    return <div className="ef-empty">尚未检测到任何本地或商品适配证据。扫描/匹配后可在此查看 PC / Quest / LilToon / Poiyomi / Unity 版本等维度的对照。</div>;
  }
  const local = compat.filter((c) => c.dimension === 'local');
  const item = compat.filter((c) => c.dimension === 'item');
  const rows = (list: any[]) => list.length ? (
    <div className="mrow" style={{ marginTop: '0.5rem' }}>
      {list.map((c, i) => (
        <div key={i} className="mcard" style={{ minWidth: 0 }}>
          <div className="nm">
            <span className={'ef-state' + (c.found ? ' is-alert' : '')}>{c.label}</span>
          </div>
          <div className="meta">
            <span className="ef-field">{COMPAT_KIND_LABEL[c.kind] || c.kind}</span>
            {c.found
              ? <span className="ef-field" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.evidence || ''}>{c.evidence || ''}</span>
              : <span className="ef-field" title="仅表示未检索到对应本地版本的证据，未做缺失验证">未发现证据</span>}
          </div>
        </div>
      ))}
    </div>
  ) : <div className="ef-empty" style={{ marginTop: '0.5rem' }}>未发现证据。</div>;
  return (
    <div className="pair2" style={{ marginTop: '0.75rem' }}>
      <div>
        <h3>本地（文件名 / 路径 / 扩展名）</h3>
        {rows(local)}
      </div>
      <div>
        <h3>商品（BOOTH 名称 / 介绍 / 标签）</h3>
        {rows(item)}
      </div>
    </div>
  );
}

function CardDetail({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [kw, setKw] = useState('');
  const [note, setNote] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [matchState, setMatchState] = useState('');
  const [msg, setMsg] = useState('');
  const [adapts, setAdapts] = useState<any[]>([]);
  const [desc, setDesc] = useState('');
  const [adaptName, setAdaptName] = useState('');
  const [adaptNote, setAdaptNote] = useState('');
  const [related, setRelated] = useState<any[]>([]);
  const [relName, setRelName] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    window.vrc?.cardDetail?.(Number(id)).then((r: any) => { setD(r); setNote(r?.note || ''); setNameDraft(r?.name || ''); setMatchState(r?.match_state || ''); setDesc(r?.description || ''); window.vrc?.cardTouchOpened?.(r.id); }).catch(() => {});
    window.vrc?.adaptList?.(Number(id)).then(setAdapts).catch(() => {});
    window.vrc?.relatedList?.(Number(id)).then(setRelated).catch(() => {});
  }, [id]);

  if (!d) return <div className="ef-empty">正在读取卡片…</div>;

  async function addKeyword() {
    if (!kw.trim()) return;
    await window.vrc.keywordAdd(d.id, kw.trim());
    setKw('');
    setD(await window.vrc.cardDetail(d.id));
  }
  async function toggleFav() {
    await window.vrc.cardFavorite(d.id, !d.favorite);
    setD(await window.vrc.cardDetail(d.id));
  }
  async function saveNote() {
    await window.vrc.cardNote(d.id, note);
  }
  async function saveName() {
    const r = await window.vrc.cardEditName(d.id, nameDraft);
    if (r?.ok === false) { setMsg(r.error); return; }
    setMsg('已保存名称'); setD(await window.vrc.cardDetail(d.id));
  }
  async function saveMatchState() {
    await window.vrc.cardEditState(d.id, matchState);
    setMsg('已更新匹配状态'); setD(await window.vrc.cardDetail(d.id));
  }
  async function addAdapt() {
    if (!adaptName.trim()) return;
    const r = await window.vrc.adaptAdd(d.id, adaptName.trim(), adaptNote.trim() || undefined);
    if (r?.ok === false) { setMsg(r.error); return; }
    setAdapts(r); setAdaptName(''); setAdaptNote(''); setMsg('已登记角色适配');
  }
  async function removeAdapt(aid: number) {
    setAdapts(await window.vrc.adaptRemove(d.id, aid));
  }
  async function extractWholeCard() {
    setMsg('正在解压…');
    const r = await window.vrc.archiveExtractCard(d.id);
    if (r?.ok === false) { setMsg(r.error); return; }
    const n = (r.results || []).filter((x: any) => x.ok).length;
    setMsg(n > 0 ? '已解压 ' + n + ' 个压缩包' : '解压失败');
  }
  async function extractMember(p: string) {
    setMsg('正在解压 ' + p + ' …');
    const r = await window.vrc.archiveExtract(p);
    if (r?.ok === false) { setMsg(r.error); return; }
    setMsg('已解压到 ' + r.destDir + '（' + r.extracted + ' 个文件）');
  }
  async function openUnity(memberPath: string) {
    const r = await window.vrc.openUnitypackage(d.id);
    if (r?.ok === false) { setMsg(r.error); return; }
    setMsg('已交给 Unity 打开：' + memberPath);
  }

  async function addRelated() {
    const rid = parseInt(relName.trim(), 10);
    if (!Number.isFinite(rid)) { setMsg('请输入素材编号'); return; }
    const r = await window.vrc.cardRelated(d.id, rid);
    setRelated(r); setRelName(''); setMsg('已登记工程素材关联');
  }
  async function removeRelated(rid: number) {
    setRelated(await window.vrc.relatedRemove(d.id, rid));
  }

  const TABS = [
    ['overview', '概览'],
    ['files', '文件'],
    ['adapt', '角色适配'],
    ['compat', '兼容'],
    ['related', '关联'],
    ['candidates', '候选'],
  ];

  return (
    <div className="stack">
      <div className="ef-sheet-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%', flex: '1 1 100%' }}>
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} style={{ fontSize: 'var(--ef-t-h1)', fontWeight: 700, flex: '1 1 16rem', minWidth: 0, background: 'transparent', border: 'none', borderBottom: '1px solid var(--ef-rule)', color: 'var(--ef-ink)', padding: '0 0 0.1rem' }} aria-label="素材名称" />
          <button className="ef-btn small" onClick={saveName}>保存名称</button>
        </div>
        <div className="ef-facts">
          {d.booth_id && <span className="ef-field">BOOTH {d.booth_id}</span>}
          <span className="ef-field">{fmtBytes(d.size)}</span>
          <button className={'ef-btn small' + (d.favorite ? ' go' : '')} onClick={toggleFav}>{d.favorite ? '★ 已收藏' : '☆ 收藏'}</button>
          <button className="ef-btn small" onClick={extractWholeCard}>解压整卡</button>
        </div>
      </div>
      <div className="tri"></div>
      <div className="kvlist">
        <div><span>类型</span><b>{d.kind === 'fold' ? '折叠包' : d.kind === 'file' ? '单文件' : '目录'}</b></div>
        <div><span>体积</span><b>{fmtBytes(d.size)}</b></div>
        <div><span>文件 / 目录</span><b>{fmtInt(d.files)} / {fmtInt(d.dirs)}</b></div>
        <div><span>匹配</span>
          <b>
            <select value={matchState} onChange={(e) => { setMatchState(e.target.value); saveMatchState(); }} aria-label="匹配状态">
              {Object.entries(MATCH_STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </b>
        </div>
        <div><span>分类</span><b>{d.category_reason || '未分类'}</b></div>
      </div>
      {msg && <div className="ef-notice" data-flag="!">{msg}</div>}

      <div className="tabbar" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          {d.booth && (
            <div className="stack" style={{ border: '1px solid var(--ef-rule)', padding: '0.9rem 1rem' }}>
              <div className="ef-group-head"><h2>BOOTH 商品</h2></div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {d.booth.image_url && <img src={d.booth.image_url} alt="" style={{ width: '10rem', height: '10rem', objectFit: 'cover', flex: '0 0 auto' }} />}
                <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--ef-t-title)' }}>{d.booth.name}</div>
                  <div className="ef-facts" style={{ marginTop: '0.4rem' }}>
                    <span className="ef-field">{d.booth.shop_name || ''}</span>
                    {d.booth.price ? <span className="ef-field">{d.booth.price} JPY</span> : null}
                    {d.booth.category_name ? <span className="ef-field">{d.booth.category_name}</span> : null}
                    {d.booth.is_adult ? <span className="ef-state is-alert">成人</span> : null}
                  </div>
                  {desc ? (
                    <p className="ef-prose" style={{ marginTop: '0.6rem', maxHeight: '9rem', overflow: 'auto' }}>{desc}</p>
                  ) : (
                    <div className="ef-empty" style={{ marginTop: '0.6rem' }}>暂无商品介绍。</div>
                  )}
                  <div className="ef-rows flat" style={{ marginTop: '0.6rem' }}>
                    <li><span className="meta">操作</span><span className="acts">
                      <button className="ef-btn small" onClick={() => window.vrc.openExternal(d.booth.url)}>在 BOOTH 打开</button>
                      <button className="ef-btn small" onClick={() => { window.vrc.boothGiftUrl(d.booth_id).then((u: string) => u && window.vrc.openExternal(u)); }}>Gift</button>
                    </span></li>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="chips" style={{ marginTop: '1rem' }}>
            {(d.keywords || []).map((k: string) => (
              <button key={k} className="ef-chip is-on" onClick={() => window.vrc.keywordRemove(d.id, k).then(() => window.vrc.cardDetail(d.id).then(setD))}>{k} ×</button>
            ))}
          </div>
          <div className="ef-search" style={{ marginTop: '0.75rem' }}>
            <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }} placeholder="添加关键词，回车确认" />
          </div>
          <div className="ef-setting" style={{ marginTop: '0.75rem' }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} placeholder="备注…" rows={3} />
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <div className="filelist">
            <div className="ef-group-head"><h2>扩展名分布</h2></div>
            {(d.extsTop || []).slice(0, 12).map(([ext, n]: [string, number]) => (
              <div key={ext} className="row"><span className="p">{ext}</span><span className="s">{fmtInt(n)}</span></div>
            ))}
          </div>
          {d.members && d.members.length > 0 && (
            <div className="filelist" style={{ marginTop: '1rem' }}>
              <div className="ef-group-head"><h2>成员（{d.members.length}）</h2></div>
              {d.members.slice(0, 60).map((m: any, i: number) => (
                <div key={i} className="row">
                  <span className="p">{m.rel_path}</span>
                  <span className="s">
                    {m.member_type === 'archive' && (
                      <>
                        <button className="ef-btn small" onClick={() => extractMember(m.path)}>解压</button>
                        {String(m.path || '').toLowerCase().endsWith('.unitypackage') && (
                          <button className="ef-btn small go" onClick={() => openUnity(m.path)}>导入 Unity</button>
                        )}
                      </>
                    )}
                    <span className="ef-field" style={{ marginLeft: '0.5rem' }}>{fmtBytes(m.size)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'adapt' && (
        <div className="stack" style={{ marginTop: '0.75rem', border: '1px solid var(--ef-rule)', padding: '0.9rem 1rem' }}>
          <div className="ef-group-head"><h2>角色适配（{adapts.length}）</h2></div>
          <div className="ef-rows flat">
            <li>
              <span className="meta">角色名</span>
              <span className="acts">
                <input value={adaptName} onChange={(e) => setAdaptName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAdapt(); }} placeholder="例如：桔梗 / Kikyo" style={{ flex: 1, minWidth: 0 }} />
                <input value={adaptNote} onChange={(e) => setAdaptNote(e.target.value)} placeholder="备注（可选）" style={{ width: '10rem', minWidth: 0 }} />
                <button className="ef-btn small go" onClick={addAdapt}>登记适配</button>
              </span>
            </li>
          </div>
          {adapts.length > 0 && (
            <div className="mrow" style={{ marginTop: '0.5rem' }}>
              {adapts.map((a) => (
                <div key={a.id} className="mcard">
                  <div className="nm">{a.avatar_name}</div>
                  <div className="meta">
                    <span className="ef-state">{a.source === 'manual' ? '手动' : a.source}</span>
                    {a.note && <span className="ef-field">{a.note}</span>}
                    <button className="ef-btn small danger" onClick={() => removeAdapt(a.id)}>移除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {adapts.length === 0 && <div className="ef-empty">这件衣装/材质尚未登记任何角色适配。一个材质可对应多个角色，逐个登记即可。</div>}
        </div>
      )}

      {tab === 'compat' && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <div className="ef-group-head"><h2>本地适配 vs 商品支持</h2></div>
          <div className="ef-notice" data-flag="i" style={{ marginTop: '0.5rem' }}>两个维度独立检测。灰色仅表示「未发现对应证据」，未做缺失验证，不表示不支持。</div>
          <CompatPanel compat={d.compat || null} />
        </div>
      )}

      {tab === 'related' && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <div className="ef-group-head"><h2>工程素材线索（{related.length}）</h2></div>
          <div className="ef-notice" data-flag="i" style={{ marginTop: '0.5rem' }}>把本素材与工程中其它素材做人工关联，例如同一套衣装的不同角色适配包、本体与贴图材质包。</div>
          <div className="ef-rows flat" style={{ marginTop: '0.5rem' }}>
            <li>
              <span className="meta">素材编号</span>
              <span className="acts">
                <input value={relName} onChange={(e) => setRelName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addRelated(); }} placeholder="输入目标素材编号，回车关联" style={{ flex: 1, minWidth: 0 }} />
                <button className="ef-btn small go" onClick={addRelated}>登记关联</button>
              </span>
            </li>
          </div>
          {related.length > 0 && (
            <div className="mrow" style={{ marginTop: '0.5rem' }}>
              {related.map((r) => (
                <div key={r.id} className="mcard" style={{ minWidth: 0 }}>
                  <div className="nm">{r.name}</div>
                  <div className="meta">
                    <span className="ef-field">#{r.id}</span>
                    <span className="ef-state is-draft">{MATCH_STATE[r.match_state] || r.match_state || '关联'}</span>
                    <button className="ef-btn small danger" onClick={() => removeRelated(r.id)}>移除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {related.length === 0 && <div className="ef-empty">尚未关联任何工程素材。输入编号即可把相关素材串成线索链。</div>}
        </div>
      )}

      {tab === 'candidates' && (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <div className="ef-group-head"><h2>候选匹配（{(d.candidates || []).length}）</h2></div>
          <div className="ef-rows">
            {(d.candidates || []).slice(0, 20).map((c: any) => (
              <li key={c.id}>
                <span className="meta">{c.name}</span>
                <span className="acts">
                  <span className="ef-field">{Math.round((c.score || 0) * 100)}%</span>
                  <button className="ef-btn small go" onClick={() => window.vrc.matchApply(d.id, c.booth_id, 'manual').then(() => window.vrc.cardDetail(d.id).then(setD))}>选定</button>
                </span>
              </li>
            ))}
            {(d.candidates || []).length === 0 && <li><span className="meta">暂无候选，去匹配页计算。</span></li>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 集合 ----------
function Collections() {
  const [cols, setCols] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [smart, setSmart] = useState(false);
  // 查询构造器状态
  const [qbQ, setQbQ] = useState('');
  const [qbCat, setQbCat] = useState<number | null>(null);
  const [qbState, setQbState] = useState<string>('');
  const [qbRoot, setQbRoot] = useState<string>('');
  const [qbKw, setQbKw] = useState('');
  const [qbFav, setQbFav] = useState<boolean | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ total: number } | null>(null);

  const qbJson = useMemo(() => {
    const o: any = { q: qbQ || '', category: qbCat ?? null, matchState: qbState || null, rootKey: qbRoot || null, keyword: qbKw || null, favorite: qbFav ?? null };
    return JSON.stringify(o);
  }, [qbQ, qbCat, qbState, qbRoot, qbKw, qbFav]);

  function reloadCols() { return window.vrc.collectionList().then((c: any[]) => { setCols(c); setSel((s: any) => (s ? c.find((x) => x.id === s.id) || c[0] || null : c[0] || null)); return c; }); }
  useEffect(() => {
    reloadCols();
    window.vrc.galleryCards().then(setAll).catch(() => {});
    window.vrc.categoryTree().then((t: any[]) => { const out: any[] = []; const walk = (n: any[]) => n.forEach((c) => { out.push(c); walk(c.children || []); }); walk(t); setCats(out); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sel?.id) window.vrc.collectionAssets(sel.id).then(setAssets).catch(() => {});
    else setAssets([]);
  }, [sel?.id]);

  // 查询构造器实时预览（智能集合模式下，条件变化即计算命中数）
  useEffect(() => {
    if (!smart) { setPreview(null); return; }
    const q = JSON.parse(qbJson);
    const t = setTimeout(() => { window.vrc.galleryQuery({ ...q, sort: 'updated', dir: 'desc', offset: 0, limit: 1 }).then(setPreview).catch(() => setPreview(null)); }, 300);
    return () => clearTimeout(t);
  }, [smart, qbJson]);

  async function create() {
    if (!newName.trim()) return;
    const queryJson = smart ? qbJson.trim() : '';
    if (smart) {
      try { JSON.parse(queryJson); } catch { alert('智能集合条件无效'); return; }
    }
    await window.vrc.collectionCreate(newName.trim(), smart ? queryJson : '');
    setNewName(''); setSmart(false); setQbQ(''); setQbCat(null); setQbState(''); setQbRoot(''); setQbKw(''); setQbFav(null);
    await reloadCols();
  }
  async function addPicks() {
    if (!sel || picks.size === 0) return;
    await window.vrc.collectionAdd(sel.id, Array.from(picks));
    setPicks(new Set());
    setAssets(await window.vrc.collectionAssets(sel.id));
  }
  async function removeAsset(aid: number) {
    await window.vrc.collectionRemove(sel.id, aid);
    setAssets(await window.vrc.collectionAssets(sel.id));
  }
  async function delCol() {
    if (!sel) return;
    await window.vrc.collectionDelete(sel.id);
    setSel(null);
    await reloadCols();
  }
  function toggle(id: number) {
    setPicks((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="ef-sheet-head">
          <h1>集合</h1>
          <div className="ef-facts"><span className="ef-field">{fmtInt(cols.length)} 个集合</span></div>
        </div>
        <div className="ef-search" style={{ marginBottom: '0.75rem' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="新建集合名称，回车创建" />
        </div>
        <div className="chips">
          <button className={'ef-chip' + (!smart ? ' is-on' : '')} aria-pressed={!smart} onClick={() => setSmart(false)}>手动集合</button>
          <button className={'ef-chip' + (smart ? ' is-on' : '')} aria-pressed={smart} onClick={() => setSmart(true)}>智能集合</button>
        </div>
        {smart && (
          <div className="stack" style={{ marginBottom: '0.75rem', border: '1px solid var(--ef-rule)', padding: '0.9rem 1rem' }}>
            <div className="ef-group-head"><h2>智能集合条件</h2><div className="ef-facts"><span className="ef-field">{preview ? '命中 ' + fmtInt(preview.total) + ' 项' : '计算中…'}</span></div></div>
            <div className="qb-grid">
              <label className="qb-field">搜索词<input value={qbQ} onChange={(e) => setQbQ(e.target.value)} placeholder="名称包含…" /></label>
              <label className="qb-field">关键词<input value={qbKw} onChange={(e) => setQbKw(e.target.value)} placeholder="素材关键词" /></label>
              <label className="qb-field">分类
                <select value={qbCat ?? ''} onChange={(e) => setQbCat(e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">全部</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="qb-field">匹配状态
                <select value={qbState} onChange={(e) => setQbState(e.target.value)}>
                  <option value="">全部</option>
                  {Object.entries(MATCH_STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="qb-field">来源根
                <select value={qbRoot} onChange={(e) => setQbRoot(e.target.value)}>
                  <option value="">全部</option>
                  <option value="model">模型素材</option>
                  <option value="map">地图素材</option>
                </select>
              </label>
              <label className="qb-field">收藏
                <select value={qbFav === null ? '' : qbFav ? '1' : '0'} onChange={(e) => setQbFav(e.target.value === '' ? null : e.target.value === '1')}>
                  <option value="">不限</option>
                  <option value="1">仅收藏</option>
                  <option value="0">未收藏</option>
                </select>
              </label>
            </div>
            <div className="ef-notice" data-flag="i">智能集合按上述条件动态计算成员，保存后不手动勾选；点「手动集合」可退回手动模式。</div>
          </div>
        )}
        <div className="mrow">
          {cols.map((c) => (
            <button key={c.id} className={'ef-chip' + (sel?.id === c.id ? ' is-on' : '')} onClick={() => setSel(c)}>{c.name}{c.query_json ? ' ◆' : ''}</button>
          ))}
          {cols.length === 0 && <div className="ef-empty">还没有集合。输入名称回车创建第一个集合，然后从下方勾选素材加入；或勾选「智能集合」按条件动态生成。</div>}
        </div>
        {sel && (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="ef-group-head"><h2>{sel.name}{sel.query_json ? '（智能）' : ''} · {assets.length} 项</h2><button className="ef-btn small danger" onClick={delCol}>删除集合</button></div>
            <div className="mrow">
              {assets.map((a) => (
                <div key={a.id} className="mcard">
                  <div className="thumb">{a.cover_path ? <img src={a.cover_path} alt="" /> : <span className="noimg">{a.booth_id}</span>}</div>
                  <div className="nm">{a.name}</div>
                  <div className="meta"><a href={'#/card/' + a.id} onClick={(e) => { e.preventDefault(); nav('card', String(a.id)); }}>打开</a>{!sel.query_json && <button className="ef-btn small" onClick={() => removeAsset(a.id)}>移除</button>}</div>
                </div>
              ))}
              {assets.length === 0 && <div className="ef-empty">该集合还是空的。</div>}
            </div>
          </div>
        )}
      </div>
      <div className="stack">
        <div className="ef-sheet-head"><h2>加入集合</h2><div className="ef-facts"><span className="ef-field">{fmtInt(picks.size)} 已勾选</span></div></div>
        <button className="ef-btn go" disabled={!sel || sel.query_json || picks.size === 0} onClick={addPicks}>加入「{sel?.name || '…'}」</button>
        <div className="mrow" style={{ marginTop: '1rem' }}>
          {all.map((a) => (
            <div key={a.id} className={'mcard' + (picks.has(a.id) ? ' is-picked' : '')} onClick={() => toggle(a.id)}>
              <div className="thumb">{a.cover_path ? <img src={a.cover_path} alt="" /> : <span className="noimg">{a.booth_id}</span>}</div>
              <div className="nm">{a.name}</div>
              <div className="meta"><span className="ef-state is-draft">{MATCH_STATE[a.match_state] || a.match_state}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 匹配 ----------
function Match() {
  const [all, setAll] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [cands, setCands] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [manualRef, setManualRef] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'todo' | 'history'>('todo');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchRef, setBatchRef] = useState('');

  const queue = useMemo(() => all.filter((c: any) => c.match_state === 'pending' || c.match_state === 'suggested'), [all]);
  const history = useMemo(() => all.filter((c: any) => c.match_state === 'skipped' || c.match_state === 'rejected'), [all]);
  const skippedN = all.filter((c: any) => c.match_state === 'skipped').length;
  const rejectedN = all.filter((c: any) => c.match_state === 'rejected').length;

  function reload() {
    return window.vrc.galleryCards().then((r: any[]) => setAll(r));
  }
  useEffect(() => { reload().catch(() => {}); }, []);

  function toggleSel(id: number) {
    setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAllVisible() {
    setSel((prev) => { const n = new Set(prev); queue.forEach((c) => n.add(c.id)); return n; });
  }
  function clearSel() { setSel(new Set()); }

  async function compute(c: any) {
    setBusy(true); setCurrent(c); setMsg('');
    try { setCands(await window.vrc.matchCompute(c.id)); } catch (e: any) { setMsg('搜索失败：' + e.message); setCands([]); }
    setBusy(false);
  }

  async function manualApply() {
    if (!current) return;
    const ref = manualRef.trim();
    if (!ref) { setMsg('请先填写 BOOTH 编号或链接'); return; }
    setBusy(true); setMsg('');
    try {
      const id = await window.vrc.parseBoothRef(ref);
      if (!id) { setMsg('无法识别该链接/编号'); setBusy(false); return; }
      const info = await window.vrc.boothFetch(String(id));
      await window.vrc.matchApply(current.id, info.id, 'manual');
      setManualRef(''); setMsg('已关联 ' + info.name + '（' + info.id + '）');
      await compute(current); await reload();
    } catch (e: any) { setMsg('关联失败：' + e.message); }
    setBusy(false);
  }

  async function batchApply() {
    const ref = batchRef.trim();
    if (!ref) { setMsg('请先填写 BOOTH 编号或链接'); return; }
    if (sel.size === 0) { setMsg('请先勾选要关联的素材'); return; }
    setBusy(true); setMsg('');
    try {
      const id = await window.vrc.parseBoothRef(ref);
      if (!id) { setMsg('无法识别该链接/编号'); setBusy(false); return; }
      const info = await window.vrc.boothFetch(String(id));
      const r = await window.vrc.matchApplyBatch(Array.from(sel), info.id, 'manual');
      setBatchRef(''); clearSel(); setMsg('已把 ' + (r?.updated ?? sel.size) + ' 个素材关联到 ' + info.name + '（' + info.id + '）');
      await reload();
    } catch (e: any) { setMsg('批量关联失败：' + e.message); }
    setBusy(false);
  }

  function undo() {
    if (!current) return;
    window.vrc.matchUndo(current.id).then(() => { setCands([]); setMsg('已撤回，恢复待匹配'); reload(); });
  }

  function restore(id: number) {
    window.vrc.matchUndo(id).then(() => { setMsg('已恢复，重新进入待匹配'); reload(); });
  }

  return (
    <div className="cols wide-left">
      <div className="stack">
        <div className="ef-sheet-head"><h1>匹配待办</h1><div className="ef-facts"><span className="ef-field">{fmtInt(queue.length)} 待处理</span><span className="ef-field">已跳过 {fmtInt(skippedN)}</span><span className="ef-field">已排除 {fmtInt(rejectedN)}</span></div></div>
        <div className="chips" style={{ marginBottom: '0.5rem' }}>
          <button className={'ef-chip' + (tab === 'todo' ? ' is-on' : '')} aria-pressed={tab === 'todo'} onClick={() => setTab('todo')}>待处理<span className="n">{queue.length}</span></button>
          <button className={'ef-chip' + (tab === 'history' ? ' is-on' : '')} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>跳过 / 排除<span className="n">{history.length}</span></button>
          <button className={'ef-chip' + (batchMode ? ' is-on' : '')} aria-pressed={batchMode} onClick={() => { setBatchMode(!batchMode); if (!batchMode) setSel(new Set()); }}>多选<span className="n">{sel.size}</span></button>
        </div>
        {batchMode && tab === 'todo' && (
          <div className="ef-notice" data-flag="!">多选模式：勾选多个素材后，在右侧统一输入一个 BOOTH 编号批量关联。</div>
        )}
        {tab === 'todo' && (
          <div className="mrow">
            {queue.map((c) => (
              <div key={c.id} className={'mcard' + (current?.id === c.id ? ' is-on' : '') + (sel.has(c.id) ? ' is-picked' : '')}>
                {batchMode ? (
                  <button className="pickbox" aria-pressed={sel.has(c.id)} onClick={() => toggleSel(c.id)}>{sel.has(c.id) ? '✓' : ''}</button>
                ) : null}
                <div className="thumb" onClick={() => batchMode ? toggleSel(c.id) : compute(c)}>{c.cover_path ? <img src={c.cover_path} alt="" /> : <span className="noimg">{c.booth_id}</span>}</div>
                <div className="nm">{c.name}</div>
                <div className="meta"><span className="ef-field">{fmtBytes(c.size)}</span>{c.booth_id ? <span className="ef-field">#{c.booth_id}</span> : null}</div>
              </div>
            ))}
            {queue.length === 0 && <div className="ef-empty">没有待匹配的素材。</div>}
          </div>
        )}
        {tab === 'history' && (
          <div className="mrow">
            {history.map((c) => (
              <div key={c.id} className="mcard">
                <div className="thumb">{c.cover_path ? <img src={c.cover_path} alt="" /> : <span className="noimg">{c.booth_id}</span>}</div>
                <div className="nm">{c.name}</div>
                <div className="meta">
                  <span className={'ef-state' + (c.match_state === 'rejected' ? ' is-draft' : '')}>{MATCH_STATE[c.match_state] || c.match_state}</span>
                </div>
                <div className="acts"><button className="ef-btn small go" onClick={() => restore(c.id)}>恢复</button></div>
              </div>
            ))}
            {history.length === 0 && <div className="ef-empty">还没有跳过或排除的素材。</div>}
          </div>
        )}
      </div>
      <div className="stack">
        <div className="ef-sheet-head"><h2>{batchMode ? '批量关联' : '候选'}</h2><div className="ef-facts"><span className="ef-field">{batchMode ? sel.size + ' 已选' : cands.length + ' 条'}</span></div></div>
        {busy && <div className="ef-empty">正在搜索 BOOTH…</div>}
        {msg && <div className="ef-notice" data-flag="!">{msg}</div>}
        {batchMode && (
          <div className="ef-rows flat" style={{ marginTop: 0 }}>
            <li><span className="meta">BOOTH 编号 / 链接</span><span className="acts"><input className="ef-search" value={batchRef} onChange={(e) => setBatchRef(e.target.value)} placeholder="booth.pm/zh-cn/items/6405390 或 6405390" style={{ flex: 1, minWidth: 0 }} /><button className="ef-btn small go" disabled={busy || sel.size === 0} onClick={batchApply}>批量关联</button></span></li>
            <li><span className="meta">已勾选 {sel.size} 个素材</span><span className="acts"><button className="ef-btn small" onClick={selectAllVisible}>全选当前</button><button className="ef-btn small" onClick={clearSel}>清空</button></span></li>
          </div>
        )}
        {!batchMode && (
          <div className="cands">
            {cands.map((c) => (
              <div key={c.boothItemId} className="cand">
                <div className="thumb">{c.imageUrl ? <img src={c.imageUrl} alt="" /> : <span className="noimg">{c.boothItemId}</span>}</div>
                <div className="tt">{c.name}<span className="st">{c.shopName} · {c.price} JPY</span></div>
                <div className="sc">{Math.round((c.score || 0) * 100)}%</div>
                <div className="acts">
                  <button className="ef-btn small go" onClick={() => window.vrc.matchApply(current.id, c.boothItemId, 'manual').then(() => { compute(current); reload(); })}>选定</button>
                  <button className="ef-btn small danger" onClick={() => window.vrc.matchReject(current.id, c.boothItemId).then(() => compute(current))}>排除</button>
                </div>
              </div>
            ))}
            {cands.length === 0 && !busy && current && <div className="ef-empty">没有候选，可在下方手动填写编号/链接关联。</div>}
          </div>
        )}
        {!batchMode && current && (
          <div className="ef-rows flat" style={{ marginTop: '1rem' }}>
            <li><span className="meta">当前：{current.name}</span><span className="acts"><button className="ef-btn small" onClick={() => window.vrc.matchSkip(current.id).then(() => { setCurrent(null); setCands([]); setMsg(''); reload(); })}>跳过</button><button className="ef-btn small" onClick={undo}>撤回</button></span></li>
            <li><span className="meta">手动编号 / 链接</span><span className="acts"><input className="ef-search" value={manualRef} onChange={(e) => setManualRef(e.target.value)} placeholder="booth.pm/zh-cn/items/6405390 或 6405390" style={{ flex: 1, minWidth: 0 }} /><button className="ef-btn small go" disabled={busy} onClick={manualApply}>关联</button></span></li>
          </div>
        )}
      </div>
    </div>
  );
}
// ---------- 分类 ----------
function Classify() {
  const [tree, setTree] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [newCat, setNewCat] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [msg, setMsg] = useState('');

  function reloadTree() { return window.vrc?.categoryTree?.().then(setTree).catch(() => {}); }
  function reload() { return window.vrc.galleryCards().then(setCards).catch(() => {}); }
  useEffect(() => {
    reloadTree();
    reload();
  }, []);

  const flat = useMemo(() => { const out: any[] = []; const walk = (n: any[]) => n.forEach((c) => { out.push(c); walk(c.children || []); }); walk(tree); return out; }, [tree]);
  const unfiled = useMemo(() => cards.filter((c) => !c.category_id), [cards]);

  async function assign(c: any, cat: number) {
    await window.vrc.categoryAssign(c.id, cat, 'manual');
    setPicks((p) => { const n = { ...p }; delete n[c.id]; return n; });
    await reload();
  }

  async function createCat() {
    const r = await window.vrc.categoryCreate(newCat);
    if (!r?.ok) { setMsg(r?.error || '创建失败'); return; }
    setMsg('已新建分类「' + newCat + '」');
    setNewCat('');
    await reloadTree();
  }

  async function renameCat(c: any) {
    const r = await window.vrc.categoryRename(c.id, editName);
    if (!r?.ok) { setMsg(r?.error || '重命名失败'); return; }
    setMsg('已重命名');
    setEditing(null); setEditName('');
    await reloadTree();
  }

  async function deleteCat(c: any) {
    const r = await window.vrc.categoryDelete(c.id);
    if (!r?.ok) { setMsg(r?.error || '删除失败'); return; }
    setMsg('已删除分类「' + c.name + '」，其下素材回到待分类');
    if (sel?.id === c.id) setSel(null);
    await reloadTree();
    await reload();
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="ef-sheet-head"><h1>分类</h1><div className="ef-facts"><span className="ef-field">{fmtInt(flat.length)} 类</span><span className="ef-field">{fmtInt(cards.length)} 素材</span></div></div>
        <div className="mrow" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
          <input
            className="ef-search" style={{ flex: '1 1 12rem' }} value={newCat} placeholder="新建分类名，回车确认"
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) createCat(); }}
            aria-label="新建分类名"
          />
          <button className="ef-btn small go" disabled={!newCat.trim()} onClick={createCat}>新建分类</button>
        </div>
        <div className="mrow">
          {flat.map((c) => (
            <span key={c.id} className="mrow" style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
              {editing === c.id ? (
                <>
                  <input className="ef-search" style={{ width: '9rem' }} value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameCat(c); }} />
                  <button className="ef-btn small go" onClick={() => renameCat(c)}>保存</button>
                  <button className="ef-btn small" onClick={() => { setEditing(null); setEditName(''); }}>取消</button>
                </>
              ) : (
                <>
                  <button key={c.id} className={'ef-chip' + (sel?.id === c.id ? ' is-on' : '')} onClick={() => setSel(sel?.id === c.id ? null : c)}>
                    {c.name}<span className="n">{c.cardCount}</span>
                  </button>
                  {!c.builtin && (
                    <button className="ef-btn small" title="重命名" onClick={() => { setEditing(c.id); setEditName(c.name); }}>改</button>
                  )}
                  {!c.builtin && (
                    <button className="ef-btn small danger" title="删除" onClick={() => deleteCat(c)}>×</button>
                  )}
                </>
              )}
            </span>
          ))}
        </div>
        {msg && <div className="ef-notice" data-flag="i">{msg}</div>}
        {sel && (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="ef-group-head"><h2>{sel.name} 下的素材</h2></div>
            <div className="mrow">
              {cards.filter((c) => c.category_id === sel.id).map((c) => (
                <div key={c.id} className="mcard">
                  <div className="nm">{c.name}</div>
                  <div className="meta"><span className="ef-state">{MATCH_STATE[c.match_state] || c.match_state}</span><span className="ef-field">{c.reason || ''}</span></div>
                </div>
              ))}
              {cards.filter((c) => c.category_id === sel.id).length === 0 && <div className="ef-empty">该分类下暂无素材。</div>}
            </div>
          </div>
        )}
      </div>
      <div className="stack">
        <div className="ef-sheet-head"><h2>待分类</h2><div className="ef-facts"><span className="ef-field">{fmtInt(unfiled.length)} 待处理</span></div></div>
        <div className="mrow">
          {unfiled.slice(0, 40).map((c) => (
            <div key={c.id} className="mcard">
              <div className="thumb">{c.cover_path ? <img src={c.cover_path} alt="" /> : <span className="noimg">{c.booth_id}</span>}</div>
              <div className="nm">{c.name}</div>
              <div className="acts">
                <select value={picks[c.id] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [c.id]: Number(e.target.value) }))}>
                  <option value="">选择分类</option>
                  {flat.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button className="ef-btn small go" disabled={!picks[c.id]} onClick={() => assign(c, picks[c.id])}>归入</button>
              </div>
            </div>
          ))}
          {unfiled.length === 0 && <div className="ef-empty">全部素材都已分类。</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- 关键词 ----------
function Keywords() {
  const [cards, setCards] = useState<any[]>([]);
  const [kw, setKw] = useState('');

  useEffect(() => { window.vrc?.galleryCards?.().then(setCards).catch(() => {}); }, []);

  const withKw = cards.filter((c) => (c.keywords?.length || c.keyword_count));

  return (
    <div className="stack">
      <div className="ef-sheet-head"><h1>关键词</h1><div className="ef-facts"><span className="ef-field">{fmtInt(withKw.length)} 带关键词</span></div></div>
      <div className="ef-search"><input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="kw: 关键词搜索" /></div>
      <div className="mrow">
        {cards.filter((c) => !kw || (c.name || '').toLowerCase().includes(kw.toLowerCase()) || (c.keywords || []).some((k: string) => k.includes(kw))).slice(0, 40).map((c) => (
          <div key={c.id} className="mcard">
            <div className="nm">{c.name}</div>
            <div className="chips">{(c.keywords || []).map((k: string) => <span key={k} className="ef-chip is-on">{k}</span>)}</div>
            <div className="meta"><a href={'#/card/' + c.id} onClick={(e) => { e.preventDefault(); nav('card', String(c.id)); }}>打开</a></div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ---------- 内置 BOOTH 浏览器 ----------
function Booth() {
  const [frameUrl, setFrameUrl] = useState('https://booth.pm/zh-cn/');
  const [lib, setLib] = useState<any>({ loggedIn: false, items: [] });
  const [libLoaded, setLibLoaded] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // BOOTH 官方对商品/资料库页返回 X-Frame-Options: SAMEORIGIN，iframe 会被拦截，
  // 因此统一改为在独立子窗口（persist:booth 共享登录态）中打开。
  function openUrl(url: string) {
    setFrameUrl(url);
    window.vrc?.boothOpen?.(url);
  }

  function openItem(id: string) {
    openUrl('https://booth.pm/zh-cn/items/' + id);
  }

  function openLibrary() {
    setLibraryOpen(true);
    const u = 'https://accounts.booth.pm/library';
    setFrameUrl(u);
    openUrl(u);
    loadLibrary();
  }

  async function loadLibrary() {
    setLibLoaded(false);
    try {
      const r = await window.vrc.boothLibrary();
      setLib(r);
    } catch (e) {
      setLib({ loggedIn: false, items: [] });
    }
    setLibLoaded(true);
  }

  async function wishlist(id: string) {
    const url = await window.vrc.boothWishlistUrl(id);
    openUrl(url);
  }

  async function gift(id: string) {
    const url = await window.vrc.boothGiftUrl(id);
    openUrl(url);
  }

  return (
    <div className="viewer">
      <div className="vbar">
        <div className="ef-sheet-head"><h1>BOOTH 浏览器</h1></div>
        <div className="ef-rows flat">
          <li>
            <span className="meta">URL</span>
            <span className="acts">
              <input className="url" value={frameUrl} onChange={(e) => setFrameUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') openUrl(frameUrl); }} placeholder="https://booth.pm/zh-cn/items/6405390 或 6405390" />
              <button className="ef-btn small go" onClick={() => openUrl(frameUrl)}>在窗口打开</button>
            </span>
          </li>
          <li>
            <span className="meta">登录 / 资料库</span>
            <span className="acts">
              <button className="ef-btn small" onClick={() => openUrl('https://accounts.booth.pm/')}>官方登录</button>
              <button className="ef-btn small go" onClick={openLibrary}>已购资料库</button>
              {libLoaded && <span className={'ef-state' + (lib.loggedIn ? '' : ' is-draft')}>{lib.loggedIn ? '已登录' : '未登录'}</span>}
            </span>
          </li>
        </div>
        <div className="cands">
          {libraryOpen && (
            <div className="stack">
              <div className="ef-group-head"><h2>已购资料库（{lib.items?.length || 0}）</h2><button className="ef-btn small" onClick={loadLibrary}>刷新</button></div>
              {!libLoaded && <div className="ef-empty">正在读取资料库…</div>}
              {libLoaded && lib.items?.length === 0 && <div className="ef-empty">{lib.loggedIn ? '资料库为空。' : '未登录，请先在上方点击「官方登录」完成登录。'}</div>}
              {lib.items?.map((it: any) => (
                <div key={it.id} className="cand">
                  <div className="thumb" onClick={() => openItem(it.id)}>{it.imageUrl ? <img src={it.imageUrl} alt="" /> : <span className="noimg">{it.id}</span>}</div>
                  <div className="tt" onClick={() => openItem(it.id)}>{it.name}<span className="st">{it.shop} {it.date ? '· ' + it.date : ''}</span></div>
                  <div className="sc">{it.id}</div>
                  <div className="acts">
                    <button className="ef-btn small go" onClick={() => openItem(it.id)}>打开</button>
                    <button className="ef-btn small" onClick={() => wishlist(it.id)}>喜欢</button>
                    <button className="ef-btn small" onClick={() => gift(it.id)}>Gift</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!libraryOpen && <div className="ef-empty">输入商品链接或编号后点击「在窗口打开」，BOOTH 页面会在独立窗口打开；登录态与主窗口共享，下载会自动登记到「网络任务」。</div>}
        </div>
      </div>
      <div className="vdoc">
        <div className="ef-empty">BOOTH 官方禁止页面被内嵌，商品页与资料库均改为在独立窗口打开；登录态与主窗口共享，下载会自动登记到「网络任务」。</div>
      </div>
    </div>
  );
}

// ---------- 网络任务 ----------
function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [speed, setSpeed] = useState<Record<number, { ts: number; bps: number }[]>>({});
  const [now, setNow] = useState(Date.now());
  const [dlUrl, setDlUrl] = useState('');
  const [dlLabel, setDlLabel] = useState('');

  useEffect(() => {
    window.vrc?.netList?.().then(setTasks).catch(() => {});
    const off = window.vrc?.onNetProgress?.((t: any[]) => { setTasks(t); setNow(Date.now()); }) || (() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { off(); clearInterval(timer); };
  }, []);

  async function act(fn: string, id: number) {
    const list = await (window.vrc as any)[fn](id);
    setTasks(list);
  }
  async function showSpeed(id: number) {
    const s = await window.vrc.netSpeed(id);
    setSpeed((p) => ({ ...p, [id]: s }));
  }
  async function addDownload() {
    if (!dlUrl.trim()) return;
    const label = dlLabel.trim() || dlUrl.trim();
    setTasks(await window.vrc.netAddUrl(dlUrl.trim(), label));
    setDlUrl(''); setDlLabel('');
  }

  const STATUS: Record<string, string> = { queued: '排队', running: '下载中', paused: '已暂停', done: '完成', failed: '失败' };

  return (
    <div className="stack">
      <div className="ef-sheet-head"><h1>网络任务</h1><div className="ef-facts">
        <span className="ef-field">{fmtInt(tasks.length)} 项</span>
        <span className="ef-field">{fmtInt(tasks.filter((t) => t.status === 'running').length)} 进行中</span>
      </div></div>
      <div className="ef-rows flat">
        <li>
          <span className="meta">下载入口</span>
          <span className="acts">
            <input value={dlUrl} onChange={(e) => setDlUrl(e.target.value)} placeholder="https://… 下载地址" style={{ flex: 1, minWidth: 0 }} />
            <input value={dlLabel} onChange={(e) => setDlLabel(e.target.value)} placeholder="名称（可选）" style={{ width: '12rem', minWidth: 0 }} />
            <button className="ef-btn small go" onClick={addDownload}>加入下载</button>
          </span>
        </li>
      </div>
      <div className="ef-rows flat">
        {tasks.map((t) => {
          const pct = t.bytes_total > 0 ? Math.round((t.bytes_done / t.bytes_total) * 100) : 0;
          const hist = speed[t.id] || [];
          const cur = hist.length ? hist[hist.length - 1].bps : 0;
          return (
            <li key={t.id}>
              <span className="meta">
                <b>{t.label || t.kind}</b>
                <span className="ef-field">{t.url}</span>
                <span className="ef-state is-draft">{STATUS[t.status] || t.status}</span>
                {t.error && <span className="ef-state is-alert">{t.error}</span>}
              </span>
              <span className="acts">
                <span className="ef-field">{fmtBytes(t.bytes_done)}{t.bytes_total > 0 ? ' / ' + fmtBytes(t.bytes_total) : ''}</span>
                {t.bytes_total > 0 && <span className="trate"><span className="spark" style={{ width: Math.max(2, pct) + '%' }} /></span>}
                <span className="ef-field">{fmtBytes(cur)}/s</span>
                {t.status === 'running' && <button className="ef-btn small" onClick={() => act('netPause', t.id)}>暂停</button>}
                {t.status === 'paused' && <button className="ef-btn small go" onClick={() => act('netResume', t.id)}>恢复</button>}
                {t.status === 'failed' && <button className="ef-btn small" onClick={() => act('netRetry', t.id)}>重试</button>}
                <button className="ef-btn small" onClick={() => showSpeed(t.id)}>速度</button>
                <button className="ef-btn small danger" onClick={() => act('netRemove', t.id)}>移除</button>
              </span>
            </li>
          );
        })}
        {tasks.length === 0 && <li><span className="meta">暂无网络任务。</span></li>}
      </div>
      {Object.entries(speed).map(([id, hist]) => (
        <div key={id} className="stack" style={{ marginTop: '1rem' }}>
          <div className="ef-group-head"><h2>速度历史 #{id}</h2></div>
          <div className="bars">
            {(hist.slice(-40)).map((s, i) => (
              <span key={i} style={{ height: Math.max(2, Math.min(100, s.bps / 1048576 * 6)) + 'px' }} title={fmtBytes(s.bps) + '/s'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 保存视图 ----------
function Recents() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.vrc?.recentList?.(20).then((r: any[]) => { setItems(r || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="stack">
      <div className="ef-sheet-head"><h1>最近使用</h1><div className="ef-facts"><span className="ef-field">{fmtInt(items.length)} 项</span></div></div>
      <div className="ef-notice" data-flag="i">打开过的素材会自动登记为「最近打开」，编辑过名称、匹配状态、备注或登记过角色适配的素材记为「最近编辑」。</div>
      <div className="ef-records" style={{ marginTop: '0.5rem' }}>
        {items.map((r, i) => {
          const cover = r.cover_path || r.booth_image || '';
          const kindLabel = r.kindLabel || '最近使用';
          return (
            <li key={r.id}>
              <a className="ef-record" href={'#/card/' + r.id} onClick={(e) => { e.preventDefault(); nav('card', String(r.id)); }}>
                <span className="tag">{String(i + 1).padStart(2, '0')}</span>
                <span className="date">{r.when || ''}</span>
                <span className="name with-thumb">
                  <span className="thumb" style={{ width: '2rem', height: '2rem' }}>{cover ? <img src={cover} alt="" loading="lazy" /> : <span className="noimg">{r.booth_id || '·'}</span>}</span>
                  <span className="nm">{r.name}</span>
                </span>
                <span className="field">
                  <span className="ef-state is-draft">{kindLabel}</span>
                  <span className="ef-state">{MATCH_STATE[r.match_state] || r.match_state}</span>
                  <span className="ef-field">{fmtBytes(r.size)}</span>
                </span>
              </a>
            </li>
          );
        })}
        {!loading && items.length === 0 && <li><a className="ef-record"><span className="name">还没有最近使用记录。打开或编辑素材后，会自动出现在这里。</span></a></li>}
      </div>
    </div>
  );
}

function Views() {
  const [views, setViews] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [qJson, setQJson] = useState('');
  const [msg, setMsg] = useState('');

  function reload() { window.vrc.viewList().then(setViews).catch(() => {}); }
  useEffect(() => { reload(); }, []);

  async function save() {
    if (!name.trim()) return;
    try { JSON.parse(qJson); } catch { setMsg('JSON 无效'); return; }
    setViews(await window.vrc.viewSave(name.trim(), qJson.trim()));
    setName(''); setQJson(''); setMsg('已保存视图');
  }
  async function apply(v: any) {
    const q = await window.vrc.viewApply(v.id);
    // 应用到图库：写入暂存查询并跳转图库，Gallery 挂载后回填筛选
    pendingGalleryQuery = q;
    nav('gallery');
  }

  return (
    <div className="stack">
      <div className="ef-sheet-head"><h1>保存视图</h1><div className="ef-facts"><span className="ef-field">{fmtInt(views.length)} 个视图</span></div></div>
      <div className="ef-setting">
        <label>视图名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：待匹配的服装" />
      </div>
      <div className="ef-setting">
        <label>查询 JSON</label>
        <textarea value={qJson} onChange={(e) => setQJson(e.target.value)} rows={4} placeholder={'{"q":"","category":1,"matchState":"pending","keyword":null,"favorite":null,"sort":"updated","dir":"desc"}'} />
      </div>
      <div className="ef-rows flat">
        <li><span className="meta">操作</span><span className="acts"><button className="ef-btn small go" onClick={save}>保存视图</button></span></li>
      </div>
      {msg && <div className="ef-notice" data-flag="!">{msg}</div>}
      <div className="ef-records" style={{ marginTop: '1rem' }}>
        {views.map((v, i) => (
          <li key={v.id}><a className="ef-record" href="#/gallery" onClick={(e) => { e.preventDefault(); apply(v); }}>
            <span className="tag">{String(i + 1).padStart(2, '0')}</span>
            <span className="date">{v.name}</span>
            <span className="name">{v.query_json}</span>
            <span className="field"><button className="ef-btn small danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.vrc.viewDelete(v.id).then(setViews); }}>删除</button></span>
          </a></li>
        ))}
        {views.length === 0 && <li><a className="ef-record"><span className="name">还没有保存视图。填写名称与查询 JSON 保存后，可快速复用筛选条件。</span></a></li>}
      </div>
    </div>
  );
}

// ---------- 设置 ----------

function Settings({ settings, reload }: { settings: any; reload: () => void }) {
  const [theme, setTheme] = useState(settings?.theme || 'system');
  const [motion, setMotion] = useState(settings?.motion || 'full');
  const [concurrency, setConcurrency] = useState(settings?.maxConcurrency || 4);

  async function save(patch: any) {
    await window.vrc.settingsSet(patch);
    applySettingsToDom({ ...(settings || {}), ...patch });
    reload();
  }

  return (
    <div className="stack">
      <div className="ef-sheet-head"><h1>设置</h1></div>
      <div className="ef-setting">
        <label>主题</label>
        <div className="ef-seg" role="tablist">
          {['system', 'light', 'dark'].map((t) => (
            <button key={t} role="tab" aria-selected={theme === t} className={theme === t ? 'is-on' : ''} onClick={() => { setTheme(t); save({ theme: t }); }}>{t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}</button>
          ))}
        </div>
      </div>
      <div className="ef-setting">
        <label>动效</label>
        <div className="ef-seg" role="tablist">
          {['full', 'calm'].map((t) => (
            <button key={t} role="tab" aria-selected={motion === t} className={motion === t ? 'is-on' : ''} onClick={() => { setMotion(t); save({ motion: t }); }}>{t === 'full' ? '全开' : '静'}</button>
          ))}
        </div>
      </div>
      <div className="ef-setting">
        <label>下载并发</label>
        <div className="ef-seg" role="tablist">
          {[1, 2, 4, 8].map((n) => (
            <button key={n} role="tab" aria-selected={concurrency === n} className={concurrency === n ? 'is-on' : ''} onClick={() => { setConcurrency(n); save({ maxConcurrency: n }); }}>{n}</button>
          ))}
        </div>
      </div>
      <div className="ef-notice" data-flag="i">设置即时保存到本地资料库。</div>
    </div>
  );
}

// ---------- 更新提示（跟随 GitHub 最新发布） ----------
function UpdateNotice({ info, onClose }: { info: any; onClose: () => void }) {
  return (
    <dialog className="ef-dialog" open onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ef-panel cut-br">
        <div className="ef-eyebrow slash">UPDATE / 更新</div>
        <h2>发现新版本 v{info.latest}</h2>
        <p>当前版本 v{info.current}。{info.name ? '最新发布：' + info.name : ''}</p>
        {info.notes ? <div className="ef-prose" style={{ whiteSpace: 'pre-wrap', maxHeight: '16rem', overflow: 'auto', marginBottom: '1rem' }}>{info.notes}</div> : null}
        <div className="ef-actions">
          <button className="ef-btn small" onClick={onClose}>稍后再说</button>
          <button className="ef-btn small go" onClick={() => { if (info.downloadUrl) window.vrc?.openExternal?.(info.downloadUrl); onClose(); }}>前往下载</button>
        </div>
      </div>
    </dialog>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
