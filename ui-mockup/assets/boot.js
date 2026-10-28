// boot.js — shared page wiring (ES module, deferred).
import { wireReadouts, wireTheme, wireDialogs, wireParallax } from './fx.js';
import { drawDial } from './dial.js';

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

function wireDial() {
  const svg = qs('svg.ef-dial');
  if (!svg || !window.VRCA_DATA) return;
  const D = window.VRCA_DATA;
  const cards = D.cards;
  const st = window.UI ? window.UI.stats() : null;
  const cat = (n) => cards.filter((c) => c.category === n).length;
  const sections = [
    { zh: '图库', en: 'Library', href: 'index.html', big: cards.length, unit: ' 卡', here: true },
    { zh: '匹配', en: 'Match', href: 'match.html', big: st ? st.unmatched : 0, unit: ' 待', alert: st && st.unmatched > 0 },
    { zh: '分类', en: 'Classify', href: 'classify.html', big: st ? st.unfiled : 0, unit: ' 待' },
    { zh: '关键词', en: 'Keywords', href: 'keywords.html', big: st ? st.keywordCards : 0, unit: ' 卡' },
    { zh: '浏览器', en: 'Browser', href: 'booth.html', big: 0, unit: ' 任务' },
    { zh: '任务', en: 'Tasks', href: 'tasks.html', big: 0, unit: ' 中' }
  ];
  const total = cards.reduce((a, c) => a + (c.size || 0), 0);
  const matched = st ? st.matched : 0;
  drawDial(svg, {
    sections,
    gauges: [
      { label: '匹配率', share: cards.length ? matched / cards.length : 0 },
      { label: '分类率', share: cards.length ? (st ? st.filed : 0) / cards.length : 0 }
    ],
    idle: { label: '已扫描', big: cards.length, unit: ' 卡', sub: D.scannedAt || '' }
  });
}

function wireChips() {
  const wrap = qs('.chips');
  if (!wrap) return;
  const list = qs('#recs');
  const btns = qsa('.ef-chip[data-cat]', wrap);
  btns.forEach((b) => {
    b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      const cat = b.getAttribute('data-cat');
      qsa('li', list).forEach((li) => {
        const on = cat === '全部' || li.getAttribute('data-cat') === cat;
        li.style.display = on ? '' : 'none';
      });
    });
  });
}

function wireSearch() {
  const input = qs('#q');
  const list = qs('#recs');
  if (!input || !list) return;
  input.addEventListener('input', () => {
    const v = input.value.trim().toLowerCase();
    qsa('li[data-search]', list).forEach((li) => {
      li.style.display = !v || li.getAttribute('data-search').includes(v) ? '' : 'none';
    });
  });
}

wireDial();
wireChips();
wireSearch();
wireTheme();
wireReadouts();
wireDialogs();
wireParallax();
