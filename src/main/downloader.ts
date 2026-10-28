// 网络下载引擎（计划书 §5.10）：并发、暂停/恢复、重试、速度历史、缓存
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Db } from './db';
import type { BrowserWindow } from 'electron';

export interface DownloadTask {
  id: number;
  kind: string;
  label: string;
  url: string;
  destPath: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed';
  bytesTotal: number;
  bytesDone: number;
  retry: number;
  error: string | null;
}

const MAX_RETRY = 3;

export class DownloadEngine {
  private db: Db;
  private getWindow: () => BrowserWindow | null;
  private maxConcurrency: number;
  private running = new Set<number>();
  private controllers = new Map<number, AbortController>();
  private speedHistory = new Map<number, { ts: number; bps: number }[]>();
  private lastSample = new Map<number, { ts: number; bytes: number }>();

  constructor(db: Db, getWindow: () => BrowserWindow | null, maxConcurrency = 4) {
    this.db = db;
    this.getWindow = getWindow;
    this.maxConcurrency = maxConcurrency;
  }

  setConcurrency(n: number) { this.maxConcurrency = n; this.pump(); }

  // 入队（由 IPC 调用）
  async enqueue(kind: string, label: string, url: string, destPath: string): Promise<number> {
    const r = this.db.exec('INSERT INTO net_tasks(kind,label,url,status,dest_path) VALUES(?,?,?,?,?)', kind, label, url, 'queued', destPath);
    const id = Number(r.lastInsertRowid);
    this.pump();
    return id;
  }

  // 恢复所有未完成任务（应用启动时）
  resumePending() {
    const rows = this.db.all('SELECT * FROM net_tasks WHERE status IN (?,?)', 'running', 'queued') as any[];
    for (const r of rows) {
      this.db.exec("UPDATE net_tasks SET status='queued' WHERE id=?", r.id);
    }
    this.pump();
  }

  pump() {
    const free = this.maxConcurrency - this.running.size;
    if (free <= 0) return;
    const queued = this.db.all("SELECT * FROM net_tasks WHERE status='queued' ORDER BY id LIMIT ?", free) as any[];
    for (const t of queued) {
      this.start(t.id);
    }
  }

