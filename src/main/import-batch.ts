import type { Db } from './db';
export function createImportBatch(db: Db, source: string, files: string[] = []) {
  const label = '待匹配 · ' + new Date().toLocaleString('zh-CN', { hour12: false });
  const col = db.exec("INSERT INTO collections(name,desc,kind) VALUES(?,?,?)", label, '同批导入；等待匹配，可人工调整分类。', 'import_batch');
  const id = Number(db.exec('INSERT INTO import_batches(collection_id,label,source) VALUES(?,?,?)', col.lastInsertRowid, label, source).lastInsertRowid);
  return id;
}
export function linkImportBatch(db: Db, batchId: number, assetIds: number[]) {
  const batch = db.get('SELECT * FROM import_batches WHERE id=?', batchId) as any;
  if (!batch) return;
  const ids = [...new Set(assetIds)].filter((id) => Number.isInteger(id));
  for (const id of ids) {
    db.exec('INSERT OR IGNORE INTO collection_assets(collection_id,asset_id) VALUES(?,?)', batch.collection_id, id);
    db.exec("UPDATE assets SET match_state='pending',score=NULL,updated_at=datetime('now') WHERE id=? AND match_state='auto'", id);
    for (const other of ids) if (id !== other) db.exec("INSERT INTO related_assets(asset_id,related_id,kind) SELECT ?,?,'import_batch' WHERE NOT EXISTS(SELECT 1 FROM related_assets WHERE asset_id=? AND related_id=? AND kind='import_batch')",id,other,id,other);
  }
}
export function archiveNamesForCard(db: Db, id: number) {
  return db.all("SELECT rel_path FROM asset_members WHERE asset_id=? AND member_type='archive'",id).map((r:any)=>r.rel_path);
}
