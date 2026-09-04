// Web lab entrypoint (presentation plane only — §11.14, §12.44).
// Wires the Lab to a canvas, camera, and DOM controls. All rendering state
// (camera, tool, zoom) lives here; the engine stays untouched.

import { Lab, type LabParameters } from "./lab";
import { DEFAULT_EXPERIMENT } from "../experiment/config";
import { distance, type Vec2 } from "../world/spatial";
import type { OrganismRecord, ResourcePatch, World } from "../world/world";
import { wobblePhase, PLANT_ORB_RADIUS } from "../world/plants";
import type { TickMetrics } from "../systems/systems";
import {
  type CellNode,
  nodeGain,
  brainStep,
  BRAIN_INPUTS,
  INPUT,
  OUTPUT,
} from "../world/body";
import { axialCentre, dayPhase, daylight, Terrain, WALL_SPACING, WALL_HEX_RADIUS } from "../world/terrain";

/**
 * Recompute the brain's sensory input vector for the selected organism the same
 * way the BehaviourSystem does, so the panel preview matches the real policy.
 * Presentation-only: reads world state, writes nothing. (Hoisted declaration.)
 */
function brainInputFor(organism: OrganismRecord, world: World): number[] {
  const input: number[] = new Array<number>(BRAIN_INPUTS).fill(0);
  const idx = world.ephemeral.resourceIndex;
  const orgIdx = world.ephemeral.organismIndex;
  let foodX = 0;
  let foodY = 0;
  if (idx) {
    const res = idx.queryNearest({ x: organism.x, y: organism.y }, organism.senseRadius);
    if (res) {
      const d = Math.max(res.dist, 1e-6);
      const s = 1 - res.dist / Math.max(1, organism.senseRadius);
      foodX += ((res.pos.x - organism.x) / d) * s;
      foodY += ((res.pos.y - organism.y) / d) * s;
    }
  }
  const g = world.field.gradient(organism.x, organism.y);
  const gm = Math.hypot(g.gx, g.gy);
  if (gm > 1e-3) {
    const s = Math.min(1, gm) * 0.4;
    foodX += (g.gx / gm) * s;
    foodY += (g.gy / gm) * s;
  }
  let preyX = 0;
  let preyY = 0;
  if (orgIdx) {
    const near = orgIdx.queryNearest({ x: organism.x, y: organism.y }, organism.senseRadius);
    if (near && near.key !== organism.id) {
      const d = Math.max(near.dist, 1e-6);
      preyX += (near.pos.x - organism.x) / d;
      preyY += (near.pos.y - organism.y) / d;
    }
  }
  let wallX = 0;
  let wallY = 0;
  const probe = organism.radius + 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = organism.x + Math.cos(a) * probe;
    const py = organism.y + Math.sin(a) * probe;
    if (world.blocked(px, py) || world.terrain.isWater(px, py)) {
      wallX -= Math.cos(a);
      wallY -= Math.sin(a);
    }
  }
  const norm = (x: number, y: number): [number, number] => {
    const m = Math.hypot(x, y);
    return m > 1e-3 ? [x / m, y / m] : [0, 0];
  };
  [foodX, foodY] = norm(foodX, foodY);
  [preyX, preyY] = norm(preyX, preyY);
  [wallX, wallY] = norm(wallX, wallY);
  // Photoreceptors: max raycast light over receptor nodes (occlusion-aware).
  let light = 0;
  const day = world.daylight();
  for (const node of organism.nodes) {
    if (node.kind !== "photoreceptor") continue;
    const a = organism.facing + node.angle;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const r = organism.radius + node.length;
    const steps = Math.max(3, Math.min(10, Math.ceil(r / 3)));
    let blocked = false;
    for (let s = 1; s <= steps; s++) {
      const px = organism.x + dirX * (r * s) / steps;
      const py = organism.y + dirY * (r * s) / steps;
      if (world.blocked(px, py) || (world.terrain.isWater(px, py) && s > steps * 0.6)) { blocked = true; break; }
    }
    light = Math.max(light, day * (blocked ? 0.15 : 1) * nodeGain(node, organism));
  }
  input[INPUT.light] = Math.min(1, light);
  input[INPUT.foodX] = foodX;
  input[INPUT.foodY] = foodY;
  input[INPUT.preyX] = preyX;
  input[INPUT.preyY] = preyY;
  input[INPUT.wallX] = wallX;
  input[INPUT.wallY] = wallY;
  input[INPUT.energy] = Math.min(1, organism.energy / 100);
  input[INPUT.biomass] = Math.min(1, organism.biomass / 60);
  input[INPUT.daylight] = day;
  input[INPUT.aggression] = Math.max(-1, Math.min(1, organism.genome.genes.trophic));
  // Terrain correlates (match the BehaviourSystem's input assembly).
  input[INPUT.elevation] = Math.min(1, Math.max(0, world.elevationAt(organism.x, organism.y)));
  input[INPUT.water] = Math.min(1, world.waterDepthAt(organism.x, organism.y) / 3);
  input[INPUT.wallProximity] = world.wallProximityAt(organism.x, organism.y, organism.radius + 5);
  // Fold recurrent memory exactly like the behaviour system (leaky blend).
  for (const slot of [INPUT.light, INPUT.foodX, INPUT.foodY, INPUT.preyX, INPUT.preyY, INPUT.wallX, INPUT.wallY]) {
    input[slot] = Math.tanh(input[slot]! + (organism.memory[slot] ?? 0) * 0.25);
  }
  return input;
}

/** Kind-coded colour for a body node in the nodal map. */
function nodeColor(kind: string): string {
  switch (kind) {
    case "photoreceptor": return "rgba(255, 214, 118, 0.95)";
    case "chemoreceptor": return "rgba(142, 211, 107, 0.95)";
    case "mechanoreceptor": return "rgba(131, 182, 232, 0.95)";
    case "flagellum": return "rgba(104, 208, 180, 0.95)";
    case "spike": return "rgba(236, 144, 120, 0.95)";
    default: return "rgba(216, 232, 224, 0.9)";
  }
}

/** Diverging colour for a hidden activation in [-1, 1]. */
function hiddenColor(h: number): string {
  const t = Math.max(0, Math.min(1, (h + 1) / 2));
  const warm = [230, 187, 111];
  const cool = [104, 168, 208];
  const mix = warm.map((w, i) => Math.round(cool[i]! + (w - cool[i]!) * t));
  return `rgba(${mix[0]},${mix[1]},${mix[2]},0.95)`;
}

/** Output-channel colour (moveX/moveY teal, speed gold, attack red). */
function outputColor(i: number): string {
  switch (i) {
    case OUTPUT.moveX:
    case OUTPUT.moveY: return "rgba(104, 208, 180, 0.95)";
    case OUTPUT.speed: return "rgba(230, 187, 111, 0.95)";
    case OUTPUT.attack: return "rgba(236, 144, 120, 0.95)";
    default: return "rgba(216, 232, 224, 0.9)";
  }
}

interface Camera { x: number; y: number; zoom: number; }
type ToolMode = "pan" | "spawn" | "cull" | "inspect";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx2d = canvas.getContext("2d")!;

const lab = new Lab({
  ...DEFAULT_EXPERIMENT,
  experimentId: "lab-v2",
  seed: "lab-session-v1",
});

const camera: Camera = { x: lab.world.config.width / 2, y: lab.world.config.height / 2, zoom: 1 };
const tool: { mode: ToolMode } = { mode: "inspect" };
let paused = false;
let cameraReady = false;
let dragging = false;
let dragStart: { x: number; y: number } | null = null;
let lastCheckpointTick: number | null = null;
// Tracking camera: when true, the viewport recentres on the selected organism
// every frame (presentation-only — never touches world state, §12.44).
let trackingSelected = false;
// Multi-touch pinch-to-zoom + one-finger pan (mobile navigation).
const pointers = new Map<number, { x: number; y: number }>();
let pinching = false;
let pinchDist = 0;
let pinchMid: { x: number; y: number } = { x: 0, y: 0 };

