// 压缩包解压 + unitypackage 导入 Unity（计划书 §3.2、§5.11；m02404）
import * as fs from 'node:fs';
import * as path from 'node:path';
import { open as yauzlOpen } from 'yauzl';
import { zipSlipSafeName } from '../shared/path-tokens';

export interface ExtractResult {
  ok: boolean;
  extracted: number;
  destDir: string;
  error?: string;
}

const ZIP_EXT = new Set(['.zip', '.unitypackage']);
const RAR_EXT = new Set(['.rar']);
const S7Z_EXT = new Set(['.7z']);

function extOf(p: string): string {
  return path.extname(p).toLowerCase();
}

export function isUnitypackage(p: string): boolean {
  return extOf(p) === '.unitypackage';
}

export function isExtractableArchive(p: string): boolean {
  const e = extOf(p);
  return ZIP_EXT.has(e) || RAR_EXT.has(e) || S7Z_EXT.has(e);
}

// 解压 zip（含 unitypackage，yauzl 流式读 + Zip-Slip 防护）
function extractZip(filePath: string, destDir: string): Promise<{ extracted: number }> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    yauzlOpen(filePath, { lazyEntries: true, autoClose: true }, (err: any, zf: any) => {
      if (err || !zf) return reject(err || new Error('open zip failed'));
      let extracted = 0;
      let pending = 0;
      let ended = false;
      let failed: any = null;

      const maybeDone = () => {
        if (ended && pending === 0) {
          if (failed) reject(failed);
          else resolve({ extracted });
        }
      };

      zf.on('entry', (entry: any) => {
        const safe = zipSlipSafeName(entry.fileName);
        if (!safe) { zf.readEntry(); return; }
        const outPath = path.join(destDir, safe);
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(outPath, { recursive: true });
          zf.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        pending++;
        zf.openReadStream(entry, (err2: any, stream: any) => {
          if (err2) {
            if (!failed) failed = err2;
            pending--;
            maybeDone();
            zf.readEntry();
            return;
          }
          const ws = fs.createWriteStream(outPath);
          stream.pipe(ws);
          ws.on('finish', () => { extracted++; pending--; zf.readEntry(); });
          ws.on('error', (we: any) => { if (!failed) failed = we; pending--; maybeDone(); zf.readEntry(); });
        });
      });
      zf.on('end', () => { ended = true; maybeDone(); });
      zf.on('error', (e: any) => { if (!failed) failed = e; ended = true; maybeDone(); });
      zf.readEntry();
    });
  });
}

// 解压 rar（node-unrar-js，wasm 由 build.mjs 复制到 dist/main/unrar.wasm）
async function extractRar(filePath: string, destDir: string): Promise<{ extracted: number }> {
  const { createExtractorFromFile } = await import('node-unrar-js');
  fs.mkdirSync(destDir, { recursive: true });
  const wasmBinary = fs.readFileSync(path.join(__dirname, 'unrar.wasm'));
  const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: destDir, wasmBinary });
  const arc = extractor.extract();
  let extracted = 0;
  for (const _f of arc.files) extracted++;
  return { extracted };
}

// 解压 7z（7z-wasm，NODEFS 挂载真实目录，wasm 由 build.mjs 复制到 dist/main/7zz.wasm）
async function extract7z(filePath: string, destDir: string): Promise<{ extracted: number }> {
  const SevenZip = (await import('7z-wasm')).default;
  fs.mkdirSync(destDir, { recursive: true });
  const sz = await SevenZip({
    locateFile: (p: string) => (p === '7zz.wasm' ? path.join(__dirname, '7zz.wasm') : p),
  });
  const inDir = path.dirname(filePath);
  const base = path.basename(filePath);
  sz.FS.mkdir('/in');
  sz.FS.mount(sz.NODEFS, { root: inDir }, '/in');
  sz.FS.mkdir('/out');
  sz.FS.mount(sz.NODEFS, { root: destDir }, '/out');
  const before = countFiles(destDir);
  try {
    sz.callMain(['x', '/in/' + base, '-o/out', '-y']);
  } catch (e) {
    // callMain 在 7z 返回非 0 时抛异常（quit_），此处继续统计已解压文件
  }
  return { extracted: Math.max(0, countFiles(destDir) - before) };
}

function countFiles(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) n += countFiles(p);
      else n++;
    }
  } catch { /* ignore */ }
  return n;
}

// 通用解压入口
export async function extractArchive(filePath: string, destDir?: string): Promise<ExtractResult> {
  const e = extOf(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const out = destDir || path.join(path.dirname(filePath), base + '_extracted');
  if (!ZIP_EXT.has(e) && !RAR_EXT.has(e) && !S7Z_EXT.has(e)) {
    return { ok: false, extracted: 0, destDir: out, error: '不支持的压缩格式：' + e };
  }
  try {
    let extracted = 0;
    if (ZIP_EXT.has(e)) extracted = (await extractZip(filePath, out)).extracted;
    else if (RAR_EXT.has(e)) extracted = (await extractRar(filePath, out)).extracted;
    else extracted = (await extract7z(filePath, out)).extracted;
    return { ok: true, extracted, destDir: out };
  } catch (err: any) {
    return { ok: false, extracted: 0, destDir: out, error: err?.message || String(err) };
  }
}