  async start(id: number) {
    if (this.running.has(id)) return;
    const task = this.db.get('SELECT * FROM net_tasks WHERE id=?', id) as any;
    if (!task) return;
    this.running.add(id);
    this.db.exec("UPDATE net_tasks SET status='running', error=NULL WHERE id=?", id);
    this.emit();
    const ctrl = new AbortController();
    this.controllers.set(id, ctrl);

    try {
      await this.run(task, ctrl.signal);
      this.db.exec("UPDATE net_tasks SET status='done', bytes_done=bytes_total WHERE id=?", id);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 暂停：保持进度，状态由 pause() 写
        this.db.exec("UPDATE net_tasks SET status='paused' WHERE id=?", id);
      } else {
        const retry = (task.retry || 0) + 1;
        if (retry <= MAX_RETRY) {
          this.db.exec("UPDATE net_tasks SET status='queued', retry=?, error=? WHERE id=?", retry, String(e?.message || e));
        } else {
          this.db.exec("UPDATE net_tasks SET status='failed', retry=?, error=? WHERE id=?", retry, String(e?.message || e));
        }
      }
    } finally {
      this.running.delete(id);
      this.controllers.delete(id);
      this.lastSample.delete(id);
      this.emit();
      this.pump();
    }
  }

  async run(task: any, signal: AbortSignal) {
    const dest = task.dest_path || defaultDest(task.url, task.label);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // 断点续传：已存在部分文件则用 Range
    let start = 0;
    try { start = fs.statSync(dest).size; } catch {}
    const headers: Record<string, string> = { 'User-Agent': 'VRC素材整理/1.0' };
    if (start > 0) headers['Range'] = 'bytes=' + start + '-';
    const res = await fetch(task.url, { headers, signal });
    if (start > 0 && res.status !== 206) {
      // 服务器不支持 Range，重头下载
      start = 0;
      fs.writeFileSync(dest, '');
      const res2 = await fetch(task.url, { signal });
      await this.stream(task, res2, dest, signal);
      return;
    }
    if (res.status !== 200 && res.status !== 206) throw new Error('HTTP ' + res.status);
    const total = start + Number(res.headers.get('content-length') || 0);
    if (total > 0) this.db.exec('UPDATE net_tasks SET bytes_total=? WHERE id=?', total, task.id);
    this.db.exec('UPDATE net_tasks SET bytes_done=? WHERE id=?', start, task.id);
    const flag = start > 0 ? 'a' : 'w';
    const fd = fs.openSync(dest, flag);
    try {
      const reader = res.body!.getReader();
      let done = 0;
      const buf: Uint8Array[] = [];
      this.lastSample.set(task.id, { ts: Date.now(), bytes: start });
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf.push(value);
        done += value.length;
        fs.writeSync(fd, value);
        this.db.exec('UPDATE net_tasks SET bytes_done=? WHERE id=?', start + done, task.id);
        this.sampleSpeed(task.id, start + done);
        if (buf.length % 16 === 0) this.emit();
      }
      this.sampleSpeed(task.id, start + done);
      this.emit();
    } finally {
      fs.closeSync(fd);
    }
  }

  async stream(task: any, res: Response, dest: string, signal: AbortSignal) {
    const total = Number(res.headers.get('content-length') || 0);
    if (total > 0) this.db.exec('UPDATE net_tasks SET bytes_total=? WHERE id=?', total, task.id);
    const fd = fs.openSync(dest, 'w');
    try {
      const reader = res.body!.getReader();
      let done = 0;
      this.lastSample.set(task.id, { ts: Date.now(), bytes: 0 });
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        fs.writeSync(fd, value);
        done += value.length;
        this.db.exec('UPDATE net_tasks SET bytes_done=? WHERE id=?', done, task.id);
        this.sampleSpeed(task.id, done);
        if (done % (256 * 1024) === 0) this.emit();
      }
      this.emit();
    } finally {
      fs.closeSync(fd);
    }
  }

  sampleSpeed(id: number, bytes: number) {
    const prev = this.lastSample.get(id);
    if (!prev) return;
    const now = Date.now();
    const dt = (now - prev.ts) / 1000;
    if (dt < 0.5) return;
    const bps = (bytes - prev.bytes) / dt;
    this.lastSample.set(id, { ts: now, bytes });
    let arr = this.speedHistory.get(id) || [];
    arr.push({ ts: now, bps: Math.max(0, Math.round(bps)) });
    if (arr.length > 60) arr = arr.slice(-60);
    this.speedHistory.set(id, arr);
    this.db.exec('INSERT INTO net_speed_samples(task_id,ts,bps) VALUES(?,?,?)', id, now, Math.round(bps));
  }

  pause(id: number) {
    const c = this.controllers.get(id);
    if (c) { c.abort(); this.controllers.delete(id); }
    else this.db.exec("UPDATE net_tasks SET status='paused' WHERE id=?", id);
  }

  resume(id: number) {
    this.db.exec("UPDATE net_tasks SET status='queued', error=NULL WHERE id=?", id);
    this.pump();
  }

  retry(id: number) {
    this.db.exec("UPDATE net_tasks SET status='queued', retry=0, error=NULL, bytes_done=0 WHERE id=?", id);
    this.pump();
  }

  remove(id: number) {
    this.pause(id);
    this.db.exec('DELETE FROM net_tasks WHERE id=?', id);
    this.db.exec('DELETE FROM net_speed_samples WHERE task_id=?', id);
    this.emit();
  }

  speedSamples(id: number) {
    return this.speedHistory.get(id) || [];
  }

  list() {
    return this.db.all('SELECT * FROM net_tasks ORDER BY id DESC');
  }

  private emit() {
    const w = this.getWindow();
    if (w && !w.isDestroyed()) w.webContents.send('net:progress', this.list());
  }
}

function defaultDest(url: string, label: string): string {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname) || label + '.bin';
    return path.join(process.env.TEMP || '.', 'VRCAssetLibrary', base);
  } catch {
    return path.join(process.env.TEMP || '.', 'VRCAssetLibrary', label + '.bin');
  }
}
