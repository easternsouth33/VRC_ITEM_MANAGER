// IPC 通道注册（main ↔ renderer）
import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Db } from './db';
import { scanRoot, foldSinglePackage, fileFingerprint } from './scanner';
import type { ScanResult } from './scanner';
import { persistScan, rootKeyFor } from './persist';
import { fetchBoothItem, searchBooth, fetchBoothLibrary } from './booth';
import { inspectArchive, saveManifest } from './archive';
import { extractArchive, isUnitypackage } from './extract';
import type { DownloadEngine } from './downloader';
import { collectBoothIds, parseBoothRef } from '../shared/booth-id';
import { scoreMatch, matchStateFor, DROP_THRESHOLD } from '../shared/score';
import { normalizeName, normalizeKeyword, stripVersion } from '../shared/normalize';
import type { CardSummary, GalleryQuery, GalleryPage, Settings, NetTask, CardDetail, MatchCandidate, BoothInfo, CategoryNode, CompatEvidence } from '../shared/types';
import { buildCompatEvidence, collectCompatHits } from '../shared/compat';
import { checkUpdate } from './updater';
import { searchCandidates, evidenceForCard, toLocalBooth } from './matcher';
import { translateBoothItem } from './translate';
import { suggestAssetCategory, refreshCategorySuggestion } from './classification';
import { createImportBatch, linkImportBatch, archiveNamesForCard } from './import-batch';

