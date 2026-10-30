import type { Db } from './db';
import { normalizeName } from '../shared/normalize';
import { mapBoothCategory } from '../shared/category-map';

export interface ClothingEvidence { term: string; source: string; weight: number }
export interface CategorySuggestion { category: '服装'; confidence: number; reasons: string[]; evidence: ClothingEvidence[] }

// 服饰命名来自现有衣装包、BOOTH 常用英日名称及 Unity 内部路径。
// 只作为待确认建议，不直接写 category_id；PNG / Materials 不构成贴图分类证据。
const CLOTHING_TERMS: [string, number][] = [
  ['服装',5],['衣服',5],['衣装',6],['洋服',5],['アバター服',7],['アバター衣装',7],
  ['outfit',5],['outfits',5],['clothes',5],['clothing',5],['costume',4],['apparel',5],
  ['dress',5],['dresses',5],['onepiece',4],['one-piece',4],['ワンピース',5],
  ['shirt',4],['tshirt',4],['t-shirt',4],['blouse',4],['sweater',4],['hoodie',4],['parka',4],['jacket',4],['coat',4],
  ['シャツ',4],['ブラウス',4],['セーター',4],['パーカー',4],['ジャケット',4],['コート',4],['セーラー服',5],
  ['skirt',4],['pants',4],['shorts',4],['uniform',4],['swimsuit',4],['bikini',4],['lingerie',4],[' underwear',4],
  ['スカート',4],['パンツ',4],['ズボン',4],['制服',4],['水着',4],['下着',4],
  ['shoe',5],['shoes',5],['boots',5],['booties',5],['sneakers',5],['heels',5],['sandals',5],['socks',5],['stockings',5],
  ['鞋',5],['鞋子',5],['靴',5],['袜子',5],['袜',5],['シューズ',5],['ブーツ',5],['スニーカー',5],['サンダル',5],['靴下',5],['ソックス',5],['ストッキング',5],
];
const PATH_HINTS: [string, number][] = [['/clothes/',3],['/clothing/',3],['/outfit/',3],['/outfits/',3],['/costume/',3],['/dress/',3],['/shoes/',3],['/boots/',3],['/socks/',3],['/衣装/',3],['/服装/',3],['/靴/',3]];
const generic = new Set(['assets','material','materials','texture','textures','tex','png','fbx','prefab','model','models','mesh','vrchat','vrc','avatar','avatars','unitypackage','package','resource','resources','common','default','new','main','body','base','normal','color','mask','emission','shader','shaders','scripts','script','scene','scenes','data','file','files','sample','samples','readme','license']);
const allowed = new Set(['a','b','c','x','y','z']);

export function inferClothing(input: { names?: string[]; paths?: string[]; booth?: any; learned?: { term: string; weight?: number }[] }): CategorySuggestion | null {
  const names = (input.names || []).filter(Boolean);
  const paths = (input.paths || []).filter(Boolean).map((p) => '/' + String(p).replaceAll('\\','/').replace(/^\/+/, '').toLowerCase());
  const evidence: ClothingEvidence[] = [];
  const seen = new Set<string>();
  const add = (term: string, source: string, weight: number) => {
    const key = term + '|' + source;
    if (!seen.has(key)) { seen.add(key); evidence.push({ term, source, weight }); }
  };
  const matchText = (raw: string, source: string) => {
    const text = normalizeName(raw);
    const padded = ' ' + text.replace(/[_\-.\/]+/g,' ') + ' ';
    for (const [term, weight] of CLOTHING_TERMS) {
      const ascii = /^[a-z0-9 -]+$/.test(term);
      if (ascii ? new RegExp('(?:^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?:$|[^a-z0-9])','i').test(padded) : text.includes(normalizeName(term))) add(term, source, weight);
    }
  };
  for (const n of names) matchText(n, '文件名');
  for (const p of paths) {
    matchText(p, '包内路径');
    for (const [hint, weight] of PATH_HINTS) if (p.includes(hint)) add(hint.slice(1,-1), '包内目录', weight);
  }
  const booth = input.booth;
  if (booth) {
    const mapped = mapBoothCategory(booth.categoryName || booth.category_name || null, booth.categoryParent || booth.category_parent || null);
    if (mapped === '服装') add(booth.categoryName || booth.category_name || '衣装', 'BOOTH 分类', 12);
    for (const tag of booth.tags || []) matchText(tag, 'BOOTH 标签');
    for (const v of booth.variations || []) matchText(v.name || '', '商品版本');
  }
  for (const learned of input.learned || []) {
    const term = learned.term.trim();
    if (term.length < 2 || generic.has(normalizeName(term))) continue;
    for (const n of names) if (normalizeName(n).includes(normalizeName(term))) add(term, '已有服装命名', learned.weight || 3);
  }
  if (!evidence.length) return null;
  const confidence = Math.min(0.98, 0.35 + evidence.reduce((n, e) => n + e.weight, 0) * 0.065);
  const reasons = evidence.sort((a,b) => b.weight - a.weight).slice(0,4).map((e) => e.source + '「' + e.term + '」');
  return { category: '服装', confidence, reasons, evidence: evidence.slice(0,12) };
}

