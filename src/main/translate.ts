import type { BoothInfo, BoothVariation } from '../shared/types';

export interface BoothTranslation {
  id: string;
  name: string;
  description: string | null;
  variations: { id: string; name: string; translatedName: string }[];
  source: 'mymemory';
  translatedAt: string;
}

// 仅翻译用于阅读的中文/英文/日文文本；原始标题、别名始终独立保留。
export function needsTranslation(text: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text) && !/[\u4e00-\u9fff]/.test(text.replace(/[\u3040-\u30ff]/g, ''));
}

export async function translateText(text: string): Promise<string> {
  const value = text.trim();
  if (!value) return '';
  const source = /[\u3040-\u30ff]/.test(value) ? 'ja' : /[\u4e00-\u9fff]/.test(value) ? 'zh-CN' : 'en';
  if (source === 'zh-CN') return value;
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(value) + '&langpair=' + source + '|zh-CN';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'VRCAssetLibrary/1.0' }, signal: controller.signal });
    if (!res.ok) throw new Error('翻译服务 HTTP ' + res.status);
    const json = await res.json() as any;
    const result = json?.responseData?.translatedText;
    if (!result || json.responseStatus !== 200) throw new Error(typeof json?.responseDetails === 'string' ? json.responseDetails : '翻译结果为空');
    return String(result).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  } finally { clearTimeout(timer); }
}

export async function translateBoothItem(info: BoothInfo, existing?: BoothTranslation | null): Promise<BoothTranslation> {
  if (existing && existing.id === info.id) return existing;
  const description = info.description ? info.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').slice(0, 450) : null;
  const [name, translatedDescription, ...variationNames] = await Promise.all([
    translateText(info.name), description ? translateText(description) : Promise.resolve(null),
    ...info.variations.slice(0, 16).map((v) => translateText(v.name)),
  ]);
  return {
    id: info.id, name, description: translatedDescription,
    variations: info.variations.slice(0, 16).map((v: BoothVariation, i: number) => ({ id: v.id, name: v.name, translatedName: variationNames[i] || v.name })),
    source: 'mymemory', translatedAt: new Date().toISOString(),
  };
}
