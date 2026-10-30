import React, { useEffect, useRef, useState } from "react";

// 压缩时间轴（秒）。阶段：access 逐字输入 → logo 标志绘制 → auth 身份/权限 → scan 圆环扫描 → welcome 欢迎转场。
const T = { access: 0.0, logo: 1.5, auth: 2.4, scan: 3.4, welcome: 4.6, done: 5.8 };

function typed(text: string, t: number, start: number, cps = 26) {
  const n = Math.floor((t - start) * cps);
  return n <= 0 ? "" : text.slice(0, Math.min(text.length, n));
}
const arc = (r: number, start: number, sweep: number, x = 960, y = 540) => {
  const pt = (a: number) => `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`;
  if (sweep >= Math.PI * 1.999) return `M${pt(start)}A${r},${r} 0 1 1 ${pt(start + Math.PI)}A${r},${r} 0 1 1 ${pt(start + Math.PI * 2)}`;
  return `M${pt(start)}A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${pt(start + sweep)}`;
};

export function ArchiveBoot({ done, dark }: { done: () => void; dark: boolean }) {
  const [t, setT] = useState(0);
  const [fading, setFading] = useState(false);
  const raf = useRef(0);
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = performance.now() / 1000;
    const step = () => {
      const now = performance.now() / 1000 - startRef.current;
      setT(now);
      if (now < T.done) raf.current = requestAnimationFrame(step);
      else { setFading(true); setTimeout(done, 320); }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [done]);
  const skip = () => { cancelAnimationFrame(raf.current); setFading(true); setTimeout(done, 200); };

  const step = t < T.logo ? "access" : t < T.auth ? "logo" : t < T.scan ? "auth" : t < T.welcome ? "scan" : "welcome";
  const access = typed("ACCESS PERMISSION REQUIRED", t, 0.15);
  const auth = t < T.scan ? typed("ID CONFIRMED : OPERATOR", t, T.auth + 0.1) : "";
  const perm = t >= T.scan ? typed("PERMISSION AUTHORIZED", t, T.scan + 0.2) : "";
  // 扫描圆环参数：半径收束 + 弧端旋转
  const scanP = Math.min(1, Math.max(0, (t - T.scan) / (T.welcome - T.scan)));
  const radius = 900 - 640 * scanP;
  const whiteRadius = 700 - 480 * scanP;
  const outerStart = (470 - 560 * scanP) * Math.PI / 180;
  const outerSweep = (30 + 330 * scanP) * Math.PI / 180;
  const innerR = 124 - 36 * scanP;
  const welcome = step === "welcome";
  const ink = dark ? "#EDEDED" : "#080a08";
  const paper = dark ? "#191919" : "#eae5e1";

  return (
    <div className={"aboot" + (fading ? " is-out" : "")} style={{ background: paper, color: ink }} onClick={skip}>
      <svg className="aboot-svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        {/* 品牌三行 */}
        <g className="aboot-brand" style={{ opacity: t > 0.6 ? 1 : 0, transform: `translateX(${Math.max(0, 60 - t * 90)}px)` }}>
          <text x="120" y="150" fontSize="44" fontWeight="750" letterSpacing="2.3" fill={ink}>VRC LIBRARY</text>
          <text x="120" y="186" fontSize="19" fontWeight="600" letterSpacing="0.6" fill={ink}>ARCHIVE TERMINAL</text>
          <text x="120" y="228" fontSize="35" fontWeight="750" letterSpacing="3" fill={ink}>ANALYSIS OS</text>
        </g>
        {/* 逐字输入 */}
        <text className="aboot-access" x="960" y="560" textAnchor="middle" fontSize="30" letterSpacing="6" fill={ink} style={{ opacity: step === "access" ? 1 : 0 }}>
          {access}<tspan className="aboot-caret">▌</tspan>
        </text>
        {/* 标志绘制：连续笔画 */}
        <g style={{ opacity: step === "logo" ? 1 : 0 }}>
          <path d="M900 540 L960 480 L1020 540 L960 600 Z" fill="none" stroke={ink} strokeWidth="6"
            strokeDasharray="340" strokeDashoffset={340 - 340 * Math.min(1, (t - T.logo) / 0.7)} />
          <text x="960" y="660" textAnchor="middle" fontSize="40" fontWeight="750" letterSpacing="4" fill={ink}>
            {typed("VRC·LIBRARY", t, T.logo + 0.2, 18)}
          </text>
        </g>
        {/* 身份验证 */}
        <text x="960" y="560" textAnchor="middle" fontSize="28" letterSpacing="4" fill={ink} style={{ opacity: step === "auth" ? 1 : 0 }}>
          {auth}
        </text>
        {/* 权限扫描：外环 + 白环 + 内环 + 轨道点 */}
        <g style={{ opacity: step === "scan" ? 1 : 0 }}>
          <path d={arc(radius, outerStart, outerSweep)} fill="none" stroke={ink} strokeWidth="2.4" />
          <path d={arc(whiteRadius, outerStart * 0.6, outerSweep)} fill="none" stroke={dark ? "#FFFA00" : "#fff"} strokeWidth="4" />
          <path d={arc(innerR, outerStart * 1.4, 2.3)} fill="none" stroke={ink} strokeWidth="2" />
          <path d={arc(innerR, outerStart * 1.4 + Math.PI, 2.3)} fill="none" stroke={ink} strokeWidth="2" />
          {Array.from({ length: 6 }).map((_, i) => {
            const a = t * 2 + i * Math.PI / 3;
            return <circle key={i} cx={960 + Math.cos(a) * (innerR + 30)} cy={540 + Math.sin(a) * (innerR + 30)} r="5" fill={ink} />;
          })}
          <circle cx="960" cy="540" r={10 + 6 * Math.sin(t * 12)} fill={dark ? "#FFFA00" : ink} />
          <text x="960" y={540 + radius + 60} textAnchor="middle" fontSize="26" letterSpacing="5" fill={ink}>{perm}</text>
        </g>
        {/* 欢迎转场 */}
        <g style={{ opacity: welcome ? 1 : 0, transform: `scale(${welcome ? 1 : 0.96})`, transformOrigin: "960px 540px", transition: "transform .5s, opacity .4s" }}>
          <text x="960" y="500" textAnchor="middle" fontSize="54" fontWeight="750" letterSpacing="6" fill={ink}>WELCOME TO</text>
          <text x="960" y="570" textAnchor="middle" fontSize="40" fontWeight="600" letterSpacing="4" fill={ink}>VRC LIBRARY.LLC.</text>
          <text x="960" y="640" textAnchor="middle" fontSize="24" letterSpacing="8" fill={ink}>INTERNAL DATABASE</text>
        </g>
      </svg>
      <div className="aboot-powered" style={{ color: ink }}>POWERED BY VRC LIBRARY <i style={{ background: ink }} /></div>
      <button className="aboot-skip" onClick={skip}>跳过开场 ↗</button>
    </div>
  );
}
