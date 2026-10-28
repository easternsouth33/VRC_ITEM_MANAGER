// 名称归一与编号解析（计划书 §5.2）

export function normalizeName(s: string): string {
  let out = s.normalize('NFKC');
  // 全角 → 半角
  out = out.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 去空白与下划线
  out = out.replace(/[\s_]+/g, '');
  // 小写
  return out.toLowerCase();
}

export function normalizeKeyword(s: string): string {
  return normalizeName(s);
}

// 提取 6-8 位编号，返回编号与位置列表
export function extractBoothIds(text: string): { id: string; pos: number; atStart: boolean }[] {
  const re = /(?<!\d)(\d{6,8})(?!\d)/g;
  const out: { id: string; pos: number; atStart: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ id: m[1], pos: m.index, atStart: /^[\s\[(（【0-9]*$/.test(text.slice(0, m.index)) });
  }
  return out;
}

// 剥离版本/副本后缀，返回 {base, version}
export function stripVersion(text: string): { base: string; version: string | null } {
  const patterns = [
    /v?\d+(?:\.\d+){1,3}(?:[-_.]?[a-zA-Z]{0,8}\d*)?/i,
    /ver\.?\s?\d+(?:\.\d+)*/i,
    /-\s*コピー/i,
    /\(\d+\)/,
    /_copy/i,
    /副本/,
    /\[\d+\]/,
  ];
  let version: string | null = null;
  let base = text;
  for (const p of patterns) {
    const m = base.match(p);
    if (m) { version = m[0]; base = base.replace(p, ''); }
  }
  base = base.replace(/[-_.\s]+$/g, '');
  return { base, version };
}

// 切分英日别名（计划书 §5.2）
export function splitAliases(name: string): string[] {
  return name
    .split(/[\/｜|\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// bigram Dice 相似度（归一后）
export function bigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    if (s.length === 1) set.add(s);
    return set;
  };
  const A = grams(a), B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}
