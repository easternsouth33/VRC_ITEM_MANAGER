/* ui.js — static mockup renderer. Reads window.VRCA_DATA (data.js). */
(function () {
  "use strict";
  var D = window.VRCA_DATA;
  var CARDS = D.cards, BOOTH = D.booth || {}, CANDS = window.VRCA_CANDIDATES || {};
  var byId = {};
  CARDS.forEach(function (c) { byId[c.id] = c; });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }
  function fmtInt(n) {
    return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function fmtBytes(n) {
    if (n == null) return "—";
    if (!n) return "0 B";
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    var s = i === 0 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, "");
    return s + " " + u[i];
  }
  function coverOf(c) {
    if (c.cover) return c.cover;
    if (c.boothId && D.covers.indexOf(String(c.boothId)) >= 0) return "covers/" + c.boothId + ".jpg";
    return "";
  }
  function thumb(c) {
    var cov = coverOf(c);
    if (cov) return "<img class=\"thumb\" src=\"" + esc(cov) + "\" alt=\"\" loading=\"lazy\">";
    return "<span class=\"thumb is-empty\">" + esc(c.id) + "</span>";
  }
  function badge(text, draft) {
    return "<span class=\"ef-state" + (draft ? " is-draft" : "") + "\">" + esc(text) + "</span>";
  }
  function pct(a, b) {
    return b ? Math.round((a / b) * 100) + "%" : "0%";
  }

  function stats() {
    var s = { cards: CARDS.length, files: 0, bytes: 0, dirs: 0, matched: 0, unmatched: 0, filed: 0, unfiled: 0, model: 0, map: 0, folds: 0, keywordCards: 0 };
    CARDS.forEach(function (c) {
      s.files += c.files || 0;
      s.bytes += c.size || 0;
      s.dirs += c.dirs || 0;
      if (c.match === "none") s.unmatched++; else s.matched++;
      if (c.category && c.category !== "待分类") s.filed++; else s.unfiled++;
      if (c.root === "model") s.model++; else if (c.root === "map") s.map++;
      if (c.kind === "fold") s.folds++;
      if (c.keywords && c.keywords.length) s.keywordCards++;
    });
    return s;
  }

  var NAV = [
    ["index.html", "图库", "Library", "gallery"],
    ["match.html", "匹配", "Match", "match"],
    ["classify.html", "分类", "Classify", "classify"],
    ["keywords.html", "关键词", "Keywords", "keywords"],
    ["booth.html", "浏览器", "Browser", "booth"],
    ["tasks.html", "任务", "Tasks", "tasks"],
    ["settings.html", "设置", "Settings", "settings"]
  ];

  function cmdbar(cur) {
    var h = "<header class=\"ef-cmdbar\"><a class=\"brand\" href=\"welcome.html\"><span class=\"seal\">V</span><span>素材库</span></a><nav>";
    var pending = stats().unmatched;
    NAV.forEach(function (n) {
      var extra = "";
      if (n[3] === "match" && pending) extra = "<span class=\"count\">" + pending + "</span>";
      h += "<a href=\"" + n[0] + "\"" + (n[3] === cur ? " aria-current=\"page\"" : "") + "><small>" + n[2] + "</small>" + n[1] + extra + "</a>";
    });
    h += "</nav><div class=\"util\"><span class=\"ef-field\" data-fx-load>" + fmtInt(stats().cards) + " 卡片</span><button class=\"ef-btn small\" data-theme-toggle aria-pressed=\"false\">主题</button></div></header>";
    return h;
  }
  function tri() { return "<div class=\"ef-tri ef-in-sweep\"><i></i><i></i><i></i></div>"; }

  function fig(cls, val, label, alert, href) {
    var inner = "<b>" + val + "</b><span>" + esc(label) + "</span>";
    if (href) return "<a class=\"" + (alert ? "is-alert " : "") + cls + "\" href=\"" + href + "\">" + inner + "</a>";
    return "<div class=\"" + (alert ? "is-alert " : "") + cls + "\">" + inner + "</div>";
  }
  function panelFig(cut, lead, title, en, figs) {
    var h = "<section class=\"ef-panel " + cut + (lead ? " " + lead : "") + "\"><h2>" + esc(title) + " <small>" + en + "</small></h2><div class=\"ef-figs\">";
    figs.forEach(function (f) { h += fig("", f[0], f[1], f[2], f[3]); });
    return h + "</div></section>";
  }

  /* ---------- welcome (showcase) ---------- */
  function welcome() {
    var st = stats();
    return "<div class=\"welcome\">" + tri() +
      "<section class=\"stage\">" +
      "<span class=\"ef-eyebrow slash\">ASSET LIBRARY / 素材库</span>" +
      "<h1 class=\"ef-wordmark\"><span class=\"solid\">素材库</span><span class=\"hollow\">ASSET LIBRARY</span></h1>" +
      "<div class=\"big\" aria-label=\"" + st.cards + " 张卡片\"><em data-fx-load>" + fmtInt(st.cards) + "</em></div>" +
      "<p class=\"lines\">本地 VRChat 素材整理：扫描文件夹、拖入压缩包、自动匹配 BOOTH 商品、人工分类与关键词、内置浏览器与下载登记。</p>" +
      "<div class=\"acts\">" +
      "<a class=\"ef-btn go\" href=\"index.html\">扫描文件夹</a>" +
      "<a class=\"ef-btn go\" href=\"index.html\">拖入压缩包</a>" +
      "<a class=\"ef-btn go\" href=\"booth.html\">打开资料库</a>" +
      "</div>" +
      "<ul class=\"ef-facts\">" +
      "<li><span class=\"ef-field\" data-fx-load>" + fmtInt(st.cards) + "</span> 张卡片</li>" +
      "<li><span class=\"ef-field\" data-fx-load>" + fmtInt(st.files) + "</span> 个文件</li>" +
      "<li><span class=\"ef-field\" data-fx-load>" + fmtBytes(st.bytes) + "</span></li>" +
      "<li><span class=\"ef-field\" data-fx-load>" + esc(D.scannedAt || "—") + "</span></li>" +
      "</ul>" +
      "</section>" +
      "<footer class=\"foot\"><span class=\"ef-field\">VRCA 0.1 · portable</span><span class=\"ef-field\">数据目录：exe 同目录 VRCAssetLibraryData</span><a class=\"ef-btn small\" href=\"index.html\">进入图库 →</a></footer>" +
      "</div>";
  }

  /* ---------- gallery (console) ---------- */
  function recordRow(c, i) {
    var tag = c.boothId ? "<span class=\"ef-tag\">" + c.boothId + "</span>" : "<span class=\"ef-state is-draft\">未编号</span>";
    var date = "<span class=\"ef-field\">" + esc(D.scannedAt || "—") + "</span>";
    var mBadge = c.match === "none" ? badge("待匹配", true) : badge("已匹配", false);
    var cBadge = (c.category && c.category !== "待分类") ? badge(c.category, false) : badge("待分类", true);
    var name = "<span class=\"name with-thumb\">" + thumb(c) + "<span class=\"nm\"><span class=\"tt\">" + esc(c.name) + "</span><span class=\"st\">" + mBadge + cBadge + "</span></span></span>";
    var sz = "<span class=\"ef-field\">" + fmtBytes(c.size) + " · " + fmtInt(c.files) + "</span>";
    var search = (c.name + " " + (c.boothId || "") + " " + c.id + " " + c.category + " " + (c.keywords || []).join(" ")).toLowerCase();
    return "<li data-cat=\"" + esc(c.category || "待分类") + "\" data-search=\"" + esc(search) + "\">" +
      "<a class=\"ef-record ef-in-come\" style=\"--i:" + (i % 12) + "\" href=\"card.html?id=" + c.id + "\">" + tag + date + name + sz + "</a></li>";
  }
  function chipsRow(st) {
    var cats = [["全部", st.cards], ["角色模型", 0], ["场景地图", 0], ["Shader", 0], ["交互道具", 0], ["天空盒", 0], ["特效粒子", 0], ["配饰", 0], ["待分类", st.unfiled]];
    CARDS.forEach(function (c) {
      var k = c.category;
      for (var i = 0; i < cats.length; i++) if (cats[i][0] === k) { cats[i][1]++; break; }
    });
    var h = "<div class=\"chips\">";
    cats.forEach(function (p, i) {
      h += "<button class=\"ef-chip\" data-cat=\"" + esc(p[0]) + "\"" + (i === 0 ? " aria-pressed=\"true\"" : "") + "><span>" + esc(p[0]) + "</span><span class=\"n\">" + p[1] + "</span></button>";
    });
    return h + "</div>";
  }
  function recentPanel() {
    var top = CARDS.slice().sort(function (a, b) { return (b.size || 0) - (a.size || 0); }).slice(0, 5);
    var h = "<section class=\"ef-panel\"><h2>最近扫描 <small>RECENT</small></h2><ul class=\"ef-rows\">";
    top.forEach(function (c) {
      h += "<li><div><b>" + esc(c.name) + "</b><span class=\"meta\"><span>" + esc(c.id) + "</span><span>" + fmtBytes(c.size) + "</span><span>" + fmtInt(c.files) + " 文件</span></span></div><div class=\"acts\"><a class=\"ef-btn small\" href=\"card.html?id=" + c.id + "\">详情</a></div></li>";
    });
    return h + "</ul></section>";
  }
  function todoPanel() {
    var st = stats();
    var h = "<section class=\"ef-panel\"><h2>待办 <small>INBOX</small></h2><ul class=\"ef-rows\">";
    h += "<li><div><b>待匹配商品</b><span class=\"meta\"><span>未匹配的卡片</span></span></div><div class=\"acts\"><a class=\"ef-btn small\" href=\"match.html\">" + st.unmatched + "</a></div></li>";
    h += "<li><div><b>待分类</b><span class=\"meta\"><span>尚无人工或 BOOTH 分类</span></span></div><div class=\"acts\"><a class=\"ef-btn small\" href=\"classify.html\">" + st.unfiled + "</a></div></li>";
    h += "<li><div><b>待下载登记</b><span class=\"meta\"><span>已购资料库未登记</span></span></div><div class=\"acts\"><a class=\"ef-btn small\" href=\"booth.html\">0</a></div></li>";
    return h + "</ul></section>";
  }
  function gallery() {
    var st = stats();
    var h = "<div class=\"ef-head\"><h1>图库 <small>LIBRARY</small></h1><p>" + fmtInt(st.cards) + " 张卡片 · " + fmtInt(st.files) + " 个文件 · " + fmtBytes(st.bytes) + "</p></div>";
    h += "<div class=\"board\"><div class=\"orbit\">";
    h += "<div class=\"hub\"><section class=\"ef-panel\"><h2>分类分布 <small>CLASSIFY</small></h2><svg class=\"ef-dial\" role=\"img\" aria-label=\"分类分布圆盘\"></svg></section></div>";
    h += panelFig("cut-br", "lead-right", "匹配", "MATCH", [["待匹配", st.unmatched, true, "match.html"], ["已匹配", st.matched, false, "match.html"], ["匹配率", pct(st.matched, st.cards), false, ""]]);
    h += panelFig("cut-bl", "lead-left", "分类", "CLASSIFY", [["待分类", st.unfiled, true, "classify.html"], ["已分类", st.filed, false, "classify.html"], ["分类率", pct(st.filed, st.cards), false, ""]]);
    h += panelFig("cut-br", "", "来源", "SOURCE", [["模型", st.model, false, ""], ["地图", st.map, false, ""], ["根目录", D.roots.length, false, ""]]);
    h += panelFig("cut-bl", "", "体量", "VOLUME", [["文件", st.files, false, ""], ["目录", st.dirs, false, ""], ["体积", fmtBytes(st.bytes), false, ""]]);
    h += panelFig("cut-tr", "", "整理", "CURATION", [["折叠卡", st.folds, false, ""], ["关键词", st.keywordCards, false, "keywords.html"], ["收藏", 0, false, ""]]);
    h += panelFig("cut-tl", "", "网络", "NETWORK", [["任务", 0, false, "tasks.html"], ["下载中", 0, false, "tasks.html"], ["速度", "—", false, ""]]);
    h += "</div></div>";
    h += "<div class=\"cols wide-left\"><div>";
    h += "<div class=\"ef-bar-title\"><span>// RECORDS / 素材记录</span><span class=\"ef-field\">" + fmtInt(st.cards) + "</span></div>";
    h += "<div class=\"ef-search\"><input type=\"search\" id=\"q\" placeholder=\"搜索名称、编号、关键词 kw: 或 cat:\"></div>";
    h += chipsRow(st);
    h += "<ul class=\"ef-records\" id=\"recs\">";
    CARDS.forEach(function (c, i) { h += recordRow(c, i); });
    h += "</ul></div>";
    h += "<div class=\"stack\">" + recentPanel() + todoPanel() + "</div></div>";
    return h;
  }


  /* ---------- card detail (reading + local console) ---------- */
  function kvItem(k, v) {
    return "<li><span>" + esc(k) + "</span><span>" + v + "</span></li>";
  }
  function chipKeywords(c) {
    if (!c.keywords || !c.keywords.length) return "<span class=\"ef-state is-draft\">无关键词</span>";
    return c.keywords.map(function (k) { return "<button class=\"ef-chip\"><span>" + esc(k) + "</span></button>"; }).join("");
  }
  function fileRows(c) {
    var rows = c.sample || [];
    if (!rows.length) return "<p class=\"ef-empty\">该卡片未登记可展开的文件清单。</p>";
    var h = "<ul class=\"filelist\">";
    rows.forEach(function (p) {
      var isDir = /\/$/.test(p);
      h += "<li><span class=\"p\">" + esc(p) + "</span><span class=\"s\">" + (isDir ? "dir" : "file") + "</span></li>";
    });
    return h + "</ul>";
  }
  function cardDetail(id) {
    var c = byId[id] || CARDS[0];
    var st = stats();
    var b = c.booth || null;
    var catReason = c.reason || "none";
    var catExplain = "";
    if (catReason.indexOf("booth:") === 0) catExplain = "依据本商品 BOOTH 分类";
    else if (catReason.indexOf("keyword:") === 0) catExplain = "命中关键词 " + catReason.slice(8);
    else if (catReason.indexOf("manual") === 0) catExplain = "人工指定";
    else catExplain = "尚未归类";

    var h = "";
    // topbar back
    h += "<div class=\"ef-topbar\"><a class=\"ef-back\" href=\"index.html\" aria-label=\"返回图库\">←</a><span class=\"ef-pair\"><small>// CARD / 卡片详情</small><span>" + esc(c.name) + "</span></span><div class=\"acts\"><button class=\"ef-btn small\">收藏</button><button class=\"ef-btn small\" data-theme-toggle aria-pressed=\"false\">主题</button></div></div>";

    h += "<div class=\"shell tight\"><div class=\"cols wide-left\"><div>";
    // left: cover + prose
    h += "<div class=\"ef-sheet\">";
    h += "<div class=\"ef-tri\" style=\"margin-top:1rem\"><i></i><i></i><i></i></div>";
    var cov = coverOf(c);
    if (cov) h += "<img class=\"cover-big\" src=\"" + esc(cov) + "\" alt=\"封面\">";
    else h += "<div class=\"cover-big is-empty\" style=\"display:grid;place-items:center;border:1px solid var(--ef-rule)\"><span class=\"ef-field\">无封面</span></div>";
    h += "<h1 style=\"margin:1rem 0 0\">" + esc(c.name) + "</h1>";
    h += "<ul class=\"ef-facts\"><li>#" + esc(c.id) + "</li><li>" + (c.kind === "fold" ? "折叠卡" : c.kind === "dir" ? "目录" : "文件") + "</li><li>" + esc(D.roots.filter(function (r) { return r.key === c.root; })[0] ? (D.roots.filter(function (r) { return r.key === c.root; })[0].label) : c.root) + "</li><li>" + fmtBytes(c.size) + "</li><li>" + fmtInt(c.files) + " 文件 / " + fmtInt(c.dirs) + " 目录</li></ul>";
    h += "<ul class=\"kvlist\">";
    h += kvItem("BOOTH 编号", c.boothId ? "<a class=\"ef-tag\" href=\"https://booth.pm/ja/items/" + c.boothId + "\">" + c.boothId + "</a>" : "<span class=\"ef-state is-draft\">未编号</span>");
    h += kvItem("匹配", c.match === "none" ? "未匹配" : "<b>" + c.match + "</b> 依据 · 得分 " + (c.score || 0).toFixed(2));
    h += kvItem("分类", (c.category && c.category !== "待分类" ? c.category : "待分类") + " <span class=\"ef-field\">" + esc(catExplain) + "</span>");
    h += kvItem("关键词", chipKeywords(c));
    h += kvItem("商品名称", b ? esc(b.name) : "<span class=\"ef-state is-draft\">未关联</span>");
    h += kvItem("店铺", b ? esc(b.shop) : "—");
    h += kvItem("商品分类", b ? esc(b.cat) : "—");
    h += kvItem("标签", b && b.tags && b.tags.length ? b.tags.map(function (t) { return "<span class=\"ef-chip\"><span>" + esc(t) + "</span></span>"; }).join("") : "—");
    h += kvItem("扩展名", c.extsTop && c.extsTop.length ? c.extsTop.slice(0, 6).map(function (e) { return "<span class=\"ef-chip\"><span>" + esc(e[0]) + "</span><span class=\"n\">" + e[1] + "</span></span>"; }).join("") : "—");
    h += "</ul>";
    h += "<h2 style=\"margin:1.5rem 0 0.5rem\">文件清单 <small style=\"color:var(--ef-ink-2);font-weight:400\">SAMPLE</small></h2>";
    h += fileRows(c);
    h += "</div></div>";

    // right: local/booth adaptation + members + ops
    h += "<div class=\"stack\">";
    h += "<section class=\"ef-panel\"><h2>适配与商品支持 <small>COMPAT</small></h2><div class=\"pair2\"><div><h3>本地证据</h3><ul>";
    var localHas = c.extsTop && c.extsTop.length;
    if (localHas) {
      c.extsTop.slice(0, 5).forEach(function (e) { h += "<li><span>" + esc(e[0]) + "</span><span class=\"ef-field\">" + e[1] + " 个</span></li>"; });
    } else {
      h += "<li><span class=\"ef-state is-draft\">未发现</span><span>尚未发现对应本地版本的证据，不代表已验证文件缺失</span></li>";
    }
    h += "</ul></div><div><h3>商品自述</h3><ul>";
    if (b) {
      h += "<li><span>分类</span><span>" + esc(b.cat) + "</span></li>";
      h += "<li><span>标签</span><span>" + (b.tags && b.tags.length ? b.tags.slice(0, 4).join(" · ") : "—") + "</span></li>";
    } else {
      h += "<li><span class=\"ef-state is-draft\">未关联</span><span>匹配待办里处理</span></li>";
    }
    h += "</ul></div></div></section>";
    h += "<section class=\"ef-panel\"><h2>成员 <small>MEMBERS</small></h2><ul class=\"ef-rows\">";
    var members = c.members || [];
    if (members.length) {
      members.slice(0, 8).forEach(function (m) {
        h += "<li><div><b>" + esc(m.name) + "</b><span class=\"meta\"><span>" + (m.kind === "dir" ? "目录" : "文件") + "</span><span>" + fmtBytes(m.size) + "</span><span>" + fmtInt(m.files) + " 文件</span></span></div></li>";
      });
      if (members.length > 8) h += "<li><div><b>… 另有 " + (members.length - 8) + " 个成员</b></div></li>";
    } else {
      h += "<li><div><b>单文件卡片</b><span class=\"meta\"><span>展开查看压缩包中央目录清单</span></span></div></li>";
    }
    h += "</ul></section>";
    h += "<section class=\"ef-panel\"><h2>操作 <small>ACTIONS</small></h2><div class=\"ef-rows\"><ul class=\"ef-rows\">";
    h += "<li><div><b>重新匹配</b><span class=\"meta\"><span>用当前名称与编号重跑 BOOTH 搜索</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">执行</button></div></li>";
    h += "<li><div><b>手动指定分类</b><span class=\"meta\"><span>人工分类优先于商品分类与关键词</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">指定</button></div></li>";
    h += "<li><div><b>在资源管理器中定位</b><span class=\"meta\"><span>右键卡片 / 文件夹定位</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">打开</button></div></li>";
    h += "</ul></div></section></div></div></div>";
    return h;
  }

  /* ---------- match (console) ---------- */
  function candRow(cand, card) {
    var img = cand.img || cand.cover || (cand.id ? "https://booth.pximg.net/c/300x300_a2_g5/" + cand.id + ".jpg" : "");
    var im = img ? "<img src=\"" + esc(img) + "\" alt=\"\" loading=\"lazy\">" : "<span class=\"thumb is-empty\">?</span>";
    var score = cand.score != null ? cand.score.toFixed(2) : (cand.match === "id" ? "0.98" : "0.40");
    var why = cand.match === "id" ? "编号一致" : cand.match === "name" ? "名称命中" : "关键词/标签";
    return "<div class=\"cand\">" + im + "<div class=\"t\"><b>" + esc(cand.name || ("商品 " + cand.id)) + "</b><span>" + esc(cand.id) + " · " + why + "</span></div><span class=\"score\">" + score + "</span><div class=\"acts\" style=\"grid-column:2/-1;display:flex;gap:.35rem\"><button class=\"ef-btn small go\">采用</button><button class=\"ef-btn small\">排除</button><button class=\"ef-btn small\">跳过</button></div></div>";
  }
  function matchRow(c) {
    var cands = CANDS[c.id] || [];
    var h = "<div class=\"mrow\"><div class=\"local\">" + thumb(c) + "<div><b style=\"display:block;line-height:1.4\">" + esc(c.name) + "</b><span class=\"meta ef-field\" style=\"display:block;margin-top:.25rem\">" + esc(c.id) + " · " + fmtBytes(c.size) + "</span></div></div>";
    h += "<div class=\"cands\">";
    if (cands.length) {
      cands.slice(0, 3).forEach(function (cd) { h += candRow(cd, c); });
    } else {
      h += "<div class=\"cand\" style=\"grid-template-columns:minmax(0,1fr)\"><div class=\"t\"><b>无候选</b><span>未在 BOOTH 检索到候选，可手动填链接或编号</span></div><div class=\"acts\"><button class=\"ef-btn small\">搜索 BOOTH</button><button class=\"ef-btn small\">手动填编号</button></div></div>";
    }
    h += "</div></div>";
    return h;
  }
  function matchPage() {
    var st = stats();
    var pending = CARDS.filter(function (c) { return c.match === "none"; });
    var h = "<div class=\"ef-head\"><h1>匹配待办 <small>MATCH</small></h1><p>" + fmtInt(st.unmatched) + " 张卡片尚未匹配 BOOTH 商品</p></div>";
    h += "<p class=\"ef-notice\" data-flag=\"!\" >候选封面按行比较，点击采用即写入关联；支持手动填链接/编号、排除、跳过、撤回来源。</p>";
    h += "<div class=\"ef-group-head\"><span>// QUEUE / 待匹配队列</span><span class=\"ef-field\">" + fmtInt(pending.length) + "</span></div>";
    h += "<div id=\"mrowlist\">";
    pending.forEach(function (c) { h += matchRow(c); });
    h += "</div>";
    return h;
  }

  /* ---------- classify (console) ---------- */
  function classifyPage() {
    var st = stats();
    var cats = {};
    CARDS.forEach(function (c) {
      var k = c.category && c.category !== "待分类" ? c.category : "待分类";
      cats[k] = cats[k] || [];
      cats[k].push(c);
    });
    var order = ["角色模型", "场景地图", "Shader", "交互道具", "天空盒", "特效粒子", "配饰", "待分类"];
    var h = "<div class=\"ef-head\"><h1>分类 <small>CLASSIFY</small></h1><p>人工分类优先，其次本商品 BOOTH 分类；鞋袜归服装，不因衣装包含 PNG/Materials 而误归贴图。</p></div>";
    h += "<div class=\"cols\"><div>";
    order.forEach(function (k) {
      var items = cats[k] || [];
      var isPending = k === "待分类";
      h += "<div class=\"ef-group-head\"><span>" + (isPending ? "待分类" : esc(k)) + " <span class=\"ef-field\">" + items.length + "</span></span><span class=\"ef-field\">" + (isPending ? "PENDING" : esc(k)) + "</span></div>";
      h += "<ul class=\"ef-records\">";
      items.forEach(function (c, i) {
        var tag = c.boothId ? "<span class=\"ef-tag\">" + c.boothId + "</span>" : "<span class=\"ef-state is-draft\">未编号</span>";
        var why = c.reason ? ("<span class=\"ef-field\">" + esc(c.reason) + "</span>") : "<span class=\"ef-field\">none</span>";
        h += "<li><a class=\"ef-record\" href=\"card.html?id=" + c.id + "\">" + tag + "<span class=\"ef-field\">" + esc(c.id) + "</span>" + "<span class=\"name with-thumb\">" + thumb(c) + "<span class=\"nm\"><span class=\"tt\">" + esc(c.name) + "</span><span class=\"st\">" + esc(why) + "</span></span></span>" + "<span class=\"ef-field\">" + fmtBytes(c.size) + "</span></a></li>";
      });
      h += "</ul>";
    });
    h += "</div>";
    h += "<div class=\"stack\"><section class=\"ef-panel\"><h2>分类规则 <small>RULES</small></h2><ul class=\"ef-ledger\">";
    h += "<li><span>人工分类</span><b>优先</b></li><li><span>BOOTH 分类</span><b>次之</b></li><li><span>关键词</span><b>再次</b></li><li><span>鞋袜</span><b>归服装</b></li><li><span>衣装包含贴图</span><b>仍归服装</b></li>";
    h += "</ul></section>";
    h += "<section class=\"ef-panel\"><h2>内置关键词分类 <small>BUILTIN</small></h2><ul class=\"ef-rows\">";
    [["服装", "服/衣装/ワンピース/dress/outfit"], ["发型", "髪/ヘア/髪型/hair"], ["配饰", "アクセサリ/首饰/accessory"], ["贴图材质", "テクスチャ/マテリアル/texture/material"], ["天空盒", "Skybox/スカイボックス"], ["场景地图", "ワールド/World/マップ"], ["Shader", "シェーダー/Shader"], ["工具脚本", "ツール/スクリプト/tool/script"]].forEach(function (p) {
      h += "<li><div><b>" + p[0] + "</b><span class=\"meta\"><span>" + esc(p[1]) + "</span></span></div></li>";
    });
    h += "</ul></section></div></div>";
    return h;
  }

  /* ---------- keywords (console) ---------- */
  function keywordsPage() {
    var st = stats();
    var h = "<div class=\"ef-head\"><h1>关键词 <small>KEYWORDS</small></h1><p>手动输入或分类关键词标签；命中参与匹配打分、分类归属与 BOOTH 搜索。</p></div>";
    h += "<p class=\"ef-notice\" data-flag=\"!\" >用回车或逗号生成词条；批量标注支持 +关键词 追加、-关键词 移除，可整体撤回。</p>";
    h += "<div class=\"cols even\"><div>";
    h += "<div class=\"ef-bar-title\"><span>// CHIPS / 关键词录入</span></div>";
    h += "<div class=\"ef-search\"><input type=\"text\" id=\"kw\" placeholder=\"输入关键词，如：靴 / 巧克力 / 天空盒\"></div>";
    h += "<div class=\"chips\" style=\"margin-top:.75rem\">";
    var all = {};
    CARDS.forEach(function (c) { (c.keywords || []).forEach(function (k) { all[k] = (all[k] || 0) + 1; }); });
    Object.keys(all).forEach(function (k) { h += "<button class=\"ef-chip\"><span>" + esc(k) + "</span><span class=\"n\">" + all[k] + "</span></button>"; });
    if (!Object.keys(all).length) h += "<span class=\"ef-empty\">暂无关键词，从卡片详情页录入。</span>";
    h += "</div>";
    h += "<div class=\"ef-group-head\"><span>带关键词的卡片</span><span class=\"ef-field\">" + st.keywordCards + "</span></div>";
    h += "<ul class=\"ef-records\">";
    CARDS.filter(function (c) { return c.keywords && c.keywords.length; }).forEach(function (c, i) {
      h += "<li><a class=\"ef-record\" href=\"card.html?id=" + c.id + "\"><span class=\"ef-tag\">" + esc(c.id) + "</span><span class=\"ef-field\">" + esc(c.category) + "</span><span class=\"name with-thumb\">" + thumb(c) + "<span class=\"nm\"><span class=\"tt\">" + esc(c.name) + "</span><span class=\"st\">" + c.keywords.map(function (k) { return "<span class=\"ef-chip\"><span>" + esc(k) + "</span></span>"; }).join("") + "</span></span></span><span class=\"ef-field\">" + fmtBytes(c.size) + "</span></a></li>";
    });
    h += "</ul></div>";
    h += "<div class=\"stack\"><section class=\"ef-panel\"><h2>语法 <small>SYNTAX</small></h2><ul class=\"ef-ledger\">";
    h += "<li><span>kw:靴</span><b>筛选含该词</b></li><li><span>cat:服装</span><b>按分类筛</b></li><li><span>-tag:已归档</span><b>排除</b></li><li><span>+靴</span><b>批量追加</b></li><li><span>-靴</span><b>批量移除</b></li>";
    h += "</ul></section>";
    h += "<section class=\"ef-panel\"><h2>命中依据 <small>REASON</small></h2><ul class=\"ef-ledger\">";
    h += "<li><span>靴 → 服装</span><b>命中关键词：靴</b></li><li><span>巧克力 → 角色模型</span><b>卡片关键词</b></li><li><span>天空盒 → 天空盒</span><b>keyword:Skybox</b></li>";
    h += "</ul></section></div></div>";
    return h;
  }

  /* ---------- booth browser (console) ---------- */
  function boothPage() {
    var st = stats();
    var h = "<div class=\"ef-head\"><h1>内置浏览器 <small>BOOTH BROWSER</small></h1><p>可编辑搜索词，打开商品直接应用；支持官方网页登录、喜欢、Gift、已购资料库与下载登记。</p></div>";
    h += "<div class=\"viewer\"><div class=\"vbar\">";
    h += "<div class=\"ef-search\"><input type=\"search\" id=\"bq\" value=\"VRChat\" placeholder=\"BOOTH 搜索词\"><button class=\"ef-btn go small\">搜索</button></div>";
    h += "<div class=\"ef-seg\" role=\"tablist\"><button class=\"is-on\" role=\"tab\">全局搜索</button><button role=\"tab\">已购资料库</button><button role=\"tab\">商品页</button></div>";
    h += "</div><div class=\"vdoc\"><div class=\"url\"><span class=\"ef-field\">https://booth.pm/ja/search/VRChat</span><button class=\"ef-btn small\">打开</button></div>";
    h += "<div class=\"vshop\"><span class=\"ef-pair\"><small>// VIEW / 网页视图</small><span>BOOTH</span></span><p class=\"ef-empty\">内置网页视图在本静态原型中以占位呈现；正式版由 Electron WebContentsView 挂载并持久化登录态。</p></div>";
    h += "<div class=\"vimgs\">";
    // show three representative item thumbs from real covers
    ["6405390", "7328764", "6732684"].forEach(function (id) {
      h += "<div class=\"cand\"><img src=\"covers/" + id + ".jpg\" alt=\"\" loading=\"lazy\"><div class=\"t\"><b>商品 " + id + "</b><span>BOOTH</span></div><div class=\"acts\"><button class=\"ef-btn small\">应用</button></div></div>";
    });
    h += "</div></div><div class=\"stack\">";
    h += "<section class=\"ef-panel\"><h2>登录状态 <small>SESSION</small></h2><ul class=\"ef-ledger\"><li><span>BOOTH 账号</span><b>未登录</b></li><li><span>已购资料库</span><b>需登录后读取</b></li><li><span>下载登记</span><b>登录后可用</b></li></ul></section>";
    h += "<section class=\"ef-panel\"><h2>快捷入口 <small>LINKS</small></h2><ul class=\"ef-rows\">";
    [["喜欢 / Like", "商品页心形按钮"], ["Gift", "商品页 Gift 入口"], ["已购资料库", "accounts.booth.pm/library"], ["下载登记", "library 内登记"]].forEach(function (p) {
      h += "<li><div><b>" + p[0] + "</b><span class=\"meta\"><span>" + p[1] + "</span></span></div></li>";
    });
    h += "</ul></section></div></div>";
    return h;
  }

  /* ---------- network tasks (console) ---------- */
  function tasksPage() {
    var h = "<div class=\"ef-head\"><h1>网络任务 <small>TASKS</small></h1><p>正在读取的商品、下载进度、速度历史；支持并发、暂停、恢复、缓存和重试。</p></div>";
    h += "<div class=\"cols even\"><div>";
    h += "<div class=\"ef-group-head\"><span>// QUEUE / 任务队列</span><span class=\"ef-field\">3</span></div>";
    h += "<ul class=\"ef-rows flat\">";
    var tasks = [
      ["读取商品 8034710", "读取中", 0.62, "12.4 KB/s"],
      ["下载 6405390 封面", "下载中", 0.18, "1.2 MB/s"],
      ["登记已购 6732684", "排队中", 0.0, "—"]
    ];
    tasks.forEach(function (t) {
      h += "<li><div><b>" + t[0] + "</b><span class=\"meta\"><span>" + t[1] + "</span><span>" + t[3] + "</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">暂停</button><button class=\"ef-btn small\">重试</button></div></li>";
      if (t[2] > 0) h += "<div class=\"ef-progress\" style=\"margin:0 1.15rem .75rem\"><i style=\"--p:" + t[2] + "\"></i></div>";
    });
    h += "</ul>";
    h += "<div class=\"ef-group-head\"><span>// SPEED / 速度历史</span><span class=\"ef-field\">60 秒</span></div>";
    h += "<div class=\"trate\">";
    var sp = [3,5,4,8,12,9,15,20,18,26,22,30,28,35,40,38,44,50,46,52,58,55,60,57,63,61,66,64,70,68,72,71,75,73,78,76,80,79,82,84];
    sp.forEach(function (v) { h += "<span class=\"spark\" style=\"--v:" + (v / 84) + "\"></span>"; });
    h += "</div>";
    h += "<div class=\"ef-group-head\"><span>// CONCURRENCY / 并发与缓存</span></div>";
    h += "<ul class=\"ef-ledger\"><li><span>并发数</span><b>3</b></li><li><span>缓存目录</span><b>temp-explore/</b></li><li><span>重试上限</span><b>3 次</b></li><li><span>限速</span><b>未启用</b></li></ul>";
    h += "</div><div class=\"stack\">";
    h += "<section class=\"ef-panel\"><h2>看板 <small>BOARD</small></h2><div class=\"ef-figs\">" + fig("", "3", "任务", false, "") + fig("", "1.2 MB/s", "峰值速度", false, "") + fig("", "0", "失败", false, "") + "</div></section>";
    h += "<section class=\"ef-panel\"><h2>操作 <small>ACTIONS</small></h2><ul class=\"ef-rows\">";
    h += "<li><div><b>全部暂停</b><span class=\"meta\"><span>保留队列与断点</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">执行</button></div></li>";
    h += "<li><div><b>全部恢复</b><span class=\"meta\"><span>继续未完成任务</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">执行</button></div></li>";
    h += "<li><div><b>清空已完成</b><span class=\"meta\"><span>移除已完成记录</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">执行</button></div></li>";
    h += "</ul></section></div></div>";
    return h;
  }

  /* ---------- settings (console) ---------- */
  function settingsPage() {
    var h = "<div class=\"ef-head\"><h1>设置 <small>SETTINGS</small></h1><p>数据目录、主题、动效、关键词参与分类等全局默认。</p></div>";
    h += "<div class=\"cols even\"><div>";
    h += "<div class=\"ef-group-head\"><span>// THEME / 主题</span></div>";
    h += "<ul class=\"ef-setting\">";
    h += "<li><div><b>主题</b><span class=\"meta\"><span>跟随系统 / 浅色 / 深色</span></span></div><div class=\"acts\"><div class=\"ef-seg\"><button class=\"is-on\">跟随系统</button><button>浅色</button><button>深色</button></div></div></li>";
    h += "<li><div><b>动效</b><span class=\"meta\"><span>「静」等价 prefers-reduced-motion</span></span></div><div class=\"acts\"><label class=\"ef-switch\"><input type=\"checkbox\" checked><span>全开</span></label></div></li>";
    h += "</ul>";
    h += "<div class=\"ef-group-head\"><span>// DATA / 数据</span></div>";
    h += "<ul class=\"ef-setting\">";
    h += "<li><div><b>数据目录</b><span class=\"meta\"><span>便携模式：exe 同目录 VRCAssetLibraryData</span></span></div><div class=\"acts\"><span class=\"ef-field\">VRCAssetLibraryData</span></div></li>";
    h += "<li><div><b>扫描根</b><span class=\"meta\"><span>可指定任意文件夹或拖入压缩包</span></span></div><div class=\"acts\"><button class=\"ef-btn small\">选择文件夹</button></div></li>";
    h += "</ul>";
    h += "</div><div class=\"stack\">";
    h += "<div class=\"ef-group-head\"><span>// KEYWORD / 关键词</span></div>";
    h += "<ul class=\"ef-setting\">";
    h += "<li><div><b>关键词参与分类</b><span class=\"meta\"><span>人工分类永远优先；可关闭 keyword_rules</span></span></div><div class=\"acts\"><label class=\"ef-switch\"><input type=\"checkbox\" checked><span>启用</span></label></div></li>";
    h += "<li><div><b>关键词参与匹配</b><span class=\"meta\"><span>命中写 reasons_json，权重 0.15</span></span></div><div class=\"acts\"><label class=\"ef-switch\"><input type=\"checkbox\" checked><span>启用</span></label></div></li>";
    h += "</ul>";
    h += "<section class=\"ef-panel\"><h2>关于 <small>ABOUT</small></h2><ul class=\"ef-ledger\"><li><span>版本</span><b>0.1.0</b></li><li><span>技术栈</span><b>Electron 45 · React 19 · SQLite</b></li><li><span>样式</span><b>终末地风格 · 纯 CSS</b></li></ul></section>";
    h += "</div></div>";
    return h;
  }

  /* ---------- empty / error (console) ---------- */
  function emptyPage() {
    var h = "<div class=\"ef-head\"><h1>空态 <small>EMPTY</small></h1><p>以下为各视图在无数据时的一句话空态。</p></div>";
    h += "<div class=\"cols even\"><div>";
    h += "<p class=\"ef-empty\">图库还没有卡片：先扫描文件夹，或直接把压缩包拖进窗口。</p>";
    h += "<p class=\"ef-empty\">还没有匹配结果：换一个搜索词，或手动填写链接与编号。</p>";
    h += "<p class=\"ef-empty\">这个分类还没有素材：给它挂一个关键词，让分类更有依据。</p>";
    h += "<p class=\"ef-empty\">没有网络任务：打开内置浏览器读取商品，任务会显示在这里。</p>";
    h += "</div><div class=\"stack\">";
    h += "<section class=\"ef-panel\"><h2>错误态 <small>ERROR</small></h2><ul class=\"ef-ledger\">";
    h += "<li><span>网络不可达</span><b>离线灰态，不影响本地整理</b></li><li><span>商品已下架</span><b>候选降级为编号提示</b></li><li><span>压缩包损坏</span><b>跳过并记录，不阻塞扫描</b></li>";
    h += "</ul></section></div></div>";
    return h;
  }

  /* ---------- render router ---------- */
  function render(page, id) {
    var body = document.getElementById("ef");
    var nav = document.getElementById("nav");
    var pageKey = { gallery: "gallery", match: "match", classify: "classify", keywords: "keywords", booth: "booth", tasks: "tasks", settings: "settings", empty: "empty", welcome: "welcome", card: "card" }[page] || "gallery";
    if (nav) nav.innerHTML = cmdbar(pageKey === "card" ? "gallery" : pageKey);
    var html;
    switch (pageKey) {
      case "welcome": html = welcome(); break;
      case "card": html = cardDetail(id); break;
      case "match": html = matchPage(); break;
      case "classify": html = classifyPage(); break;
      case "keywords": html = keywordsPage(); break;
      case "booth": html = boothPage(); break;
      case "tasks": html = tasksPage(); break;
      case "settings": html = settingsPage(); break;
      case "empty": html = emptyPage(); break;
      default: html = gallery();
    }
    if (body) body.innerHTML = html;
    return html;
  }

  window.UI = {
    render: render,
    gallery: gallery,
    cardDetail: cardDetail,
    matchPage: matchPage,
    classifyPage: classifyPage,
    keywordsPage: keywordsPage,
    boothPage: boothPage,
    tasksPage: tasksPage,
    settingsPage: settingsPage,
    emptyPage: emptyPage,
    welcome: welcome,
    stats: stats,
    fmtBytes: fmtBytes,
    esc: esc
  };
})();
