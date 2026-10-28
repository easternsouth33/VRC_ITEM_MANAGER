// 文件夹扫描 + 折叠检测（计划书 §5.1、§3.1）
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CardKind, MemberInfo, ScanProgress } from '../shared/types';
import { collectBoothIds } from '../shared/booth-id';
import { stripVersion } from '../shared/normalize';

export interface ScanResult {
  name: string;
  kind: CardKind;
  base: string;
  size: number;
  files: number;
  dirs: number;
  members: MemberInfo[];
  extsTop: [string, number][];
  boothIds: { id: string; atStart: boolean }[];
  versionText: string | null;
  sample: string;
  foldedOf: string | null; // 折叠进哪个父卡（null=独立卡）
  children: ScanResult[];
}

const ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.unitypackage', '.vrm', '.fbx', '.blend', '.psd']);
const COVER_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export interface ScanOpts {
  onProgress?: (p: ScanProgress) => void;
}

// 顶层扫描：root 下每个直接子项一张卡
export async function scanRoot(rootDir: string, opts: ScanOpts = {}): Promise<ScanResult[]> {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules');
  const out: ScanResult[] = [];
  let files = 0, dirs = 0;
  for (const e of entries) {
    const full = path.join(rootDir, e.name);
    const r = await scanItem(full, e, 0, opts);
    out.push(r);
    files += r.files;
    dirs += r.dirs;
    opts.onProgress?.({ rootId: 0, dirs, files, current: full, done: false });
  }
  opts.onProgress?.({ rootId: 0, dirs, files, current: '', done: true });
  return out;
}

async function scanItem(full: string, e: fs.Dirent, depth: number, opts: ScanOpts): Promise<ScanResult> {
  if (e.isDirectory()) {
    return scanDir(full, depth, opts);
  }
  if (e.isFile()) {
    return scanFile(full, depth);
  }
  return emptyResult(path.basename(full), 'file');
}

function emptyResult(name: string, kind: CardKind): ScanResult {
  return { name, kind, base: name, size: 0, files: 0, dirs: 0, members: [], extsTop: [], boothIds: [], versionText: null, sample: '', foldedOf: null, children: [] };
}

async function scanDir(full: string, depth: number, opts: ScanOpts): Promise<ScanResult> {
  const name = path.basename(full);
  const { base, version } = stripVersion(name);
  const members: MemberInfo[] = [];
  const exts = new Map<string, number>();
  let size = 0, files = 0, dirs = 0;
  const children: ScanResult[] = [];

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(full, { withFileTypes: true });
  } catch {
    return { ...emptyResult(name, 'dir'), base, versionText: version };
  }

  // 限制深度与数量（计划书 §5.1：单商品最多 5000 目录项、文件 2000）
  const MAX_DEPTH = 24;
  const MAX_ENTRIES = 5000;
  if (depth < MAX_DEPTH) {
    for (const child of entries) {
      if (files + dirs > MAX_ENTRIES) break;
      const cp = path.join(full, child.name);
      if (child.isDirectory()) {
        dirs++;
        members.push({ path: cp, relPath: child.name, memberType: 'dir', role: 'primary', depth, size: 0, unavailable: false });
        if (depth < 4) {
          const sub = await scanDir(cp, depth + 1, opts);
          children.push(sub);
          size += sub.size; files += sub.files;
        }
      } else if (child.isFile()) {
        files++;
        const st = statSize(cp);
        size += st;
        const ext = path.extname(child.name).toLowerCase();
        exts.set(ext, (exts.get(ext) || 0) + 1);
        const mt: MemberInfo['memberType'] = ARCHIVE_EXTS.has(ext) ? 'archive' : 'file';
        members.push({ path: cp, relPath: child.name, memberType: mt, role: 'primary', depth, size: st, unavailable: false });
      }
    }
  }

  const extArr = [...exts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  return {
    name, kind: 'dir', base, size, files, dirs, members, extsTop: extArr,
    boothIds: collectBoothIds([name, ...members.filter((m) => m.memberType === 'archive').map((m) => m.relPath)]).map((h) => ({ id: h.id, atStart: h.atStart })),
    versionText: version,
    sample: entries.slice(0, 40).map((c) => c.name).join(' | '),
    foldedOf: null,
    children,
  };
}

function scanFile(full: string, depth: number): ScanResult {
  const name = path.basename(full);
  const { base, version } = stripVersion(name);
  const ext = path.extname(name).toLowerCase();
  const size = statSize(full);
  const members: MemberInfo[] = [{
    path: full, relPath: name,
    memberType: ARCHIVE_EXTS.has(ext) ? 'archive' : 'file',
    role: 'primary', depth, size, unavailable: false,
  }];
  return {
    name, kind: 'file', base, size, files: 1, dirs: 0, members,
    extsTop: ext ? [[ext, 1]] : [],
    boothIds: collectBoothIds([name]).map((h) => ({ id: h.id, atStart: h.atStart })),
    versionText: version,
    sample: name,
    foldedOf: null,
    children: [],
  };
}

function statSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

// 折叠检测：单一素材包装目录（计划书 §5.1 第六条）
// 规则：目录内只有「同名压缩包 + 同名解压目录」，或只有单个压缩包/单个目录
export function foldSinglePackage(results: ScanResult[]): ScanResult[] {
  return results.map((r) => foldOne(r)).filter((r): r is ScanResult => !!r);
}

function foldOne(r: ScanResult): ScanResult | null {
  if (r.kind !== 'dir' || r.foldedOf) return r;
  // 规则 1：目录内只有一个压缩包，无其他文件（除封面）
  const archives = r.members.filter((m) => m.memberType === 'archive');
  const others = r.members.filter((m) => m.memberType !== 'archive' && !m.path.endsWith('.url'));
  if (archives.length === 1 && others.length === 0) {
    return { ...r, foldedOf: r.base, children: r.children };
  }
  // 规则 2：一个压缩包 + 一个同名解压目录
  if (archives.length === 1 && others.length === 1 && others[0].memberType === 'dir') {
    const arcName = path.basename(archives[0].path, path.extname(archives[0].path)).toLowerCase();
    const dirName = path.basename(others[0].path).toLowerCase();
    if (arcName === dirName || arcName.includes(dirName) || dirName.includes(arcName)) {
      return { ...r, foldedOf: r.base };
    }
  }
  return r;
}

// 目录哈希（指纹：size+mtime+首尾 64KB，计划书 §3.2 去重）
export function fileFingerprint(p: string): string {
  try {
    const st = fs.statSync(p);
    const h = crypto.createHash('sha1');
    h.update(st.size.toString());
    h.update(String(st.mtimeMs));
    const fd = fs.openSync(p, 'r');
    try {
      const head = Buffer.alloc(64 * 1024);
      const headLen = fs.readSync(fd, head, 0, head.length, 0);
      h.update(head.subarray(0, headLen));
      if (st.size > 128 * 1024) {
        const tail = Buffer.alloc(64 * 1024);
        const tailLen = fs.readSync(fd, tail, 0, tail.length, st.size - tail.length);
        h.update(tail.subarray(0, tailLen));
      }
    } finally {
      fs.closeSync(fd);
    }
    return h.digest('hex');
  } catch {
    return '';
  }
}
