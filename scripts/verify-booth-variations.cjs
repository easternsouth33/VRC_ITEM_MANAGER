const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Db } = require('./_verify-db.cjs');
const { fetchBoothItem } = require('./_verify-booth.cjs');
const dir = path.resolve('.verify-tmp-variations-' + Date.now());
fs.mkdirSync(dir, { recursive: true });
const db = new Db({ dataDir: dir });
const info = { id: '6405390', name: 'Chocolat', shopName: 'Shop', shopSubdomain: 'shop', categoryId: null, categoryName: null, categoryParent: null, url: 'https://booth.pm/zh-cn/items/6405390', description: 'Description', wishListUrl: null, price: '1000', publishedAt: null, isAdult: false, tags: [], imageUrl: null, images: [], aliases: [], variations: [{ id: 'variation-external-id', name: 'Full set', price: '1000', type: null, url: null, downloadable: true }] };
// 模拟真实 saveBoothItem 的变体写入：新表/旧迁移表均有 variation_json。
const v = info.variations[0];
db.exec('INSERT INTO booth_items(booth_id,name) VALUES(?,?)', info.id, info.name);
db.exec('INSERT INTO booth_variations(booth_id,variation_id,name,price,type,url,downloadable,variation_json) VALUES(?,?,?,?,?,?,?,?)', info.id, v.id, v.name, v.price, v.type, v.url, v.downloadable ? 1 : 0, JSON.stringify(v));
const row = db.get('SELECT * FROM booth_variations WHERE booth_id=?', info.id);
assert.equal(row.variation_id, v.id);
assert.deepEqual(JSON.parse(row.variation_json), v);
assert.equal(row.name, v.name);
// 旧版表（只有 booth_id 和 NOT NULL variation_json）也能按生产迁移补列。
db.exec('DROP TABLE booth_variations');
db.exec('CREATE TABLE booth_variations(id INTEGER PRIMARY KEY AUTOINCREMENT,booth_id TEXT NOT NULL,variation_json TEXT NOT NULL)');
db.migrate();
db.exec('INSERT INTO booth_variations(booth_id,variation_id,name,price,type,url,downloadable,variation_json) VALUES(?,?,?,?,?,?,?,?)', info.id, v.id, v.name, v.price, v.type, v.url, v.downloadable ? 1 : 0, JSON.stringify(v));
assert.equal(db.get('SELECT variation_id FROM booth_variations').variation_id, v.id);
(async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ id: 6405390, name: 'Test item', variations: [{ id: 10810522, name: null, price: 6000, type: 'digital' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const parsed = await fetchBoothItem('6405390');
    assert.equal(parsed.variations[0].id, '10810522');
    assert.equal(parsed.variations[0].name, 'digital');
    console.log(JSON.stringify({ PASS: true, fresh: 'variation_json persisted', migrated: 'legacy table upgraded', id: 'variation-external-id', unnamedVariation: parsed.variations[0] }));
  } finally { global.fetch = originalFetch; }
})().catch((error) => { console.error(error); process.exitCode = 1; });
db.close(); fs.rmSync(dir, { recursive: true, force: true });
