import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  damp, smooth, easeOut, clamp, wrap, nearestOccurrence,
  selectionWave, idleWave, returnStep,
  COLUMN_SPACING, ROW_SPACING, INSPECTION_LIFT, type Spring,
} from "./motion";

export interface ArchiveCardData {
  id: number;
  name: string;
  category: string;
  boothId: string | null;
  coverUrl: string | null;
  favorite: boolean;
}

export type Cell = { lane: number; row: number };

// 阵列：五列分类循环，列内档案循环。每列 8 份可读档案。
const LANES = 5;
const ROWS = 16;

export class ArchiveScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 400);
  private cameraAim = new THREE.Vector3(-0.5, 1.1, 0.4);
  private model = new THREE.Group();
  private instances: THREE.InstancedMesh[] = [];
  private dummy = new THREE.Object3D();
  private raf = 0;
  private last = 0;
  private clock = 0;
  private disposed = false;
  private loaded = false;
  debugInfo: any = null;
  private reveal = 0;
  private detail = 0;
  private targetDetail = 0;
  private lift: Spring = { value: 0, velocity: 0 };
  private rail: Spring = { value: 0, velocity: 0 };
  private columnCamera: Spring = { value: 0, velocity: 0 };
  private rotation = 0;
  private targetRotation = 0;
  private clarity = 0;
  private targetClarity = 0;
  private pulse: { cell: Cell; time: number } | null = null;
  private hoverLifts = new Map<string, number>();
  private pointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private dragging = false;
  private dragStart = { x: 0, y: 0, rail: 0, lane: 0 };
  private dragMoved = false;
  private dark = false;

  // 数据：按列（分类）分组，列内循环。
  private columns: ArchiveCardData[][] = [];
  private selected: Cell = { lane: 2, row: 0 };
  private memory: number[] = [0, 0, 0, 0, 0]; // 切列保留列内选择记忆
  onSelect: (card: ArchiveCardData | null) => void = () => {};
  onOpen: (card: ArchiveCardData) => void = () => {};
  onHover: (card: ArchiveCardData | null) => void = () => {};

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.setBackground();
    this.camera.position.set(-62.26, 35.98, 43.28);
    this.camera.lookAt(this.cameraAim);

    const key = new THREE.DirectionalLight("#fff6ec", 2.2);
    key.position.set(-6, 14, 9);
    key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 15, bottom: -15, near: 0.1, far: 45 });
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0003;
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#c9bcb0", 0.7));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: "#d8c9b9", roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.63;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.bindPointer();
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  private setBackground() {
    const bg = this.dark ? "#191919" : "#eae5e1";
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = null;
  }
  setTheme(dark: boolean) { this.dark = dark; this.setBackground(); }

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  setData(columns: ArchiveCardData[][]) {
    this.columns = columns;
    this.memory = columns.map(() => 0);
    this.selected = { lane: Math.min(2, columns.length - 1), row: 0 };
  }
  cardAt(cell: Cell): ArchiveCardData | null {
    if (!this.columns.length) return null;
    const files = this.columns[wrap(cell.lane, this.columns.length)] || [];
    if (!files.length) return null;
    return files[wrap(cell.row, files.length)];
  }
  get selectedCard() { return this.cardAt(this.selected); }

  async load(url = "assets/models/archive-cassette.glb") {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    const count = LANES * ROWS;
    const arraySurfaces = ["Frosted_Polymer", "Ivory_Edges", "Titanium_Fasteners", "Index_Inlay", "Optical_Diffuser"];
    for (const mesh of meshes) {
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const source = mesh.material as THREE.MeshStandardMaterial;
      const name = source.name.replace(/\.\d+$/, "");
      if (name === "Carbon_Ink") continue;
      const mat = source.clone() as THREE.MeshPhysicalMaterial;
      mat.envMapIntensity = 0.6;
      this.tuneMaterial(name, mat);
      const selected = new THREE.Mesh(geom, mat);
      selected.userData.surface = name;
      selected.castShadow = true;
      selected.receiveShadow = true;
      this.model.add(selected);
      if (!arraySurfaces.includes(name)) continue;
      const arrayMat = mat.clone();
      if (name === "Frosted_Polymer") { arrayMat.transmission = 0.35; arrayMat.roughness = 0.34; }
      const inst = new THREE.InstancedMesh(geom, arrayMat, count);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = name === "Optical_Diffuser";
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.instances.push(inst);
      this.scene.add(inst);
    }
    this.scene.add(this.model);
    const bounds = new THREE.Box3().setFromObject(this.model);
    this.debugInfo = { meshes: this.model.children.length, instances: this.instances.length, min: bounds.min.toArray(), max: bounds.max.toArray() };
    (this.container as any).__archiveScene = this;
    this.loaded = true;
    this.emitSelect();
    return gltf;
  }

  private tuneMaterial(name: string, mat: THREE.MeshPhysicalMaterial) {
    if (name === "Frosted_Polymer") {
      mat.color.set("#e4ddd5"); mat.transmission = 0.45; mat.thickness = 0.12;
      mat.roughness = 0.21; mat.ior = 1.46;
      mat.attenuationColor = new THREE.Color("#eee6df"); mat.attenuationDistance = 2;
    } else if (name === "Internal_Ceramic") { mat.color.set("#c7beb6"); mat.roughness = 0.6; }
    else if (name === "Printed_Label") mat.color.set("#eae5dc");
    else if (name === "Ivory_Edges") { mat.color.set("#f0e7df"); mat.roughness = 0.31; mat.transmission = 0.65; mat.thickness = 0.04; }
    else if (name === "Optical_Diffuser") { mat.color.set("#e2dad4"); mat.transmission = 0; mat.roughness = 0.7; }
    else if (name === "Subsurface_Optics") { mat.color.set("#b9aba1"); mat.roughness = 0.48; mat.metalness = 0.05; }
    else if (name === "Optical_Edges") { mat.transmission = 0; mat.color.set("#d4c7be"); mat.roughness = 0.26; mat.metalness = 0.08; }
  }

  start() { if (!this.raf) { this.last = performance.now() / 1000; this.raf = requestAnimationFrame(this.tick); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  navigate(axis: "row" | "lane", dir: number) {
    if (this.targetDetail) return;
    if (axis === "lane") {
      const next = wrap(this.selected.lane + dir, this.columns.length || LANES);
      this.memory[this.selected.lane] = this.selected.row;
      this.selected = { lane: next, row: this.memory[next] ?? 0 };
      this.targetRotation = 0;
    } else {
      this.selected = { lane: this.selected.lane, row: this.selected.row + dir };
    }
    this.pulse = { cell: { ...this.selected }, time: this.clock };
    this.rotation = 0;
    this.emitSelect();
  }
  selectCell(cell: Cell) {
    this.memory[this.selected.lane] = this.selected.row;
    this.selected = { ...cell };
    this.pulse = { cell: { ...cell }, time: this.clock };
    this.rotation = 0;
    this.emitSelect();
  }
  private emitSelect() { this.onSelect(this.selectedCard); }
  openDetail() { this.targetDetail = 1; this.targetClarity = 1; const c = this.selectedCard; if (c) this.onOpen(c); }
  closeDetail() { this.targetDetail = 0; this.targetClarity = 0; }

  private cellPosition(cell: Cell): THREE.Vector3 {
    return new THREE.Vector3((cell.lane - 2) * COLUMN_SPACING, 0, (cell.row - 7.5) * ROW_SPACING);
  }
  private visibleCell(index: number): Cell {
    const lane = nearestOccurrence(Math.floor(index / ROWS), this.selected.lane, LANES);
    const row = nearestOccurrence(index % ROWS, this.selected.row, ROWS);
    return { lane, row };
  }

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - this.last);
    this.last = now;
    this.clock += dt;
    if (!this.loaded) return;
    const t = this.clock;

    // 选中卡片升降 + 镜头详情插值
    damp(this.lift, this.targetDetail ? INSPECTION_LIFT : 0.4, this.targetDetail ? 4.2 : 4.2, dt);
    const cameraTarget = this.targetDetail ? smooth((this.lift.value - 0.8) / 2.4) : smooth((this.lift.value - 0.4) / (INSPECTION_LIFT - 0.4));
    this.detail = THREE.MathUtils.lerp(this.detail, cameraTarget, 1 - Math.exp(-dt * 6));
    const detail = this.detail;
    this.reveal = Math.min(1, this.reveal + dt * 0.8);
    this.clarity = THREE.MathUtils.lerp(this.clarity, this.targetClarity, 1 - Math.exp(-dt * 5));

    // 选中卡旋转（详情里允许检查）
    if (this.targetDetail) this.rotation = THREE.MathUtils.lerp(this.rotation, this.targetRotation, 1 - Math.exp(-dt * 8));
    else this.rotation = returnStep(this.rotation, dt);

    // 选中列/行相机轨道
    damp(this.columnCamera, (this.selected.lane - 2) * COLUMN_SPACING, 7, dt);
    damp(this.rail, -(this.selected.row - 7.5) * ROW_SPACING, 7, dt);
    const trackX = this.columnCamera.value;

    const field = (row: number, lane: number) => {
      let v = idleWave(row, lane, t) * (1 - detail);
      if (this.pulse) {
        const age = t - this.pulse.time;
        const d = Math.hypot(row - this.pulse.cell.row, (lane - this.pulse.cell.lane) * 2.2);
        v += selectionWave(d, age);
        if (age > 3.2) this.pulse = null;
      }
      return v;
    };

    // 实例化阵列
    const entryZ = -28 * (1 - easeOut(this.reveal));
    let i = 0;
    for (let index = 0; index < LANES * ROWS; index++) {
      const cell = this.visibleCell(index);
      const p = this.cellPosition(cell);
      const y = p.y + field(cell.row, cell.lane);
      this.dummy.position.set(p.x - trackX, y - this.presentationDrop(cell), p.z + entryZ + this.rail.value);
      this.dummy.rotation.set(
        (field(cell.row + 0.5, cell.lane) - field(cell.row - 0.5, cell.lane)) * 0.024 * (1 - detail), 0, 0,
      );
      this.dummy.updateMatrix();
      for (const inst of this.instances) inst.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    for (const inst of this.instances) inst.instanceMatrix.needsUpdate = true;

    // 选中卡片：仅竖直升降，横向/纵深不变；靠近与转向交给镜头。
    const chosen = this.cellPosition(this.selected);
    const selY = chosen.y + field(this.selected.row, this.selected.lane) + this.lift.value;
    this.model.position.set(chosen.x - trackX, selY, chosen.z + entryZ + this.rail.value);
    this.model.rotation.set(0, this.rotation, 0);
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshPhysicalMaterial;
        if (o.userData.surface === "Frosted_Polymer") m.roughness = THREE.MathUtils.lerp(0.42, 0.04, this.clarity);
        if (o.userData.surface === "Frosted_Polymer") m.transmission = THREE.MathUtils.lerp(0.35, 0.62, this.clarity);
      }
    });

    // 镜头：阵列视角 → 详情左侧构图
    const yaw = THREE.MathUtils.degToRad(59);
    const elevation = THREE.MathUtils.degToRad(19);
    const viewDirection = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation),
    );
    viewDirection.lerp(new THREE.Vector3(-0.277, 0.238, 0.931), detail).normalize();
    const distance = THREE.MathUtils.lerp(30, 10.5, detail);
    const arrayAim = new THREE.Vector3(-1.091, -0.045, 0.481);
    const aim = arrayAim.clone();
    if (detail > 0.001) {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), viewDirection).normalize();
      const up = new THREE.Vector3().crossVectors(viewDirection, right).normalize();
      const pixelScale = 1080 / 12;
      const anchor = this.model.position.clone().add(new THREE.Vector3(-2.5, 3.7, 0));
      anchor.addScaledVector(right, -(518 - 960) / pixelScale);
      anchor.addScaledVector(up, -(540 - 287) / pixelScale);
      aim.lerp(anchor, detail);
    }
    this.cameraAim.copy(aim);
    this.camera.position.copy(aim).addScaledVector(viewDirection, distance);
    this.camera.lookAt(aim);
    this.renderer.render(this.scene, this.camera);
  };

  private presentationDrop(_cell: Cell) { return 0; }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true; this.dragMoved = false;
      this.dragStart = { x: e.clientX, y: e.clientY, rail: this.selected.row, lane: this.selected.lane };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (this.dragging && !this.targetDetail) {
        const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.dragMoved = true;
        // 水平切列 / 垂直切档，阈值步进
        const laneDelta = Math.round(dx / 90);
        const rowDelta = Math.round(dy / 46);
        if (laneDelta !== 0 || rowDelta !== 0) {
          const targetLane = wrap(this.dragStart.lane - laneDelta, this.columns.length || LANES);
          const targetRow = this.dragStart.rail + rowDelta;
          if (targetLane !== this.selected.lane || targetRow !== this.selected.row) {
            this.memory[this.selected.lane] = this.selected.row;
            this.selected = { lane: targetLane, row: targetRow };
            this.emitSelect();
          }
        }
      }
      if (this.dragging && this.targetDetail) {
        this.targetRotation += (e.movementX || 0) * 0.008;
      }
    });
    el.addEventListener("pointerup", (e) => {
      this.dragging = false;
      if (!this.dragMoved && !this.targetDetail) {
        // 点选：射线找实例
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.instances, false);
        if (hits.length && hits[0].instanceId !== undefined) {
          const cell = this.visibleCell(hits[0].instanceId);
          this.selectCell(cell);
          this.pulse = { cell, time: this.clock };
        } else {
          this.openDetail();
        }
      } else if (!this.dragMoved && this.targetDetail) {
        this.closeDetail();
      }
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!this.targetDetail) this.navigate("row", e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    el.addEventListener("dblclick", () => { if (!this.targetDetail) this.openDetail(); });
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener("resize", this.resize);
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
