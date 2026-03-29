import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useAppStore } from '../store/appStore';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────
const NODE_R = 28;           // sphere radius
const ARROW_R = 6;           // arrowhead cone radius
const ARROW_H = 16;          // arrowhead cone height

// ── Types ──────────────────────────────────────────────────────────────────
interface NodeObj {
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  label: CSS2DObject;
}

interface EdgeObj {
  line: THREE.Line;
  arrow: THREE.Mesh;
  hitbox: THREE.Mesh;
  midPivot: THREE.Object3D;
  labelObj: CSS2DObject;
  sourceId: string;
  targetId: string;
}

// ── 3-D force-directed layout (Fruchterman–Reingold) ──────────────────────
function forceLayout(
  nodeIds: string[],
  links: { source: string; target: string }[],
  iterations = 280,
): Map<string, THREE.Vector3> {
  const n = nodeIds.length;
  if (n === 0) return new Map();

  const spread = Math.max(280, n * 70);
  const xs = Float64Array.from({ length: n }, () => (Math.random() - 0.5) * spread);
  const ys = Float64Array.from({ length: n }, () => (Math.random() - 0.5) * spread);
  const zs = Float64Array.from({ length: n }, () => (Math.random() - 0.5) * spread * 0.55);
  const idx = new Map(nodeIds.map((id, i) => [id, i]));

  const k  = Math.cbrt((spread ** 3) / n) * 0.85;
  let   T  = spread * 0.32;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    fx.fill(0); fy.fill(0); fz.fill(0);

    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = xs[j]-xs[i], dy = ys[j]-ys[i], dz = zs[j]-zs[i];
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
        const f  = (k * k) / d;
        const nx = dx/d*f, ny = dy/d*f, nz = dz/d*f;
        fx[i] -= nx; fy[i] -= ny; fz[i] -= nz;
        fx[j] += nx; fy[j] += ny; fz[j] += nz;
      }
    }

    // Attraction
    for (const { source, target } of links) {
      const a = idx.get(source), b = idx.get(target);
      if (a === undefined || b === undefined) continue;
      const dx = xs[b]-xs[a], dy = ys[b]-ys[a], dz = zs[b]-zs[a];
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
      const f  = (d * d) / k;
      const nx = dx/d*f, ny = dy/d*f, nz = dz/d*f;
      fx[a] += nx; fy[a] += ny; fz[a] += nz;
      fx[b] -= nx; fy[b] -= ny; fz[b] -= nz;
    }

    // Light gravity to center
    for (let i = 0; i < n; i++) {
      fx[i] -= xs[i] * 0.012;
      fy[i] -= ys[i] * 0.012;
      fz[i] -= zs[i] * 0.012;
    }

    // Apply with temperature cap
    for (let i = 0; i < n; i++) {
      const speed = Math.sqrt(fx[i]**2 + fy[i]**2 + fz[i]**2) || 0.001;
      const c = Math.min(speed, T) / speed;
      xs[i] += fx[i] * c;
      ys[i] += fy[i] * c;
      zs[i] += fz[i] * c;
    }
    T *= 0.96;
  }

  return new Map(nodeIds.map((id, i) => [id, new THREE.Vector3(xs[i], ys[i], zs[i])]));
}