export function registerIpc(db: Db, getWindow: () => BrowserWindow | null, state: { boothCookie: string; netTasks: Map<number, AbortController> }, downloader: DownloadEngine) {
  function clearCardRecords(id: number) {
    for (const table of ['asset_members','asset_files','asset_keywords','matches','match_history','asset_adaptations','collection_assets','compat_evidence','covers','category_suggestions']) db.exec('DELETE FROM ' + table + ' WHERE asset_id=?', id);
    db.exec('DELETE FROM related_assets WHERE asset_id=? OR related_id=?', id, id);
    db.exec('DELETE FROM assets WHERE id=?', id);
  }
  ipcMain.handle('import:batch-start', async (_e,source: string,files: string[] = []) => createImportBatch(db,source,files));
  ipcMain.handle('import:batch-finish', async (_e,batchId: number,assetIds: number[]) => { linkImportBatch(db,batchId,assetIds); return {ok:true,count:new Set(assetIds).size}; });
  ipcMain.handle('import:list', async () => db.all("SELECT id,root_id,source,kind,asset_ids_json,created_at,undone_at FROM import_snapshots ORDER BY id DESC LIMIT 30").map((r: any) => ({ ...r, count: JSON.parse(r.asset_ids_json).length })));
  ipcMain.handle('import:undo', async (_e, snapshotId: number) => {
    const snapshot = db.get('SELECT * FROM import_snapshots WHERE id=?', snapshotId) as any;
    if (!snapshot || snapshot.undone_at) return { ok: false, error: '该导入记录已撤回或不存在' };
    const ids: number[] = JSON.parse(snapshot.asset_ids_json);
    const backup = snapshot.backup_json ? JSON.parse(snapshot.backup_json) : null;
    for (const id of ids) clearCardRecords(id);
    if (backup?.root) {
      db.exec('UPDATE roots SET card_count=?,last_scan_at=? WHERE id=?', backup.root.card_count, backup.root.last_scan_at, snapshot.root_id);
      for (const a of backup.assets) {
        db.exec(`INSERT INTO assets(id,name,kind,root_id,root_key,booth_id,match_state,score,category_id,category_reason,category_manual_id,size,files,dirs,cover_path,favorite,hidden,unavailable,version_text,note,base,sample,fingerprint,fold_of,fold_parent,updated_at,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          a.id,a.name,a.kind,a.root_id,a.root_key,a.booth_id,a.match_state,a.score,a.category_id,a.category_reason,a.category_manual_id,a.size,a.files,a.dirs,a.cover_path,a.favorite,a.hidden,a.unavailable,a.version_text,a.note,a.base,a.sample,a.fingerprint,a.fold_of,a.fold_parent,a.updated_at,a.created_at);
      }
      for (const m of backup.members) db.exec('INSERT INTO asset_members(id,asset_id,path,rel_path,member_type,role,depth,size,unavailable) VALUES(?,?,?,?,?,?,?,?,?)',m.id,m.asset_id,m.path,m.rel_path,m.member_type,m.role,m.depth,m.size,m.unavailable);
      for (const f of backup.files) db.exec('INSERT INTO asset_files(id,asset_id,path,rel_path,ext,size) VALUES(?,?,?,?,?,?)',f.id,f.asset_id,f.path,f.rel_path,f.ext,f.size);
    } else if (snapshot.root_id) {
      const count = (db.get('SELECT COUNT(*) AS n FROM assets WHERE root_id=?', snapshot.root_id) as any)?.n || 0;
      db.exec('UPDATE roots SET card_count=? WHERE id=?', count, snapshot.root_id);
    }
    db.exec("UPDATE import_snapshots SET undone_at=datetime('now') WHERE id=?", snapshotId);
    return { ok: true, removed: ids.length, restored: backup?.assets?.length || 0 };
  });
  // ---- 扫描 ----
  ipcMain.handle('scan:folders', async (_e, dirs: string[]) => {
    const results: { root: string; label: string; rootKey: string; cards: number; assetIds: number[] }[] = [];
    for (const d of dirs) {
      const label = path.basename(d);
      const rootKey = rootKeyFor(label);
      // upsert root
      let root = db.get<{ id: number }>('SELECT id FROM roots WHERE path = ?', d);
      if (!root) {
        const r = db.exec('INSERT INTO roots(path,label,kind) VALUES(?,?,?)', d, label, 'folder');
        root = { id: Number(r.lastInsertRowid) };
      } else {
        db.exec("UPDATE roots SET label=?, last_scan_at=datetime('now') WHERE id=?", label, root.id);
      }
      const scanned = await scanRoot(d);
      const folded = foldSinglePackage(scanned);
      const assetIds: number[] = [];
      const count = persistScan(db, root.id, rootKey, folded, assetIds);
      results.push({ root: d, label, rootKey, cards: count, assetIds });
    }
    return { ok: true, results };
  });

  ipcMain.handle('roots:list', async () => {
    return db.all('SELECT * FROM roots ORDER BY id');
  });

  ipcMain.handle('roots:add', async (_e, dirs: string[]) => {
    for (const d of dirs) {
      const exists = db.get('SELECT id FROM roots WHERE path = ?', d);
      if (!exists) {
        db.exec('INSERT INTO roots(path,label,kind) VALUES(?,?,?)', d, path.basename(d), 'folder');
      }
    }
    return db.all('SELECT * FROM roots ORDER BY id');
  });

  // ---- 图库查询 ----
  ipcMain.handle('gallery:query', async (_e, q: GalleryQuery) => {
    return queryGallery(db, q);
  });

  ipcMain.handle('gallery:cards', async () => {
    const cards = db.all(`SELECT a.id,a.name,a.kind,a.root_key,a.booth_id,a.match_state,a.score,a.category_id,a.category_reason,a.size,a.files,a.dirs,a.cover_path,a.favorite,a.hidden,a.unavailable,a.version_text,a.updated_at,a.base,
      b.image_url AS booth_image,
      b.name AS booth_name,
      (SELECT GROUP_CONCAT(DISTINCT f.ext) FROM asset_files f WHERE f.asset_id = a.id) AS exts,
      cat.name AS category_name
      FROM assets a LEFT JOIN booth_items b ON a.booth_id = b.booth_id LEFT JOIN categories cat ON cat.id = a.category_id
      ORDER BY a.updated_at DESC`) as any[];
    for (const card of cards) if (!card.cover_path) card.cover_path = card.booth_image || null;
    const kws = db.all('SELECT asset_id, keyword FROM asset_keywords ORDER BY asset_id, id');
    const byId = new Map<number, string[]>();
    for (const k of kws as any[]) {
      if (!byId.has(k.asset_id)) byId.set(k.asset_id, []);
      byId.get(k.asset_id)!.push(k.keyword);
    }
    for (const card of cards) card.keywords = byId.get(card.id) || [];
    return cards;
  });

  // ---- 卡片详情 ----
  ipcMain.handle('card:detail', async (_e, id: number) => {
    const card = db.get('SELECT * FROM assets WHERE id = ?', id);
    if (!card) return null;
    const members = db.all('SELECT * FROM asset_members WHERE asset_id = ? ORDER BY depth, rel_path', id);
    const boothId = card.booth_id as string | null;
    const boothRow = boothId ? db.get('SELECT * FROM booth_items WHERE booth_id = ?', boothId) as any : null;
    const booth = boothRow ? toLocalBooth(boothRow) : null;
    if (boothRow && booth) {
      booth.tags = db.all('SELECT tag FROM booth_item_tags WHERE booth_id=?', boothId).map((r: any) => r.tag);
      booth.variations = db.all('SELECT * FROM booth_variations WHERE booth_id=? ORDER BY id', boothId).map((v: any) => ({ id: String(v.variation_id || v.id), name: v.name, price: v.price, type: v.type, url: v.url, downloadable: !!v.downloadable }));
      booth.translations = boothRow.translation_json ? JSON.parse(boothRow.translation_json) : null;
    }
    if (!card.cover_path && booth) card.cover_path = (booth as any).image_url || null;
    const candidates = db.all('SELECT * FROM matches WHERE asset_id = ? ORDER BY pinned DESC, score DESC', id);
    const keywords = db.all('SELECT keyword FROM asset_keywords WHERE asset_id = ? ORDER BY weight DESC, id', id).map((r: any) => r.keyword);
    const extsTop = db.all('SELECT ext, SUM(size) AS n FROM asset_files WHERE asset_id = ? GROUP BY ext ORDER BY n DESC LIMIT 12', id).map((r: any) => [r.ext, r.n]);
    const compat = buildCompatEvidenceFor(db, id);
    const related = db.all('SELECT a.id, a.name, r.kind FROM related_assets r JOIN assets a ON a.id = r.related_id WHERE r.asset_id = ? ORDER BY r.id', id);
    return { ...card, members, booth, candidates, keywords, extsTop, compat, related, description: (booth as any)?.description || null };
  });

  // ---- 本地适配 vs 商品支持（需求⑤ / §5.7）----
  ipcMain.handle('compat:evidence', async (_e, id: number) => {
    return buildCompatEvidenceFor(db, id);
  });

  // ---- BOOTH 抓取 ----
  ipcMain.handle('booth:fetch', async (_e, id: string) => {
    const info = await fetchBoothItem(id, { cookie: state.boothCookie });
    saveBoothItem(db, info);
    return info;
  });

  // 为 auto 卡批量抓取 BOOTH 封面（并发 4，只补无封面的）
  ipcMain.handle('booth:hydrate-covers', async () => {
    const cards = db.all("SELECT id, booth_id FROM assets WHERE booth_id IS NOT NULL AND (cover_path IS NULL OR cover_path='') AND match_state='auto' LIMIT 60") as any[];
    let done = 0;
    const worker = async (card: any) => {
      const local = db.get('SELECT image_url FROM booth_items WHERE booth_id=?', card.booth_id);
      const localUrl = local && (local as any).image_url ? String((local as any).image_url) : '';
      // 已有 300x300 或更大封面则直接复用，72x72 缩略图需重新抓取升级
      if (localUrl && !/\/c\/72x72/.test(localUrl)) {
        db.exec('UPDATE assets SET cover_path=? WHERE id=?', localUrl, card.id);
        done++;
        return;
      }
      try {
        const info = await fetchBoothItem(card.booth_id);
        saveBoothItem(db, info);
        if (info.imageUrl) { db.exec('UPDATE assets SET cover_path=? WHERE id=?', info.imageUrl, card.id); done++; }
      } catch {
        if (localUrl) { db.exec('UPDATE assets SET cover_path=? WHERE id=?', localUrl, card.id); done++; }
      }
    };
    let i = 0;
    const pool = Array.from({ length: 4 }, async () => {
      while (i < cards.length) { const c = cards[i++]; await worker(c); }
    });
    await Promise.all(pool);
    return { done, total: cards.length };
  });

  ipcMain.handle('booth:search', async (_e, query: string) => {
    return searchBooth(query, { cookie: state.boothCookie });
  });

  // 已购资料库（计划书 §5.8）
  ipcMain.handle('booth:library', async () => {
    const lib = await fetchBoothLibrary({ cookie: state.boothCookie });
    // 登录态变化写 kv，并落库 booth_library
    db.kvSet('booth:loggedIn', lib.loggedIn ? '1' : '0');
    for (const it of lib.items) {
      db.exec('INSERT OR IGNORE INTO booth_library(booth_id,name,url,state) VALUES(?,?,?,?)', it.id, it.name, it.url, 'listed');
    }
    return lib;
  });

  ipcMain.handle('booth:library-list', async () => {
    return db.all('SELECT * FROM booth_library ORDER BY id DESC');
  });

  // 喜欢：打开商品页的 wishlist 地址（由 renderer 在 iframe 内点击，这里只给 URL）
  ipcMain.handle('booth:wishlist-url', async (_e, id: string) => {
    const local = db.get('SELECT * FROM booth_items WHERE booth_id=?', id);
    if (local && (local as any).wish_list_url) return (local as any).wish_list_url;
    try {
      const info = await fetchBoothItem(id, { cookie: state.boothCookie });
      saveBoothItem(db, info);
      return info.wishListUrl || ('https://booth.pm/zh-cn/items/' + id);
    } catch {
      return 'https://booth.pm/zh-cn/items/' + id;
    }
  });

  ipcMain.handle('booth:translate', async (_e, id: string, force = false) => {
    const local = db.get('SELECT * FROM booth_items WHERE booth_id=?', id) as any;
    let info = local ? toLocalBooth(local) : await fetchBoothItem(id, { cookie: state.boothCookie });
    if (local) {
      info.tags = db.all('SELECT tag FROM booth_item_tags WHERE booth_id=?', id).map((r: any) => r.tag);
      info.variations = db.all('SELECT * FROM booth_variations WHERE booth_id=? ORDER BY id', id).map((v: any) => ({ id: String(v.variation_id || v.id), name: v.name, price: v.price, type: v.type, url: v.url, downloadable: !!v.downloadable }));
    }
    if (!info.variations.length || !info.description) {
      try { const fresh = await fetchBoothItem(id, { cookie: state.boothCookie }); saveBoothItem(db, fresh); info = fresh; } catch { /* 本地缓存可用时继续 */ }
    }
    const hash = JSON.stringify([info.name, info.description, info.variations.map((v) => v.name)]);
    if (!force && local?.translation_json && local.translation_source_hash === hash) return JSON.parse(local.translation_json);
    const translated = await translateBoothItem(info);
    db.exec('UPDATE booth_items SET translation_json=?,translation_source_hash=?,translated_at=? WHERE booth_id=?', JSON.stringify(translated), hash, translated.translatedAt, id);
    return translated;
  });

  // ---- 匹配 ----
  ipcMain.handle('match:compute', async (_e, assetId: number) => {
    const card = db.get('SELECT * FROM assets WHERE id = ?', assetId);
    if (!card) return [];
    const candidates = await findCandidates(db, card as any, state);
    return candidates;
  });

  ipcMain.handle('match:apply', async (_e, assetId: number, boothId: string, source: 'auto' | 'search' | 'manual') => {
    // 匹配只关联 BOOTH 商品，不自动分类：类别由用户亲自选择（计划书 §5.5）
    db.exec(`UPDATE assets SET booth_id=?, match_state='manual', updated_at=datetime('now') WHERE id=?`,
      boothId, assetId);
    db.exec(`INSERT INTO match_history(asset_id,booth_id,action,from_state,to_state) VALUES(?,?,?,?,?)`, assetId, boothId, 'apply', 'pending', 'manual');
    return { ok: true };
  });

  ipcMain.handle('match:apply-batch', async (_e, assetIds: number[], boothId: string, source: 'auto' | 'search' | 'manual') => {
    // 批量关联同一 BOOTH 商品（不自动分类，类别由用户亲自选择）
    if (!Array.isArray(assetIds) || assetIds.length === 0) return { ok: false, error: '未选择任何素材' };
    const ids = assetIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return { ok: false, error: '素材编号无效' };
    const placeholders = ids.map(() => '?').join(',');
    db.exec(`UPDATE assets SET booth_id=?, match_state='manual', updated_at=datetime('now') WHERE id IN (${placeholders})`, boothId, ...ids);
    for (const id of ids) {
      db.exec(`INSERT INTO match_history(asset_id,booth_id,action,from_state,to_state) VALUES(?,?,?,?,?)`, id, boothId, 'apply', 'pending', 'manual');
    }
    return { ok: true, updated: ids.length };
  });
  ipcMain.handle('match:reject', async (_e, assetId: number, boothId: string) => {
    db.exec(`UPDATE assets SET match_state='rejected', updated_at=datetime('now') WHERE id=?`, assetId);
    db.exec(`INSERT INTO match_history(asset_id,booth_id,action,from_state,to_state) VALUES(?,?,?,?,?)`, assetId, boothId, 'reject', 'suggested', 'rejected');
    return { ok: true };
  });

  ipcMain.handle('match:skip', async (_e, assetId: number) => {
    db.exec(`UPDATE assets SET match_state='skipped', updated_at=datetime('now') WHERE id=?`, assetId);
    return { ok: true };
  });

  ipcMain.handle('match:undo', async (_e, assetId: number) => {
    db.exec(`UPDATE assets SET match_state='pending', booth_id=NULL, updated_at=datetime('now') WHERE id=?`, assetId);
    return { ok: true };
  });

  // ---- 分类 ----
  ipcMain.handle('category:tree', async () => {
    return categoryTree(db);
  });

  ipcMain.handle('category:suggestion', async (_e, assetId: number) => refreshCategorySuggestion(db,assetId));
  ipcMain.handle('category:suggestions', async () => db.all('SELECT s.*,a.name,c.name AS category_name FROM category_suggestions s JOIN assets a ON a.id=s.asset_id JOIN categories c ON c.id=s.category_id WHERE a.category_manual_id IS NULL ORDER BY s.confidence DESC,s.asset_id'));

  ipcMain.handle('category:assign', async (_e, assetId: number, categoryId: number, reason: string) => {
    db.exec(`UPDATE assets SET category_id=?, category_reason=?, category_manual_id=?, updated_at=datetime('now') WHERE id=?`, categoryId, reason, categoryId, assetId);
    db.exec(`INSERT INTO asset_ops(asset_id,op,payload_json) VALUES(?,?,?)`, assetId, 'category', JSON.stringify({ categoryId, reason }));
    db.exec('DELETE FROM category_suggestions WHERE asset_id=?',assetId);
    return { ok: true };
  });

  ipcMain.handle('category:create', async (_e, name: string, parentId?: number) => {
    const n = (name || '').trim();
    if (!n) return { ok: false, error: '分类名不能为空' };
    if (n.length > 32) return { ok: false, error: '分类名最长 32 字' };
    const dup = db.get('SELECT id FROM categories WHERE name = ?', n);
    if (dup) return { ok: false, error: '分类名已存在' };
    const sort = (db.get('SELECT COALESCE(MAX(sort),0)+1 AS s FROM categories') as any).s;
    const r = db.exec('INSERT INTO categories(name, parent_id, builtin, sort) VALUES(?,?,?,?)', n, parentId ?? null, 0, sort);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('category:rename', async (_e, id: number, name: string) => {
    const n = (name || '').trim();
    if (!n) return { ok: false, error: '分类名不能为空' };
    if (n.length > 32) return { ok: false, error: '分类名最长 32 字' };
    const dup = db.get('SELECT id FROM categories WHERE name = ? AND id != ?', n, id);
    if (dup) return { ok: false, error: '分类名已存在' };
    db.exec(`UPDATE categories SET name=? WHERE id=?`, n, id);
    return { ok: true };
  });

  ipcMain.handle('category:delete', async (_e, id: number) => {
    const cat = db.get('SELECT builtin FROM categories WHERE id=?', id);
    if (!cat) return { ok: false, error: '分类不存在' };
    if ((cat as any).builtin) return { ok: false, error: '内置分类不可删除' };
    db.exec(`UPDATE assets SET category_id=NULL, category_reason=NULL WHERE category_id=?`, id);
    db.exec(`UPDATE categories SET parent_id=NULL WHERE parent_id=?`, id);
    db.exec(`DELETE FROM categories WHERE id=?`, id);
    return { ok: true };
  });

  // ---- 关键词 ----
  ipcMain.handle('keyword:add', async (_e, assetId: number, keyword: string) => {
    const norm = normalizeKeyword(keyword);
    const exists = db.get('SELECT id FROM asset_keywords WHERE asset_id=? AND keyword_norm=?', assetId, norm);
    if (!exists) {
      db.exec('INSERT INTO asset_keywords(asset_id,keyword,keyword_norm,source) VALUES(?,?,?,?)', assetId, keyword.trim(), norm, 'manual'); // 关键词仅作标签，不再触发分类
    }
    return db.all('SELECT keyword FROM asset_keywords WHERE asset_id=?', assetId).map((r: any) => r.keyword);
  });

  ipcMain.handle('keyword:remove', async (_e, assetId: number, keyword: string) => {
    const norm = normalizeKeyword(keyword);
    db.exec('DELETE FROM asset_keywords WHERE asset_id=? AND keyword_norm=?', assetId, norm);
    return db.all('SELECT keyword FROM asset_keywords WHERE asset_id=?', assetId).map((r: any) => r.keyword);
  });

  ipcMain.handle('keyword:batch', async (_e, assetIds: number[], add: string[], remove: string[]) => {
    for (const id of assetIds) {
      for (const k of add) {
        const norm = normalizeKeyword(k);
        if (!db.get('SELECT id FROM asset_keywords WHERE asset_id=? AND keyword_norm=?', id, norm)) {
          db.exec('INSERT INTO asset_keywords(asset_id,keyword,keyword_norm,source) VALUES(?,?,?,?)', id, k.trim(), norm, 'manual');
        }
      }
      for (const k of remove) {
        db.exec('DELETE FROM asset_keywords WHERE asset_id=? AND keyword_norm=?', id, normalizeKeyword(k));
      }
    }
    db.exec('INSERT INTO asset_ops(op,payload_json) VALUES(?,?)', 'batch_keyword', JSON.stringify({ add, remove, count: assetIds.length }));
    return { ok: true };
  });

  // ---- 收藏 / 备注 / 标签 ----
  ipcMain.handle('card:favorite', async (_e, id: number, fav: boolean) => {
    db.exec("UPDATE assets SET favorite=?, updated_at=datetime('now') WHERE id=?", fav ? 1 : 0, id);
    return { ok: true };
  });
  ipcMain.handle('card:note', async (_e, id: number, note: string) => {
    db.exec("UPDATE assets SET note=?, updated_at=datetime('now') WHERE id=?", note, id);
    return { ok: true };
  });

  // 自由编辑素材名称
  ipcMain.handle('card:edit-name', async (_e, id: number, name: string) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '名称不能为空' };
    db.exec(`UPDATE assets SET name=?, edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, n, id);
    db.exec(`INSERT INTO asset_ops(asset_id,op,payload_json) VALUES(?,?,?)`, id, 'edit-name', JSON.stringify({ name: n }));
    return { ok: true };
  });

  // 角色适配（VRChat 衣装：一个材质/衣服可适配多个角色）
  ipcMain.handle('adapt:list', async (_e, assetId: number) => {
    return db.all('SELECT * FROM asset_adaptations WHERE asset_id=? ORDER BY id', assetId);
  });

  ipcMain.handle('adapt:add', async (_e, assetId: number, avatarName: string, note?: string) => {
    const name = String(avatarName || '').trim();
    if (!name) return { ok: false, error: '角色名不能为空' };
    const norm = normalizeName(name);
    const exists = db.get('SELECT id FROM asset_adaptations WHERE asset_id=? AND avatar_norm=?', assetId, norm);
    if (exists) return { ok: false, error: '该角色适配已存在' };
    db.exec('INSERT INTO asset_adaptations(asset_id,avatar_name,avatar_norm,source,note) VALUES(?,?,?,?,?)', assetId, name, norm, 'manual', note || null);
    db.exec("UPDATE assets SET edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?", assetId);
    return db.all('SELECT * FROM asset_adaptations WHERE asset_id=? ORDER BY id', assetId);
  });

  ipcMain.handle('adapt:remove', async (_e, assetId: number, adaptationId: number) => {
    db.exec('DELETE FROM asset_adaptations WHERE id=? AND asset_id=?', adaptationId, assetId);
    db.exec("UPDATE assets SET edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?", assetId);
    return db.all('SELECT * FROM asset_adaptations WHERE asset_id=? ORDER BY id', assetId);
  });

  ipcMain.handle('adapt:note', async (_e, assetId: number, adaptationId: number, note: string) => {
    db.exec('UPDATE asset_adaptations SET note=? WHERE id=? AND asset_id=?', note, adaptationId, assetId);
    return db.all('SELECT * FROM asset_adaptations WHERE asset_id=? ORDER BY id', assetId);
  });

  // 批量登记：一次把一个角色适配登记到多个素材（选中衣装 → 登记到角色）
  ipcMain.handle('adapt:batch-add', async (_e, assetIds: number[], avatarName: string, note?: string) => {
    const name = String(avatarName || '').trim();
    if (!name) return { ok: false, error: '角色名不能为空' };
    const norm = normalizeName(name);
    let added = 0;
    for (const id of assetIds) {
      const exists = db.get('SELECT id FROM asset_adaptations WHERE asset_id=? AND avatar_norm=?', id, norm);
      if (exists) continue;
      db.exec('INSERT INTO asset_adaptations(asset_id,avatar_name,avatar_norm,source,note) VALUES(?,?,?,?,?)', id, name, norm, 'manual', note || null);
      db.exec("UPDATE assets SET edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?", id);
      added++;
    }
    db.exec('INSERT INTO asset_ops(op,payload_json) VALUES(?,?)', 'batch_adapt', JSON.stringify({ avatarName: name, count: added }));
    return { ok: true, added };
  });

  // 编辑匹配状态 / 备注：记录编辑时间，写操作日志
  ipcMain.handle('card:edit-state', async (_e, id: number, matchState: string) => {
    db.exec(`UPDATE assets SET match_state=?, edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, matchState, id);
    db.exec(`INSERT INTO asset_ops(asset_id,op,payload_json) VALUES(?,?,?)`, id, 'edit-state', JSON.stringify({ matchState }));
    return { ok: true };
  });

  // 记录最近打开（详情页打开即调用）
  ipcMain.handle('card:touch-opened', async (_e, id: number) => {
    db.exec(`UPDATE assets SET last_opened_at=datetime('now') WHERE id=?`, id);
    return { ok: true };
  });

  // 最近使用列表：按 last_opened_at 或 edited_at 倒序
  ipcMain.handle('recent:list', async (_e, limit: number = 20) => {
    const rows = db.all(`SELECT a.id,a.name,a.kind,a.root_key,a.booth_id,a.match_state,a.category_id,a.category_reason,a.size,a.cover_path,a.favorite,a.last_opened_at,a.edited_at,a.updated_at,
      b.image_url AS booth_image
      FROM assets a LEFT JOIN booth_items b ON a.booth_id = b.booth_id
      WHERE a.last_opened_at IS NOT NULL OR a.edited_at IS NOT NULL
      ORDER BY COALESCE(a.last_opened_at, a.edited_at) DESC LIMIT ?`, limit) as any[];
    for (const r of rows) {
      if (!r.cover_path) r.cover_path = r.booth_image || null;
      r.kindLabel = r.last_opened_at ? '最近打开' : '最近编辑';
      r.when = r.last_opened_at || r.edited_at;
    }
    return rows;
  });
  ipcMain.handle('card:related', async (_e, id: number, relatedId: number) => {
    db.exec('INSERT OR IGNORE INTO related_assets(asset_id,related_id,kind) VALUES(?,?,?)', id, relatedId, 'manual');
    return db.all('SELECT a.id,a.name FROM related_assets r JOIN assets a ON a.id=r.related_id WHERE r.asset_id=?', id);
  });

  // ---- 工程素材线索 / 人工关联（需求⑦）----
  ipcMain.handle('related:list', async (_e, id: number) => {
    return db.all('SELECT a.id, a.name, r.kind, a.match_state, a.cover_path FROM related_assets r JOIN assets a ON a.id = r.related_id WHERE r.asset_id = ? ORDER BY r.id', id);
  });
  ipcMain.handle('related:remove', async (_e, id: number, relatedId: number) => {
    db.exec('DELETE FROM related_assets WHERE asset_id = ? AND related_id = ?', id, relatedId);
    return db.all('SELECT a.id, a.name, r.kind FROM related_assets r JOIN assets a ON a.id = r.related_id WHERE r.asset_id = ? ORDER BY r.id', id);
  });

  // ---- 集合 ----
  ipcMain.handle('collection:list', async () => db.all('SELECT * FROM collections ORDER BY id'));
  ipcMain.handle('collection:create', async (_e, name: string, queryJson?: string) => {
    db.exec('INSERT INTO collections(name,query_json) VALUES(?,?)', name, queryJson ?? null);
    return db.all('SELECT * FROM collections ORDER BY id');
  });
  ipcMain.handle('collection:add', async (_e, collectionId: number, assetIds: number[]) => {
    for (const id of assetIds) db.exec('INSERT OR IGNORE INTO collection_assets(collection_id,asset_id) VALUES(?,?)', collectionId, id);
    return { ok: true };
  });
  ipcMain.handle('collection:assets', async (_e, collectionId: number) => {
    const col = db.get('SELECT * FROM collections WHERE id=?', collectionId) as any;
    if (col && col.query_json) {
      // 智能集合：按保存的查询 JSON 动态计算成员
      const q = JSON.parse(col.query_json);
      const page = queryGallery(db, {
        q: q.q || '', category: q.category ?? null, matchState: q.matchState ?? null,
        rootKey: q.rootKey ?? null, keyword: q.keyword ?? null, favorite: q.favorite ?? null,
        sort: q.sort || 'updated', dir: q.dir || 'desc', offset: 0, limit: 1000,
      });
      return page.cards as any[];
    }
    return db.all(`SELECT a.id,a.name,a.kind,a.root_key,a.booth_id,a.match_state,a.score,a.category_id,a.category_reason,a.size,a.files,a.dirs,a.cover_path,a.favorite,a.base,a.version_text,
      b.image_url AS booth_image
      FROM collection_assets ca
      JOIN assets a ON a.id = ca.asset_id
      LEFT JOIN booth_items b ON a.booth_id = b.booth_id
      WHERE ca.collection_id = ? ORDER BY a.name`, collectionId) as any[];
  });
  ipcMain.handle('collection:remove', async (_e, collectionId: number, assetId: number) => {
    db.exec('DELETE FROM collection_assets WHERE collection_id=? AND asset_id=?', collectionId, assetId);
    return { ok: true };
  });
  ipcMain.handle('collection:delete', async (_e, collectionId: number) => {
    db.exec('DELETE FROM collection_assets WHERE collection_id=?', collectionId);
    db.exec('DELETE FROM collections WHERE id=?', collectionId);
    return db.all('SELECT * FROM collections ORDER BY id');
  });

  // ---- 网络任务（下载引擎，计划书 §5.10）----
  ipcMain.handle('net:list', async () => downloader.list());
  ipcMain.handle('net:add', async (_e, task: Partial<NetTask>) => {
    const id = await downloader.enqueue(task.kind || 'download', task.label || '', task.url || '', (task as any).destPath || '');
    return downloader.list();
  });
  ipcMain.handle('net:pause', async (_e, id: number) => { downloader.pause(id); return downloader.list(); });
  ipcMain.handle('net:resume', async (_e, id: number) => { downloader.resume(id); return downloader.list(); });
  ipcMain.handle('net:retry', async (_e, id: number) => { downloader.retry(id); return downloader.list(); });
  ipcMain.handle('net:remove', async (_e, id: number) => { downloader.remove(id); return downloader.list(); });
  ipcMain.handle('net:speed', async (_e, id: number) => downloader.speedSamples(id));

  // ---- 内置浏览器 ----
  ipcMain.handle('browser:open-external', async (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { ok: true };
  });

  // 内置 BOOTH 浏览器窗口：BOOTH 官方对商品/搜索页返回 X-Frame-Options: SAMEORIGIN，
  // 无法在 renderer iframe 内嵌；改为独立子窗口（partition persist:booth 共享登录态），
  // 下载登记仍由 boothSession 的 will-download 统一接管。
  ipcMain.handle('booth:open', async (_e, url: string) => {
    if (!/^https?:\/\//.test(url)) return { ok: false, error: '无效地址' };
    const parent = getWindow();
    const win = new BrowserWindow({
      width: 1280,
      height: 880,
      minWidth: 640,
      minHeight: 480,
      title: 'BOOTH',
      backgroundColor: '#F4F4F2',
      parent: parent ?? undefined,
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:booth',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    try {
      await win.loadURL(url);
      return { ok: true };
    } catch (e: any) {
      win.destroy();
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // 检查 GitHub 最新发布（自动更新提示）
  ipcMain.handle('update:check', async () => {
    return checkUpdate();
  });

  // ---- 设置 ----
  ipcMain.handle('settings:get', async () => {
    return getSettings(db);
  });
  ipcMain.handle('settings:set', async (_e, patch: Partial<Settings>) => {
    for (const [k, v] of Object.entries(patch)) db.kvSet('setting:' + k, JSON.stringify(v));
    return getSettings(db);
  });

  // ---- 保存视图（计划书 §5.9）----
  ipcMain.handle('view:list', async () => db.all('SELECT * FROM saved_views ORDER BY id'));
  ipcMain.handle('view:save', async (_e, name: string, queryJson: string) => {
    db.exec('INSERT INTO saved_views(name,query_json) VALUES(?,?)', name, queryJson);
    return db.all('SELECT * FROM saved_views ORDER BY id');
  });
  ipcMain.handle('view:delete', async (_e, id: number) => {
    db.exec('DELETE FROM saved_views WHERE id=?', id);
    return db.all('SELECT * FROM saved_views ORDER BY id');
  });
  ipcMain.handle('view:apply', async (_e, id: number) => {
    const v = db.get('SELECT * FROM saved_views WHERE id=?', id);
    return v ? JSON.parse((v as any).query_json) : null;
  });

  // ---- Gift 入口（计划书 §5.8）：不硬编码路径，从商品 JSON 取 wish_list / 相关链接 ----
  ipcMain.handle('booth:gift-url', async (_e, id: string) => {
    // BOOTH 的 Gift 是带 authenticity_token 的 CSRF 表单 POST 到 {shop}.booth.pm/cart，
    // 无法在无登录态下静默完成；返回商品页由用户在 iframe 内点「ギフトとして贈る」。
    try {
      const info = await fetchBoothItem(id, { cookie: state.boothCookie });
      saveBoothItem(db, info);
    } catch { /* 抓取失败仍返回商品页 */ }
    return 'https://booth.pm/zh-cn/items/' + id;
  });

  // ---- 下载入口（计划书 §5.10）：入队下载 URL ----
  ipcMain.handle('net:add-url', async (_e, url: string, label: string, destPath?: string) => {
    const id = await downloader.enqueue('download', label, url, destPath || '');
    return downloader.list();
  });

  // ---- 选择文件夹 / 打开文件夹 ----
  ipcMain.handle('dialog:pickFolders', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'multiSelections'] });
    return res.canceled ? [] : res.filePaths;
  });
  ipcMain.handle('dialog:pickFiles', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] });
    return res.canceled ? [] : res.filePaths;
  });
  // ---- 数据备份 / 迁移（计划书 §5.11）----
  ipcMain.handle('db:backup', async () => {
    const win = getWindow();
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const res = await dialog.showSaveDialog(win!, {
      title: '备份数据库',
      defaultPath: 'VRC素材整理-backup-' + stamp + '.db',
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, error: '已取消' };
    try {
      db.backupTo(res.filePath);
      return { ok: true, path: res.filePath };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('db:restore', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: '导入 / 迁移数据库',
      properties: ['openFile'],
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, error: '已取消' };
    const r = db.importFrom(res.filePaths[0]);
    return r;
  });

  ipcMain.handle('db:info', async () => {
    return {
      dataDir: db.dataDir,
      dbPath: db.dbPath,
      cards: (db.get('SELECT COUNT(*) AS n FROM assets') as any)?.n || 0,
      boothItems: (db.get('SELECT COUNT(*) AS n FROM booth_items') as any)?.n || 0,
    };
  });

  // ---- 整理导出素材库（m06142）：按数据库结构存储 + 可移植 + 自动按顺序放文件夹 ----
  ipcMain.handle('library:organize', async (_e, opts: { mode?: 'copy' | 'move' } = {}) => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: '选择整理导出的目标文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, error: '已取消' };
    const target = res.filePaths[0];
    const mode = opts?.mode === 'move' ? 'move' : 'copy';

    const sanitize = (s: string) => (s || '未命名').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
    const pad = (n: number) => String(n).padStart(3, '0');

    // 取所有卡（含分类名、商品名）
    const cards = db.all(`
      SELECT a.*, c.name AS category_name, b.name AS booth_name
      FROM assets a
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN booth_items b ON b.id = a.booth_id
      WHERE a.fold_parent IS NULL
      ORDER BY a.root_key, c.sort, c.id, a.booth_id, a.name`) as any[];

    const manifest: any[] = [];
    let copied = 0, failed = 0;
    const errors: string[] = [];

    // 按 root_key → 分类 分组，组内编号排序
    const counters = new Map<string, number>();
    for (const card of cards) {
      const rootLabel = card.root_key === 'map' ? '地图素材' : '模型素材';
      const catLabel = sanitize(card.category_name || '未分类');
      const groupKey = rootLabel + '/' + catLabel;
      const seq = (counters.get(groupKey) || 0) + 1;
      counters.set(groupKey, seq);

      const idPart = card.booth_id ? card.booth_id + '_' : '';
      const folderName = pad(seq) + '_' + idPart + sanitize(card.name);
      const destDir = path.join(target, rootLabel, catLabel, folderName);

      try {
        fs.mkdirSync(destDir, { recursive: true });
        // 收集该卡磁盘路径：目录卡取最浅公共根目录；文件卡取成员文件
        const members = db.all('SELECT * FROM asset_members WHERE asset_id=? ORDER BY depth, rel_path', card.id) as any[];
        const dirMembers = members.filter((m) => m.member_type === 'dir' && m.path && fs.existsSync(m.path));
        const fileMembers = members.filter((m) => m.member_type !== 'dir' && m.path && fs.existsSync(m.path));
        const copiedPaths: string[] = [];

        const copyOne = (src: string, destBase: string) => {
          const base = path.basename(src);
          const dst = path.join(destBase, base);
          const stat = fs.statSync(src);
          if (stat.isDirectory()) {
            fs.cpSync(src, dst, { recursive: true });
          } else {
            fs.copyFileSync(src, dst);
          }
          copiedPaths.push(path.relative(target, dst));
          if (mode === 'move') {
            try { fs.rmSync(src, { recursive: stat.isDirectory(), force: true }); } catch { /* 忽略 */ }
          }
        };

        if (dirMembers.length) {
          // 目录卡：取最浅公共根目录（depth 最小），避免重复复制嵌套
          const minDepth = Math.min(...dirMembers.map((m) => m.depth));
          const tops = dirMembers.filter((m) => m.depth === minDepth);
          const seen = new Set<string>();
          for (const t of tops) {
            if (seen.has(t.path)) continue;
            seen.add(t.path);
            copyOne(t.path, destDir);
          }
        } else if (fileMembers.length) {
          const seen = new Set<string>();
          for (const f of fileMembers) {
            if (seen.has(f.path)) continue;
            seen.add(f.path);
            copyOne(f.path, destDir);
          }
        }

        manifest.push({
          assetId: card.id,
          name: card.name,
          boothId: card.booth_id,
          category: card.category_name || null,
          rootKey: card.root_key,
          dest: path.relative(target, destDir),
          files: copiedPaths,
        });
        copied++;
      } catch (e: any) {
        failed++;
        errors.push(card.name + ': ' + String(e?.message || e));
      }
    }

    // 可移植：备份数据库 + 写 manifest.json（相对路径映射）
    try {
      const dbDest = path.join(target, 'library.db');
      db.backupTo(dbDest);
      fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        mode,
        totalCards: cards.length,
        copied,
        failed,
        cards: manifest,
      }, null, 2), 'utf8');
      fs.writeFileSync(path.join(target, 'README.txt'),
        'VRC素材整理 · 整理导出\\r\\n' +
        '本目录按数据库结构组织：模型素材/地图素材 → 分类 → 序号_BOOTH编号_素材名。\\r\\n' +
        'library.db 为完整资料库（可用应用「导入/迁移数据库」恢复）。\\r\\n' +
        'manifest.json 记录每张卡到此目录的相对路径映射，便于整体移植。\\r\\n', 'utf8');
    } catch (e: any) {
      errors.push('写入数据库/manifest: ' + String(e?.message || e));
    }

    return { ok: true, target, totalCards: cards.length, copied, failed, errors: errors.slice(0, 20) };
  });

  ipcMain.handle('shell:showItem', async (_e, p: string) => {
    shell.showItemInFolder(p);
    return { ok: true };
  });
  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    shell.openPath(p);
    return { ok: true };
  });

  // ---- 模糊词搜索匹配（m05918）：编号直连失败/无候选时，用关键词搜索 BOOTH 补充候选 ----
  ipcMain.handle('match:search', async (_e, assetId: number, query?: string) => {
    const card = db.get('SELECT * FROM assets WHERE id=?', assetId) as any;
    if (!card) return [];
    const out = await searchCandidates(db, card, (q) => searchBooth(q, { cookie: state.boothCookie }), (id: string) => fetchBoothItem(id, { cookie: state.boothCookie }), (info) => saveBoothItem(db, info), query);
    for (const c of out) {
      db.exec(`INSERT INTO matches(asset_id,booth_id,score,reasons_json,source,state) VALUES(?,?,?,?,?,?) ON CONFLICT(asset_id,booth_id) DO UPDATE SET score=excluded.score,reasons_json=excluded.reasons_json`,
        assetId, c.boothItemId, c.score, JSON.stringify(c.reasons), c.source, matchStateFor(c.score, false, true));
    }
    return out;
  });

  // ---- 手动删除文件（m06064）：移入回收站优先，不可用时永久删除；同步清理 DB 记录 ----
  function trashOrUnlink(target: string): 'trash' | 'unlink' {
    try { shell.trashItem(target); return 'trash'; } catch { /* 回收站不可用 */ }
    try { fs.rmSync(target, { recursive: true, force: true }); return 'unlink'; } catch (e: any) { throw new Error('删除失败：' + (e?.message || String(e))); }
  }

  ipcMain.handle('file:delete', async (_e, assetId: number, targetPath: string) => {
    // 仅允许删除属于该卡片的成员/文件，防越权
    const mem = db.get('SELECT * FROM asset_members WHERE asset_id=? AND path=?', assetId, targetPath) as any;
    const fil = db.get('SELECT * FROM asset_files WHERE asset_id=? AND path=?', assetId, targetPath) as any;
    if (!mem && !fil) return { ok: false, error: '该路径不属于此素材，未删除' };
    if (!fs.existsSync(targetPath)) {
      // 文件已不在磁盘：只清库
      if (mem) db.exec('DELETE FROM asset_members WHERE id=?', mem.id);
      if (fil) db.exec('DELETE FROM asset_files WHERE id=?', fil.id);
      return { ok: true, method: 'db-only' };
    }
    const method = trashOrUnlink(targetPath);
    if (mem) db.exec('DELETE FROM asset_members WHERE id=?', mem.id);
    if (fil) db.exec('DELETE FROM asset_files WHERE id=?', fil.id);
    return { ok: true, method };
  });

  ipcMain.handle('card:delete', async (_e, assetId: number) => {
    const card = db.get('SELECT * FROM assets WHERE id=?', assetId) as any;
    if (!card) return { ok: false, error: '素材不存在' };
    // 收集该卡所有磁盘路径（目录卡=根目录；文件/归档卡=单文件）
    const paths = new Set<string>();
    for (const m of db.all('SELECT path FROM asset_members WHERE asset_id=?', assetId) as any[]) paths.add(m.path);
    for (const f of db.all('SELECT path FROM asset_files WHERE asset_id=?', assetId) as any[]) paths.add(f.path);
    if (card.kind === 'dir' || card.kind === 'fold') {
      // 目录卡：成员 path 通常是目录本身或子项；取最浅公共目录
      const dirPaths = [...paths].filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
      if (dirPaths.length) {
        // 最浅者（根目录）
        dirPaths.sort((a, b) => a.length - b.length);
        paths.clear(); paths.add(dirPaths[0]);
      }
    }
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const p of paths) {
      try { if (fs.existsSync(p)) { trashOrUnlink(p); deleted.push(p); } } catch { failed.push(p); }
    }
    // 清理 DB（有外键的表逐个清）
    for (const t of ['asset_members','asset_files','covers','matches','match_history','asset_keywords','asset_adaptations','related_assets','collection_assets','compat_evidence']) {
      try { db.exec(`DELETE FROM ${t} WHERE asset_id=?`, assetId); } catch { /* 表结构差异忽略 */ }
    }
    try { db.exec('DELETE FROM related_assets WHERE related_id=?', assetId); } catch {}
    db.exec('DELETE FROM assets WHERE id=?', assetId);
    return { ok: failed.length === 0, deleted, failed };
  });

  // ---- 拖入压缩包（renderer 传 File.path）----
  ipcMain.handle('archive:inspect', async (_e, filePath: string, requestedBatchId?: number) => {
    const batchId = requestedBatchId || createImportBatch(db, 'archive:' + filePath, [filePath]);
  const manifest = await inspectArchive(filePath);
    const saved = saveManifest(getDataDir(db), filePath, manifest);
    const before = db.get<{ id: number }>('SELECT id FROM assets WHERE fingerprint=?', manifest.fingerprint);
    const cardId = upsertArchiveCard(db, filePath, manifest);
    if (!before) db.exec('INSERT INTO import_snapshots(root_id,source,kind,asset_ids_json,backup_json) VALUES(?,?,?,?,?)', null, filePath, 'archive', JSON.stringify([cardId]), null);
  refreshCategorySuggestion(db, cardId, manifest.entries.map((e) => e.name));
  linkImportBatch(db, batchId, [cardId]);
    // m04241：拖入后自动用文件名搜索 BOOTH，返回约 3 条候选供选择（编号已自动命中则跳过）
    let candidates: MatchCandidate[] = [];
    db.exec("UPDATE assets SET match_state='pending',score=NULL WHERE id=?",cardId);
    const card = db.get('SELECT * FROM assets WHERE id=?', cardId) as any;
    if (card && card.match_state !== 'auto') {
      try {
        candidates = (await searchCandidates(db, card, (q) => searchBooth(q, { cookie: state.boothCookie }), fetchBoothItem, (info) => saveBoothItem(db, info))).slice(0,4);
      } catch { /* 离线或搜索失败则无候选 */ }
    }
    return { manifest, saved, cardId, name: path.basename(filePath), candidates };
  });

  // ---- 解压 + unitypackage 导入 Unity（m02404）----
  ipcMain.handle('archive:extract', async (_e, filePath: string, destDir?: string) => {
    return extractArchive(filePath, destDir);
  });

  ipcMain.handle('archive:extract-card', async (_e, assetId: number, destDir?: string) => {
    const mems = db.all('SELECT * FROM asset_members WHERE asset_id = ? AND member_type = ?', assetId, 'archive') as any[];
    if (mems.length === 0) return { ok: false, error: '该素材没有可解压的压缩包成员' };
    const done: any[] = [];
    for (const m of mems) {
      const out = destDir || path.join(getDataDir(db), 'extracted', String(assetId), path.basename(m.path, path.extname(m.path)));
      const r = await extractArchive(m.path, out);
      done.push({ member: m.rel_path || m.path, ...r });
    }
    return { ok: done.some((d) => d.ok), results: done };
  });

  ipcMain.handle('asset:open-unitypackage', async (_e, assetId: number) => {
    const mems = db.all('SELECT * FROM asset_members WHERE asset_id = ? AND member_type = ?', assetId, 'archive') as any[];
    const up = mems.find((m: any) => isUnitypackage(m.path));
    if (!up) return { ok: false, error: '该素材未找到 .unitypackage 文件' };
    const err = await shell.openPath(up.path);
    return { ok: !err, path: up.path, error: err || undefined };
  });

  ipcMain.handle('fingerprint:file', async (_e, p: string) => fileFingerprint(p));
  ipcMain.handle('parse:boothRef', async (_e, s: string) => parseBoothRef(s));
}

function getDataDir(db: Db): string {
  return db.dataDir;
}

// 拖入归档 → 建卡：归档文件名 + 内部顶层文件夹名参与匹配（m03766）
function uniqueTopFolders(entries: { name: string; dir: boolean }[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const seg = (e.name || '').split(/[\\/]/)[0].trim();
    if (!seg) continue;
    if (/^[0-9a-f]{32}$/i.test(seg)) continue; // 跳过 unitypackage 的 32 位 guid 顶层目录
    set.add(seg);
  }
  return [...set].slice(0, 12);
}

function upsertArchiveCard(db: Db, filePath: string, manifest: { entries: { name: string; dir: boolean }[]; totalSize: number; fileCount: number; dirCount: number; fingerprint: string }): number {
  const name = path.basename(filePath);
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  const { base, version } = stripVersion(stem);
  const topFolders = uniqueTopFolders(manifest.entries);
  const boothIds = collectBoothIds([name, stem, ...topFolders]);
  const boothId = boothIds.length ? boothIds[0].id : null;
  let matchState = 'pending';
  let score: number | null = null;
  if (boothId) {
    const atStart = boothIds[0].atStart;
    const titleOverlap = boothId.length >= 6 && normalizeName(base).includes(boothId);
    matchState = atStart || titleOverlap ? 'auto' : 'pending';
    score = matchState === 'auto' ? 1 : null;
  }
  const size = manifest.totalSize > 0 ? manifest.totalSize : (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
  const sample = topFolders.length ? (topFolders.join(' | ') + ' | ' + manifest.fileCount + ' 文件') : (manifest.fileCount + ' 文件');
  const existing = db.get<{ id: number }>('SELECT id FROM assets WHERE fingerprint=?', manifest.fingerprint);
  if (existing) {
    db.exec(`UPDATE assets SET name=?,base=?,booth_id=?,match_state=?,score=?,size=?,files=?,dirs=?,version_text=?,sample=?,updated_at=datetime('now') WHERE id=?`,
      name, base, boothId, matchState, score, size, manifest.fileCount, manifest.dirCount, version, sample, existing.id);
    return existing.id;
  }
  const r = db.exec(
    `INSERT INTO assets(name,kind,root_id,root_key,booth_id,match_state,score,size,files,dirs,version_text,base,sample,fingerprint,updated_at,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    name, 'file', null, 'file', boothId, matchState, score, size, manifest.fileCount, manifest.dirCount, version, base, sample, manifest.fingerprint
  );
  const assetId = Number(r.lastInsertRowid);
  db.exec('INSERT INTO asset_members(asset_id,path,rel_path,member_type,role,depth,size,unavailable) VALUES(?,?,?,?,?,?,?,?)',
    assetId, filePath, name, 'archive', 'primary', 0, size, 0);
  db.exec('INSERT INTO imports(root_id,source,kind,stat) VALUES(?,?,?,?)', null, 'file', 'archive', JSON.stringify({ file: filePath, entries: manifest.fileCount }));
  return assetId;
}

function saveBoothItem(db: Db, info: BoothInfo) {
  const exists = db.get('SELECT id FROM booth_items WHERE booth_id=?', info.id);
  const values = [info.name, info.shopName, info.shopSubdomain, info.categoryId, info.categoryName, info.categoryParent, info.url, info.price, info.publishedAt, info.isAdult ? 1 : 0, info.imageUrl, JSON.stringify(info.aliases), info.description, JSON.stringify(info.variations || []), JSON.stringify(info.images || [])];
  if (exists) {
    db.exec(`UPDATE booth_items SET name=?,shop_name=?,shop_subdomain=?,category_id=?,category_name=?,category_parent=?,url=?,price=?,published_at=?,is_adult=?,image_url=?,aliases_json=?,description=?,variations_json=?,images_json=?,fetched_at=datetime('now') WHERE booth_id=?`, ...values, info.id);
  } else {
    db.exec(`INSERT INTO booth_items(booth_id,name,shop_name,shop_subdomain,category_id,category_name,category_parent,url,price,published_at,is_adult,image_url,aliases_json,description,variations_json,images_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, info.id, ...values);
  }
  db.exec('DELETE FROM booth_item_tags WHERE booth_id=?', info.id);
  for (const t of info.tags) db.exec('INSERT OR IGNORE INTO booth_item_tags(booth_id,tag) VALUES(?,?)', info.id, t);
  db.exec('DELETE FROM booth_variations WHERE booth_id=?', info.id);
  for (const v of info.variations || []) {
    db.exec('INSERT INTO booth_variations(booth_id,variation_id,name,price,type,url,downloadable,variation_json) VALUES(?,?,?,?,?,?,?,?)', info.id, v.id, v.name, v.price, v.type, v.url, v.downloadable ? 1 : 0, JSON.stringify(v));
  }
}

function queryGallery(db: Db, q: GalleryQuery): GalleryPage {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.q) { where.push('(a.name LIKE ? OR a.base LIKE ?)'); params.push('%' + q.q + '%', '%' + q.q + '%'); }
  if (q.category != null) { where.push('a.category_id = ?'); params.push(q.category); }
  if (q.matchState) { where.push('a.match_state = ?'); params.push(q.matchState); }
  if (q.rootKey) { where.push('a.root_key = ?'); params.push(q.rootKey); }
  if (q.favorite != null) { where.push('a.favorite = ?'); params.push(q.favorite ? 1 : 0); }
  if (q.keyword) {
    where.push('EXISTS (SELECT 1 FROM asset_keywords k WHERE k.asset_id=a.id AND k.keyword_norm LIKE ?)');
    params.push('%' + normalizeKeyword(q.keyword) + '%');
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get<{ c: number }>(`SELECT COUNT(*) c FROM assets a ${w}`, ...params)?.c || 0;
  const sortMap: Record<string, string> = { name: 'a.name', size: 'a.size', updated: 'a.updated_at' };
  const sort = sortMap[q.sort] || 'a.updated_at';
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  const cards = db.all(`SELECT a.id,a.name,a.kind,a.root_key,a.booth_id,a.match_state,a.score,a.category_id,a.category_reason,a.size,a.files,a.dirs,a.cover_path,a.favorite,a.hidden,a.unavailable,a.version_text,a.updated_at,a.base FROM assets a ${w} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`, ...params, q.limit, q.offset);
  return { total, cards: cards as unknown as CardSummary[] };
}

async function findCandidates(db: Db, card: any, state: { boothCookie: string }): Promise<MatchCandidate[]> {
  const ids = collectBoothIds(evidenceForCard(db, card));
  const out: MatchCandidate[] = [];
  const seen = new Set<string>();
  // 商品编号优先：同时检查卡片名、目录名和包内压缩包名称。
  for (const h of ids) {
    let info: BoothInfo | null = null;
    try { info = await fetchBoothItem(h.id, { cookie: state.boothCookie }); } catch { /* 尝试缓存 */ }
    if (!info) {
      const local = db.get('SELECT * FROM booth_items WHERE booth_id=?', h.id) as any;
      if (local) info = toLocalBooth(local);
    }
    if (info && !seen.has(info.id)) {
      seen.add(info.id); saveBoothItem(db, info);
      const sc = scoreMatch({ cardName: card.name, versionText: card.version_text, keywords: [], author: null }, { name: info.name, aliases: info.aliases, shopName: info.shopName || '', tags: info.tags, variationNames: info.variations?.map((v) => v.name) }, true);
      out.push({ boothItemId: info.id, name: info.name, shopName: info.shopName || '', score: sc.score, reasons: sc.reasons, price: info.price, imageUrl: info.imageUrl, source: 'auto', pinned: false });
    }
  }
  // 无精确编号证据时才用名称搜索；版本包名与作者共同参与打分。
  if (!out.length) {
    const hits = await searchCandidates(db, card, (q) => searchBooth(q, { cookie: state.boothCookie }), (id: string) => fetchBoothItem(id, { cookie: state.boothCookie }), (info) => saveBoothItem(db, info));
    out.push(...hits);
  }
  for (const c of out) {
    db.exec(`INSERT INTO matches(asset_id,booth_id,score,reasons_json,source,state) VALUES(?,?,?,?,?,?) ON CONFLICT(asset_id,booth_id) DO UPDATE SET score=excluded.score,reasons_json=excluded.reasons_json`,
      card.id, c.boothItemId, c.score, JSON.stringify(c.reasons), c.source, matchStateFor(c.score, c.source === 'auto', true));
  }
  return out.sort((a, b) => b.score - a.score);
}

function categoryTree(db: Db): CategoryNode[] {
  const cats = db.all('SELECT c.*, (SELECT COUNT(*) FROM assets a WHERE a.category_id=c.id) AS card_count FROM categories c ORDER BY sort, id');
  const map = new Map<number, CategoryNode>();
  for (const c of cats as any[]) map.set(c.id, { id: c.id, name: c.name, parentId: c.parent_id, builtin: !!c.builtin, sort: c.sort, cardCount: c.card_count, children: [] });
  const roots: CategoryNode[] = [];
  for (const c of map.values()) {
    if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.children.push(c);
    else roots.push(c);
  }
  return roots;
}

function getSettings(db: Db): Settings {
  const g = (k: string, d: string) => { const v = db.kvGet('setting:' + k); return v == null ? d : JSON.parse(v); };
  return {
    dataDir: db.dataDir,
    mode: g('mode', 'portable') as Settings['mode'],
    theme: g('theme', 'system') as Settings['theme'],
    motion: g('motion', 'full') as Settings['motion'],
    maxConcurrency: Number(g('maxConcurrency', '4')),
    rateLimitMs: Number(g('rateLimitMs', '500')),
    keywordCategoryEnabled: g('keywordCategoryEnabled', 'true') === 'true',
    exploreSplitEnabled: g('exploreSplitEnabled', 'true') === 'true',
  };
}


// 本地适配 vs 商品支持（§5.7）：从 asset_members/asset_files 拼 local，从 booth_items 拼 item
function buildCompatEvidenceFor(db: Db, assetId: number): CompatEvidence[] {
  const members = db.all('SELECT rel_path, path, member_type FROM asset_members WHERE asset_id = ? ORDER BY depth, rel_path', assetId) as any[];
  const files = db.all('SELECT ext FROM asset_files WHERE asset_id = ?', assetId) as any[];
  const localTexts: [string, string][] = [];
  for (const m of members) {
    const s = String(m.rel_path || m.path || '');
    if (s) localTexts.push(['本地文件 ' + (m.member_type || 'file'), s]);
  }
  for (const f of files) {
    const e = String(f.ext || '');
    if (e) localTexts.push(['本地扩展名', '.' + e]);
  }
  const card = db.get('SELECT name, base, version_text FROM assets WHERE id = ?', assetId) as any;
  if (card) {
    localTexts.push(['本地名称', String(card.name || '') + ' ' + String(card.base || '') + ' ' + String(card.version_text || '')]);
  }
  const booth = card?.booth_id ? (db.get('SELECT * FROM booth_items WHERE booth_id = ?', card.booth_id) as any) : null;
  const itemTexts: [string, string][] = [];
  if (booth) {
    itemTexts.push(['商品名', String(booth.name || '')]);
    itemTexts.push(['商品介绍', String(booth.description || '').slice(0, 4096)]);
    itemTexts.push(['商品标签', String((booth as any).aliases_json || '')]);
  }
  const localHits = collectCompatHits(localTexts);
  const itemHits = collectCompatHits(itemTexts);
  const evidence = [
    ...buildCompatEvidence('local', localHits),
    ...buildCompatEvidence('item', itemHits),
  ];
  // persist found rows into compat_evidence
  db.exec('DELETE FROM compat_evidence WHERE asset_id = ?', assetId);
  for (const ev of evidence) {
    db.exec('INSERT INTO compat_evidence (asset_id, local_version, booth_version, kind, found, note) VALUES (?, ?, ?, ?, ?, ?)', assetId, null, null, ev.kind, ev.found ? 1 : 0, ev.evidence || null);
  }
  return evidence;
}
