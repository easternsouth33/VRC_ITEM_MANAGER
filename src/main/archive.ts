// 压缩包清单读取（拖入建卡，计划书 §3.2，只读中央目录不解压）
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface ArchiveEntry {
  name: string;
  size: number;
  dir: boolean;
}

export interface ArchiveManifest {
  format: 'zip' | 'rar' | '7z' | 'unitypackage' | 'unknown';
  entries: ArchiveEntry[];
  totalSize: number;
  fileCount: number;
  dirCount: number;
  fingerprint: string;
}

const ZIP_EXT = new Set(['.zip', '.unitypackage']);
const RAR_EXT = new Set(['.rar']);
const S7Z_EXT = new Set(['.7z']);

function ext(p: string): string {
  return path.extname(p).toLowerCase();
}

// 中央目录清单 → manifest JSON（写入 temp-explore/{sha1}/manifest.json）
export async function inspectArchive(filePath: string): Promise<ArchiveManifest> {
  const e = ext(filePath);
  const fingerprint = fileFingerprint(filePath);
  let manifest: ArchiveManifest = { format: 'unknown', entries: [], totalSize: 0, fileCount: 0, dirCount: 0, fingerprint };

  if (ZIP_EXT.has(e)) {
    manifest.format = e === '.unitypackage' ? 'unitypackage' : 'zip';
    const { open } = await import('yauzl');
    await new Promise<void>((resolve, reject) => {
      open(filePath, { lazyEntries: true, autoClose: true }, (err, zf) => {
        if (err || !zf) return reject(err || new Error('open zip failed'));
        zf.on('entry', (entry: any) => {
          const dir = /\/$/.test(entry.fileName);
          manifest.entries.push({ name: entry.fileName, size: entry.uncompressedSize || 0, dir });
          if (dir) manifest.dirCount++; else manifest.fileCount++;
          manifest.totalSize += entry.uncompressedSize || 0;
          zf.readEntry();
        });
        zf.on('end', () => resolve());
        zf.on('error', reject);
        zf.readEntry();
      });
    });
  } else if (RAR_EXT.has(e)) {
    manifest.format = 'rar';
    try {
      const { createExtractorFromFile } = await import('node-unrar-js');
      const extractor = await createExtractorFromFile({ filepath: filePath });
      const list = extractor.getFileList();
      const arr = Array.isArray(list) ? list : (list as any).fileHeaders || [];
      for (const f of arr as any[]) {
        const dir = !!f.flags.directory;
        const name = f.name;
        const size = Number(f.extractionSize || f.packSize || 0);
        manifest.entries.push({ name, size, dir });
        if (dir) manifest.dirCount++; else manifest.fileCount++;
        manifest.totalSize += size;
      }
    } catch (err) {
      manifest.format = 'unknown';
      manifest.entries = [];
    }
  } else if (S7Z_EXT.has(e)) {
    manifest.format = '7z';
    try {
      // 7z-wasm 提供 l（list）命令，输出文本解析；简化：仅登记文件数（实际清单解析较重，此处给占位）
      manifest.entries = [];
      manifest.format = '7z';
    } catch {
      manifest.format = 'unknown';
    }
  }

  return manifest;
}

function fileFingerprint(p: string): string {
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
    } finally { fs.closeSync(fd); }
    return h.digest('hex');
  } catch { return ''; }
}

// 保存 manifest 到 temp-explore 目录
export function saveManifest(dataDir: string, filePath: string, manifest: ArchiveManifest): string {
  const dir = path.join(dataDir, 'temp-explore', manifest.fingerprint);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'manifest.json');
  fs.writeFileSync(out, JSON.stringify({ source: filePath, ...manifest }, null, 2));
  return out;
}
