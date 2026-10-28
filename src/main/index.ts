// 主进程入口（计划书 §2 交付形态）
import { app, BrowserWindow, session, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Db } from './db';
import { registerIpc } from './ipc';
import { DownloadEngine } from './downloader';
import { BUILTIN_CATEGORIES, BUILTIN_KEYWORD_RULES } from '../shared/category-map';
import { normalizeKeyword } from '../shared/normalize';

let mainWindow: BrowserWindow | null = null;
let db: Db | null = null;

// 数据目录双模式（计划书 §2.2）
function resolveDataDir(): string {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portable) {
    return path.join(portable, 'VRCAssetLibraryData');
  }
  return path.join(app.getPath('appData'), 'VRCAssetLibrary');
}

function seedBuiltins(d: Db) {
  // 分类
  for (const [i, name] of BUILTIN_CATEGORIES.entries()) {
    const row = d.get('SELECT id FROM categories WHERE name=?', name);
    if (!row) d.exec('INSERT INTO categories(name,builtin,sort) VALUES(?,1,?)', name, i);
  }
  // 关键词规则（scope=category）
  for (const rule of BUILTIN_KEYWORD_RULES) {
    const cat = d.get('SELECT id FROM categories WHERE name=?', rule.category);
    if (!cat) continue;
    const norm = normalizeKeyword(rule.keyword);
    const exists = d.get("SELECT id FROM keyword_rules WHERE keyword_norm=? AND scope='category'", norm);
    if (!exists) {
      d.exec("INSERT INTO keyword_rules(scope,keyword_norm,category_id,weight,created_by,enabled) VALUES('category',?,?,1,'builtin',1)", norm, (cat as any).id);
    }
    const ck = d.get('SELECT id FROM category_keywords WHERE category_id=? AND keyword_norm=?', (cat as any).id, norm);
    if (!ck) d.exec('INSERT INTO category_keywords(category_id,keyword_norm,keyword,lang,builtin) VALUES(?,?,?,?,1)', (cat as any).id, norm, rule.keyword, rule.lang);
  }
}

async function createWindow() {
  const preload = path.join(__dirname, '..', 'preload', 'index.js');
  const html = path.join(__dirname, '..', 'renderer', 'index.html');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#161616',
    show: true,
    title: 'VRC素材整理',
    webPreferences: {
      preload,
      partition: 'persist:booth',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // 窗口已 show:true 立即显示；ready-to-show 仅作兜底（首帧绘制后确保可见）
  mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show(); });
  await mainWindow.loadFile(html);

  mainWindow.on('closed', () => { mainWindow = null; });
}

function configureSession() {
  // 持久化 BOOTH 登录态（计划书 §5.8）
  const ses = session.defaultSession;
  const partition = 'persist:booth';
  const boothSession = session.fromPartition(partition);
  boothSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  // 允许 boooth 域读取 cookie 到主进程用
  return { ses, boothSession, boothCookieStore: boothSession.cookies };
}

app.whenReady().then(async () => {
  const dataDir = resolveDataDir();
  db = new Db({ dataDir });
  seedBuiltins(db);

  const { boothSession } = configureSession();

  const state = { boothCookie: '', netTasks: new Map<number, AbortController>() };
  const downloader = new DownloadEngine(db, () => mainWindow, 4);
  registerIpc(db, () => mainWindow, state, downloader);
  downloader.resumePending();

  // 下载登记（计划书 §5.8）：BOOTH 商品/资料库下载落到 dataDir/downloads 并写入 net_tasks
  const downloadsDir = path.join(dataDir, 'downloads');
  boothSession.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    const total = item.getTotalBytes();
    const url = item.getURL();
    let dest = item.getSavePath();
    try {
      fs.mkdirSync(downloadsDir, { recursive: true });
      dest = path.join(downloadsDir, filename);
      item.setSavePath(dest);
    } catch { /* 忽略路径覆盖失败，仍用默认路径 */ }
    db?.exec("INSERT INTO net_tasks(kind,label,url,dest_path,status,bytes_total,bytes_done,error) VALUES('library',?,?,?,'done',?,0,NULL)", filename, url, dest, total);
    const w = mainWindow;
    if (w && !w.isDestroyed()) w.webContents.send('net:progress', downloader.list());
  });

  // 从 persist:booth 会话读取 cookie 供 fetch 用
  boothSession.cookies.get({}).then((cookies) => {
    state.boothCookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }).catch(() => {});

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { db?.close(); } catch {}
});
