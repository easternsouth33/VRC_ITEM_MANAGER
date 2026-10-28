// 自动更新检查（跟随 GitHub 最新发布）
// 本机 schannel 证书链不完整（DSH 环境），查询 GitHub API 时关闭证书校验；仅限本模块自身 fetch。
import { app, shell } from 'electron';

export interface UpdateInfo {
  updateAvailable: boolean;
  current: string;
  latest: string;
  name: string | null;
  notes: string | null;
  downloadUrl: string | null;
}

function cmp(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function checkUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  const base: UpdateInfo = { updateAvailable: false, current, latest: current, name: null, notes: null, downloadUrl: null };
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const res = await fetch('https://api.github.com/repos/easternsouth33/VRC_ITEM_MANAGER/releases/latest', {
      headers: { 'User-Agent': 'VRC素材整理/' + current, 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) return base;
    const j = await res.json() as any;
    const latest = String(j.tag_name || '').replace(/^v/i, '');
    const updateAvailable = !!latest && cmp(latest, current) > 0;
    const assets = Array.isArray(j.assets) ? j.assets : [];
    const asset = assets.find((a: any) => /\.exe$/i.test(String(a.name || '')));
    return {
      updateAvailable,
      current,
      latest: latest || current,
      name: j.name || null,
      notes: typeof j.body === 'string' ? j.body.slice(0, 2000) : null,
      downloadUrl: asset?.browser_download_url || j.html_url || null,
    };
  } catch {
    return base;
  }
}

export function openUpdateUrl(url: string) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}
