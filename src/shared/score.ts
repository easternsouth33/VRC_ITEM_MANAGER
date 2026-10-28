// 匹配打分（计划书 §5.4）
import { normalizeName, bigramDice } from './normalize';

export interface ScoreInput {
  cardName: string;          // 目录/归档名（未剥离版本）
  versionText: string | null;
  keywords: string[];        // 卡片手动关键词
  author: string | null;     // 解析出的作者后缀
}

export interface ScoreTarget {
  name: string;
  aliases: string[];
  shopName: string;
  tags: string[];
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

// 标题相似：与商品名及各别名取最大 bigram Dice
export function titleSimilarity(cardName: string, target: ScoreTarget): number {
  const c = normalizeName(cardName);
  const names = [target.name, ...target.aliases].map(normalizeName);
  let best = 0;
  for (const n of names) best = Math.max(best, bigramDice(c, n));
  return best;
}

export function scoreMatch(input: ScoreInput, target: ScoreTarget, boothIdExact: boolean): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  if (boothIdExact) {
    score += 1.0;
    reasons.push('编号命中');
  }

  const title = titleSimilarity(input.cardName, target);
  if (title > 0.5) {
    score += 0.40 * title;
    if (title > 0.6) reasons.push(`标题相似 ${Math.round(title * 100)}%`);
  }

  if (input.author) {
    const a = normalizeName(input.author);
    const shop = normalizeName(target.shopName);
    const aliases = target.aliases.map(normalizeName);
    if (shop && (shop.includes(a) || a.includes(shop) || aliases.some((x) => x.includes(a)))) {
      score += 0.20;
      reasons.push(`作者命中：${input.author}`);
    }
  }

  if (input.versionText && target.name.toLowerCase().includes(input.versionText.toLowerCase())) {
    score += 0.10;
    reasons.push('版本一致');
  }

  if (input.keywords.length) {
    const hay = normalizeName([target.name, ...target.aliases, target.shopName, ...target.tags].join(' '));
    for (const kw of input.keywords) {
      if (hay.includes(normalizeName(kw))) {
        score += 0.15;
        reasons.push(`关键词命中：${kw}`);
      }
    }
  }

  const tagInter = target.tags.filter((t) => /vrc|vrchat|アバター|ワールド/i.test(t)).length;
  if (tagInter > 0) {
    score += 0.05;
    reasons.push('VRChat 标签');
  }

  score = Math.min(score, 1.0);
  return { score: Math.round(score * 100) / 100, reasons };
}

export function matchStateFor(score: number, boothIdExact: boolean, titleOverlap: boolean): 'auto' | 'suggested' {
  // 编号精确命中但标题零重叠 → 降为 suggested（计划书 §5.4）
  if (boothIdExact && titleOverlap) return 'auto';
  if (score >= 0.85) return 'auto';
  if (score >= 0.55) return 'suggested';
  return 'suggested'; // 兜底；调用方在 <0.55 时丢弃
}

export const DROP_THRESHOLD = 0.55;
