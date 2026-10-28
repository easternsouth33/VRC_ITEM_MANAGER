// 本地适配 vs 商品支持（计划书 §5.7，需求⑤）
// 两个维度独立检测：local 从本地文件/名称抽证据；item 从 BOOTH 商品名/介绍/标签抽证据。
// 无证据 = 未发现证据（灰色），不是"缺失/不支持"。

export type CompatKind = 'platform' | 'shader' | 'version' | 'feature';

export interface CompatRule {
  key: string;
  label: string;
  kind: CompatKind;
  patterns: RegExp[];
}

export interface CompatEvidence {
  dimension: 'local' | 'item';
  key: string;
  label: string;
  kind: CompatKind;
  found: boolean;
  evidence: string | null; // 命中来源（文件 rel_path / 字段名 + 片段）
}

// 检测规则：pattern 全部不用 g 标志（避免 lastIndex 状态残留）
export const COMPAT_RULES: CompatRule[] = [
  { key: 'PC', label: 'PC', kind: 'platform', patterns: [/\bpc\b/i, /windows/i, /\bwin(?:64|x64)?\b/i] },
  { key: 'Quest', label: 'Quest', kind: 'platform', patterns: [/\bquest\b/i, /\bandroid\b/i] },
  { key: 'VRChat', label: 'VRChat', kind: 'platform', patterns: [/\bvrchat\b/i, /\bvrc(?:hat)?\b/i] },
  { key: 'LilToon', label: 'LilToon', kind: 'shader', patterns: [/\bliltoon\b/i, /\blil[\s_-]?toon\b/i] },
  { key: 'Poiyomi', label: 'Poiyomi', kind: 'shader', patterns: [/\bpoiyomi\b/i, /\bpoi[\s_-]?toon\b/i] },
  { key: 'UTS', label: 'UTS', kind: 'shader', patterns: [/\buts2?\b/i, /unity[\s_-]?chan[\s_-]?toon/i] },
  { key: 'Unity2022', label: 'Unity 2022', kind: 'version', patterns: [/\bunity[\s_-]?2022\b/i, /\b2022\.3/i] },
  { key: 'Unity2019', label: 'Unity 2019', kind: 'version', patterns: [/\bunity[\s_-]?2019\b/i, /\b2019\.4/i] },
  { key: '対応版', label: '対応版', kind: 'feature', patterns: [/対応|对应版|対応版|対応衣装|対応体/] },
];

// 返回命中的规则 key（去重，保序）
export function detectCompatKeys(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const r of COMPAT_RULES) {
    for (const p of r.patterns) {
      if (p.test(text)) { out.push(r.key); break; }
    }
  }
  return out;
}

// 从一组 (来源, 文本) 中提取命中证据，Map<key, 证据字符串>（首次命中优先）
export function collectCompatHits(texts: [string, string][]): Map<string, string> {
  const hits = new Map<string, string>();
  for (const [src, text] of texts) {
    for (const key of detectCompatKeys(text)) {
      if (!hits.has(key)) hits.set(key, src + ': ' + (text.length > 120 ? text.slice(0, 120) + '…' : text));
    }
  }
  return hits;
}

// 生成完整证据列表（未命中的规则 found=false，evidence=null）
export function buildCompatEvidence(dimension: 'local' | 'item', hits: Map<string, string>): CompatEvidence[] {
  return COMPAT_RULES.map((r) => ({
    dimension,
    key: r.key,
    label: r.label,
    kind: r.kind,
    found: hits.has(r.key),
    evidence: hits.get(r.key) || null,
  }));
}
