// 共享类型定义（main / renderer 共用）

export type CardKind = 'dir' | 'fold' | 'file';

export type MatchState =
  | 'pending'   // 待匹配
  | 'auto'      // 编号直接命中
  | 'suggested' // 高相似候选
  | 'manual'    // 人工选定
  | 'rejected'  // 已排除
  | 'skipped';  // 已跳过

export interface RootInfo {
  id: number;
  path: string;
  label: string;
  kind: 'folder' | 'temp';
  unavailable: boolean;
  enabled: boolean;
  addedAt: string;
  lastScanAt: string | null;
  cardCount: number;
}

export interface MemberInfo {
  path: string;
  relPath: string;
  memberType: 'file' | 'dir' | 'archive';
  role: 'primary' | 'extracted' | 'duplicate' | 'sidecar';
  depth: number;
  size: number;
  unavailable: boolean;
}

export interface BoothInfo {
  id: string;
  name: string;
  shopName: string;
  shopSubdomain: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryParent: string | null;
  url: string;
  description: string | null;
  wishListUrl: string | null;
  price: string | null;
  publishedAt: string | null;
  isAdult: boolean;
  tags: string[];
  imageUrl: string | null;
  aliases: string[];
}

export interface MatchCandidate {
  boothItemId: string;
  name: string;
  shopName: string;
  score: number;
  reasons: string[];
  price: string | null;
  imageUrl: string | null;
  source: 'auto' | 'search' | 'manual';
  pinned: boolean;
}

export interface CompatEvidence {
  dimension: 'local' | 'item';
  key: string;
  label: string;
  kind: 'platform' | 'shader' | 'version' | 'feature';
  found: boolean;
  evidence: string | null;
}

export interface CardSummary {
  id: number;
  name: string;
  kind: CardKind;
  rootId: number;
  rootKey: string;
  boothId: string | null;
  matchState: MatchState;
  score: number | null;
  category: string | null;
  categoryReason: string | null;
  size: number;
  files: number;
  dirs: number;
  coverPath: string | null;
  keywords: string[];
  favorite: boolean;
  hidden: boolean;
  unavailable: boolean;
  versionText: string | null;
  updatedAt: string;
}

export interface CardDetail extends CardSummary {
  members: MemberInfo[];
  extsTop: [string, number][];
  booth: BoothInfo | null;
  candidates: MatchCandidate[];
  sample: string;
  note: string;
  related: { id: number; name: string }[];
  compat: CompatEvidence[] | null;
}

export interface ScanProgress {
  rootId: number;
  dirs: number;
  files: number;
  current: string;
  done: boolean;
}

export interface NetTask {
  id: number;
  kind: string;
  label: string;
  url: string;
  destPath?: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed';
  bytesTotal: number;
  bytesDone: number;
  retry: number;
  error: string | null;
}

export interface NetSpeedSample {
  ts: number;
  bps: number;
}

export interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  builtin: boolean;
  sort: number;
  cardCount: number;
  children: CategoryNode[];
}

export interface GalleryQuery {
  q: string;
  category: number | null;
  matchState: MatchState | null;
  rootKey: string | null;
  keyword: string | null;
  favorite: boolean | null;
  sort: 'name' | 'size' | 'updated';
  dir: 'asc' | 'desc';
  offset: number;
  limit: number;
}

export interface GalleryPage {
  total: number;
  cards: CardSummary[];
}

export interface Settings {
  dataDir: string;
  mode: 'portable' | 'user';
  theme: 'system' | 'light' | 'dark';
  motion: 'full' | 'calm';
  maxConcurrency: number;
  rateLimitMs: number;
  keywordCategoryEnabled: boolean;
  exploreSplitEnabled: boolean;
}
