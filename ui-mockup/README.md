# UI 原型（终末地风格）— ui-mockup

静态多屏 HTML 原型，用真实扫描数据（46 卡 / 1708 文件 / 42.2 GB）渲染 VRChat 素材库的 10 个界面。

## 打开方式
直接双击任意 .html 即可离线打开（字体、封面、脚本全部本地，无外部请求）。
如需经 HTTP 服务查看：在 ui-mockup 目录起任意静态服务，例如
```
npx http-server -p 8080
```
或
```
python -m http.server 8080
```
然后访问 http://127.0.0.1:8080/welcome.html 。

## 页面清单（计划书 §5.12.3 的 10 屏）
| 文件 | 界面 | 页面型态 |
| --- | --- | --- |
| welcome.html | 启动欢迎 | 展示 |
| index.html | 图库主界面（圆盘 + 看板 + 记录行） | 控制台 |
| card.html?id=C004 | 卡片详情（阅读 + 局部控制台，两栏） | 阅读/控制台 |
| match.html | 匹配待办（候选封面按行比较） | 控制台 |
| classify.html | 分类树 | 控制台 |
| keywords.html | 关键词管理 | 控制台 |
| booth.html | 内置 BOOTH 浏览器 | 控制台 |
| tasks.html | 网络任务（进度/速度历史/并发） | 控制台 |
| settings.html | 设置 | 控制台 |
| empty.html | 空态与错误态 | 控制台 |

## 资产
- assets/endfield.css — 终末地设计规范（56 KB，纯 CSS 变量 + 类）
- assets/app.css — 本应用自有版式（仅布局，不重复风格）
- assets/ui.js — 静态渲染器（读 data.js，生成各屏 HTML）
- assets/boot.js — 页面接线（ES module：圆盘、筛选、搜索、主题、动效）
- assets/dial.js / fx.js / variant.js — 圆盘与微动效（来自 skill）
- assets/fonts — Saira 可变字体 + 思源黑体（自托管，font-display: optional）
- covers/ — 20 张真实 BOOTH 封面（300×300）
- data.js — 真实扫描聚合数据（window.VRCA_DATA）
- candidates.js — BOOTH 搜索候选（window.VRCA_CANDIDATES，C039/C035/C038）
- shots/ — 10 屏 1280×900 截图

## 已验证（headless Edge CDP）
- 10 屏全部渲染非空：PASS
- 四宽度（375 / 768 / 1024 / 1440）无横向滚动：PASS
- 深浅两主题切换（--ef-paper 浅 #f4f4f2 / 深 #191919）：PASS
- Saira Variable 与 Noto Sans SC Variable 均 loaded：PASS
- prefers-reduced-motion 下 animation 与 transition 全禁（计数 0）：PASS
- 黄色 #FFFA00 未用作正文文字色：PASS（空）
