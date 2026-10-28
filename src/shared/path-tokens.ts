// 路径安全（计划书 §2.4 resolveSafePath）
import * as path from 'node:path';

export function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveSafePath(base: string, ...segments: string[]): string {
  const out = path.resolve(base, ...segments);
  if (!isSubPath(base, out)) throw new Error('路径逃逸：' + out);
  return out;
}

// Zip-Slip 过滤（计划书 §3.2）
export function isSafeEntryName(name: string): boolean {
  const n = name.replace(/\\\\/g, '/');
  if (n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return false;
  const parts = n.split('/');
  if (parts.some((p) => p === '..')) return false;
  return true;
}

export function zipSlipSafeName(name: string): string | null {
  return isSafeEntryName(name) ? name : null;
}