export function learnedClothingTerms(db: Db) {
  const rows = db.all(`SELECT a.name, a.sample, a.base FROM assets a JOIN categories c ON c.id=a.category_manual_id WHERE c.name='服装'`) as any[];
  const counts = new Map<string,{term:string;count:number}>();
  for (const row of rows) for (const source of [row.name,row.base,...(row.sample||'').split('|')]) {
    for (const raw of String(source||'').match(/[a-zA-Z][a-zA-Z0-9-]{2,31}|[\u3040-\u30ff\u3400-\u9fff]{2,16}/g) || []) {
      const term = raw.replace(/^\d+|\d+$/g,'').toLowerCase();
      if (generic.has(term) || allowed.has(term) || /^[a-z]\d*$/.test(term) || /\d{5,}/.test(term)) continue;
      const entry = counts.get(term) || {term:raw,count:0}; entry.count++; counts.set(term,entry);
    }
  }
  return [...counts.values()].filter((x) => x.count >= 2).sort((a,b)=>b.count-a.count).slice(0,80).map((x) => ({term:x.term,weight:Math.min(6,2+x.count)}));
}

export function suggestionForAsset(db: Db, assetId: number, extraPaths: string[] = []) {
  const card = db.get('SELECT * FROM assets WHERE id=?', assetId) as any;
  if (!card) return null;
  const paths = db.all('SELECT rel_path FROM asset_members WHERE asset_id=? LIMIT 5000', assetId).map((r:any)=>r.rel_path);
  paths.push(...String(card.sample||'').split('|'),...extraPaths);
  const boothRow = card.booth_id ? db.get('SELECT * FROM booth_items WHERE booth_id=?',card.booth_id) as any : null;
  const booth = boothRow ? {...boothRow,tags:db.all('SELECT tag FROM booth_item_tags WHERE booth_id=?',card.booth_id).map((r:any)=>r.tag),variations:[]} : null;
  return inferClothing({names:[card.name,card.base],paths,booth,learned:learnedClothingTerms(db)});
}

export function suggestAssetCategory(db: Db, assetId: number, extraPaths: string[] = []) {
  const card = db.get('SELECT category_manual_id FROM assets WHERE id=?',assetId) as any;
  if (card?.category_manual_id) return null;
  const suggestion = suggestionForAsset(db,assetId,extraPaths);
  if (!suggestion) return null;
  const category = db.get<{id:number}>("SELECT id FROM categories WHERE name='服装'",);
  return category ? {...suggestion,categoryId:category.id} : null;
}

export function refreshCategorySuggestion(db: Db, assetId: number, extraPaths: string[] = []) {
  const suggestion = suggestAssetCategory(db, assetId, extraPaths);
  if (!suggestion) { db.exec('DELETE FROM category_suggestions WHERE asset_id=?',assetId); return null; }
  db.exec('INSERT INTO category_suggestions(asset_id,category_id,confidence,reasons_json,evidence_json) VALUES(?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET category_id=excluded.category_id,confidence=excluded.confidence,reasons_json=excluded.reasons_json,evidence_json=excluded.evidence_json,created_at=datetime(\'now\')',assetId,suggestion.categoryId,suggestion.confidence,JSON.stringify(suggestion.reasons),JSON.stringify(suggestion.evidence));
  return suggestion;
}
