// BOOTH 编号解析与 URL 归一
import { extractBoothIds, normalizeName } from './normalize';

export interface BoothIdHit {
  id: string;
  pos: number;
  atStart: boolean;
}

// 从目录名/归档名/成员名/readme 收集编号（计划书 §5.2）
export function collectBoothIds(sources: string[]): BoothIdHit[] {
  const hits: BoothIdHit[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    for (const h of extractBoothIds(src)) {
      if (!seen.has(h.id)) { seen.add(h.id); hits.push(h); }
    }
  }
  // 编号位于开头者优先，其次按出现顺序
  return hits.sort((a, b) => Number(b.atStart) - Number(a.atStart) || a.pos - b.pos);
}

// 解析用户手填的链接/编号（计划书 §5.4）
export function parseBoothRef(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // 纯数字
  if (/^\d{6,8}$/.test(s)) return s;
  // URL / 片段
  const m = s.match(/booth\.pm\/(?:ja\/)?items\/(\d{6,8})/i)
    || s.match(/([a-z0-9-]+)\.booth\.pm\/items\/(\d{6,8})/i);
  if (m) return m[2] || m[1];
  // 纯编号兜底
  const any = extractBoothIds(s);
  return any.length ? any[0].id : null;
}

// 解析作者前缀/后缀（-作者 或 作者-）
export function splitAuthorSuffix(name: string): { title: string; author: string | null } {
  const n = normalizeName(name);
  const m = n.match(/^(.+?)[-–—]([^-–—]{1,24})$/);
  if (m && !/\d/.test(m[2])) {
    return { title: m[1], author: m[2] };
  }
  return { title: name, author: null };
}