// ---------------------------------------------------------------- UI wiring

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const statTick = $("stat-tick");
const statFps = $("stat-fps");
const statPop = $("stat-pop");
const statBirths = $("stat-births");
const statDeaths = $("stat-deaths");
const statField = $("stat-field");
const statMaturity = $("stat-maturity");
const statDiversity = $("stat-diversity");
const panel = $("organism-panel");
const panelBody = $("organism-body");
const drawer = $("drawer");
const drawerToggle = $("btn-drawer");
const drawerTitle = $("drawer-title");
const sampleCount = $("sample-count");
const dataSummary = $("data-summary");
const eventsSummary = $("events-summary");
const checkpointSummary = $("checkpoint-summary");

const toolIds: readonly ToolMode[] = ["inspect", "spawn", "cull", "pan"];
for (const mode of toolIds) {
  $(`tool-${mode}`).addEventListener("click", () => setTool(mode));
}

function setTool(mode: ToolMode): void {
  tool.mode = mode;
  for (const name of toolIds) $(`tool-${name}`).classList.toggle("active", name === mode);
  canvas.style.cursor = mode === "pan" ? "grab" : mode === "spawn" ? "copy" : mode === "cull" ? "not-allowed" : "crosshair";
}

$("btn-pause").addEventListener("click", () => {
  paused = !paused;
  const pauseButton = $("btn-pause");
  pauseButton.dataset.paused = String(paused);
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.dataset.tip = paused ? "Resume" : "Pause / resume";
});

$("btn-reset").addEventListener("click", () => {
  lab.reset();
  fieldDirty = true;
  fitWorld();
  flash("world reset");
});

const speed = $("speed") as HTMLInputElement;
const speedVal = $("speed-val");
// Fill the speed slider's track up to the thumb (CSS reads --fill).
const paintSpeed = (): void => {
  speed.style.setProperty("--fill", `${(Number(speed.value) / Number(speed.max)) * 100}%`);
  speedVal.textContent = `${speed.value}×`;
};
speed.addEventListener("input", () => { lab.settings.ticksPerFrame = Number(speed.value); paintSpeed(); });
paintSpeed();

for (const id of ["show-field", "show-resources", "show-organisms"] as const) {
  $(id).addEventListener("change", () => {
    lab.settings.showField = ($("show-field") as HTMLInputElement).checked;
    lab.settings.showResources = ($("show-resources") as HTMLInputElement).checked;
    lab.settings.showOrganisms = ($("show-organisms") as HTMLInputElement).checked;
    if (lab.settings.showField) fieldDirty = true;
  });
}

$("btn-zoom-in").addEventListener("click", () => zoomAt(1.25));
$("btn-zoom-out").addEventListener("click", () => zoomAt(0.8));
$("btn-fit").addEventListener("click", fitWorld);
$("btn-fullscreen").addEventListener("click", async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
  resizeCanvas();
});

$("btn-checkpoint").addEventListener("click", () => {
  const blob = new Blob([lab.serializeCheckpoint()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nu-checkpoint-t${lab.world.tick}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  lastCheckpointTick = lab.world.tick;
  checkpointSummary.textContent = `Saved t${lab.world.tick}; checkpoint contains world, lineage, field, and RNG stream state.`;
  flash(`checkpoint saved at t${lab.world.tick}`);
});

$("clear-selection").addEventListener("click", () => {
  lab.selectedId = null;
  trackingSelected = false;
  updatePanel();
});

// Tracking camera: the 🎥 button in the selection panel toggles follow mode;
// each frame recentres on the selected organism. Any manual pan cancels it.
function setTracking(on: boolean): void {
  trackingSelected = on && lab.selectedId !== null;
  const badge = document.querySelector<HTMLSpanElement>(".sel-track");
  if (badge) {
    badge.classList.toggle("tracking", trackingSelected);
    badge.title = trackingSelected ? "Tracking camera active — pan to release" : "tracking camera";
  }
  if (trackingSelected) flash("tracking camera locked");
}

panelBody.addEventListener("click", (event) => {
  const badge = (event.target as HTMLElement).closest<HTMLElement>(".sel-track");
  if (!badge) return;
  if (!lab.selectedId) return;
  setTracking(!trackingSelected);
});

drawerToggle.addEventListener("click", () => {
  const open = drawer.classList.toggle("open");
  drawerToggle.classList.toggle("drawer-hidden", !open);
  drawerToggle.title = open ? "Hide panel" : "Show panel";
  drawerToggle.setAttribute("aria-expanded", String(open));
});

const tabTitles: Record<string, string> = { telemetry: "Telemetry", parameters: "Parameters", data: "Data", coverage: "Coverage" };
for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"))) {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab ?? "telemetry";
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"))) button.classList.toggle("active", button === tab);
    for (const section of Array.from(document.querySelectorAll<HTMLElement>(".tab-panel"))) {
      const active = section.dataset.panel === name;
      section.hidden = !active;
      section.classList.toggle("active", active);
    }
    drawerTitle.textContent = tabTitles[name] ?? "Telemetry";
    if (name === "telemetry") redrawCharts();
  });
}

// -------------------------------------------------------------- parameters

type ParamCategory = "world" | "energetics" | "consumption" | "evolution";

interface ParameterSpec {
  readonly key: keyof LabParameters;
  readonly id: string;
  readonly category: ParamCategory;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const PARAM_CATEGORIES: readonly { key: ParamCategory; title: string; hint: string }[] = [
  { key: "world", title: "World", hint: "arena + starting life" },
  { key: "energetics", title: "Energetics", hint: "food, metabolism, reproduction" },
  { key: "consumption", title: "Consumption", hint: "eating + scavenging" },
  { key: "evolution", title: "Evolution", hint: "mutation, sex, learning" },
];

const parameterSpecs: readonly ParameterSpec[] = [
  { key: "width", id: "param-width", category: "world", label: "world width", min: 60, max: 2000, step: 10 },
  { key: "height", id: "param-height", category: "world", label: "world height", min: 60, max: 2000, step: 10 },
  { key: "initialPopulation", id: "param-initialPopulation", category: "world", label: "initial population", min: 1, max: 600, step: 5 },
  { key: "resourcePatches", id: "param-resourcePatches", category: "world", label: "plant clusters", min: 1, max: 400, step: 5 },
  { key: "basalCost", id: "param-basalCost", category: "energetics", label: "basal cost", min: 0, max: 10, step: 0.01 },
  { key: "movementCost", id: "param-movementCost", category: "energetics", label: "movement cost", min: 0, max: 10, step: 0.01 },
  { key: "patchCapacity", id: "param-patchCapacity", category: "energetics", label: "patch capacity", min: 1, max: 300, step: 1 },
  { key: "energyPerResource", id: "param-energyPerResource", category: "energetics", label: "energy / resource", min: 0.1, max: 20, step: 0.1 },
  { key: "reproductionCost", id: "param-reproductionCost", category: "energetics", label: "reproduction cost", min: 0, max: 100, step: 0.5 },
  { key: "maxAge", id: "param-maxAge", category: "energetics", label: "max age", min: 10, max: 10000, step: 50 },
  { key: "maturityAge", id: "param-maturityAge", category: "energetics", label: "maturity age", min: 1, max: 2000, step: 5 },
  { key: "pulseProbability", id: "param-pulseProbability", category: "energetics", label: "pulse probability", min: 0, max: 1, step: 0.005 },
  { key: "pulseAmount", id: "param-pulseAmount", category: "energetics", label: "pulse amount", min: 0, max: 500, step: 5 },
  { key: "consumeRadius", id: "param-consumeRadius", category: "consumption", label: "consume radius", min: 0.5, max: 100, step: 0.5 },
  { key: "biteSize", id: "param-biteSize", category: "consumption", label: "bite size", min: 0.1, max: 100, step: 0.5 },
  { key: "corpseEnergyFraction", id: "param-corpseEnergyFraction", category: "consumption", label: "corpse fraction", min: 0, max: 1, step: 0.01 },
  { key: "mutationRate", id: "param-mutationRate", category: "evolution", label: "mutation rate", min: 0, max: 1, step: 0.005 },
  { key: "mutationSigma", id: "param-mutationSigma", category: "evolution", label: "mutation sigma", min: 0, max: 2, step: 0.005 },
  { key: "reproductionProbability", id: "param-reproductionProbability", category: "evolution", label: "reproduction probability", min: 0, max: 1, step: 0.005 },
  { key: "recombination", id: "param-recombination", category: "evolution", label: "recombination (0 = asexual)", min: 0, max: 1, step: 0.005 },
  { key: "learningRate", id: "param-learningRate", category: "evolution", label: "learning rate", min: 0, max: 0.2, step: 0.001 },
];

function formatParamValue(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.05 ? 2 : 3;
  return String(Number(value.toFixed(decimals)));
}

/** Build the categorized accordion of sliders (one row per parameter). */
function buildParameterAccordion(): void {
  const root = $("param-accordion");
  root.innerHTML = "";
  for (const category of PARAM_CATEGORIES) {
    const specs = parameterSpecs.filter((s) => s.category === category.key);
    const section = document.createElement("section");
    section.className = "param-group open";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "param-group-head";
    head.innerHTML =
      `<span class="param-caret">▾</span>` +
      `<span class="param-group-title">${category.title}</span>` +
      `<span class="param-group-meta">${category.hint}</span>`;
    const body = document.createElement("div");
    body.className = "param-group-body";
    for (const spec of specs) {
      const row = document.createElement("label");
      row.className = "param-row";
      row.innerHTML =
        `<span class="param-name" title="${spec.label}">${spec.label}</span>` +
        `<input id="${spec.id}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" />` +
        `<output class="param-value">0</output>`;
      const input = row.querySelector("input")!;
      const out = row.querySelector(".param-value")!;
      input.addEventListener("input", () => {
        out.textContent = formatParamValue(Number(input.value), spec.step);
      });
      body.appendChild(row);
    }
    section.appendChild(head);
    section.appendChild(body);
    head.addEventListener("click", () => {
      const open = section.classList.toggle("open");
      head.setAttribute("aria-expanded", String(open));
    });
    root.appendChild(section);
  }
}

function populateParameters(): void {
  const values = lab.getParameters();
  for (const spec of parameterSpecs) {
    const input = $<HTMLInputElement>(spec.id);
    const value = clampParam(Number(values[spec.key]), spec.min, spec.max);
    input.value = String(value);
    const row = input.closest(".param-row");
    if (row) row.querySelector(".param-value")!.textContent = formatParamValue(value, spec.step);
  }
  ($("param-seed") as HTMLInputElement).value = lab.seed;
}

function clampParam(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

$("parameters-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const next: Partial<LabParameters> = {};
  for (const spec of parameterSpecs) {
    const input = $<HTMLInputElement>(spec.id);
    const value = Number(input.value);
    if (!Number.isFinite(value)) return flash(`invalid ${spec.label}`);
    (next as Record<string, number>)[spec.key] = clampParam(value, spec.min, spec.max);
  }
  const seed = ($("param-seed") as HTMLInputElement).value.trim() || "lab-session-v1";
  lab.setParameters(next, seed);
  fieldDirty = true;
  fitWorld();
  populateParameters();
  flash("parameters applied; world reset");
});

buildParameterAccordion();
populateParameters();

// ------------------------------------------------------------------- input

function logicalSize(): { width: number; height: number } {
  return { width: canvas.clientWidth || 960, height: canvas.clientHeight || 640 };
}

function screenToWorld(px: number, py: number): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return { x: camera.x + (px - rect.width / 2) / camera.zoom, y: camera.y + (py - rect.height / 2) / camera.zoom };
}

