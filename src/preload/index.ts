// preload：contextBridge 暴露安全 IPC API（计划书 §2.2）
import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  // 扫描
  scanFolders: (dirs: string[]) => ipcRenderer.invoke('scan:folders', dirs),
  rootsList: () => ipcRenderer.invoke('roots:list'),
  rootsAdd: (dirs: string[]) => ipcRenderer.invoke('roots:add', dirs),
  // 图库
  galleryQuery: (q: unknown) => ipcRenderer.invoke('gallery:query', q),
  galleryCards: () => ipcRenderer.invoke('gallery:cards'),
  // 卡片
  cardDetail: (id: number) => ipcRenderer.invoke('card:detail', id),
  cardFavorite: (id: number, fav: boolean) => ipcRenderer.invoke('card:favorite', id, fav),
  cardNote: (id: number, note: string) => ipcRenderer.invoke('card:note', id, note),
  cardRelated: (id: number, relatedId: number) => ipcRenderer.invoke('card:related', id, relatedId),
  relatedList: (id: number) => ipcRenderer.invoke('related:list', id),
  relatedRemove: (id: number, relatedId: number) => ipcRenderer.invoke('related:remove', id, relatedId),
  cardEditState: (id: number, matchState: string) => ipcRenderer.invoke('card:edit-state', id, matchState),
  cardEditName: (id: number, name: string) => ipcRenderer.invoke('card:edit-name', id, name),
  // 角色适配
  adaptList: (assetId: number) => ipcRenderer.invoke('adapt:list', assetId),
  adaptAdd: (assetId: number, avatarName: string, note?: string) => ipcRenderer.invoke('adapt:add', assetId, avatarName, note),
  adaptRemove: (assetId: number, adaptationId: number) => ipcRenderer.invoke('adapt:remove', assetId, adaptationId),
  adaptNote: (assetId: number, adaptationId: number, note: string) => ipcRenderer.invoke('adapt:note', assetId, adaptationId, note),
  adaptBatchAdd: (assetIds: number[], avatarName: string, note?: string) => ipcRenderer.invoke('adapt:batch-add', assetIds, avatarName, note),
  cardTouchOpened: (id: number) => ipcRenderer.invoke('card:touch-opened', id),
  recentList: (limit?: number) => ipcRenderer.invoke('recent:list', limit),
  compatEvidence: (id: number) => ipcRenderer.invoke('compat:evidence', id),
  // BOOTH
  boothFetch: (id: string) => ipcRenderer.invoke('booth:fetch', id),
  boothHydrateCovers: () => ipcRenderer.invoke('booth:hydrate-covers'),
    boothSearch: (query: string) => ipcRenderer.invoke('booth:search', query),
  boothLibrary: () => ipcRenderer.invoke('booth:library'),
  boothLibraryList: () => ipcRenderer.invoke('booth:library-list'),
  boothWishlistUrl: (id: string) => ipcRenderer.invoke('booth:wishlist-url', id),
  // 匹配
  matchCompute: (assetId: number) => ipcRenderer.invoke('match:compute', assetId),
  matchSearch: (assetId: number, query?: string) => ipcRenderer.invoke('match:search', assetId, query),
  matchApply: (assetId: number, boothId: string, source: string) => ipcRenderer.invoke('match:apply', assetId, boothId, source),
  matchReject: (assetId: number, boothId: string) => ipcRenderer.invoke('match:reject', assetId, boothId),
  matchApplyBatch: (assetIds: number[], boothId: string, source: string) => ipcRenderer.invoke('match:apply-batch', assetIds, boothId, source),
  matchSkip: (assetId: number) => ipcRenderer.invoke('match:skip', assetId),
  matchUndo: (assetId: number) => ipcRenderer.invoke('match:undo', assetId),
  // 分类
  categoryTree: () => ipcRenderer.invoke('category:tree'),
  categoryAssign: (assetId: number, categoryId: number, reason: string) => ipcRenderer.invoke('category:assign', assetId, categoryId, reason),
  categoryCreate: (name: string, parentId?: number) => ipcRenderer.invoke('category:create', name, parentId),
  categoryRename: (id: number, name: string) => ipcRenderer.invoke('category:rename', id, name),
  categoryDelete: (id: number) => ipcRenderer.invoke('category:delete', id),
  // 关键词
  keywordAdd: (assetId: number, keyword: string) => ipcRenderer.invoke('keyword:add', assetId, keyword),
  keywordRemove: (assetId: number, keyword: string) => ipcRenderer.invoke('keyword:remove', assetId, keyword),
  keywordBatch: (assetIds: number[], add: string[], remove: string[]) => ipcRenderer.invoke('keyword:batch', assetIds, add, remove),
  // 集合
  collectionList: () => ipcRenderer.invoke('collection:list'),
  collectionCreate: (name: string) => ipcRenderer.invoke('collection:create', name),
  collectionAdd: (collectionId: number, assetIds: number[]) => ipcRenderer.invoke('collection:add', collectionId, assetIds),
  collectionAssets: (collectionId: number) => ipcRenderer.invoke('collection:assets', collectionId),
  collectionRemove: (collectionId: number, assetId: number) => ipcRenderer.invoke('collection:remove', collectionId, assetId),
  collectionDelete: (collectionId: number) => ipcRenderer.invoke('collection:delete', collectionId),
  // 网络任务
  netList: () => ipcRenderer.invoke('net:list'),
  netAdd: (task: unknown) => ipcRenderer.invoke('net:add', task),
  netPause: (id: number) => ipcRenderer.invoke('net:pause', id),
  netResume: (id: number) => ipcRenderer.invoke('net:resume', id),
  netRetry: (id: number) => ipcRenderer.invoke('net:retry', id),
  netRemove: (id: number) => ipcRenderer.invoke('net:remove', id),
  netSpeed: (id: number) => ipcRenderer.invoke('net:speed', id),
  onNetProgress: (cb: (tasks: any[]) => void) => {
    const listener = (_e: any, tasks: any[]) => cb(tasks);
    ipcRenderer.on('net:progress', listener);
    return () => ipcRenderer.removeListener('net:progress', listener);
  },
  // 保存视图
  viewList: () => ipcRenderer.invoke('view:list'),
  viewSave: (name: string, queryJson: string) => ipcRenderer.invoke('view:save', name, queryJson),
  viewDelete: (id: number) => ipcRenderer.invoke('view:delete', id),
  viewApply: (id: number) => ipcRenderer.invoke('view:apply', id),
  // Gift / 下载入口
  boothGiftUrl: (id: string) => ipcRenderer.invoke('booth:gift-url', id),
  netAddUrl: (url: string, label: string, destPath?: string) => ipcRenderer.invoke('net:add-url', url, label, destPath),
  // 浏览器
  openExternal: (url: string) => ipcRenderer.invoke('browser:open-external', url),
  boothOpen: (url: string) => ipcRenderer.invoke('booth:open', url),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  // 设置
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  // 对话框 / shell
  pickFolders: () => ipcRenderer.invoke('dialog:pickFolders'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  showItem: (p: string) => ipcRenderer.invoke('shell:showItem', p),
  fileDelete: (assetId: number, targetPath: string) => ipcRenderer.invoke('file:delete', assetId, targetPath),
  cardDelete: (assetId: number) => ipcRenderer.invoke('card:delete', assetId),
  // 数据备份 / 迁移
  dbBackup: () => ipcRenderer.invoke('db:backup'),
  dbRestore: () => ipcRenderer.invoke('db:restore'),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  // 拖入压缩包
  archiveInspect: (filePath: string) => ipcRenderer.invoke('archive:inspect', filePath),
  // 解压 + unitypackage 导入 Unity
  archiveExtract: (filePath: string, destDir?: string) => ipcRenderer.invoke('archive:extract', filePath, destDir),
  archiveExtractCard: (assetId: number, destDir?: string) => ipcRenderer.invoke('archive:extract-card', assetId, destDir),
  openUnitypackage: (assetId: number) => ipcRenderer.invoke('asset:open-unitypackage', assetId),
  fingerprintFile: (p: string) => ipcRenderer.invoke('fingerprint:file', p),
  parseBoothRef: (s: string) => ipcRenderer.invoke('parse:boothRef', s),
  // 平台
  platform: process.platform,
  // 拖拽路径：用 webUtils.getPathForFile 获取真实文件系统路径（Electron 32+ 移除 file.path）
  getFilePath: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('vrc', api);

export type VrcApi = typeof api;
