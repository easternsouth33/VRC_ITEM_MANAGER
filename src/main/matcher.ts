import type { Db } from './db';
import type { BoothInfo, MatchCandidate } from '../shared/types';
import { collectBoothIds, splitAuthorSuffix } from '../shared/booth-id';
import { scoreMatch, DROP_THRESHOLD } from '../shared/score';
import { normalizeName } from '../shared/normalize';

export interface MatchStore {
  save(info: BoothInfo): void;
  local(id: string): BoothInfo | undefined;
  keywords(assetId: number): string[];
}

export function matchQueries(card: any, manual?: string) {
  const base = (manual?.trim() || card.base || card.name || '').trim();
  const raw = String(base).replace(/\.(zip|rar|7z|unitypackage|fbx|vrm)$/i, '');
  const cleaned = raw.replace(/[\(\[\{（【][^\)\]\}）】]*[\)\]\}）】]/g, ' ')
    .replace(/(?<!\d)\d{6,8}(?!\d)/g, ' ').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const withoutVersion = cleaned.replace(/\b(?:v|ver(?:sion)?)\s*\d+(?:\.\d+){0,3}[a-z0-9-]*\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const author = splitAuthorSuffix(raw).author;
  const words = withoutVersion.split(/[\s/／|｜]+/).filter((w: string) => w.length >= 2 && !/^\d+$/.test(w));
  const queries: string[] = [];
  const add = (q: string) => { q = q.trim(); if (q && q.length <= 100 && !queries.includes(q)) queries.push(q); };
  add(raw); if (withoutVersion) add(withoutVersion);
  if (author && words.length) add(words[0] + ' ' + author);
  if (words.length >= 2) add(words.slice(0, 2).join(' '));
  if (words.length) add(words[0]);
  return queries.slice(0, 5);
}

export function evidenceForCard(db: Db, card: any) {
  const archives = db.all("SELECT rel_path FROM asset_members WHERE asset_id=? AND member_type='archive'", card.id).map((r: any) => r.rel_path);
  return [card.name, card.base, ...archives].filter(Boolean);
}

export function scoreCandidate(db: Db, card: any, info: BoothInfo, idExact: boolean) {
  const keywords = db.all('SELECT keyword FROM asset_keywords WHERE asset_id=?', card.id).map((r: any) => r.keyword);
  const author = splitAuthorSuffix(card.name).author;
  return scoreMatch({ cardName: card.name, versionText: card.version_text, keywords, author }, {
    name: info.name, aliases: info.aliases, shopName: info.shopName || '', shopSubdomain: info.shopSubdomain,
    tags: info.tags || [], variationNames: info.variations?.map((v) => v.name) || [],
  }, idExact);
}

export function toLocalBooth(row: any): BoothInfo {
  return {
    ...row, id: String(row.id || row.booth_id), shopName: row.shop_name || row.shopName || '', shopSubdomain: row.shop_subdomain || null,
    categoryId: row.category_id || null, categoryName: row.category_name || null, categoryParent: row.category_parent || null,
    wishListUrl: row.wish_list_url || null, publishedAt: row.published_at || null, isAdult: !!row.is_adult,
    imageUrl: row.image_url || null, images: row.image_url ? [row.image_url] : [], variations: [],
    aliases: (() => { try { return JSON.parse(row.aliases_json || '[]'); } catch { return []; } })(),
    tags: row.tags || [],
  } as BoothInfo;
}

export async function searchCandidates(
  db: Db, card: any,
  search: (query: string) => Promise<any[]>,
  fetchItem: (id: string) => Promise<BoothInfo>,
  save: (info: BoothInfo) => void,
  manual?: string,
): Promise<MatchCandidate[]> {
  const exactIds = new Set(collectBoothIds(evidenceForCard(db, card)).map((x) => x.id));
  const found = new Map<string, MatchCandidate>();
  for (const query of matchQueries(card, manual)) {
    let hits: any[];
    try { hits = await search(query); } catch { continue; }
    // 每个查询取前六项补充详情，限制请求总量；详情并发最多 3。
    const queue = hits.slice(0, 6).filter((h) => !found.has(String(h.id)));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (cursor < queue.length) {
        const hit = queue[cursor++];
        const id = String(hit.id);
        let info: BoothInfo | null = null;
        try { info = await fetchItem(id); } catch { /* 保留搜索结果 */ }
        if (info) save(info);
        const fallback = toLocalBooth({ booth_id: id, name: hit.name, shop_name: hit.brand, image_url: hit.imageUrl, price: hit.price });
        const target = info || fallback;
        const sc = scoreCandidate(db, card, target, exactIds.has(id));
        if (sc.score < DROP_THRESHOLD) continue;
        found.set(id, {
          boothItemId: id, name: target.name, shopName: target.shopName || hit.brand || '', score: sc.score,
          reasons: [...sc.reasons, '检索词：' + query], price: target.price || hit.price,
          imageUrl: target.imageUrl || hit.imageUrl, source: exactIds.has(id) ? 'auto' : 'search', pinned: false,
        });
      }
    }));
    if (found.size >= 10) break;
  }
  return [...found.values()].sort((a, b) => b.score - a.score || a.boothItemId.localeCompare(b.boothItemId)).slice(0, 10);
}