function fitWorld(): void {
  const { width, height } = logicalSize();
  const margin = 48;
  camera.x = lab.world.config.width / 2;
  camera.y = lab.world.config.height / 2;
  camera.zoom = Math.max(0.2, Math.min(24, Math.min((width - margin) / lab.world.config.width, (height - margin) / lab.world.config.height)));
  cameraReady = true;
}

function zoomAt(factor: number, px?: number, py?: number): void {
  const { width, height } = logicalSize();
  const x = px ?? width / 2;
  const y = py ?? height / 2;
  const before = screenToWorld(x, y);
  camera.zoom = Math.min(24, Math.max(0.2, camera.zoom * factor));
  const after = screenToWorld(x, y);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

function resizeCanvas(): void {
  const { width, height } = logicalSize();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = Math.max(1, Math.round(width * dpr));
  const nextHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!cameraReady) fitWorld();
}

canvas.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  // Two-finger touch ⇒ pinch-to-zoom around the midpoint.
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(b.x - a.x, b.y - a.y);
    pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinching = true;
    dragging = false;
    dragStart = null;
    return;
  }
  const w = screenToWorld(e.offsetX, e.offsetY);
  // Touch: one finger always pans (intuitive mobile navigation).
  if (e.pointerType === "touch") {
    dragging = true;
    dragStart = { x: e.offsetX, y: e.offsetY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  if (tool.mode === "pan" || e.button === 1) {
    dragging = true;
    dragStart = { x: e.offsetX, y: e.offsetY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    return;
  }
  if (tool.mode === "spawn") { lab.spawn(w.x, w.y); flash("founder spawned"); return; }
  if (tool.mode === "cull") {
    const killed = lab.cull(w.x, w.y, 10);
    if (killed > 0) flash(`culled ${killed} organism${killed > 1 ? "s" : ""}`);
    return;
  }
  let best: OrganismRecord | null = null;
  let bestD = Infinity;
  for (const o of lab.world.liveOrganisms()) {
    const d = distance(w, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  lab.selectedId = best && bestD < 6 / camera.zoom + 2 ? best.id : null;
  updatePanel();
});

canvas.addEventListener("pointermove", (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinching && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (pinchDist > 0 && d > 0) zoomAt(d / pinchDist, pinchMid.x, pinchMid.y);
    pinchDist = d;
    return;
  }
  if (dragging && dragStart) {
    camera.x -= (e.offsetX - dragStart.x) / camera.zoom;
    camera.y -= (e.offsetY - dragStart.y) / camera.zoom;
    dragStart = { x: e.offsetX, y: e.offsetY };
    if (trackingSelected) setTracking(false); // manual pan releases the tracking camera
  }
});

function stopDragging(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinching = false;
  dragging = false;
  dragStart = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  canvas.style.cursor = tool.mode === "pan" ? "grab" : tool.mode === "spawn" ? "copy" : tool.mode === "cull" ? "not-allowed" : "crosshair";
}
canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.offsetX, e.offsetY);
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.key === "+" || e.key === "=") zoomAt(1.12);
  if (e.key === "-") zoomAt(0.89);
  if (e.key === "0") fitWorld();
});

// ------------------------------------------------------------------ render

function flash(msg: string): void {
  const el = $("flash");
  el.textContent = msg;
  el.style.opacity = "1";
  window.setTimeout(() => { el.style.opacity = "0"; }, 1200);
}

function w2s(x: number, y: number): [number, number] {
  const { width, height } = logicalSize();
  return [(x - camera.x) * camera.zoom + width / 2, (y - camera.y) * camera.zoom + height / 2];
}

// ------------------------------------------------------------------ static bg
// Terrain (elevation + water + organic walls + border) is static per world, so
// render it ONCE to an offscreen canvas and blit per frame instead of issuing
// tens of thousands of fillRect calls every frame. Redrawn only when the world
// object changes (reset / parameter apply).

const bg = document.createElement("canvas");
const BG_SCALE = 2; // px per world unit — crisp near fit-zoom, fine when zoomed in
let bgWorld: unknown = null;

/** Smoothstep ramp in [0,1]. */
function ss01(t: number): number {
  const v = Math.min(1, Math.max(0, t));
  return v * v * (3 - 2 * v);
}

/**
 * Smooth background renderer. Elevation + water depth are bilinearly
 * interpolated from the coarse terrain grid onto the display pixels, so the
 * depth gradient is continuous (no per-cell banding) and shorelines round
 * into smooth water bodies. Region-variable depth factors baked into the
 * water data make different basins read as deep lakes vs shallow ponds.
 */
