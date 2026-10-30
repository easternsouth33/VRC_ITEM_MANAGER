// BOOTH 抓取与搜索（计划书 §5.3）
// Electron 45 内建 Node 24 有全局 fetch
import * as cheerio from 'cheerio';
import type { BoothInfo, BoothVariation } from '../shared/types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36 VRCAssetLibrary/1.0';

export interface BoothFetchOpts {
  cookie?: string;
}

async function getJSON(url: string, opts: BoothFetchOpts = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

// 单品 JSON（计划书 §5.3）
export async function fetchBoothItem(id: string, opts: BoothFetchOpts = {}): Promise<BoothInfo> {
  const url = `https://booth.pm/zh-cn/items/${id}.json`;
  const j = await getJSON(url, opts) as any;
  const tags: string[] = Array.isArray(j.tags) ? j.tags.map((t: any) => t.name) : [];
  const aliases: string[] = [];
  const rawDescription = typeof j.description === 'string' ? j.description : '';
  for (const line of rawDescription.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:英語名|英文名|English(?:\s+name)?|商品名|名称|アセット名|Name)\s*[:：]\s*(.{2,160})/i);
    if (match?.[1]) aliases.push(match[1].trim());
  }
  const variations: BoothVariation[] = Array.isArray(j.variations) ? j.variations.map((v: any) => ({
    id: String(v.id || ''), name: String(v.name || v.type || '下载内容'), price: v.price == null ? null : String(v.price),
    type: v.type || null, url: v.url || null, downloadable: !!(v.downloadable || v.downloads?.length || v.is_downloadable),
  })).filter((v: BoothVariation) => v.name) : [];
  const images: string[] = Array.isArray(j.images) ? j.images.map((im: any) => im.original || im.resized).filter(Boolean) : [];
  const name = j.name || '';
  // 英日别名：商品名里常见用 / 或 ｜ 分隔的别名
  for (const a of name.split(/[/｜|]/)) {
    const t = a.trim();
    if (t && t !== name) aliases.push(t);
  }
  const cat = j.category || {};
  const shop = j.shop || {};
  const description: string | null = typeof j.description === 'string' && j.description.trim() ? j.description.trim() : null;
  // 优先 original 大图（封面清晰），resized 兜底；resized 带 300x300 变体时优先大图
  let img: string | null = null;
  if (Array.isArray(j.images) && j.images.length) {
    const first = j.images[0];
    img = first.original || first.resized || null;
    // 若 original 是超大原图，可用 300x300 变体控制体积：从其他 images 或 resized 找更大尺寸
    if (first.resized && /\/c\/\d+x\d+/.test(first.resized)) {
      img = first.resized.replace(/\/c\/\d+x\d+/, '/c/300x300');
    }
  }
  return {
    id: String(j.id || id),
    name,
    shopName: shop.name || null,
    shopSubdomain: shop.subdomain || null,
    categoryId: cat.id ? String(cat.id) : null,
    categoryName: cat.name || null,
    categoryParent: cat.parent?.name || null,
    url: j.url || `https://booth.pm/zh-cn/items/${id}`,
    description,
    wishListUrl: j.wish_list_url || null,
    price: j.price != null ? String(j.price) : null,
    publishedAt: j.published_at || null,
    isAdult: !!j.is_adult,
    tags,
    imageUrl: img || null,
    images,
    variations,
    aliases: [...new Set(aliases.map((a: string) => a.trim()).filter((a: string) => a && a !== name))],
  };
}

// 搜索页解析（计划书 §5.3）
export interface BoothSearchHit {
  id: string;
  name: string;
  price: string | null;
  category: string | null;
  brand: string | null;
  imageUrl: string | null;
  url: string;
}

export async function searchBooth(query: string, opts: BoothFetchOpts = {}): Promise<BoothSearchHit[]> {
  const url = `https://booth.pm/zh-cn/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const $ = cheerio.load(html);
  const hits: BoothSearchHit[] = [];
  $('li.item-card').each((_i, el) => {
    const $el = $(el);
    const id = $el.attr('data-product-id');
    if (!id) return;
    const name = $el.attr('data-product-name') || $el.find('.item-card__title').text().trim();
    const price = $el.attr('data-product-price') || null;
    const category = $el.attr('data-product-category') || null;
    const brand = $el.attr('data-product-brand') || null;
    const img = $el.find('a.js-thumbnail-image').attr('data-original') || $el.find('img').attr('src') || null;
    const link = $el.find('.item-card__title a').attr('href') || `https://booth.pm/zh-cn/items/${id}`;
    hits.push({ id, name, price, category, brand, imageUrl: img, url: link.startsWith('http') ? link : 'https://booth.pm' + link });
  });
  return hits;
}

// 店铺子域单品 JSON（计划书 §5.3，备用）
export async function fetchShopItem(subdomain: string, id: string, opts: BoothFetchOpts = {}): Promise<BoothInfo | null> {
  try {
    return await fetchBoothItem(id, opts);
  } catch {
    return null;
  }
}

// 已购资料库（计划书 §5.8）：同 session 抓取 accounts.booth.pm/library，解析已购商品。
// 未登录时该页 title 为「ログイン - BOOTH」（实测 9515 字节）。
export interface LibraryItem {
  id: string;
  name: string;
  shop: string | null;
  url: string;
  imageUrl: string | null;
  date: string | null;
}

export async function fetchBoothLibrary(opts: BoothFetchOpts = {}): Promise<{ loggedIn: boolean; items: LibraryItem[] }> {
  const url = 'https://accounts.booth.pm/library';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  // 未登录会落在登录页
  if (/ログイン/.test(title) || /login/i.test(title)) {
    return { loggedIn: false, items: [] };
  }
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  // 资料库条目：常见为指向 /items/{id} 或 /zh-cn/items/{id} 的链接
  $('a[href*="/items/"]').each((_i, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const m = href.match(/\/items\/(\d{6,8})/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);
    // 标题取链接自身文本或其父卡片标题
    let name = $a.text().trim();
    if (!name || name.length < 2) {
      name = $a.closest('li,article,div').find('h2,h3,[class*=title],[class*=name]').first().text().trim();
    }
    if (!name) name = id;
    let imageUrl = $a.find('img').attr('src') || $a.find('img').attr('data-original') || null;
    if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    // 店铺：附近 shop 文本
    let shop: string | null = null;
    const shopEl = $a.closest('li,article,div').find('[class*=shop],[class*=brand]').first();
    if (shopEl.length) shop = shopEl.text().trim() || null;
    let date: string | null = null;
    const dateEl = $a.closest('li,article,div').find('[class*=date],time').first();
    if (dateEl.length) date = dateEl.text().trim() || dateEl.attr('datetime') || null;
    items.push({
      id,
      name,
      shop,
      url: 'https://booth.pm/zh-cn/items/' + id,
      imageUrl,
      date,
    });
  });
  return { loggedIn: true, items };
}