// ── Visual-state application ───────────────────────────────────────────────
function applyVisualStates(
  nodeMap : Map<string, NodeObj>,
  edgeMap : Map<string, EdgeObj>,
  selEntity : string | null,
  selRel    : string | null,
  hlEntities: string[],
  hlRels    : string[],
  edgeColorHex: number,
) {
  const hlEntitySet = new Set(hlEntities);
  const hlRelSet    = new Set(hlRels);
  const hasSelection = selEntity != null || selRel != null;

  // Build active sets (selection + neighbours)
  const activeNodes = new Set<string>();
  const activeEdges = new Set<string>();
  if (selEntity) {
    activeNodes.add(selEntity);
    edgeMap.forEach((e, id) => {
      if (e.sourceId === selEntity || e.targetId === selEntity) {
        activeEdges.add(id);
        activeNodes.add(e.sourceId);
        activeNodes.add(e.targetId);
      }
    });
  }
  if (selRel) {
    activeEdges.add(selRel);
    const e = edgeMap.get(selRel);
    if (e) { activeNodes.add(e.sourceId); activeNodes.add(e.targetId); }
  }

  nodeMap.forEach((o, id) => {
    const mat     = o.mesh.material as THREE.MeshPhongMaterial;
    const glowMat = o.glow.material as THREE.MeshBasicMaterial;
    const orig    = o.mesh.userData.origColor as number;

    mat.color.setHex(orig);
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0.05;
    mat.opacity = 1;
    mat.transparent = false;

    if (id === selEntity) {
      mat.emissive.setHex(0x0078D4); mat.emissiveIntensity = 0.65;
      o.mesh.scale.setScalar(1.28);  o.glow.scale.setScalar(1.28);
      glowMat.opacity = 0.30;
    } else if (hlEntitySet.has(id)) {
      mat.emissive.setHex(0xFFB900); mat.emissiveIntensity = 0.50;
      o.mesh.scale.setScalar(1.18);  o.glow.scale.setScalar(1.18);
      glowMat.opacity = 0.22;
    } else if (hasSelection && activeNodes.has(id)) {
      o.mesh.scale.setScalar(1.0); o.glow.scale.setScalar(1.0);
      glowMat.opacity = 0.10;
    } else if (hasSelection) {
      o.mesh.scale.setScalar(1.0); o.glow.scale.setScalar(1.0);
      glowMat.opacity = 0.03;
      mat.opacity = 0.22; mat.transparent = true;
    } else {
      o.mesh.scale.setScalar(1.0); o.glow.scale.setScalar(1.0);
      glowMat.opacity = 0.10;
    }
  });

  edgeMap.forEach((o, id) => {
    const lm = o.line.material  as THREE.LineBasicMaterial;
    const am = o.arrow.material as THREE.MeshPhongMaterial;
    const el = o.labelObj.element as HTMLElement;
    am.emissive.setHex(0x000000); am.emissiveIntensity = 0;

    if (id === selRel) {
      lm.color.setHex(0x0078D4); am.color.setHex(0x0078D4);
      am.emissive.setHex(0x0078D4); am.emissiveIntensity = 0.55;
      el.style.color = '#4FC3F7'; el.style.opacity = '1';
      lm.opacity = 1; lm.transparent = false;
      am.opacity = 1; am.transparent = false;
    } else if (hlRelSet.has(id)) {
      lm.color.setHex(0xFFB900); am.color.setHex(0xFFB900);
      am.emissive.setHex(0xFFB900); am.emissiveIntensity = 0.45;
      el.style.color = '#FFB900'; el.style.opacity = '1';
      lm.opacity = 1; lm.transparent = false;
      am.opacity = 1; am.transparent = false;
    } else if (hasSelection && activeEdges.has(id)) {
      lm.color.setHex(edgeColorHex); am.color.setHex(edgeColorHex);
      el.style.color = ''; el.style.opacity = '0.75';
      lm.opacity = 0.75; lm.transparent = false;
      am.opacity = 0.75; am.transparent = false;
    } else if (hasSelection) {
      lm.color.setHex(edgeColorHex); am.color.setHex(edgeColorHex);
      el.style.opacity = '0.12';
      lm.opacity = 0.12; lm.transparent = true;
      am.opacity = 0.12; am.transparent = true;
    } else {
      lm.color.setHex(edgeColorHex); am.color.setHex(edgeColorHex);
      el.style.color = ''; el.style.opacity = '1';
      lm.opacity = 1; lm.transparent = false;
      am.opacity = 1; am.transparent = false;
    }
  });
}