function renderBackground(): void {
  const cfg = lab.world.config;
  const terrain = lab.world.terrain;
  const bw = Math.max(1, Math.round(cfg.width * BG_SCALE));
  const bh = Math.max(1, Math.round(cfg.height * BG_SCALE));
  if (bg.width !== bw) bg.width = bw;
  if (bg.height !== bh) bg.height = bh;
  const bctx = bg.getContext("2d")!;
  const image = bctx.createImageData(bw, bh);
  const pixels = image.data;
  const cell = terrain.config.cellSize;
  const cols = terrain.cols;
  const rows = terrain.rows;
  const elev = terrain.elevation;
  const depth = terrain.water;

  let p = 0;
  for (let py = 0; py < bh; py++) {
    const wy = (py + 0.5) / BG_SCALE;
    const cy = Math.max(0, Math.min(rows - 2, Math.floor(wy / cell)));
    const ty = (wy - cy * cell) / cell;
    for (let px = 0; px < bw; px++) {
      const wx = (px + 0.5) / BG_SCALE;
      const cx = Math.max(0, Math.min(cols - 2, Math.floor(wx / cell)));
      const tx = (wx - cx * cell) / cell;
      const i00 = cy * cols + cx;
      const i10 = cy * cols + cx + 1;
      const i01 = (cy + 1) * cols + cx;
      const i11 = (cy + 1) * cols + cx + 1;
      const eTop = elev[i00]! * (1 - tx) + elev[i10]! * tx;
      const eBot = elev[i01]! * (1 - tx) + elev[i11]! * tx;
      const e = eTop * (1 - ty) + eBot * ty;
      const dTop = depth[i00]! * (1 - tx) + depth[i10]! * tx;
      const dBot = depth[i01]! * (1 - tx) + depth[i11]! * tx;
      const d = dTop * (1 - ty) + dBot * ty;
      if (d > 0.005) {
        // Water: alpha + hue ramp with depth; the gradient is continuous.
        const t = ss01(d / 3.4);
        const r = Math.round(74 + (14 - 74) * t);
        const g = Math.round(178 + (62 - 178) * t);
        const b = Math.round(198 + (128 - 198) * t);
        const a = Math.round(255 * (0.34 + 0.58 * t));
        pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b; pixels[p + 3] = a;
      } else {
        // Land: continuous elevation shading with a soft damp shore tint near water.
        const shore = d > 0 ? d / 0.005 : 0;
        const base = Math.min(1, Math.max(0, e));
        const r = Math.round((10 + 46 * base) * (1 - shore * 0.25));
        const g = Math.round((17 + 60 * base) * (1 + shore * 0.08));
        const b = Math.round((15 + 40 * base) * (1 - shore * 0.2));
        pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b; pixels[p + 3] = 255;
      }
      p += 4;
    }
  }
  bctx.putImageData(image, 0, 0);

  const s = BG_SCALE;
  // Walls read as SOLID ROCK FORMATIONS: adjacent hex tiles are merged by
  // drawing every tile without gaps and painting the union once, then facets
  // (light top-left, dark bottom-right) and a few deterministic cracks give
  // the formations a rocky, monolithic look instead of discrete hexes.
  // Group tiles into contiguous formations first (deterministic id order).
  const formationOf = new Map<string, string>();
  const formations: string[][] = [];
  const tileKey = (t: { x: number; y: number }): string => `${Math.round(t.x * 4)}:${Math.round(t.y * 4)}`;
  const adjacency = new Map<string, string[]>();
  const tiles = terrain.wallPolygons.map((w) => {
    let cx = 0;
    let cy = 0;
    for (const v of w.vertices) { cx += v.x; cy += v.y; }
    cx /= w.vertices.length;
    cy /= w.vertices.length;
    return { id: w.id, x: cx, y: cy };
  });
  for (const t of tiles) adjacency.set(tileKey(t), []);
  const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) <= WALL_SPACING * 1.25;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (!near(tiles[i]!, tiles[j]!)) continue;
      adjacency.get(tileKey(tiles[i]!))!.push(tileKey(tiles[j]!));
      adjacency.get(tileKey(tiles[j]!))!.push(tileKey(tiles[i]!));
    }
  }
  const seen = new Set<string>();
  for (const t of tiles) {
    const key = tileKey(t);
    if (seen.has(key)) continue;
    const group: string[] = [];
    const stack = [key];
    while (stack.length) {
      const k = stack.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      group.push(k);
      for (const n of adjacency.get(k) ?? []) if (!seen.has(n)) stack.push(n);
    }
    formations.push(group);
    for (const k of group) formationOf.set(k, `f${formations.length - 1}`);
  }
  bctx.lineJoin = "round";
  bctx.lineCap = "round";
  // Paint each formation: body fill, then highlight/shadow facet strokes on
  // each tile to sculpt the rock, then a shared rim.
  for (const group of formations) {
    const groupTiles = tiles.filter((t) => group.includes(tileKey(t)));
    // Base body: fill every tile fully (union look).
    bctx.beginPath();
    for (const t of groupTiles) {
      const poly = terrain.wallPolygons.find((w) => w.id === t.id);
      if (!poly) continue;
      bctx.moveTo(poly.vertices[0]!.x * s, poly.vertices[0]!.y * s);
      for (let i = 1; i < poly.vertices.length; i++) bctx.lineTo(poly.vertices[i]!.x * s, poly.vertices[i]!.y * s);
      bctx.closePath();
    }
    bctx.fillStyle = "#4a3a2c";
    bctx.fill("nonzero");
    // Sculpt facets: per-tile top-left highlight + bottom-right shadow.
    for (const t of groupTiles) {
      const poly = terrain.wallPolygons.find((w) => w.id === t.id);
      if (!poly) continue;
      const cx = t.x * s;
      const cy = t.y * s;
      bctx.strokeStyle = "rgba(122, 102, 78, 0.5)"; // sunlit facet
      bctx.lineWidth = Math.max(1, 0.5 * s);
      bctx.beginPath();
      for (let i = 0; i < poly.vertices.length; i++) {
        const a = poly.vertices[i]!;
        const b2 = poly.vertices[(i + 1) % poly.vertices.length]!;
        if (a.x * s < cx && a.y * s < cy) {
          bctx.moveTo(a.x * s, a.y * s);
          bctx.lineTo(b2.x * s, b2.y * s);
        }
      }
      bctx.stroke();
      bctx.strokeStyle = "rgba(26, 20, 15, 0.55)"; // shadow facet
      bctx.beginPath();
      for (let i = 0; i < poly.vertices.length; i++) {
        const a = poly.vertices[i]!;
        const b2 = poly.vertices[(i + 1) % poly.vertices.length]!;
        if (a.x * s > cx || a.y * s > cy) {
          bctx.moveTo(a.x * s, a.y * s);
          bctx.lineTo(b2.x * s, b2.y * s);
        }
      }
      bctx.stroke();
    }
    // Deterministic cracks: one per 2 tiles, seeded by formation index.
    const crackCount = Math.max(1, Math.floor(groupTiles.length / 2));
    bctx.strokeStyle = "rgba(20, 15, 11, 0.5)";
    bctx.lineWidth = Math.max(0.8, 0.35 * s);
    for (let c = 0; c < crackCount; c++) {
      const t = groupTiles[(c * 2) % groupTiles.length]!;
      const seed = c * 7919 + group.length * 104729;
      const a1 = ((seed % 628) / 100);
      const len = WALL_HEX_RADIUS * (0.7 + ((seed >> 3) % 50) / 100);
      bctx.beginPath();
      bctx.moveTo(t.x * s, t.y * s);
      bctx.lineTo(t.x * s + Math.cos(a1) * len * s, t.y * s + Math.sin(a1) * len * s);
      bctx.lineTo(t.x * s + Math.cos(a1 + 0.9) * len * 0.6 * s, t.y * s + Math.sin(a1 + 0.9) * len * 0.6 * s);
      bctx.stroke();
    }
  }
  bctx.lineCap = "butt";
  bctx.lineJoin = "miter";
  bctx.strokeStyle = "#23404a";
  bctx.lineWidth = 2 * s;
  bctx.strokeRect(0, 0, bw, bh);
}

// Pheromone field is redrawn once per sim tick to an offscreen canvas and
// blitted per frame — iterating every grid cell each frame (10k+) was frame-time.
const fieldCanvas = document.createElement("canvas");
let fieldDirty = true;

function renderField(): void {
  const cfg = lab.world.config;
  const snap = lab.world.field.snapshot();
  const fw = Math.max(1, Math.round(cfg.width * BG_SCALE));
  const fh = Math.max(1, Math.round(cfg.height * BG_SCALE));
  if (fieldCanvas.width !== fw) fieldCanvas.width = fw;
  if (fieldCanvas.height !== fh) fieldCanvas.height = fh;
  const fctx = fieldCanvas.getContext("2d")!;
  fctx.clearRect(0, 0, fw, fh);
  const cellPx = snap.cols > 0 ? fw / snap.cols : 1;
  const rowPx = snap.rows > 0 ? fh / snap.rows : 1;
  for (let cy = 0; cy < snap.rows; cy++) {
    for (let cx = 0; cx < snap.cols; cx++) {
      const value = snap.values[cy * snap.cols + cx]!;
      if (value < 0.01) continue;
      fctx.fillStyle = `rgba(48, 160, 140, ${Math.min(0.55, value * 0.02).toFixed(3)})`;
      fctx.fillRect(cx * cellPx, cy * rowPx, Math.ceil(cellPx), Math.ceil(rowPx));
    }
  }
  fieldDirty = false;
}

