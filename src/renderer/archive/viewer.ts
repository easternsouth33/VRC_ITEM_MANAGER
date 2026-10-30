import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { damp, type Spring } from "./motion";

// 六组结构拆解：与原装配一致的分组与深度。
const PARTS = [
  { id: "fasteners", label: "紧固件", en: "FASTENERS", depth: 2.75 },
  { id: "cover", label: "透明盖板", en: "OPTICAL COVER", depth: 1.85 },
  { id: "optical-lenses", label: "折射环组", en: "REFRACTIVE RINGS", depth: 0.75 },
  { id: "optical-core", label: "光学核心", en: "OPTICAL CORE", depth: -0.15 },
  { id: "substrate", label: "信息基板", en: "SUBSTRATE", depth: -1.1 },
  { id: "carrier", label: "背板与框架", en: "CARRIER", depth: -2.05 },
] as const;

export class ModelViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 120);
  private controls: OrbitControls;
  private groups = new Map<string, THREE.Group>();
  private spread: Spring = { value: 0, velocity: 0 };
  private targetSpread = 0;
  private clarity: Spring = { value: 1, velocity: 0 };
  private targetClarity = 1;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private loaded = false;
  onClose: () => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.scene.background = new THREE.Color("#eae5e1");
    const key = new THREE.DirectionalLight("#fff6ec", 3.0);
    key.position.set(6, 10, 8);
    this.scene.add(key, new THREE.HemisphereLight("#ffffff", "#c9bcb0", 1.1));
    this.camera.position.set(7.2, 3.8, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    window.addEventListener("resize", this.resize);
    this.resize();
  }
  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
  setTheme(dark: boolean) { this.scene.background = new THREE.Color(dark ? "#191919" : "#eae5e1"); }

  async load(url = "assets/models/archive-assembly.glb") {
    const gltf = await new GLTFLoader().loadAsync(url);
    // 按名称把部件分到六组；未匹配的进 carrier。
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    for (const p of PARTS) {
      const g = new THREE.Group();
      g.name = p.id;
      this.groups.set(p.id, g);
      this.scene.add(g);
    }
    const buckets: Record<string, THREE.Object3D[]> = {};
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const n = (o.name || "").toLowerCase();
      let part = "carrier";
      if (/screw|fastener|bolt/.test(n)) part = "fasteners";
      else if (/cover|glass|frosted|polymer/.test(n)) part = "cover";
      else if (/ring|lens|optical_edge|optic/.test(n)) part = "optical-lenses";
      else if (/core|diffuser|subsurface/.test(n)) part = "optical-core";
      else if (/substrate|label|inlay|printed/.test(n)) part = "substrate";
      (buckets[part] ||= []).push(o);
    });
    for (const [part, objs] of Object.entries(buckets)) {
      for (const o of objs) {
        const clone = o.clone();
        clone.applyMatrix4(o.matrixWorld);
        this.groups.get(part)!.add(clone);
      }
    }
    // 若分组全部落空（模型命名不同），退化为整体一组。
    const any = [...this.groups.values()].some((g) => g.children.length);
    if (!any) this.groups.get("carrier")!.add(root);
    this.loaded = true;
  }

  start() { if (!this.raf) { this.last = performance.now() / 1000; this.raf = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  explode() { this.targetSpread = 1; }
  assemble() { this.targetSpread = 0; }
  toggleSpread() { this.targetSpread = this.targetSpread > 0.5 ? 0 : 1; }
  setClarity(clear: boolean) { this.targetClarity = clear ? 1 : 0; }
  resetView() {
    this.camera.position.set(7.2, 3.8, 12);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - this.last);
    this.last = now;
    damp(this.spread, this.targetSpread, 6, dt);
    damp(this.clarity, this.targetClarity, 8, dt);
    for (const p of PARTS) {
      const g = this.groups.get(p.id);
      if (g) g.position.y = this.spread.value * p.depth;
    }
    this.groups.get("cover")?.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshPhysicalMaterial;
        if (m && "roughness" in m) {
          m.roughness = THREE.MathUtils.lerp(0.42, 0.04, this.clarity.value);
          if ("transmission" in m) m.transmission = THREE.MathUtils.lerp(0.75, 0.96, this.clarity.value);
        }
      }
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener("resize", this.resize);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
