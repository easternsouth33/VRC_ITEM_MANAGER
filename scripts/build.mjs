// 构建脚本：用 esbuild 打 main / preload / renderer
// 本会话不能写 .npmrc，镜像用环境变量传入；esbuild 二进制路径用绝对路径绕过 require.resolve
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// esbuild.exe 真实位置（pnpm .pnpm 仓库里），bin/esbuild 的 shim 走 require.resolve 会失败
const ESBUILD_EXE = resolve(root, 'node_modules/.pnpm/@esbuild+win32-x64@0.28.0/node_modules/@esbuild/win32-x64/esbuild.exe');
process.env.ESBUILD_BINARY_PATH = ESBUILD_EXE;

const outDir = resolve(root, 'dist');
const external = ['electron', 'node:sqlite', 'node:path', 'node:fs', 'node:fs/promises', 'node:os', 'node:crypto', 'node:child_process', 'node:util', 'node:stream', 'node:events', 'node:url'];

async function buildMain() {
  await build({
    entryPoints: [resolve(root, 'src/main/index.ts')],
    outfile: resolve(outDir, 'main/index.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external,
    sourcemap: 'inline',
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production') },
    logLevel: 'info',
  });
}

async function buildPreload() {
  await build({
    entryPoints: [resolve(root, 'src/preload/index.ts')],
    outfile: resolve(outDir, 'preload/index.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron'],
    sourcemap: 'inline',
    logLevel: 'info',
  });
}

async function buildRenderer() {
  mkdirSync(resolve(outDir, 'renderer'), { recursive: true });
  const staticDirs = ['assets', 'fonts', 'covers'];
  for (const d of staticDirs) {
    const src = resolve(root, 'ui-mockup', d);
    const dst = resolve(outDir, 'renderer', d);
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  }
  const htmlSrc = resolve(root, 'src/renderer/index.html');
  const html = readFileSync(htmlSrc, 'utf8');
  writeFileSync(resolve(outDir, 'renderer/index.html'), html);
  // 终末地圆盘：把 assets/dial.js 原样内联成 dist/renderer/dial.js（<script src> 载入后挂 window.drawDial）
  const dialSrc = resolve(root, 'ui-mockup/assets/dial.js');
  if (existsSync(dialSrc)) {
    // dial.js 是 ES module（export function drawDial），普通 script 载入不挂 window——改写为 window.drawDial 全局
    let src = readFileSync(dialSrc, 'utf8');
    src = src.replace(/export\s+function\s+drawDial/, 'window.drawDial = function drawDial');
    writeFileSync(resolve(outDir, 'renderer/dial.js'), src);
  }

  await build({
    entryPoints: [resolve(root, 'src/renderer/main.tsx')],
    outfile: resolve(outDir, 'renderer/app.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome156',
    jsx: 'automatic',
    sourcemap: false,
    minify: true,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    logLevel: 'info',
  });
}

// 复制解压库 wasm 到 dist/main（主进程 __dirname 定位，unrar/7z 解压需要）
function copyWasm() {
  const pairs = [
    ['node_modules/node-unrar-js/dist/js/unrar.wasm', 'dist/main/unrar.wasm'],
    ['node_modules/7z-wasm/7zz.wasm', 'dist/main/7zz.wasm'],
  ];
  for (const [src, dst] of pairs) {
    const s = resolve(root, src);
    const d = resolve(root, dst);
    if (existsSync(s)) {
      mkdirSync(dirname(d), { recursive: true });
      cpSync(s, d);
      console.log('wasm copy ->', dst);
    }
  }
}

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  await buildMain();
  await buildPreload();
  await buildRenderer();
  copyWasm();
  console.log('build ok ->', outDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