function draw(): void {
  const { width: W, height: H } = logicalSize();
  ctx2d.fillStyle = "#050b0f";
  ctx2d.fillRect(0, 0, W, H);

  const cfg = lab.world.config;

  // Pre-rendered static background: terrain, water pools, organic walls, border.
  if (bgWorld !== lab.world) {
    renderBackground();
    bgWorld = lab.world;
  }
  const [ax, ay] = w2s(0, 0);
  const [bx, by] = w2s(cfg.width, cfg.height);
  const wasSmoothing = ctx2d.imageSmoothingEnabled;
  ctx2d.imageSmoothingEnabled = true;
  ctx2d.drawImage(bg, ax, ay, (bx - ax) * BG_SCALE, (by - ay) * BG_SCALE);
  ctx2d.imageSmoothingEnabled = wasSmoothing;

  if (lab.settings.showField) {
    if (fieldDirty) renderField();
    const wasSmoothing = ctx2d.imageSmoothingEnabled;
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.drawImage(fieldCanvas, ax, ay, (bx - ax) * BG_SCALE, (by - ay) * BG_SCALE);
    ctx2d.imageSmoothingEnabled = wasSmoothing;
  }

  if (lab.settings.showResources) {
    // Plants are clusters of joined, slightly-overlapping leaf orbs that
    // WIGGLE (presentation-only wobble from the tick). Each orb is world-sized
    // (scaled by zoom) so it stays constant when you zoom out.
    const tick = lab.world.tick;
    const clusters = new Map<string, ResourcePatch[]>();
    const singletons: ResourcePatch[] = [];
    for (const resource of lab.world.resources.values()) {
      if (resource.spore) { singletons.push(resource); continue; }
      if (resource.clusterId) {
        const list = clusters.get(resource.clusterId) ?? [];
        list.push(resource);
        clusters.set(resource.clusterId, list);
      } else {
        singletons.push(resource);
      }
    }
    ctx2d.strokeStyle = "rgba(150, 210, 110, 0.4)";
    ctx2d.lineWidth = 1;
    const zoomOut = camera.zoom < 0.45;
    for (const nodes of clusters.values()) {
      const wobbled = nodes.map((n) => {
        const phase = wobblePhase(n.id);
        const dx = zoomOut ? 0 : Math.sin(tick * 0.12 + phase) * 0.5;
        const dy = zoomOut ? 0 : Math.cos(tick * 0.09 + phase * 1.3) * 0.5;
        return { n, wx: n.x + dx, wy: n.y + dy };
      });
      let cxp = 0;
      let cyp = 0;
      for (const w of wobbled) { cxp += w.wx; cyp += w.wy; }
      cxp /= wobbled.length;
      cyp /= wobbled.length;
      const [sx, sy] = w2s(cxp, cyp);
      if (!zoomOut) {
        for (const w of wobbled) {
          const [nx, ny] = w2s(w.wx, w.wy);
          ctx2d.beginPath();
          ctx2d.moveTo(sx, sy);
          ctx2d.lineTo(nx, ny);
          ctx2d.stroke();
        }
      }
      for (const w of wobbled) {
        const [nx, ny] = w2s(w.wx, w.wy);
        const quantity = w.n.quantity / (w.n.capacity ?? cfg.patchCapacity);
        const radius = PLANT_ORB_RADIUS * 0.85 * (0.55 + 0.65 * quantity);
        const rpx = radius * camera.zoom;
        ctx2d.fillStyle = `rgba(142, 211, 107, ${0.32 + 0.62 * quantity})`;
        ctx2d.beginPath();
        ctx2d.arc(nx, ny, Math.max(1, rpx), 0, Math.PI * 2);
        ctx2d.fill();
        // Dark green outline makes each leaf read as a distinct cell of the body.
        ctx2d.strokeStyle = `rgba(13, 58, 30, ${0.6 + 0.42 * quantity})`;
        ctx2d.lineWidth = 1.1;
        ctx2d.stroke();
      }
    }
    for (const resource of singletons) {
      const [x, y] = w2s(resource.x, resource.y);
      if (resource.spore) {
        // Drifting spore: small pale orb with a pulsing glow.
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.15 + wobblePhase(resource.id));
        ctx2d.fillStyle = `rgba(180, 240, 190, ${0.5 + 0.4 * pulse})`;
        ctx2d.beginPath();
        ctx2d.arc(x, y, 1.4 * camera.zoom, 0, Math.PI * 2);
        ctx2d.fill();
        continue;
      }
      const isCorpse = !resource.clusterId && resource.regenerationRate <= 0;
      const quantity = resource.quantity / (resource.capacity ?? cfg.patchCapacity);
      const radius = isCorpse ? 1.0 + quantity * 3.4 : PLANT_ORB_RADIUS * 0.85 * (0.55 + 0.65 * quantity);
      const rpx = Math.max(1, radius * camera.zoom);
      ctx2d.fillStyle = isCorpse ? `rgba(196, 158, 122, ${0.32 + 0.5 * quantity})` : `rgba(142, 211, 107, ${0.28 + 0.62 * quantity})`;
      ctx2d.beginPath();
      ctx2d.arc(x, y, rpx, 0, Math.PI * 2);
      ctx2d.fill();
      // Non-corpse patches are plant leaves: outline them dark green.
      ctx2d.strokeStyle = `rgba(13, 58, 30, ${0.6 + 0.42 * quantity})`;
      ctx2d.lineWidth = 1.1;
      ctx2d.stroke();
      if (!isCorpse && rpx >= 2.2) {
        ctx2d.strokeStyle = `rgba(13, 58, 30, ${0.55 + 0.4 * quantity})`;
        ctx2d.lineWidth = 1;
        ctx2d.stroke();
      }
    }
  }

  // Water-shape smoothing overlay: a translucent feathered ring so the
  // terrain water bodies read as smooth ponds/lakes rather than coarse grid cells.
  const terrain = lab.world.terrain;
  const terrainStep = terrain.config.cellSize;
  if (lab.settings.showField || lab.settings.showResources) {
    const level = terrain.config.waterLevel;
    const depth = terrain.water;
    ctx2d.save();
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.globalCompositeOperation = "lighter";
    for (let cy = 0; cy < terrain.rows; cy++) {
      for (let cx = 0; cx < terrain.cols; cx++) {
        const d = depth[cy * terrain.cols + cx]!;
        if (d <= 0.25) continue;
        const [x, y] = w2s((cx + 0.5) * terrainStep, (cy + 0.5) * terrainStep);
        const px = d * camera.zoom * 1.4;
        ctx2d.fillStyle = `rgba(120, 200, 220, ${Math.min(0.35, 0.06 + d * 0.05).toFixed(3)})`;
        ctx2d.beginPath();
        ctx2d.arc(x, y, Math.max(1, px), 0, Math.PI * 2);
        ctx2d.fill();
      }
    }
    ctx2d.restore();
  }

  // Day/night overlay: dim the world at night so the cycle is visible.
  const day = lab.world.daylight();
  const night = 1 - day;
  if (night > 0.02) {
    ctx2d.fillStyle = `rgba(4, 8, 18, ${(night * 0.55).toFixed(3)})`;
    ctx2d.fillRect(0, 0, W, H);
  }

  if (lab.settings.showOrganisms) {
    // LOD: when zoomed out, cells are sub-pixel dots — skip facing markers and
    // rings below the threshold so thousands of cells stay cheap to draw.
    const detailZoom = camera.zoom >= 1.15;
    for (const o of lab.world.liveOrganisms()) {
      const [x, y] = w2s(o.x, o.y);
      const rpx = o.radius * camera.zoom;
      const margin = 4 + rpx;
      if (x < -margin || y < -margin || x > W + margin || y > H + margin) continue;
      const energy = Math.min(1, o.energy / 100);
      // Heritable pigment: the `hue` gene places the cell on a full colour
      // wheel; saturation lightens with stored energy, so populations drift
      // visually apart while individual vigour stays readable.
      const baseHue = Math.round((o.genome.genes.hue ?? 0.33) * 360);
      const hue = o.lifecycle === "DEAD" ? 0 : baseHue;
      if (rpx < 1.4) {
        // Cheap dot — one fillRect, no arc overhead at the far-zoom regime.
        ctx2d.fillStyle = `hsl(${hue}, 62%, ${Math.round(40 + 20 * energy)}%)`;
        ctx2d.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
        continue;
      }
      ctx2d.fillStyle = `hsl(${hue}, ${Math.round(58 + 26 * energy)}%, ${Math.round(40 + 18 * energy)}%)`;
      ctx2d.beginPath();
      ctx2d.arc(x, y, rpx, 0, Math.PI * 2);
      ctx2d.fill();
      // Facing marker shows node orientation (only when there's room to see it).
      if (detailZoom) {
        ctx2d.strokeStyle = "rgba(255,255,255,0.55)";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.moveTo(x, y);
        ctx2d.lineTo(x + Math.cos(o.facing) * rpx * 1.3, y + Math.sin(o.facing) * rpx * 1.3);
        ctx2d.stroke();
      }
      if (o.id === lab.selectedId) {
        ctx2d.strokeStyle = "rgba(255, 255, 255, 0.88)";
        ctx2d.lineWidth = 1.2;
        ctx2d.beginPath();
        ctx2d.arc(x, y, Math.max(6, o.senseRadius * camera.zoom), 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
  }

  if (tool.mode !== "pan" && tool.mode !== "inspect") {
    ctx2d.strokeStyle = tool.mode === "spawn" ? "rgba(142, 211, 107, 0.8)" : "rgba(236, 144, 120, 0.8)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(W / 2 - 9, H / 2); ctx2d.lineTo(W / 2 + 9, H / 2);
    ctx2d.moveTo(W / 2, H / 2 - 9); ctx2d.lineTo(W / 2, H / 2 + 9);
    ctx2d.stroke();
  }
}

// ------------------------------------------------------------------- charts
// Interactive trajectory charts. Series can be stacked into one chart, paired
// on left/right axes, regrouped, reordered, and collapsed per chart (and per
// stacked group). The plotted window (timeframe) is selectable and every chart
// draws axis value labels + time labels on the x axis.

interface ChartSeriesDef {
  readonly id: string;
  readonly key: keyof TickMetrics;
  readonly color: string;
  readonly label: string;
}

const chartSeriesDefs: readonly ChartSeriesDef[] = [
  { id: "chart-pop", key: "population", color: "#8ed36b", label: "population" },
  { id: "chart-energy", key: "meanEnergy", color: "#e6bb6f", label: "mean energy" },
  { id: "chart-field", key: "fieldTotal", color: "#68d0b4", label: "pheromone field" },
  { id: "chart-resource", key: "resourceTotal", color: "#91c978", label: "resources" },
  { id: "chart-maturity", key: "meanMaturity", color: "#c69be8", label: "mean maturity" },
  { id: "chart-diversity", key: "founderDiversity", color: "#83b6e8", label: "founder diversity" },
  { id: "chart-speed", key: "meanSpeed", color: "#e8a585", label: "mean speed" },
  { id: "chart-metabolism", key: "meanMetabolism", color: "#d8e8e0", label: "mean metabolism" },
];

type AxisSide = "left" | "right";

interface ChartGroupState {
  readonly id: string;
  open: boolean;
  series: { def: ChartSeriesDef; axis: AxisSide }[];
}

let nextChartGroup = 0;
let chartGroups: ChartGroupState[] = chartSeriesDefs.map((def) => ({
  id: `cg${nextChartGroup++}`,
  open: true,
  series: [{ def, axis: "left" }],
}));
let chartWindow = 360;

function findSeries(defId: string): { group: ChartGroupState; index: number } | null {
  for (const group of chartGroups) {
    const index = group.series.findIndex((s) => s.def.id === defId);
    if (index >= 0) return { group, index };
  }
  return null;
}

function ungroupedDefs(): ChartSeriesDef[] {
  return chartSeriesDefs.filter((def) => !findSeries(def.id));
}

function groupTitle(group: ChartGroupState): string {
  if (group.series.length === 1) return group.series[0]!.def.label;
  return `${group.series.length} stacked · ${group.series[0]!.def.label} ${group.series[1] ? `+ ${group.series[1]!.def.label}` : ""}${group.series.length > 2 ? " +…" : ""}`;
}

function addDefToGroup(group: ChartGroupState, def: ChartSeriesDef): void {
  const hasLeft = group.series.some((s) => s.axis === "left");
  // A second series defaults to the right axis so it can be compared as a pair.
  group.series.push({ def, axis: group.series.length === 0 || !hasLeft ? "left" : "right" });
}

function stackAllCharts(): void {
  chartGroups = [
    {
      id: `cg${nextChartGroup++}`,
      open: true,
      series: chartSeriesDefs.map((def, i) => ({ def, axis: i === 1 ? "right" : "left" })),
    },
  ];
  rebuildCharts();
}

function splitAllCharts(): void {
  chartGroups = chartSeriesDefs.map((def) => ({ id: `cg${nextChartGroup++}`, open: true, series: [{ def, axis: "left" }] }));
  rebuildCharts();
}

function moveChartGroup(group: ChartGroupState, dir: -1 | 1): void {
  const index = chartGroups.indexOf(group);
  const target = index + dir;
  if (index < 0 || target < 0 || target >= chartGroups.length) return;
  chartGroups.splice(index, 1);
  chartGroups.splice(target, 0, group);
  rebuildCharts();
}

function moveSeriesWithin(defId: string, dir: -1 | 1): void {
  const found = findSeries(defId);
  if (!found) return;
  const { group, index } = found;
  const target = index + dir;
  if (target < 0 || target >= group.series.length) return;
  const [item] = group.series.splice(index, 1);
  group.series.splice(target, 0, item!);
  rebuildCharts();
}

function toggleSeriesAxis(defId: string): void {
  const found = findSeries(defId);
  if (!found) return;
  const series = found.group.series[found.index]!;
  series.axis = series.axis === "left" ? "right" : "left";
  rebuildCharts();
}

function detachSeries(defId: string): void {
  const found = findSeries(defId);
  if (!found) return;
  const { group, index } = found;
  const [series] = group.series.splice(index, 1);
  const at = chartGroups.indexOf(group);
  const fresh: ChartGroupState = { id: `cg${nextChartGroup++}`, open: true, series: series ? [series] : [] };
  chartGroups.splice(at + 1, 0, fresh);
  if (group.series.length === 0) chartGroups.splice(chartGroups.indexOf(group), 1);
  rebuildCharts();
}

/** Rebuild the chart DOM from the group state, then draw every open chart. */
function rebuildCharts(): void {
  const root = $("charts-root");
  root.innerHTML = "";
  for (const group of chartGroups) {
    const el = document.createElement("div");
    el.className = `chart-group${group.open ? "" : " closed"}`;
    el.dataset.group = group.id;
    const head = document.createElement("div");
    head.className = "chart-head";
    head.innerHTML =
      `<button class="chart-caret" type="button" data-act="toggle" title="${group.open ? "Collapse chart" : "Expand chart"}">${group.open ? "▾" : "▸"}</button>` +
      `<span class="chart-title" title="${escapeHtml(groupTitle(group))}">${escapeHtml(groupTitle(group))}</span>` +
      `<span class="chart-tools">` +
      `<button class="mini-btn" type="button" data-act="move-up" title="Move chart earlier">↑</button>` +
      `<button class="mini-btn" type="button" data-act="move-down" title="Move chart later">↓</button>` +
      `<select class="chart-add" aria-label="Add series to this chart"><option value="">+ series</option>` +
      ungroupedDefs().map((d) => `<option value="${d.id}">${escapeHtml(d.label)}</option>`).join("") +
      `</select></span>`;
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    for (const series of group.series) {
      const chip = document.createElement("span");
      chip.className = `legend-item${series.axis === "right" ? " right" : ""}`;
      chip.innerHTML =
        `<i class="legend-dot" style="background:${series.def.color}"></i>` +
        `<span class="legend-label">${escapeHtml(series.def.label)}</span>` +
        `<button class="legend-ctl" type="button" data-act="axis" data-def="${series.def.id}" title="Assign to ${series.axis === "left" ? "right" : "left"} axis">${series.axis === "left" ? "L" : "R"}</button>` +
        `<button class="legend-ctl" type="button" data-act="series-left" data-def="${series.def.id}" title="Move series left">‹</button>` +
        `<button class="legend-ctl" type="button" data-act="series-right" data-def="${series.def.id}" title="Move series right">›</button>` +
        `<button class="legend-ctl" type="button" data-act="series-out" data-def="${series.def.id}" title="Detach into its own chart">✕</button>`;
      legend.appendChild(chip);
    }
    const body = document.createElement("div");
    body.className = "chart-body";
    body.innerHTML = `<div class="chart-wrap"><canvas data-chart="${group.id}" class="chart-canvas"></canvas></div>`;
    el.appendChild(head);
    el.appendChild(legend);
    el.appendChild(body);
    root.appendChild(el);
  }
  drawAllCharts();
}

// Delegate clicks on the dynamically-built chart controls.
$("charts-root").addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("button");
  if (!button?.dataset.act) return;
  const host = button.closest<HTMLElement>(".chart-group");
  const groupAt = (): ChartGroupState | undefined => (host ? chartGroups.find((g) => g.id === host.dataset.group) : undefined);
  switch (button.dataset.act) {
    case "toggle": {
      const g = groupAt();
      if (g) { g.open = !g.open; rebuildCharts(); }
      break;
    }
    case "move-up": {
      const g = groupAt();
      if (g) moveChartGroup(g, -1);
      break;
    }
    case "move-down": {
      const g = groupAt();
      if (g) moveChartGroup(g, 1);
      break;
    }
    case "axis":
      if (button.dataset.def) toggleSeriesAxis(button.dataset.def);
      break;
    case "series-left":
      if (button.dataset.def) moveSeriesWithin(button.dataset.def, -1);
      break;
    case "series-right":
      if (button.dataset.def) moveSeriesWithin(button.dataset.def, 1);
      break;
    case "series-out":
      if (button.dataset.def) detachSeries(button.dataset.def);
      break;
  }
});

