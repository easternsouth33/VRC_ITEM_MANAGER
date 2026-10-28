// SQLite 数据层（node:sqlite，计划书 §4 数据模型）
import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface DbOpts {
  dataDir: string;
}

export class Db {
  db: DatabaseSync;
  dataDir: string;
  dbPath: string;

  constructor(opts: DbOpts) {
    this.dataDir = opts.dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.dbPath = path.join(this.dataDir, 'library.db');
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  migrate() {
    this.db.exec(SCHEMA);
    this.migrateColumns();
  }

  // 对已存在的旧库补列（CREATE TABLE IF NOT EXISTS 不会加新列）
  private migrateColumns() {
    const cols = (table: string) => {
      const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      return new Set(rows.map((r) => r.name));
    };
    try {
      if (!cols('net_tasks').has('dest_path')) {
        this.db.exec('ALTER TABLE net_tasks ADD COLUMN dest_path TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
    try {
      if (!cols('collections').has('query_json')) {
        this.db.exec('ALTER TABLE collections ADD COLUMN query_json TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
    try {
      if (!cols('assets').has('last_opened_at')) {
        this.db.exec('ALTER TABLE assets ADD COLUMN last_opened_at TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
    try {
      if (!cols('assets').has('edited_at')) {
        this.db.exec('ALTER TABLE assets ADD COLUMN edited_at TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
    try {
      if (!cols('booth_items').has('description')) {
        this.db.exec('ALTER TABLE booth_items ADD COLUMN description TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
    try {
      if (!cols('assets').has('fingerprint')) {
        this.db.exec('ALTER TABLE assets ADD COLUMN fingerprint TEXT');
      }
    } catch (e) { /* 表不存在或已加列 */ }
  }

  exec(sql: string, ...params: any[]) {
    return this.db.prepare(sql).run(...params);
  }

  all<T = Record<string, unknown>>(sql: string, ...params: any[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, ...params: any[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  kvGet(key: string): string | null {
    const r = this.get<{ v: string }>('SELECT v FROM kv WHERE k = ?', key);
    return r ? r.v : null;
  }

  kvSet(key: string, v: string) {
    this.exec('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', key, v);
  }

  // 备份：VACUUM INTO 输出一致的单文件快照（计划书 §5.11 数据备份迁移）
  backupTo(destPath: string): void {
    fs.rmSync(destPath, { force: true });
    this.db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
  }

  // 迁移导入：校验为 VRC素材整理 数据库后替换当前库（原库保留为 .pre-import.bak）
  importFrom(srcPath: string): { ok: boolean; error?: string } {
    let test: DatabaseSync;
    try {
      test = new DatabaseSync(srcPath, { readOnly: true });
    } catch {
      return { ok: false, error: '不是有效的 SQLite 数据库文件' };
    }
    let hasAssets = false;
    try {
      hasAssets = !!test.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'").get();
    } catch { /* 继续 */ }
    test.close();
    if (!hasAssets) return { ok: false, error: '该文件不是 VRC素材整理 数据库（缺少 assets 表）' };

    // 当前库 checkpoint 后备份，再替换
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* 忽略 */ }
    this.db.close();
    const bak = this.dbPath + '.pre-import.bak';
    try { fs.rmSync(bak, { force: true }); } catch { /* 忽略 */ }
    fs.copyFileSync(this.dbPath, bak);
    fs.copyFileSync(srcPath, this.dbPath);
    for (const suf of ['-wal', '-shm']) {
      try { fs.rmSync(this.dbPath + suf, { force: true }); } catch { /* 忽略 */ }
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
    return { ok: true };
  }

  close() {
    this.db.close();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'folder',
  unavailable INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_scan_at TEXT,
  card_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id INTEGER,
  source TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'scan',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  stat TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dir',
  root_id INTEGER,
  root_key TEXT,
  booth_id TEXT,
  match_state TEXT NOT NULL DEFAULT 'pending',
  score REAL,
  category_id INTEGER,
  category_reason TEXT,
  category_manual_id INTEGER,
  size INTEGER NOT NULL DEFAULT 0,
  files INTEGER NOT NULL DEFAULT 0,
  dirs INTEGER NOT NULL DEFAULT 0,
  cover_path TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  unavailable INTEGER NOT NULL DEFAULT 0,
  version_text TEXT,
  note TEXT,
  base TEXT,
  sample TEXT,
  fingerprint TEXT,
  fold_of INTEGER,
  fold_parent INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  member_type TEXT NOT NULL DEFAULT 'file',
  role TEXT NOT NULL DEFAULT 'primary',
  depth INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  unavailable INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  ext TEXT,
  size INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS covers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER,
  booth_id TEXT,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  width INTEGER,
  height INTEGER
);

CREATE TABLE IF NOT EXISTS booth_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booth_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  shop_name TEXT,
  shop_subdomain TEXT,
  category_id TEXT,
  category_name TEXT,
  category_parent TEXT,
  url TEXT,
  price TEXT,
  published_at TEXT,
  is_adult INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  raw_json TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booth_item_tags (
  booth_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (booth_id, tag)
);

CREATE TABLE IF NOT EXISTS booth_variations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booth_id TEXT NOT NULL,
  variation_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  booth_id TEXT NOT NULL,
  score REAL NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'auto',
  pinned INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'suggested',
  UNIQUE(asset_id, booth_id)
);

CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  booth_id TEXT,
  action TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER,
  op TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  builtin INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'match',
  keyword_norm TEXT NOT NULL,
  category_id INTEGER,
  weight REAL NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'builtin',
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  desc TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_assets (
  collection_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS related_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  related_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS compat_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  local_version TEXT,
  booth_version TEXT,
  kind TEXT NOT NULL DEFAULT 'unknown',
  found INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS net_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  dest_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  bytes_total INTEGER NOT NULL DEFAULT 0,
  bytes_done INTEGER NOT NULL DEFAULT 0,
  retry INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS net_speed_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  ts INTEGER NOT NULL,
  bps INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS booth_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booth_id TEXT,
  name TEXT,
  url TEXT,
  state TEXT NOT NULL DEFAULT 'unknown',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT
);

CREATE TABLE IF NOT EXISTS asset_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  keyword_norm TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keyword_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'match',
  keyword_norm TEXT NOT NULL,
  category_id INTEGER,
  weight REAL NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'builtin',
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS category_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  keyword_norm TEXT NOT NULL,
  keyword TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'zh',
  builtin INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_assets_root ON assets(root_id);
CREATE INDEX IF NOT EXISTS idx_assets_match ON assets(match_state);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_fold ON assets(fold_of);
CREATE INDEX IF NOT EXISTS idx_members_asset ON asset_members(asset_id);
CREATE INDEX IF NOT EXISTS idx_files_asset ON asset_files(asset_id);
CREATE INDEX IF NOT EXISTS idx_matches_asset ON matches(asset_id);
CREATE INDEX IF NOT EXISTS idx_keywords_asset ON asset_keywords(asset_id);

CREATE TABLE IF NOT EXISTS asset_adaptations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  avatar_name TEXT NOT NULL,
  avatar_norm TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adapt_asset ON asset_adaptations(asset_id);
`;