export function OntologyGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef   = useRef(true);

  // Three.js object refs
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const css2dRef    = useRef<CSS2DRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef      = useRef<number>(0);

  // Scene-object maps (id → objects)
  const nodeMap = useRef<Map<string, NodeObj>>(new Map());
  const edgeMap = useRef<Map<string, EdgeObj>>(new Map());

  const {
    currentOntology,
    selectedEntityId,
    selectedRelationshipId,
    highlightedEntities,
    highlightedRelationships,
    selectEntity,
    selectRelationship,
    activeQuest,
    currentStepIndex,
    advanceQuestStep,
    darkMode,
  } = useAppStore();

  // Stable refs so pointer-event handlers inside the effect stay current
  const selectEntityRef   = useRef(selectEntity);
  const selectRelRef      = useRef(selectRelationship);
  const activeQuestRef    = useRef(activeQuest);
  const stepIndexRef      = useRef(currentStepIndex);
  const advanceRef        = useRef(advanceQuestStep);
  useEffect(() => {
    selectEntityRef.current = selectEntity;
    selectRelRef.current    = selectRelationship;
    activeQuestRef.current  = activeQuest;
    stepIndexRef.current    = currentStepIndex;
    advanceRef.current      = advanceQuestStep;
  }, [selectEntity, selectRelationship, activeQuest, currentStepIndex, advanceQuestStep]);

  const themeColors = useMemo(() => darkMode
    ? { edgeHex: 0x505050, nodeLabel: '#B3B3B3', edgeLabel: '#888888', edgeLabelBg: 'rgba(0,0,0,0.5)' }
    : { edgeHex: 0x888888, nodeLabel: '#2A2A2A', edgeLabel: '#555555', edgeLabelBg: 'rgba(255,255,255,0.75)' },
  [darkMode]);

  // ── Main Three.js effect — rebuilds the whole scene when ontology changes ──
  useEffect(() => {
    if (!containerRef.current) return;
    mountedRef.current = true;
    const container = containerRef.current;
    const w = Math.max(container.clientWidth,  1);
    const h = Math.max(container.clientHeight, 1);

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(55, w / h, 1, 8000);
    camera.position.set(0, 0, 800);
    cameraRef.current = camera;

    // WebGL renderer — transparent so the CSS chess-board shows through
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // CSS2D renderer for HTML labels
    const css2d = new CSS2DRenderer();
    css2d.setSize(w, h);
    css2d.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(css2d.domElement);
    css2dRef.current = css2d;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(300, 400, 500);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9999ff, 0.25);
    fill.position.set(-300, -200, -300);
    scene.add(fill);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.minDistance    = 60;
    controls.maxDistance    = 3000;
    controlsRef.current = controls;

    // ── Build nodes + edges ───────────────────────────────────────────────
    nodeMap.current.clear();
    edgeMap.current.clear();

    const nodeIds = currentOntology.entityTypes.map(e => e.id);
    const links   = currentOntology.relationships
      .filter(r => r.from && r.to && r.from !== r.to)
      .map(r => ({ source: r.from, target: r.to }));

    const positions  = forceLayout(nodeIds, links);
    const sphereGeo  = new THREE.SphereGeometry(NODE_R, 28, 28);
    const glowGeo    = new THREE.SphereGeometry(NODE_R * 1.45, 20, 20);
    const arrowGeo   = new THREE.ConeGeometry(ARROW_R, ARROW_H, 10);

    for (const entity of currentOntology.entityTypes) {
      const pos      = positions.get(entity.id) ?? new THREE.Vector3();
      const colorInt = parseInt(entity.color.replace('#', ''), 16);

      const mat = new THREE.MeshPhongMaterial({
        color: colorInt, emissive: 0x000000, emissiveIntensity: 0.05, shininess: 90,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.userData = { id: entity.id, origColor: colorInt };
      scene.add(mesh);

      const glowMat = new THREE.MeshBasicMaterial({
        color: colorInt, transparent: true, opacity: 0.1,
        side: THREE.BackSide, depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(pos);
      scene.add(glow);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'graph3d-label';
      labelDiv.textContent = `${entity.icon} ${entity.name}`;
      labelDiv.style.color = themeColors.nodeLabel;
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, -(NODE_R + 14), 0);
      mesh.add(label);

      nodeMap.current.set(entity.id, { mesh, glow, label });
    }

    const UP = new THREE.Vector3(0, 1, 0);

    for (const rel of currentOntology.relationships) {
      if (!rel.from || !rel.to || rel.from === rel.to) continue;
      const srcObj = nodeMap.current.get(rel.from);
      const tgtObj = nodeMap.current.get(rel.to);
      if (!srcObj || !tgtObj) continue;

      const srcPos = srcObj.mesh.position.clone();
      const tgtPos = tgtObj.mesh.position.clone();
      const dirV   = tgtPos.clone().sub(srcPos);
      const length = dirV.length();
      const dirN   = dirV.clone().normalize();
      const mid    = srcPos.clone().add(tgtPos).multiplyScalar(0.5);

      // Offset line endpoints to node surfaces so the line doesn't pierce nodes
      const lineSrc = srcPos.clone().addScaledVector(dirN,  NODE_R);
      const lineTgt = tgtPos.clone().addScaledVector(dirN, -(NODE_R + ARROW_H));

      const lineGeo = new THREE.BufferGeometry().setFromPoints([lineSrc, lineTgt]);
      const lineMat = new THREE.LineBasicMaterial({ color: themeColors.edgeHex });
      const line    = new THREE.Line(lineGeo, lineMat);
      line.userData = { sourceId: rel.from, targetId: rel.to };
      scene.add(line);

      // Arrow cone
      const arrowMat = new THREE.MeshPhongMaterial({ color: themeColors.edgeHex, shininess: 60 });
      const arrow    = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.copy(tgtPos).addScaledVector(dirN, -(NODE_R + ARROW_H * 0.5));
      if (Math.abs(dirN.dot(UP)) < 0.999) {
        arrow.quaternion.setFromUnitVectors(UP, dirN);
      } else {
        arrow.quaternion.setFromUnitVectors(UP, dirN.y > 0 ? UP : UP.clone().negate());
      }
      scene.add(arrow);

      // Invisible cylinder hitbox for raycasting (edges are hairlines in WebGL)
      const hitLen    = Math.max(length - 2 * NODE_R, 10);
      const hitboxGeo = new THREE.CylinderGeometry(12, 12, hitLen, 8);
      const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const hitbox    = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.copy(mid);
      hitbox.userData = { id: rel.id };
      if (Math.abs(dirN.dot(UP)) < 0.999) {
        hitbox.quaternion.setFromUnitVectors(UP, dirN);
      } else {
        hitbox.rotation.z = Math.PI / 2;
      }
      scene.add(hitbox);

      // Edge label pivot at midpoint
      const midPivot = new THREE.Object3D();
      midPivot.position.copy(mid);
      scene.add(midPivot);

      const edgeLabelDiv = document.createElement('div');
      edgeLabelDiv.className = 'graph3d-edge-label';
      edgeLabelDiv.textContent = rel.name;
      edgeLabelDiv.style.color      = themeColors.edgeLabel;
      edgeLabelDiv.style.background = themeColors.edgeLabelBg;
      const labelObj = new CSS2DObject(edgeLabelDiv);
      midPivot.add(labelObj);

      edgeMap.current.set(rel.id, {
        line, arrow, hitbox, midPivot, labelObj,
        sourceId: rel.from, targetId: rel.to,
      });
    }

    // Initial camera fit
    const box = new THREE.Box3();
    nodeMap.current.forEach(({ mesh }) => box.expandByObject(mesh));
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      const size   = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 100);
      const fov    = camera.fov * (Math.PI / 180);
      const dist   = (maxDim / 2) / Math.tan(fov / 2) * 1.7;
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(0, 0, dist));
      controls.update();
    }

    // ── Pointer-click for selection (distinguishes click from orbit drag) ──
    let ptrDownX = 0, ptrDownY = 0;
    const raycaster = new THREE.Raycaster();

    const onPointerDown = (e: PointerEvent) => { ptrDownX = e.clientX; ptrDownY = e.clientY; };
    const onPointerUp   = (e: PointerEvent) => {
      if (Math.abs(e.clientX - ptrDownX) > 6 || Math.abs(e.clientY - ptrDownY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx   = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      const ny   = -((e.clientY - rect.top)  / rect.height) *  2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);

      // Check nodes first
      const nodeHits = raycaster.intersectObjects([...nodeMap.current.values()].map(o => o.mesh));
      if (nodeHits.length > 0) {
        const id = nodeHits[0].object.userData.id as string;
        selectEntityRef.current(id);
        const q = activeQuestRef.current, si = stepIndexRef.current;
        if (q) {
          const step = q.steps[si];
          if (step.targetType === 'entity' && step.targetId === id) advanceRef.current();
        }
        return;
      }

      // Check edge hitboxes
      const edgeHits = raycaster.intersectObjects([...edgeMap.current.values()].map(o => o.hitbox));
      if (edgeHits.length > 0) {
        const id = edgeHits[0].object.userData.id as string;
        selectRelRef.current(id);
        const q = activeQuestRef.current, si = stepIndexRef.current;
        if (q) {
          const step = q.steps[si];
          if (step.targetType === 'relationship' && step.targetId === id) advanceRef.current();
        }
        return;
      }

      // Background click → deselect
      selectEntityRef.current(null);
      selectRelRef.current(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup',   onPointerUp);

    // ── Animation loop ────────────────────────────────────────────────────
    const animate = () => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      css2d.render(scene, camera);
    };
    animate();

    // ── Resize observer ───────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
      css2d.setSize(cw, ch);
    });
    ro.observe(container);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup',   onPointerUp);
      controls.dispose();
      sphereGeo.dispose(); glowGeo.dispose(); arrowGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      if (css2d.domElement.parentNode     === container) container.removeChild(css2d.domElement);
      nodeMap.current.clear();
      edgeMap.current.clear();
      sceneRef.current    = null;
      cameraRef.current   = null;
      rendererRef.current = null;
      css2dRef.current    = null;
      controlsRef.current = null;
    };
  // Intentional: full scene rebuild only when the ontology changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOntology]);

  // ── Theme change: update label/edge colors without rebuilding scene ───────
  useEffect(() => {
    nodeMap.current.forEach(({ label }) => {
      (label.element as HTMLElement).style.color = themeColors.nodeLabel;
    });
    edgeMap.current.forEach(({ line, arrow, labelObj }) => {
      (line.material  as THREE.LineBasicMaterial).color.setHex(themeColors.edgeHex);
      (arrow.material as THREE.MeshPhongMaterial).color.setHex(themeColors.edgeHex);
      const el = labelObj.element as HTMLElement;
      el.style.color      = themeColors.edgeLabel;
      el.style.background = themeColors.edgeLabelBg;
    });
  }, [themeColors]);

  // ── Selection & highlight visual states ───────────────────────────────────
  useEffect(() => {
    applyVisualStates(
      nodeMap.current,
      edgeMap.current,
      selectedEntityId,
      selectedRelationshipId,
      highlightedEntities,
      highlightedRelationships,
      themeColors.edgeHex,
    );
  }, [selectedEntityId, selectedRelationshipId, highlightedEntities, highlightedRelationships, themeColors]);

  // ── Camera controls ───────────────────────────────────────────────────────
  const handleFit = useCallback(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const box = new THREE.Box3();
    nodeMap.current.forEach(({ mesh }) => box.expandByObject(mesh));
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 100);
    const fov    = camera.fov * (Math.PI / 180);
    const dist   = (maxDim / 2) / Math.tan(fov / 2) * 1.7;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, dist));
    controls.update();
  }, []);

  const handleZoomIn = useCallback(() => {
    const cam = cameraRef.current; const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    cam.position.copy(ctl.target).add(cam.position.clone().sub(ctl.target).multiplyScalar(0.7));
    ctl.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    const cam = cameraRef.current; const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    cam.position.copy(ctl.target).add(cam.position.clone().sub(ctl.target).multiplyScalar(1.4));
    ctl.update();
  }, []);

  const handleReset = useCallback(() => {
    if (!sceneRef.current) return;
    const nodeIds = currentOntology.entityTypes.map(e => e.id);
    const links   = currentOntology.relationships
      .filter(r => r.from && r.to && r.from !== r.to)
      .map(r => ({ source: r.from, target: r.to }));
    const positions = forceLayout(nodeIds, links);

    // Update node positions
    nodeMap.current.forEach((o, id) => {
      const pos = positions.get(id);
      if (!pos) return;
      o.mesh.position.copy(pos);
      o.glow.position.copy(pos);
    });

    // Rebuild edge geometry to match new positions
    const UP = new THREE.Vector3(0, 1, 0);
    for (const rel of currentOntology.relationships) {
      if (!rel.from || !rel.to || rel.from === rel.to) continue;
      const eo   = edgeMap.current.get(rel.id);
      const srcO = nodeMap.current.get(rel.from);
      const tgtO = nodeMap.current.get(rel.to);
      if (!eo || !srcO || !tgtO) continue;

      const srcPos = srcO.mesh.position.clone();
      const tgtPos = tgtO.mesh.position.clone();
      const dirV   = tgtPos.clone().sub(srcPos);
      const length = dirV.length();
      const dirN   = dirV.clone().normalize();
      const mid    = srcPos.clone().add(tgtPos).multiplyScalar(0.5);

      const lineSrc = srcPos.clone().addScaledVector(dirN,  NODE_R);
      const lineTgt = tgtPos.clone().addScaledVector(dirN, -(NODE_R + ARROW_H));

      eo.line.geometry.dispose();
      eo.line.geometry = new THREE.BufferGeometry().setFromPoints([lineSrc, lineTgt]);

      eo.arrow.position.copy(tgtPos).addScaledVector(dirN, -(NODE_R + ARROW_H * 0.5));
      if (Math.abs(dirN.dot(UP)) < 0.999) eo.arrow.quaternion.setFromUnitVectors(UP, dirN);

      const hitLen = Math.max(length - 2 * NODE_R, 10);
      eo.hitbox.geometry.dispose();
      eo.hitbox.geometry = new THREE.CylinderGeometry(12, 12, hitLen, 8);
      eo.hitbox.position.copy(mid);
      if (Math.abs(dirN.dot(UP)) < 0.999) eo.hitbox.quaternion.setFromUnitVectors(UP, dirN);

      eo.midPivot.position.copy(mid);
    }

    handleFit();
  }, [currentOntology, handleFit]);

  return (
    <div className="graph-container" ref={containerRef}>
      <div className="graph-controls">
        <button className="graph-control-btn" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleFit} title="Fit to View">
          <Maximize2 size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleReset} title="Reset Layout">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="graph-legend">
        <div className="legend-title">Entity Types</div>
        {currentOntology.entityTypes.map(entity => (
          <div key={entity.id} className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: entity.color }} />
            <span>{entity.icon} {entity.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