$("charts-root").addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (!select.classList.contains("chart-add") || !select.value) return;
  const host = select.closest<HTMLElement>(".chart-group");
  const group = host ? chartGroups.find((g) => g.id === host.dataset.group) : undefined;
  const def = chartSeriesDefs.find((d) => d.id === select.value);
  if (group && def) addDefToGroup(group, def);
  rebuildCharts();
});

$("chart-window").addEventListener("change", (event) => {
  chartWindow = Math.min(720, Math.max(30, Number((event.target as HTMLSelectElement).value) || 360));
  drawAllCharts();
});
$("chart-stack-all").addEventListener("click", stackAllCharts);
$("chart-split-all").addEventListener("click", splitAllCharts);

function formatMetric(value: number): string {
  if (Math.abs(value) >= 100000) return `${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 10) return value.toFixed(0);
  return value.toFixed(2);
}

function axisRange(values: number[]): { min: number; max: number; span: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1, span: 1 };
  const pad = (max - min) * 0.08;
  const pad2 = pad < 1e-9 ? Math.max(1e-6, Math.abs(max) * 0.05) : pad;
  const lo = min - pad2;
  const hi = max + pad2;
  return { min: lo, max: hi, span: hi - lo || 1 };
}

/** Draw one chart group: series on their assigned axes, axis values + time labels. */
function drawChartGroup(group: ChartGroupState, canvas: HTMLCanvasElement): void {
  const wrap = canvas.parentElement;
  const rect = wrap?.getBoundingClientRect();
  const width = Math.max(140, Math.round(rect?.width ?? wrap?.clientWidth ?? 300));
  const height = Math.max(64, Math.round(width / 2.6));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const chart = canvas.getContext("2d")!;
  chart.setTransform(dpr, 0, 0, dpr, 0, 0);
  chart.clearRect(0, 0, width, height);

  const windowSize = Math.min(chartWindow, lab.history.length);
  const metrics = lab.history.slice(-windowSize);
  if (metrics.length < 2 || group.series.length === 0) {
    chart.fillStyle = "rgba(216, 232, 224, 0.35)";
    chart.font = "10px ui-monospace, monospace";
    chart.fillText("collecting samples…", 8, 16);
    return;
  }
  const hasLeft = group.series.some((s) => s.axis === "left");
  const hasRight = group.series.some((s) => s.axis === "right");
  const padL = hasLeft ? 42 : 8;
  const padR = hasRight ? 42 : 8;
  const padT = 10;
  const padB = 16;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (i: number): number => padL + (i / (metrics.length - 1)) * plotW;
  const yAt = (value: number, range: { min: number; span: number }): number =>
    padT + (1 - (value - range.min) / range.span) * plotH;
  const seriesOf = (side: AxisSide) => group.series.filter((s) => s.axis === side);
  const rangeFor = (side: AxisSide) => {
    const flat: number[] = [];
    for (const series of seriesOf(side)) {
      for (const metric of metrics) flat.push(Number(metric[series.def.key]));
    }
    return axisRange(flat);
  };
  const left = rangeFor("left");
  const right = hasRight ? rangeFor("right") : null;

  chart.font = "9px ui-monospace, monospace";
  chart.lineWidth = 1;
  // Gridlines + axis values for the left (and right) scale.
  for (const side of ["left", "right"] as const) {
    if (side === "right" && !right) continue;
    if (seriesOf(side).length === 0) continue;
    const range = side === "left" ? left : right!;
    const color = seriesOf(side)[0]?.def.color ?? "rgba(216, 232, 224, 0.5)";
    chart.fillStyle = color;
    chart.strokeStyle = color;
    for (const t of [0, 0.5, 1]) {
      const value = range.min + t * range.span;
      const y = Math.round(yAt(value, range));
      chart.globalAlpha = 0.16;
      chart.beginPath();
      chart.moveTo(padL, y);
      chart.lineTo(width - padR, y);
      chart.stroke();
      chart.globalAlpha = 0.9;
      const label = formatMetric(value);
      if (side === "left") chart.fillText(label, 3, y + 3);
      else chart.fillText(label, width - padR + 4, y + 3);
    }
  }
  chart.globalAlpha = 1;

  // Series polylines.
  for (const series of group.series) {
    const range = series.axis === "left" ? left : right!;
    chart.strokeStyle = series.def.color;
    chart.lineWidth = 1.5;
    chart.beginPath();
    let started = false;
    for (let i = 0; i < metrics.length; i++) {
      const value = Number(metrics[i]![series.def.key]);
      if (!Number.isFinite(value)) continue;
      const x = xAt(i);
      const y = yAt(value, range);
      if (!started) { chart.moveTo(x, y); started = true; }
      else chart.lineTo(x, y);
    }
    chart.stroke();
    // Dot the latest sample.
    const last = Number(metrics[metrics.length - 1]![series.def.key]);
    if (Number.isFinite(last)) {
      chart.fillStyle = series.def.color;
      chart.beginPath();
      chart.arc(xAt(metrics.length - 1), yAt(last, range), 2, 0, Math.PI * 2);
      chart.fill();
    }
  }

  // Time axis: relative tick labels at quarter points.
  chart.fillStyle = "rgba(216, 232, 224, 0.55)";
  chart.font = "9px ui-monospace, monospace";
  const lastTick = lab.world.tick;
  const steps = Math.max(2, Math.round(plotW / 90));
  for (let s = 0; s <= steps; s++) {
    const i = Math.round((s / steps) * (metrics.length - 1));
    const x = xAt(i);
    const tickNum = lastTick - (metrics.length - 1 - i);
    chart.fillText(`t${tickNum}`, Math.max(0, x - 12), height - 4);
  }
}

function drawAllCharts(): void {
  sampleCount.textContent = `${lab.history.length} samples · window ${Math.min(chartWindow, Math.max(0, lab.history.length)) || 0}`;
  for (const group of chartGroups) {
    if (!group.open) continue;
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-chart="${group.id}"]`);
    if (canvas) drawChartGroup(group, canvas);
  }
}

