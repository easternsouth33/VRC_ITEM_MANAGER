// 扫描结果持久化（roots → assets → asset_members → asset_files，含折叠语义，计划书 §3/§5.1）
import type { Db } from './db';
import type { ScanResult } from './scanner';
import { collectBoothIds } from '../shared/booth-id';
import { normalizeName } from '../shared/normalize';

// 根目录 → rootKey（模型 / 地图，计划书 §3.1 双根区分）
export function rootKeyFor(label: string): string {
  const n = normalizeName(label);
  if (/(模型|model|avatar)/.test(n)) return 'model';
  if (/(地图|map|world|场景)/.test(n)) return 'map';
  return 'model';
}

// 扫描结果持久化（roots → assets → asset_members → asset_files，含折叠语义）
export function persistScan(db: Db, rootId: number, rootKey: string, cards: ScanResult[]): number {
  // 清空该 root 旧卡与成员/文件（重扫幂等）
  const oldIds = db.all<{ id: number }>('SELECT id FROM assets WHERE root_id = ?', rootId);
  for (const o of oldIds) {
    db.exec('DELETE FROM asset_members WHERE asset_id=?', o.id);
    db.exec('DELETE FROM asset_files WHERE asset_id=?', o.id);
    db.exec('DELETE FROM asset_keywords WHERE asset_id=?', o.id);
    db.exec('DELETE FROM matches WHERE asset_id=?', o.id);
    db.exec('DELETE FROM related_assets WHERE asset_id=? OR related_id=?', o.id, o.id);
    db.exec('DELETE FROM assets WHERE id=?', o.id);
  }
  let count = 0;
  for (const card of cards) {
    persistCard(db, rootId, rootKey, card, null);
    count++;
  }
  db.exec("UPDATE roots SET card_count=?, last_scan_at=datetime('now') WHERE id=?", count, rootId);
  db.exec('INSERT INTO imports(root_id,source,kind,stat) VALUES(?,?,?,?)', rootId, String(rootId), 'scan', JSON.stringify({ cards: count }));
  return count;
}

function persistCard(db: Db, rootId: number, rootKey: string, card: ScanResult, foldParent: number | null): number {
  const archiveNames = card.members.filter((m) => m.memberType === 'archive').map((m) => m.relPath);
  const boothIds = collectBoothIds([card.name, card.base, ...archiveNames]);
  const boothId = boothIds.length ? boothIds[0].id : null;
  // 编号命中 → auto 状态 + 满分，否则 pending（计划书 §5.4）
  let matchState = 'pending';
  let score: number | null = null;
  if (boothId) {
    const atStart = boothIds[0].atStart;
    const titleOverlap = boothId.length >= 6 && normalizeName(card.base).includes(boothId);
    matchState = atStart || titleOverlap ? 'auto' : 'pending';
    score = matchState === 'auto' ? 1 : null;
  }
  // 关键词分类（人工优先，计划书 §5.6）
  const cat = inferKeywordCategory(db, card.name);
  const kind = card.foldedOf ? 'fold' : (card.kind === 'dir' ? 'dir' : 'file');
  // 拍平成员：折叠卡/目录卡的成员 = 自身直接子项 + 子目录树全部成员（保留各层路径，计划书 §5.1 第六条）
  const members = collectMembers(card, '');
  const exts = collectExts(card);
  const r = db.exec(
    `INSERT INTO assets(name,kind,root_id,root_key,booth_id,match_state,score,category_id,category_reason,size,files,dirs,version_text,base,sample,fold_of,fold_parent,updated_at,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    card.name, kind, rootId, rootKey, boothId, matchState, score,
    cat ? cat.id : null, cat ? 'keyword:' + cat.norm : null,
    card.size, card.files, card.dirs, card.versionText, card.base, card.sample, card.foldedOf, foldParent
  );
  const assetId = Number(r.lastInsertRowid);
  for (const m of members) {
    db.exec('INSERT INTO asset_members(asset_id,path,rel_path,member_type,role,depth,size,unavailable) VALUES(?,?,?,?,?,?,?,?)',
      assetId, m.path, m.relPath, m.memberType, m.role, m.depth, m.size, m.unavailable ? 1 : 0);
  }
  for (const [ext, n] of exts) {
    db.exec('INSERT INTO asset_files(asset_id,path,rel_path,ext,size) VALUES(?,?,?,?,?)', assetId, '', '', ext, n);
  }
  return assetId;
}

// 拍平成员：自身直接子项 + 子目录树全部成员（各层路径以 '/' 分隔相对路径保留）
function collectMembers(card: ScanResult, prefix: string): { path: string; relPath: string; memberType: string; role: string; depth: number; size: number; unavailable: boolean }[] {
  const out: { path: string; relPath: string; memberType: string; role: string; depth: number; size: number; unavailable: boolean }[] = [];
  for (const m of card.members) {
    out.push({ path: m.path, relPath: prefix ? prefix + '/' + m.relPath : m.relPath, memberType: m.memberType, role: m.role, depth: m.depth, size: m.size, unavailable: m.unavailable });
  }
  for (const child of card.children) {
    const childPrefix = prefix ? prefix + '/' + child.name : child.name;
    for (const m of collectMembers(child, childPrefix)) out.push(m);
  }
  return out;
}

// 汇总扩展名计数（自身 + 子目录树）
function collectExts(card: ScanResult): [string, number][] {
  const map = new Map<string, number>();
  const add = (c: ScanResult) => {
    for (const [ext, n] of c.extsTop) map.set(ext, (map.get(ext) || 0) + n);
    for (const child of c.children) add(child);
  };
  add(card);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

// 关键词 → 分类（人工优先，返回 {id,norm}；无命中返回 null）
function inferKeywordCategory(db: Db, name: string): { id: number; norm: string } | null {
  const text = normalizeName(name);
  const rules = db.all<{ category_id: number; keyword_norm: string; weight: number }>(
    "SELECT category_id, keyword_norm, weight FROM keyword_rules WHERE scope='category' AND enabled=1"
  );
  let best: { category_id: number; keyword_norm: string; weight: number } | null = null;
  for (const rule of rules) {
    if (text.includes(rule.keyword_norm)) {
      if (!best || rule.weight > best.weight) best = rule;
    }
  }
  return best ? { id: best.category_id, norm: best.keyword_norm } : null;
}