function redrawCharts(): void {
  drawAllCharts();
}

// --------------------------------------------------------------- readouts

function updatePanel(): void {
  if (!lab.selectedId) { panel.hidden = true; return; }
  const organism = lab.world.organisms.get(lab.selectedId);
  if (!organism || organism.lifecycle === "DEAD") { lab.selectedId = null; panel.hidden = true; return; }
  panel.hidden = false;
  const genes = organism.genome.genes;
  const nodes = organism.nodes;
  const levels = organism.nodeLevels;
  const brain = organism.brain;
  const dayLen = lab.world.terrain.config.dayLength;
  const phase = dayPhase(lab.world.tick, dayLen);
  const dl = daylight(lab.world.tick, dayLen);
  const pos = organism.x.toFixed(1);
  const py = organism.y.toFixed(1);
  const heading = ((organism.facing * (180 / Math.PI)) % 360 + 360) % 360;

  const nodalRows = nodes.map((n: CellNode, i: number) => {
    const gain = nodeGain(n, organism);
    const level = levels && i < levels.length ? levels[i]! : 0;
    const reach = organism.radius + n.length;
    const facingDeg = ((heading + (n.angle * (180 / Math.PI))) % 360 + 360) % 360;
    const bar = Math.max(0, Math.min(1, gain));
    return `<div class="node-row" style="--bar:${bar.toFixed(2)};--col:${nodeColor(n.kind)}">
      <span class="node-kind">${n.kind}</span>
      <span class="node-meta">a${facingDeg.toFixed(0)}° r${reach.toFixed(1)} g${gain.toFixed(2)} lvl${level}</span>
      <span class="node-bar" style="background:var(--col)"><span style="width:${(bar * 100).toFixed(0)}%"></span></span>
    </div>`;
  }).join("");

  // Simulate one brain step from the organism's current world readings so the
  // histogram reflects the live decision state rather than a stale cache.
  const input = brainInputFor(organism, lab.world);
  const step = brainStep(brain, input);

  panelBody.innerHTML = `
    <div class="sel-head">
      <b>${organism.id}</b> · ${organism.lifecycle} · age ${organism.age}
      <span class="sel-track" title="tracking camera">🎥</span>
    </div>
    <div class="sel-quad">
      <div class="sel-col">
        <div>energy ${organism.energy.toFixed(1)} · maturity ${(organism.maturity * 100).toFixed(0)}%</div>
        <div>pos ${pos},${py} · v ${organism.vx.toFixed(2)},${organism.vy.toFixed(2)}</div>
        <div>facing ${heading.toFixed(1)}° · senseR ${organism.senseRadius.toFixed(1)}</div>
        <div>genome ${organism.genomeId}</div>
        <div class="genes">speed ${genes.speed.toFixed(2)} · sense ${genes.senseRadius.toFixed(1)} · metab ${genes.metabolism.toFixed(2)}</div>
        <div class="genes">repro-thr ${genes.reproductionThreshold.toFixed(1)} · invest ${genes.offspringInvestment.toFixed(2)}</div>
        <div class="genes">agg ${genes.aggression.toFixed(2)} · daySens ${genes.daySensitivity.toFixed(2)}</div>
        <div class="genes">photo ${genes.photoreceptorCount} · chemo ${genes.chemoreceptorCount} · mech ${genes.mechanoreceptorCount} · flag ${genes.flagellumCount} · spike ${genes.spikeCount}</div>
      </div>
      <div class="sel-col">
        <div class="sub-head">body nodes · ${nodes.length}</div>
        ${nodalRows}
      </div>
      <div class="sel-col narrow">
        <div class="sub-head">brain · hidden</div>
        <div class="hist">${step.hidden.map((h: number) => {
          const v = Math.max(0, Math.min(1, (h + 1) / 2));
          return `<span class="hist-bar" style="height:${(v * 100).toFixed(0)}%;background:${hiddenColor(h)}"></span>`;
        }).join("")}
        </div>
        <div class="hist-labels">H0–H${step.hidden.length - 1}</div>
        <div class="sub-head">brain · outputs</div>
        <div class="hist">${step.out.map((o: number, i: number) => {
          const v = Math.max(0, Math.min(1, (o + 1) / 2));
          const label = ["moveX","moveY","speed","attack"][i] ?? `o${i}`;
          return `<span class="hist-bar" style="height:${(v * 100).toFixed(0)}%;background:${outputColor(i)}"></span>`;
        }).join("")}
        </div>
        <div class="hist-labels">${step.out.map((_: number, i: number) => ["moveX","moveY","speed","attack"][i] ?? `o${i}`).join(" · ")}</div>
        <div class="mini-stat">day ${dl.toFixed(2)} · phase ${(phase * 100).toFixed(0)}%</div>
      </div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function updateDataPanels(): void {
  const last = lab.history[lab.history.length - 1];
  const p = lab.getParameters();
  const rows: Array<[string, string]> = [
    ["seed", lab.seed], ["model", "nu-core-v2"], ["tick", String(lab.world.tick)],
    ["population", String(lab.world.liveOrganisms().length)], ["mean energy", last ? last.meanEnergy.toFixed(2) : "—"],
    ["resource total", last ? last.resourceTotal.toFixed(2) : "—"], ["field total", last ? last.fieldTotal.toFixed(2) : "—"],
    ["lineage nodes", last ? String(last.lineageNodes) : "—"], ["species", last ? String(last.speciesCount) : "—"],
    ["species diversity", last ? last.speciesDiversity.toFixed(3) : "—"], ["surviving lineages", last ? String(last.survivingLineages) : "—"],
    ["interactions", last ? String(last.interactionCount) : "—"], ["conservation drift", last ? last.conservationDrift.toFixed(2) : "—"],
    ["mutation rate", p.mutationRate.toFixed(2)],
  ];
  dataSummary.innerHTML = rows
    .map(([key, value]) => `<div class="data-row"><span>${key}</span><b>${escapeHtml(value)}</b></div>`)
    .join("");
  const counts = new Map<string, number>();
  for (const event of lab.world.ephemeral.lastEvents) counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  const entries = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  eventsSummary.innerHTML = entries.length
    ? entries.map(([type, count]) => `<div><b>${type}</b> × ${count}</div>`).join("")
    : "<div>No events in the last committed tick.</div>";
  if (lastCheckpointTick === null) checkpointSummary.textContent = "No checkpoint saved in this session.";
}

// ------------------------------------------------------------------- loop

let lastReadout = 0;
let fpsEma = 60;
let lastFrameAt = performance.now();
/** Recentre the camera on the selected organism while tracking is active. */
function applyTrackingCamera(): void {
  if (!trackingSelected) return;
  const target = lab.selectedId ? lab.world.organisms.get(lab.selectedId) : undefined;
  if (target && target.lifecycle !== "DEAD") {
    camera.x = target.x;
    camera.y = target.y;
    if (camera.zoom < 2) camera.zoom = Math.min(4, camera.zoom * 1.02);
  } else {
    trackingSelected = false; // subject died — release the camera
    const badge = document.querySelector<HTMLSpanElement>(".sel-track");
    if (badge) badge.classList.remove("tracking");
  }
}

function frame(now: number): void {
  // Current FPS = exponential average of real rAF frame intervals.
  const dtMs = Math.max(1, now - lastFrameAt);
  lastFrameAt = now;
  const instant = 1000 / dtMs;
  fpsEma = fpsEma === 0 ? instant : fpsEma * 0.92 + instant * 0.08;
  applyTrackingCamera();
  const metric = paused ? null : lab.advance();
  if (metric) fieldDirty = true; // the field changed; redraw the overlay once
  draw();
  if (metric || now - lastReadout > 120) {
    statFps.textContent = String(Math.round(fpsEma));
    statTick.textContent = String(lab.world.tick);
    statPop.textContent = String(lab.world.liveOrganisms().length);
    statBirths.textContent = String(lab.births);
    statDeaths.textContent = String(lab.deaths);
    statField.textContent = metric ? metric.fieldTotal.toFixed(0) : (lab.history.at(-1)?.fieldTotal.toFixed(0) ?? "0");
    statMaturity.textContent = metric ? `${(metric.meanMaturity * 100).toFixed(0)}%` : (lab.history.at(-1) ? `${(lab.history.at(-1)!.meanMaturity * 100).toFixed(0)}%` : "—");
    statDiversity.textContent = metric ? metric.founderDiversity.toFixed(2) : (lab.history.at(-1)?.founderDiversity.toFixed(2) ?? "—");
    redrawCharts();
    updatePanel();
    updateDataPanels();
    lastReadout = now;
  }
  requestAnimationFrame(frame);
}

resizeCanvas();
new ResizeObserver(resizeCanvas).observe(canvas);
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(frame);
