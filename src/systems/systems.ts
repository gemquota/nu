// Evolutionary plane — systems (Part 12 §12.2.4, Part 13 §13.6).
//
// Each system declares a contract (Part 11 §11.5): phases, reads, writes,
// stream. Systems read authoritative STATE(t) and write ONLY staged
// deltas/intents; nothing mutates the world directly (Part 13 §13.3 read/write
// boundaries, K3). All iteration is in deterministic id order (K5); all draws
// come from the system's declared stream at fixed draw points (K4).
//
// Behaviour (DECIDE) is node-based: an organism's perception and action go
// through its node body (photoreceptors cast rays, chemoreceptors smell,
// mechanoreceptors touch) and its neural network (the brain) maps those node
// readings to motor/effector activations. Locomotion is incremental and gated
// by the brain's motor output; feeding grows biomass; spike nodes attack prey;
// the day/night cycle and terrain (water, organic walls) modulate the
// environment and behaviour.

import type { System, SystemContract, TickContext } from "../kernel/kernel";
import { SpatialHash } from "../world/spatial";
import {
  applyWalls,
  radiusFromBiomass,
  cellRadius,
  type OrganismRecord,
  type ResourcePatch,
  type World,
  type WallConfig,
  type WallPolicy,
} from "../world/world";
import type {
  AttackIntent,
  ConsumptionIntent,
  MoveIntent,
  ReproductionIntent,
} from "../world/intents";
import { advanceDevelopment, phenotypeScale } from "../world/development";
import { brainStep, BRAIN_HIDDEN, BRAIN_INPUTS, BRAIN_OUTPUTS, INPUT, OUTPUT, nodeReach, nodeGain, nodeLevelTotal, mutateBrain, type CellNode } from "../world/body";
import {
  CORPSE_MOLECULE_FRACTION,
  CONSTRUCTION_MOLECULE_COST,
  CORPSE_BIOMASS_ENERGY,
  CORPSE_ENERGY_DECAY,
  CORPSE_MOLECULE_DECAY,
  MOLECULE_SYNTH_ENERGY,
  MOLECULES_PER_FOOD,
  SYNTH_BASE_RATE,
  SYNTH_RESERVE_ENERGY,
  NODE_UPGRADE_MAX_LEVEL,
  NODE_UPGRADE_BASE_COST,
  NODE_UPGRADE_COST_PER_LEVEL,
  NODE_UPGRADE_MIN_ENERGY,
  SPIKE_DAMAGE_PER_LEVEL,
  moleculeCapacity,
  reproductionMoleculeCost,
} from "../world/metabolism";
import { mutateGenome, recombineBrain, recombineGenome, type OperatorApplication } from "../world/genetics";
import { clusterSpecies } from "../world/ecology";
import {
  MAX_CLUSTER_LEAVES,
  MAX_PLANT_CLUSTERS_SCALE,
  LEAF_WILT_FRACTION,
  SPORE_GROWTH_PROBABILITY,
  LEAF_MIN_SPACING,
  CLUSTER_MIN_SPACING,
  SPORE_LIFESPAN,
  SPORE_PLANT_LEAVES,
  SPORE_WIND_SPEED,
  sporeLifespanFor,
  GROWTH_PROBABILITY,
  EAT_DISLODGE_PROBABILITY,
  PHOTOSYNTHESIS_RATE,
  GROWTH_COST,
  GROWTH_RESERVE,
  LEAF_MATURATION_TICKS,
  UPKEEP_PER_LEAF,
  UPKEEP_STARVATION_TICKS,
  CONSTRUCTION_UPKEEP_FRACTION,
  SOIL_DEPLETION_PER_TICK,
  SOIL_RECOVERY_PER_TICK,
  POOL_CAPACITY_LEAVES,
  makeLeaf,
  makeSpore,
  makePlantCluster,
  photosynthesisInput,
  type PlantClusterState,
  leafRingPosition,
  plantClusterId,
} from "../world/plants";
import type { ObservationRecord } from "./observations";
import { makeOrganism, nextOrganismId } from "../world/initialization";
// ---------------------------------------------------------------------------
// OBSERVE — rebuild the derived spatial indexes (pure projection, no writes).
// ---------------------------------------------------------------------------

export class SpatialIndexSystem implements System {
  readonly contract: SystemContract = {
    systemId: "spatial-index",
    phases: ["OBSERVE"],
    reads: ["resources", "organisms"],
    writes: [],
  };
  constructor(private readonly world: World) {}

  run(): void {
    // Derived state (Part 12 §12.24): rebuildable projections, stored as
    // ephemeral — never authoritative.
    const index = new SpatialHash<string>(16);
    for (const r of this.world.resourceList()) {
      if (r.quantity > 0) index.insert(r.id, { x: r.x, y: r.y });
    }
    this.world.ephemeral.resourceIndex = index;
    const orgIndex = new SpatialHash<string>(12);
    for (const o of this.world.liveOrganisms()) orgIndex.insert(o.id, { x: o.x, y: o.y });
    this.world.ephemeral.organismIndex = orgIndex;
  }
}

function resourceIndex(world: World): SpatialHash<string> {
  return world.ephemeral.resourceIndex ?? new SpatialHash<string>(16);
}

function organismIndex(world: World): SpatialHash<string> {
  return world.ephemeral.organismIndex ?? new SpatialHash<string>(12);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Node-based perception helpers (Part 16 B1–B3 — nodes are the interface).
// ---------------------------------------------------------------------------

function nodeDir(node: CellNode, o: OrganismRecord): { x: number; y: number } {
  const a = o.facing + node.angle;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Food gradient (smell): nearest resource + pheromone trail, blended. */
function foodGradient(o: OrganismRecord, world: World): { x: number; y: number } {
  const res = resourceIndex(world).queryNearest({ x: o.x, y: o.y }, o.senseRadius);
  let x = 0;
  let y = 0;
  if (res) {
    const d = Math.max(res.dist, 1e-6);
    const s = 1 - res.dist / Math.max(1, o.senseRadius);
    x += ((res.pos.x - o.x) / d) * s;
    y += ((res.pos.y - o.y) / d) * s;
  }
  const g = world.field.gradient(o.x, o.y);
  const gm = Math.hypot(g.gx, g.gy);
  if (gm > 1e-3) {
    const s = Math.min(1, gm) * 0.4;
    x += (g.gx / gm) * s;
    y += (g.gy / gm) * s;
  }
  return { x, y };
}

/** Nearest other organism within a probe radius. */
function nearestPrey(o: OrganismRecord, world: World, radius: number): { x: number; y: number; dist: number; id: string } | null {
  const near = organismIndex(world).queryNearest({ x: o.x, y: o.y }, radius);
  if (!near || near.key === o.id) return null;
  return { x: near.pos.x, y: near.pos.y, dist: near.dist, id: near.key };
}

/** Wall/water avoidance: sample a ring around the cell. */
function wallVector(o: OrganismRecord, world: World): { x: number; y: number } {
  let wx = 0;
  let wy = 0;
  const reach = o.radius + 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = o.x + Math.cos(a) * reach;
    const py = o.y + Math.sin(a) * reach;
    if (world.blocked(px, py) || world.terrain.isWater(px, py)) {
      wx -= Math.cos(a);
      wy -= Math.sin(a);
    }
  }
  return { x: wx, y: wy };
}

/**
 * Photoreceptor raycast: a node casts a ray in its orientation; the world is
 * sampled along the ray to detect objects (food/prey/walls) and light.
 * This is genuine directional vision — the cell only perceives what a ray
 * from that specific node actually meets.
 */
function raycast(o: OrganismRecord, dir: { x: number; y: number }, node: CellNode, world: World): {
  light: number;
  food: number;
  prey: number;
  wall: boolean;
} {
  const reach = nodeReach(node, o.radius);
  const day = world.daylight();
  const steps = Math.max(3, Math.min(10, Math.ceil(reach / 3)));
  let blocked = false;
  for (let s = 1; s <= steps; s++) {
    const px = o.x + dir.x * (reach * s) / steps;
    const py = o.y + dir.y * (reach * s) / steps;
    if (world.blocked(px, py)) { blocked = true; break; }
    if (world.terrain.isWater(px, py) && s > steps * 0.6) { blocked = true; break; }
  }
  const tipX = o.x + dir.x * reach;
  const tipY = o.y + dir.y * reach;
  let food = 0;
  let prey = 0;
  if (!blocked) {
    const f = resourceIndex(world).queryNearest({ x: tipX, y: tipY }, node.length + 4);
    if (f) food = Math.max(0, 1 - f.dist / (node.length + 4));
    const p = organismIndex(world).queryNearest({ x: tipX, y: tipY }, node.length + 3);
    if (p && p.key !== o.id) prey = Math.max(0, 1 - p.dist / (node.length + 3));
  }
  // Light dims when the ray is occluded; prey shadows the light slightly.
  // Upgraded photoreceptors are more sensitive (nodeGain includes upgrades).
  const light = day * (blocked ? 0.15 : 1) * (prey > 0 ? 0.7 : 1) * nodeGain(node, o);
  return { light, food, prey, wall: blocked };
}

/**
 * Part 16 B1 — assemble formal observation records from the node body. Each
 * sensory node produces directional observations (modality/direction/intensity/
 * confidence/tick); the policy consumes ONLY these records, never the world.
 */
function nodeObservations(o: OrganismRecord, world: World): ObservationRecord[] {
  const obs: ObservationRecord[] = [
    {
      modality: "own-state",
      intensity: Math.min(1, o.energy / 100),
      confidence: 1,
      tick: world.tick,
      energy: o.energy,
      maturity: o.maturity,
    },
  ];
  const foodG = foodGradient(o, world);
  for (const node of o.nodes) {
    const dir = nodeDir(node, o);
    if (node.kind === "chemoreceptor") {
      // Directional smell: project the food gradient onto the node's axis.
      const s = foodG.x * dir.x + foodG.y * dir.y;
      if (s > 0) {
        obs.push({ modality: "resource", dirX: dir.x, dirY: dir.y, intensity: s, confidence: Math.min(1, nodeGain(node, o)), tick: world.tick });
      }
    } else if (node.kind === "photoreceptor") {
      const ray = raycast(o, dir, node, world);
      obs.push({ modality: "light", dirX: dir.x, dirY: dir.y, intensity: ray.light, confidence: 1, tick: world.tick });
      if (ray.food > 0) obs.push({ modality: "resource", dirX: dir.x, dirY: dir.y, intensity: ray.food, confidence: Math.min(1, nodeGain(node, o)), tick: world.tick });
      if (ray.prey > 0) obs.push({ modality: "prey", dirX: dir.x, dirY: dir.y, intensity: ray.prey, confidence: Math.min(1, nodeGain(node, o)), tick: world.tick });
      if (ray.wall) obs.push({ modality: "wall", dirX: -dir.x, dirY: -dir.y, intensity: 1, confidence: 1, tick: world.tick });
    } else if (node.kind === "mechanoreceptor") {
      const reach = nodeReach(node, o.radius);
      const near = organismIndex(world).queryNearest({ x: o.x, y: o.y }, reach);
      if (near && near.key !== o.id) {
        const d = Math.max(near.dist, 1e-6);
        const s = (1 - near.dist / reach) * nodeGain(node, o);
        obs.push({ modality: "prey", dirX: (near.pos.x - o.x) / d, dirY: (near.pos.y - o.y) / d, intensity: s, confidence: Math.min(1, nodeGain(node, o)), tick: world.tick });
      }
    }
  }
  return obs;
}

/** Blend recurrent memory into a sensory input slot (leaky short-term memory). */
function foldMemory(input: number[], memory: readonly number[], slots: readonly number[]): void {
  for (const slot of slots) {
    input[slot] = Math.tanh(input[slot]! + (memory[slot] ?? 0) * MEMORY_BLEND);
  }
}

/**
 * Part 16 — run the policy from observation records + recurrent memory, and
 * derive the memory update and Hebbian (lifetime-plasticity) weight deltas.
 */
function brainProcess(
  o: OrganismRecord,
  world: World,
  learningRate: number,
): { out: number[]; newMemory: number[]; newWeights: number[] | null } {
  const observations = nodeObservations(o, world);
  const input: number[] = new Array<number>(BRAIN_INPUTS).fill(0);
  let light = 0;
  let foodX = 0;
  let foodY = 0;
  let preyX = 0;
  let preyY = 0;
  let wallX = 0;
  let wallY = 0;
  for (const ob of observations) {
    const dx = ob.dirX ?? 0;
    const dy = ob.dirY ?? 0;
    switch (ob.modality) {
      case "light": light = Math.max(light, ob.intensity); break;
      case "resource": foodX += dx * ob.intensity * ob.confidence; foodY += dy * ob.intensity * ob.confidence; break;
      case "prey": preyX += dx * ob.intensity * ob.confidence; preyY += dy * ob.intensity * ob.confidence; break;
      case "wall": wallX += dx * ob.intensity; wallY += dy * ob.intensity; break;
      default: break;
    }
  }
  const norm = (x: number, y: number): [number, number] => {
    const m = Math.hypot(x, y);
    return m > 1e-3 ? [x / m, y / m] : [0, 0];
  };
  [foodX, foodY] = norm(foodX, foodY);
  [preyX, preyY] = norm(preyX, preyY);
  [wallX, wallY] = norm(wallX, wallY);
  input[INPUT.light] = Math.min(1, light);
  input[INPUT.foodX] = foodX;
  input[INPUT.foodY] = foodY;
  input[INPUT.preyX] = preyX;
  input[INPUT.preyY] = preyY;
  input[INPUT.wallX] = wallX;
  input[INPUT.wallY] = wallY;
  input[INPUT.energy] = Math.min(1, o.energy / 100);
  input[INPUT.biomass] = Math.min(1, o.biomass / 60);
  input[INPUT.daylight] = world.daylight();
  input[INPUT.aggression] = Math.max(-1, Math.min(1, o.genome.genes.trophic));
  // Terrain correlates: cells sense elevation, water depth, and continuous
  // wall proximity, so gradients (food, pheromone) can be correlated with the
  // landscape — ridge-following, pool-hunting, wall-hugging strategies can
  // evolve rather than being hard-coded.
  input[INPUT.elevation] = Math.min(1, Math.max(0, world.elevationAt(o.x, o.y)));
  input[INPUT.water] = Math.min(1, world.waterDepthAt(o.x, o.y) / 3);  input[INPUT.wallProximity] = world.wallProximityAt(o.x, o.y, o.radius + 5);
  // Directional wall gradient (correlate walls): continuous rock-distance
  // probes on the same axes as the wall-avoidance reflex, so the brain can
  // evolve wall-following/hugging, not just blind repulsion.
  {
    let wgx = 0;
    let wgy = 0;
    let wgm = 0;
    const probe = o.radius + 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (world.blocked(o.x + Math.cos(a) * probe, o.y + Math.sin(a) * probe)) {
        wgx -= Math.cos(a);
        wgy -= Math.sin(a);
        wgm += 1;
      }
    }
    if (wgm > 0) {
      const m = Math.hypot(wgx, wgy);
      if (m > 1e-3) {
        input[INPUT.wallX] = wgx / m;
        input[INPUT.wallY] = wgy / m;
      }
    }
  }

  // Recurrent memory: fold the trace into the sensory slots before deciding.
  foldMemory(input, o.memory, [INPUT.light, INPUT.foodX, INPUT.foodY, INPUT.preyX, INPUT.preyY, INPUT.wallX, INPUT.wallY]);

  const { hidden, out } = brainStep(o.brain, input);

  // Leaky memory update: decay old, integrate new sensory context.
  const newMemory = new Array<number>(BRAIN_INPUTS);
  for (let i = 0; i < BRAIN_INPUTS; i++) {
    newMemory[i] = MEMORY_DECAY * (o.memory[i] ?? 0) + (1 - MEMORY_DECAY) * input[i]!;
  }

  // Part 16 lifetime plasticity: Hebbian co-activation of inputs and activations.
  let newWeights: number[] | null = null;
  if (learningRate > 0) {
    const w = o.brain.weights;
    newWeights = [...w];
    for (let h = 0; h < BRAIN_HIDDEN; h++) {
      for (let i = 0; i < BRAIN_INPUTS; i++) {
        const idx = h * BRAIN_INPUTS + i;
        newWeights[idx] = Math.min(4, Math.max(-4, w[idx]! + learningRate * input[i]! * hidden[h]!));
      }
    }
    const off = BRAIN_INPUTS * BRAIN_HIDDEN;
    for (let oo = 0; oo < BRAIN_OUTPUTS; oo++) {
      for (let h = 0; h < BRAIN_HIDDEN; h++) {
        const idx = off + oo * BRAIN_HIDDEN + h;
        newWeights[idx] = Math.min(4, Math.max(-4, w[idx]! + learningRate * hidden[h]! * out[oo]!));
      }
    }
  }
  return { out, newMemory, newWeights };
}

const MEMORY_DECAY = 0.7;
const MEMORY_BLEND = 0.25;

// ---------------------------------------------------------------------------
// DECIDE — behaviour: nodes perceive → brain decides → motor/effector intents.
// ---------------------------------------------------------------------------

export class BehaviourSystem implements System {
  readonly contract: SystemContract = {
    systemId: "behaviour",
    phases: ["DECIDE"],
    reads: ["organisms", "resources", "resourceIndex", "organismIndex", "field"],
    writes: ["organism.facing", "organism.memory", "organism.brain"],
    stream: "behaviour",
  };
  constructor(
    private readonly world: World,
    /** Part 16 lifetime plasticity: Hebbian learning rate (0 = no learning). */
    private readonly learningRate = 0,
  ) {}

  run(ctx: TickContext): void {
    const moveScale = this.world.config.moveScale ?? 0.5;
    for (const o of this.world.liveOrganisms()) {
      const { out, newMemory, newWeights } = brainProcess(o, this.world, this.learningRate);
      let hx = out[OUTPUT.moveX]!;
      let hy = out[OUTPUT.moveY]!;
      let mag = Math.hypot(hx, hy);
      // Safety reflex: if the brain produces no heading, fall back to the
      // chemotaxis gradient (a hard-wired food-seeking taxis) so cells can feed.
      if (mag < 0.08) {
        const fg = foodGradient(o, this.world);
        hx = fg.x;
        hy = fg.y;
        mag = Math.hypot(hx, hy);
      }
      if (mag > 1e-3) { hx /= mag; hy /= mag; } else {
        const angle = ctx.rng.next("behaviour") * Math.PI * 2;
        hx = Math.cos(angle);
        hy = Math.sin(angle);
      }
      // Incremental locomotion: move a fraction of gene speed, gated by the
      // brain's motor output (small, biologically-plausible steps).
      const motor = Math.max(0.04, (out[OUTPUT.speed]! + 1) / 2);
      const desired = o.speed * moveScale * motor;
      if (desired > 0.02) {
        const intent: MoveIntent = { type: "move", actorId: o.id, headingX: hx, headingY: hy, speed: desired };
        ctx.recordIntent(intent);
      }
      // Update facing toward the intended heading (so node orientations track
      // movement).
      const target = Math.atan2(hy, hx);
      let delta = target - o.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      ctx.assertWrite("organism.facing");
      ctx.stage({ kind: "adjust", scope: "organism.facing", key: o.id, amount: delta });

      // Part 16: stage the recurrent-memory trace and (if learning) the
      // Hebbian weight update. Both apply at COMMIT, so decisions always read
      // the previous tick's learning state (B5 double buffering). Memory dies
      // with the organism — it is not heritable (B11).
      ctx.assertWrite("organism.memory");
      ctx.stage({ kind: "set", scope: "organism.memory", key: o.id, value: newMemory as unknown as number });
      if (newWeights) {
        ctx.assertWrite("organism.brain");
        ctx.stage({ kind: "set", scope: "organism.brain", key: o.id, value: newWeights as unknown as number });
      }

      // Predation: a brain that fires attack, with spike nodes, hits the
      // nearest cell in reach.
      const attackOut = out[OUTPUT.attack]!;
      if (attackOut > 0.15 && o.genome.genes.spikeCount > 0 && o.genome.genes.trophic > -0.4) {
        const spikes = o.nodes.filter((n) => n.kind === "spike");
        const reach = spikes.reduce((m, n) => Math.max(m, nodeReach(n, o.radius)), 4);
        const prey = nearestPrey(o, this.world, reach + o.radius);
        if (prey) {
          // Upgraded spikes hit harder (ProtoEvo node upgrades feed combat).
          const spikeBoost = 1 + SPIKE_DAMAGE_PER_LEVEL * nodeLevelTotal("spike", o);
          const damage = o.genome.genes.attackPower * spikes.length * (0.5 + attackOut) * spikeBoost;
          const intent: AttackIntent = { type: "attack", actorId: o.id, targetId: prey.id, damage };
          ctx.recordIntent(intent);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ACT — locomotion: move intents become proposed velocity impulses.
// ---------------------------------------------------------------------------

export class LocomotionSystem implements System {
  readonly contract: SystemContract = {
    systemId: "locomotion",
    phases: ["ACT"],
    reads: ["intents"],
    writes: ["organism.velocity.x", "organism.velocity.y"],
  };

  run(ctx: TickContext): void {
    // Locomotion is the SOLE writer of velocity: this tick's velocity is the
    // proposed heading × speed (set, not adjust — no cross-phase clobbering).
    for (const intent of ctx.intents) {
      const m = intent as Partial<MoveIntent>;
      if (m.type !== "move" || typeof m.actorId !== "string") continue; // only our intents (§13.3)
      const mv = m as MoveIntent;
      ctx.assertWrite("organism.velocity.x");
      ctx.stage({
        kind: "set",
        scope: "organism.velocity.x",
        key: mv.actorId,
        value: mv.headingX * mv.speed,
      });
      ctx.stage({
        kind: "set",
        scope: "organism.velocity.y",
        key: mv.actorId,
        value: mv.headingY * mv.speed,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// INTERACT — detect consumption opportunities (deterministic pair enumeration).
// ---------------------------------------------------------------------------

export class ConsumptionDetectionSystem implements System {
  readonly contract: SystemContract = {
    systemId: "consumption-detection",
    phases: ["INTERACT"],
    reads: ["organisms", "resources", "resourceIndex"],
    writes: [],
  };
  constructor(
    private readonly world: World,
    private readonly consumeRadius: number,
    private readonly biteSize: number,
  ) {}

  run(ctx: TickContext): void {
    const index = resourceIndex(this.world);
    for (const o of this.world.liveOrganisms()) {
      const nearby = index.query({ x: o.x, y: o.y }, this.consumeRadius);
      for (const hit of nearby) {
        const patch = this.world.resources.get(hit.key);
        if (!patch || patch.quantity <= 0) continue;
        const intent: ConsumptionIntent = {
          type: "consume",
          actorId: o.id,
          resourceId: patch.id,
          amount: this.biteSize,
        };
        ctx.recordIntent(intent);
        break; // one bite proposal per organism per tick
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RESOLVE — the world decides whether proposals succeed (stream: environment).
// ---------------------------------------------------------------------------

export class ResolutionSystem implements System {
  readonly contract: SystemContract = {
    systemId: "resolution",
    phases: ["RESOLVE"],
    reads: ["intents", "resources", "organisms", "field"],
    writes: [
      "resource.quantity",
      "resource.depletedTicks",
      "resource.molecules",
      "organism.energy",
      "organism.molecules",
      "organism.biomass",
      "field",
    ],
    stream: "environment",
  };
  constructor(
    private readonly world: World,
    private readonly pulseProbability: number,
    private readonly pulseAmount: number,
  ) {}

  run(ctx: TickContext): void {
    const depleted = new Map<string, number>();
    const fed = new Set<string>();
    for (const intent of ctx.intents) {
      const c = intent as Partial<ConsumptionIntent>;
      if (c.type !== "consume" || typeof c.actorId !== "string" || typeof c.resourceId !== "string") continue;
      const con = c as ConsumptionIntent;
      if (fed.has(con.actorId)) continue;
      const patch = this.world.resources.get(con.resourceId);
      if (!patch) continue;
      const already = depleted.get(con.resourceId) ?? 0;
      const amount = Math.min(con.amount, patch.quantity - already);
      if (amount <= 0) continue;
      depleted.set(con.resourceId, already + amount);
      fed.add(con.actorId);
      ctx.assertWrite("resource.quantity");
      ctx.stage({ kind: "adjust", scope: "resource.quantity", key: patch.id, amount: -amount });
      ctx.assertWrite("organism.energy");
      ctx.stage({ kind: "adjust", scope: "organism.energy", key: con.actorId, amount: this.world.config.energyPerResource * amount });
      // Conservation: resource quantity → organism energy at `energyPerResource`;
      // the conversion markup is a declared inflow (R2, converted at declared rates).
      this.world.conservation.inflow += (this.world.config.energyPerResource - 1) * amount;
      // ProtoEvo molecules: eating collects the complex molecules stored in
      // the food. Corpses carry an explicit molecule pool (scavenged in the
      // same proportion as their quantity); plants yield molecules per unit.
      const eater = this.world.organism(con.actorId);
      if (eater) {
        const pool = patch.molecules ?? 0;
        const molRaw =
          pool > 0 ? pool * (amount / Math.max(1e-6, patch.quantity)) : amount * MOLECULES_PER_FOOD;
        const molRoom = Math.max(0, moleculeCapacity(eater.nodes, eater.biomass) - eater.molecules);
        const molGain = Math.min(molRaw, molRoom);
        if (molGain > 1e-4) {
          ctx.assertWrite("organism.molecules");
          ctx.stage({ kind: "adjust", scope: "organism.molecules", key: eater.id, amount: molGain });
          if (pool > 0) {
            ctx.assertWrite("resource.molecules");
            ctx.stage({ kind: "adjust", scope: "resource.molecules", key: patch.id, amount: -molGain });
          }
        }
        const gain = this.world.config.energyPerResource * amount * eater.genome.genes.growthEfficiency * 0.1;
        ctx.assertWrite("organism.biomass");
        ctx.stage({ kind: "adjust", scope: "organism.biomass", key: con.actorId, amount: gain });
      }
      ctx.emit("ResourceConsumed", [con.actorId], [patch.id], { amount });
      this.world.field.deposit(eater?.x ?? patch.x, eater?.y ?? patch.y, amount * 0.5);
      // Part 17 I1: record the resolved consumption interaction (audit trail).
      this.world.recordInteraction({
        interactionId: `i${ctx.tick.toString(36)}-${this.world.interactions.length.toString(36)}`,
        tick: ctx.tick,
        interactionType: "consume",
        initiator: con.actorId,
        recipient: patch.id,
        locationX: eater?.x ?? patch.x,
        locationY: eater?.y ?? patch.y,
        transfer: amount,
      });
      // Niche construction: consuming leaves a chemical trace (E4).
      this.world.env.deposit("chemical", eater?.x ?? patch.x, eater?.y ?? patch.y, amount * 0.1);
      // Part 17 plant ecology: being eaten can dislodge a clump as a drifting
      // spore (the plant spreads when nibbled).
      if (patch.clusterId && ctx.rng.next("environment") < EAT_DISLODGE_PROBABILITY) {
        const sx = patch.x;
        const sy = patch.y;
        const dir = ctx.rng.next("environment") * Math.PI * 2;
        const spore = makeSpore(
          `r:spore-e${ctx.tick.toString(36)}-${this.world.resources.size.toString(36)}`,
          sx,
          sy,
          // Long-range ejection: the dislodged clump is flung a determinstic
          // 4–7 units/tick in a fresh random direction. Dispersal must carry
          // spores AWAY from the parent plant, so a stationary carnivore
          // grazing one plant cannot simply farm the clumps it dislodges.
          Math.cos(dir) * (4 + ctx.rng.next("environment") * 3),
          Math.sin(dir) * (4 + ctx.rng.next("environment") * 3),
          sporeLifespanFor(this.world.config.width, this.world.config.height),
        );
        ctx.assertWrite("resource");
        ctx.stage({ kind: "add", scope: "resource", entity: spore });
        // Conservation: a dislodged clump is new plant biomass (a primary inflow).
        this.world.conservation.inflow += spore.quantity;
        ctx.emit("EnvironmentChanged", [], [spore.id], { sporeDislodged: true });
      }
    }

    // Environmental dynamics: resource pulses (Environment(t+1) = G(...), §12.13).
    if (ctx.rng.next("environment") < this.pulseProbability) {
      const patches = this.world.resourceList();
      if (patches.length > 0) {
        const pick = patches[ctx.rng.int("environment", patches.length)]!;
        ctx.stage({ kind: "adjust", scope: "resource.quantity", key: pick.id, amount: this.pulseAmount });
        // Conservation ledger: an environmental pulse is a declared inflow.
        this.world.conservation.inflow += this.pulseAmount;
        ctx.emit("EnvironmentChanged", [], [pick.id], { pulse: this.pulseAmount });
      }
    }

    // Regeneration with day/night + terrain (water) modulation: patches grow
    // back toward capacity; food is likelier near water and during daylight.
    // I1.4: the depletedTicks camping counter is retired — leaf death is
    // budget-only (cluster pool starvation in PlantEcologySystem). Wilted
    // leaves contribute no photosynthesis income while below the wilt line
    // (pool signal, see the cluster budget loop), so grazing still bites.
    const day = this.world.daylight();
    const dayFactor = 0.5 + 0.6 * day;
    for (const r of this.world.resourceList()) {
      if (r.regenerationRate <= 0) continue;
      const cap = r.capacity ?? this.world.config.patchCapacity;
      const zone = this.world.zoneEffectsAt(r.x, r.y).resourceRegen;
      const water = this.world.terrainResource(r.x, r.y);
      // Full regeneration (never hard-cuts, so the food web can't crash).
      const room = cap - r.quantity;
      if (room > 0) {
        const regen = Math.min(room, cap * r.regenerationRate * zone * water * dayFactor);
        ctx.stage({ kind: "adjust", scope: "resource.quantity", key: r.id, amount: regen });
        // Conservation: regeneration is the ecosystem's energy inflow.
        this.world.conservation.inflow += regen;
      }
    }

    // E3: field dynamics — staged deposits commit, then decay + diffusion.
    this.world.field.step();
    this.world.env.step();
  }
}

// ---------------------------------------------------------------------------
// RESOLVE — plant ecology: growth (spawn new attached orbs) and spore
// dispersal (drifting clumps that settle into new plants).
// ---------------------------------------------------------------------------

/**
 * True when (x, y) is at least `minLeaf` from every leaf of the cluster being
 * grown and at least `minOther` from drifting spores. Deliberately does NOT
 * check other clusters: clusters may interlock slightly, and blocking on them
 * starves growth (plants must be able to replace withered leaves).
 */
function spacingOk(
  x: number,
  y: number,
  leaves: ResourcePatch[],
  minLeaf: number,
  spores: ResourcePatch[],
  minOther: number,
): boolean {
  const min2 = minLeaf * minLeaf;
  const minOther2 = minOther * minOther;
  for (const l of leaves) {
    const dx = l.x - x;
    const dy = l.y - y;
    if (dx * dx + dy * dy < min2) return false;
  }
  for (const s of spores) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < minOther2) return false;
  }
  return true;
}

export class PlantEcologySystem implements System {
  readonly contract: SystemContract = {
    systemId: "plant-ecology",
    phases: ["RESOLVE"],
    reads: ["resources"],
    writes: ["resource", "resource.position.x", "resource.position.y", "resource.sporeAge", "resource.quantity", "plantClusters"],
    stream: "environment",
  };
  constructor(private readonly world: World) {}

  run(ctx: TickContext): void {
    let seq = 0;
    const w = this.world.config.width;
    const h = this.world.config.height;

    // Group non-spore resources by cluster (plants).
    const plants = new Map<string, ResourcePatch[]>();
    const spores: ResourcePatch[] = [];
    for (const r of this.world.resources.values()) {
      if (r.spore) { spores.push(r); continue; }
      if (r.clusterId) {
        const list = plants.get(r.clusterId) ?? [];
        list.push(r);
        plants.set(r.clusterId, list);
      }
    }

    // ------------------------------------------------------------------
    // I1 — Living Physiology (per-cluster budget).
    //
    // Income: multi-field photosynthesis sampled through photosynthesisInput()
    // (light × water × soil × chemical). Leaves at/below the wilt line
    // contribute nothing (LEAF_WILT_FRACTION is a pool signal, not a killer).
    // Upkeep: the pool pays per leaf; failure to pay accrues starvation, and
    // ONLY pool starvation removes leaves (budget-only mortality — the
    // LEAF_DEPLETION_TICKS camping special case is retired).
    // Growth: proposals queue a leaf; queue entries are paid GROWTH_COST up
    // front and mature over LEAF_MATURATION_TICKS (construction queue).
    // ------------------------------------------------------------------
    const day = this.world.daylight();
    const dayLen = this.world.terrain.config.dayLength;
    void dayLen;
    for (const [clusterId, leaves] of plants) {
      // Lazy backfill: pre-physiology checkpoints (and freshly settled
      // clusters) derive their state here. Creation energy is a declared
      // primary-production inflow so the ledger stays closed.
      let cluster = this.world.plantClusters.get(clusterId);
      if (!cluster) {
        const perLeaf = leaves[0]!.capacity ?? this.world.config.patchCapacity;
        const seed = 0.5 * perLeaf * leaves.length;
        cluster = makePlantCluster(clusterId, seed);
        this.world.plantClusters.set(clusterId, cluster);
        this.world.conservation.inflow += seed;
      }

      // --- I1.2: multi-field photosynthesis income ---------------------
      let income = 0;
      let li = 0, lw = 0, ls = 0, lc = 0;
      const poolCap = POOL_CAPACITY_LEAVES * (leaves[0]!.capacity ?? this.world.config.patchCapacity);
      for (const leaf of leaves) {
        const cap = leaf.capacity ?? this.world.config.patchCapacity;
        // A leaf grazed to/below its wilt line is not photosynthesizing —
        // browsing a plant to the bone chokes its income (pool signal).
        if (leaf.quantity <= Math.max(0.05, cap * LEAF_WILT_FRACTION)) continue;
        const waterFactor = this.world.terrainResource(leaf.x, leaf.y);
        const chem = this.world.env.sample("chemical", leaf.x, leaf.y);
        const input = photosynthesisInput(day, waterFactor, cluster.soilDepletion, chem);
        const gain = PHOTOSYNTHESIS_RATE * cap * input.light * input.water * input.soil * input.chemical;
        income += gain;
        li += input.light; lw += input.water; ls += input.soil; lc += input.chemical;
      }
      const applied = Math.min(income, Math.max(0, poolCap - cluster.energy));
      cluster.energy += applied;
      // Ledger: photosynthesis is primary production (inflow).
      if (applied > 1e-9) this.world.conservation.inflow += applied;
      // Soil feedback: an income-earning cluster depletes local soil; a
      // starved/idle one lets it recover (clamped 0..1, slow rates).
      if (income > 1e-9) {
        cluster.soilDepletion = Math.min(1, cluster.soilDepletion + SOIL_DEPLETION_PER_TICK);
      } else {
        cluster.soilDepletion = Math.max(0, cluster.soilDepletion - SOIL_RECOVERY_PER_TICK);
      }
      const n = leaves.length;
      cluster.lastIncome = {
        light: n > 0 ? li / n : 0,
        water: n > 0 ? lw / n : 0,
        soil: n > 0 ? ls / n : 0,
        chemical: n > 0 ? lc / n : 0,
        total: applied,
      };

      // --- I1.4: upkeep paid from the pool; budget-only mortality ------
      const constructionCount = cluster.queue.length;
      const upkeep = UPKEEP_PER_LEAF * (leaves.length + CONSTRUCTION_UPKEEP_FRACTION * constructionCount);
      if (cluster.energy >= upkeep) {
        cluster.energy -= upkeep;
        this.world.conservation.outflow += upkeep;
        cluster.starvationTicks = 0;
      } else {
        // Can't fully pay: pay what there is, accrue starvation.
        this.world.conservation.outflow += cluster.energy;
        cluster.energy = 0;
        cluster.starvationTicks += 1;
        if (cluster.starvationTicks >= UPKEEP_STARVATION_TICKS) {
          // The pool can no longer sustain the body: shed the weakest leaf
          // (lowest food, ties by id — deterministic). This is the ONLY
          // runtime path that removes a leaf (I-PL1.4).
          let victim: ResourcePatch | null = null;
          for (const l of leaves) {
            if (!victim || l.quantity < victim.quantity || (l.quantity === victim.quantity && l.id.localeCompare(victim.id) < 0)) victim = l;
          }
          cluster.starvationTicks = 0;
          if (victim) {
            ctx.assertWrite("resource");
            ctx.stage({ kind: "remove", scope: "resource", id: victim.id });
            if (victim.quantity > 0.001) this.world.conservation.outflow += victim.quantity;
            ctx.emit("EnvironmentChanged", [], [victim.id], { leafStarved: true, clusterId });
          }
        }
      }

      // --- I1.3: construction queue maturation -------------------------
      if (cluster.queue.length > 0) {
        const stillBuilding: { leafId: string; ticksLeft: number }[] = [];
        for (const q of cluster.queue) {
          if (q.ticksLeft > 1) { stillBuilding.push({ leafId: q.leafId, ticksLeft: q.ticksLeft - 1 }); continue; }
          // Matured: attach the paid-for leaf via the existing edge-attach
          // + Terrain.clearance siting. The cluster centroid anchors placement.
          let cx = 0;
          let cy = 0;
          for (const l of leaves) { cx += l.x; cy += l.y; }
          cx /= leaves.length;
          cy /= leaves.length;
          const cap = Math.max(2, this.world.config.patchCapacity / MAX_CLUSTER_LEAVES);
          const ang = (this.world.tick * 0.6180339887 + q.leafId.length) % (Math.PI * 2);
          const host = leaves[Math.floor((ang / (Math.PI * 2)) * leaves.length) % leaves.length]!;
          let ox = host.x - cx;
          let oy = host.y - cy;
          const om = Math.hypot(ox, oy) || 1;
          ox /= om; oy /= om;
          const rot = ((q.leafId.length % 7) / 7 - 0.5) * 0.9;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const dx = ox * cosR - oy * sinR;
          const dy = ox * sinR + oy * cosR;
          const dist = LEAF_MIN_SPACING + 0.02;
          let lx = clamp(host.x + dx * dist, 2, w - 2);
          let ly = clamp(host.y + dy * dist, 2, h - 2);
          let ok = !this.world.blocked(lx, ly) && spacingOk(lx, ly, leaves, LEAF_MIN_SPACING, spores, CLUSTER_MIN_SPACING);
          if (!ok) {
            lx = clamp(host.x + (ox * cosR + oy * sinR) * dist, 2, w - 2);
            ly = clamp(host.y + (-ox * sinR + oy * cosR) * dist, 2, h - 2);
            ok = !this.world.blocked(lx, ly) && spacingOk(lx, ly, leaves, LEAF_MIN_SPACING, spores, CLUSTER_MIN_SPACING);
          }
          if (ok) {
            const leaf = makeLeaf(q.leafId, clusterId, lx, ly, cap);
            leaves.push(leaf);
            ctx.assertWrite("resource");
            ctx.stage({ kind: "add", scope: "resource", entity: leaf });
            // Conservation: the matured leaf's food is primary production.
            this.world.conservation.inflow += leaf.quantity;
            ctx.emit("EnvironmentChanged", [], [leaf.id], { plantGrowth: true, matured: true });
          }
          // A site that fails siting costs the queue entry (the paid
          // GROWTH_COST was already spent — honest accounting, no refund).
        }
        cluster.queue = stillBuilding;
      }

      // --- I1.3: growth proposal (energy-gated) ------------------------
      if (
        leaves.length + cluster.queue.length < MAX_CLUSTER_LEAVES &&
        cluster.queue.length < 2 &&
        cluster.energy >= GROWTH_COST + GROWTH_RESERVE &&
        ctx.rng.next("environment") < GROWTH_PROBABILITY
      ) {
        // Pay up front and queue — never an instant spawn.
        cluster.energy -= GROWTH_COST;
        this.world.conservation.outflow += GROWTH_COST;
        cluster.queue.push({ leafId: `r:leaf-${clusterId}-${ctx.tick.toString(36)}-${(seq++).toString(36)}`, ticksLeft: LEAF_MATURATION_TICKS });
      }

      cluster.age += 1;

      // Cluster dissolution: the last leaf gone (grazing/starvation) ends the
      // cluster; remaining pool is lost biomass (outflow) — no orphans.
      if (leaves.length === 0) {
        this.world.conservation.outflow += cluster.energy;
        this.world.plantClusters.delete(clusterId);
      }
    }

    // Drop state for clusters whose leaves all vanished via staged removals
    // in earlier ticks (map hygiene; leaf-bearing clusters were handled above).
    for (const id of [...this.world.plantClusters.keys()]) {
      if (!plants.has(id)) this.world.plantClusters.delete(id);
    }

    // Corpse decay: corpses are finite scavenging resources. An unconsumed
    // corpse decomposes — both its energy and its complex molecules break down
    // each tick — and once both pools are spent the corpse is removed. So
    // scavenging is a real, bounded mechanic that can't bloat the resource set.
    for (const r of this.world.resources.values()) {
      if (!r.corpse) continue;
      const molNow = r.molecules ?? 0;
      const molDecay = Math.min(molNow, CORPSE_MOLECULE_DECAY);
      const enDecay = Math.min(r.quantity, CORPSE_ENERGY_DECAY);
      if (molDecay > 1e-5) {
        ctx.assertWrite("resource.molecules");
        ctx.stage({ kind: "adjust", scope: "resource.molecules", key: r.id, amount: -molDecay });
      }
      if (enDecay > 1e-5) {
        ctx.assertWrite("resource.quantity");
        ctx.stage({ kind: "adjust", scope: "resource.quantity", key: r.id, amount: -enDecay });
        // Conservation: decomposed biomass is energy lost to the ecosystem.
        this.world.conservation.outflow += enDecay;
      }
      if (r.quantity - enDecay <= 0.01 && molNow - molDecay <= 0.01) {
        ctx.assertWrite("resource");
        ctx.stage({ kind: "remove", scope: "resource", id: r.id });
        ctx.emit("EnvironmentChanged", [], [r.id], { corpseDecayed: true });
      }
    }

    // Growth now lives entirely in the per-cluster budget loop above
    // (I1.3 construction-queue: proposed, paid, matured — never instant).

    // Ecosystem ceiling on plant clusters: spores may settle only while the
    // world stays under the cap, so plant biomass (and the population it feeds)
    // cannot snowball. The cap is config-derived — deterministic, no rng.
    const plantCap = Math.max(8, Math.round(this.world.config.resourcePatches * MAX_PLANT_CLUSTERS_SCALE));
    // Clusters sprouted earlier in this same tick also count against the cap.
    let settled = 0;

    // Spore drift + settle: clumps drift, then sprout a new plant elsewhere.
    // Motion = ejection velocity + a per-tick wind wander (deterministic
    // random walk), so the drift is a roaming flight, not a short coast.
    for (const spore of spores) {
      const wind = ctx.rng.next("environment") * Math.PI * 2;
      const nx = spore.x + (spore.sporeVx ?? 0) + Math.cos(wind) * SPORE_WIND_SPEED;
      const ny = spore.y + (spore.sporeVy ?? 0) + Math.sin(wind) * SPORE_WIND_SPEED;
      ctx.assertWrite("resource.position.x");
      ctx.stage({ kind: "adjust", scope: "resource.position.x", key: spore.id, amount: clamp(nx, 0, w - 1) - spore.x });
      ctx.assertWrite("resource.position.y");
      ctx.stage({ kind: "adjust", scope: "resource.position.y", key: spore.id, amount: clamp(ny, 0, h - 1) - spore.y });
      const age = (spore.sporeAge ?? 0) + 1;
      ctx.assertWrite("resource.sporeAge");
      ctx.stage({ kind: "adjust", scope: "resource.sporeAge", key: spore.id, amount: 1 });
      if (age >= (spore.sporeLifespan ?? SPORE_LIFESPAN)) {
        if (plants.size + settled >= plantCap) {
          // Ecosystem at plant capacity: the spore is spent without sprouting.
          ctx.assertWrite("resource");
          ctx.stage({ kind: "remove", scope: "resource", id: spore.id });
          this.world.conservation.outflow += spore.quantity;
          continue;
        }
        // Distinct-plant rule: a spore settling on top of an existing cluster
        // would sprout INTO it (two ids, one blob). Too close ⇒ the settle
        // fails and the clump is spent. Distance is centroid-to-set-point.
        let merged = false;
        for (const [, existing] of plants) {
          let ex = 0;
          let ey = 0;
          for (const l of existing) { ex += l.x; ey += l.y; }
          ex /= existing.length;
          ey /= existing.length;
          const dx = ex - spore.x;
          const dy = ey - spore.y;
          if (dx * dx + dy * dy < CLUSTER_MIN_SPACING * CLUSTER_MIN_SPACING) { merged = true; break; }
        }
        if (merged) {
          ctx.assertWrite("resource");
          ctx.stage({ kind: "remove", scope: "resource", id: spore.id });
          this.world.conservation.outflow += spore.quantity;
          continue;
        }
        settled++;
        // Rock rejection: a spore that lands inside (or brushing) a rock
        // formation would sprout unreachable food under the terrain. Instead
        // of dying there, it keeps rolling back along its drift direction and
        // settles at the first clear site — the plant still disperses, just
        // never into stone (deterministic, no extra rng draws).
        let sx = spore.x;
        let sy = spore.y;
        if (this.world.blocked(sx, sy)) {
          const vm = Math.hypot(spore.sporeVx ?? 0, spore.sporeVy ?? 0) || 1;
          let px = sx;
          let py = sy;
          let found = false;
          for (let n = 1; n <= 12; n++) {
            px = clamp(sx - ((spore.sporeVx ?? 0) / vm) * n * 3, 2, w - 2);
            py = clamp(sy - ((spore.sporeVy ?? 0) / vm) * n * 3, 2, h - 2);
            if (!this.world.blocked(px, py)) { found = true; break; }
          }
          if (!found) {
            // Fully walled in: the spore dies without sprouting.
            ctx.assertWrite("resource");
            ctx.stage({ kind: "remove", scope: "resource", id: spore.id });
            this.world.conservation.outflow += spore.quantity;
            continue;
          }
          sx = px;
          sy = py;
        }
        // Settle: sprout a small new plant cluster, remove the spore. Leaves
        // sprout on the even touching-ring (adjacent orbs just touch), the
        // same topology as initialization, so a new plant never starts as a
        // clump — and each sprout skips sites that land inside solid rock.
        const clusterId = plantClusterId(ctx.tick, seq++);
        const cap = Math.max(2, this.world.config.patchCapacity / MAX_CLUSTER_LEAVES);
        let sprouted = 0;
        for (let l = 0; l < SPORE_PLANT_LEAVES + 2 && sprouted < SPORE_PLANT_LEAVES; l++) {
          const pos = leafRingPosition(sprouted, LEAF_MIN_SPACING);
          const lx = sx + pos.x;
          const ly = sy + pos.y;
          // A sprout inside a rock formation would be unreachable food that
          // renders under the terrain — skip the site and take the next ring
          // slot (deterministically) until the cluster is full.
          if (this.world.blocked(lx, ly)) continue;
          sprouted++;
          const leaf = makeLeaf(
            `r:leaf-${clusterId}-${l}`,
            clusterId,
            clamp(lx, 2, w - 2),
            clamp(ly, 2, h - 2),
            cap,
          );
          ctx.assertWrite("resource");
          ctx.stage({ kind: "add", scope: "resource", entity: leaf });
          // Conservation: sprouted leaves are primary production.
          this.world.conservation.inflow += leaf.quantity;
        }
        ctx.assertWrite("resource");
        ctx.stage({ kind: "remove", scope: "resource", id: spore.id });
        // Conservation: the spent spore is returned to the account.
        this.world.conservation.outflow += spore.quantity;
        ctx.emit("SporeSettled", [], [spore.id], { clusterId, leaves: sprouted });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UPDATE — physics integration (walls/water), physiology, predation.
// ---------------------------------------------------------------------------

export class PhysicsSystem implements System {
  readonly contract: SystemContract = {
    systemId: "physics",
    phases: ["UPDATE"],
    reads: ["organisms", "intents"],
    writes: ["organism.position.x", "organism.position.y"],
  };
  constructor(private readonly world: World) {}

  run(ctx: TickContext): void {
    const move = new Map<string, { dx: number; dy: number }>();
    for (const intent of ctx.intents) {
      const m = intent as Partial<MoveIntent>;
      if (m.type !== "move" || typeof m.actorId !== "string") continue;
      const mv = m as MoveIntent;
      move.set(mv.actorId, { dx: mv.headingX * mv.speed, dy: mv.headingY * mv.speed });
    }
    const live = this.world.liveOrganisms();
    for (const o of live) {
      const v = move.get(o.id);
      // Water slows locomotion; zones modulate speed further.
      const scale = this.world.zoneEffectsAt(o.x, o.y).speed * this.world.terrainSpeed(o.x, o.y);
      const dx = v ? v.dx * scale : 0;
      const dy = v ? v.dy * scale : 0;
      const candX = o.x + dx;
      const candY = o.y + dy;
      // Organic barrier walls are impassable: blocked ⇒ stay put.
      if (this.world.blocked(candX, candY)) {
        ctx.emit("WallCollision", [o.id], [], { edge: "barrier", policy: "solid" });
        continue;
      }
      const { x, y, edge } = applyWalls(candX, candY, this.world.config);
      if (edge) {
        ctx.emit("WallCollision", [o.id], [], { edge, policy: wallPolicyAt(this.world.config, edge) });
      }
      // Adhesion (heritable `adhesion` gene): sticky cells drift toward and
      // cling to near neighbours. 0 = inert; mid values pull elastically
      // (spring toward the neighbour, stronger when closer); ≥0.85 locks
      // rigidly — the cell settles at contact distance and moves with the
      // neighbour's net motion, so clumps crawl as one body.
      const adh = o.genome.genes.adhesion ?? 0;
      if (adh > 0.05) {
        const idx = this.world.ephemeral.organismIndex;
        if (idx) {
          // Bonding radius is CONTACT-scale, not several body widths: adhesion
          // is a touch sense, so cells only stick when they are actually close
          // (and rigid bonds need real overlap, not a far-away pull).
          const senseR = Math.max(cellRadius(o) + cellRadius(o) * 0.5, cellRadius(o) * 2.2);
          const near = idx.queryNearest({ x: o.x, y: o.y }, senseR);
          if (near && near.key !== o.id) {
            const other = this.world.organisms.get(near.key);
            if (other && other.lifecycle === "ACTIVE") {
              const rigid = adh >= 0.85;
              const spring = rigid ? 0.45 : 0.22 * adh;
              const contact = cellRadius(o) + cellRadius(other);
              const ux = (near.pos.x - o.x) / Math.max(near.dist, 1e-6);
              const uy = (near.pos.y - o.y) / Math.max(near.dist, 1e-6);
              if (rigid) {
                // Rigid lock: snap to contact distance along the bond axis,
                // then follow the neighbour's motion (settle, don't oscillate).
                // The correction is clamped per tick so a stretched bond
                // reels the cell in instead of teleporting it across a frame.
                const settle = clamp(near.dist - contact, -2.5, 2.5);
                const ax = ux * settle * spring;
                const ay = uy * settle * spring;
                ctx.assertWrite("organism.position.x");
                ctx.stage({ kind: "adjust", scope: "organism.position.x", key: o.id, amount: ax });
                ctx.assertWrite("organism.position.y");
                ctx.stage({ kind: "adjust", scope: "organism.position.y", key: o.id, amount: ay });
                if (settle > 0.5) {
                  // Beyond contact: half-follow the neighbour's motion.
                  const ov = move.get(other.id);
                  if (ov) {
                    ctx.stage({ kind: "adjust", scope: "organism.position.x", key: o.id, amount: ov.dx * 0.5 });
                    ctx.stage({ kind: "adjust", scope: "organism.position.y", key: o.id, amount: ov.dy * 0.5 });
                  }
                }
              } else if (near.dist > contact * 0.6) {
                // Elastic: pull toward the neighbour, weaker when closer.
                const pull = spring * (1 - near.dist / senseR);
                ctx.assertWrite("organism.position.x");
                ctx.stage({ kind: "adjust", scope: "organism.position.x", key: o.id, amount: ux * pull });
                ctx.assertWrite("organism.position.y");
                ctx.stage({ kind: "adjust", scope: "organism.position.y", key: o.id, amount: uy * pull });
              }
            }
          }
        }
      }
      ctx.assertWrite("organism.position.x");
      ctx.stage({ kind: "set", scope: "organism.position.x", key: o.id, value: x });
      ctx.stage({ kind: "set", scope: "organism.position.y", key: o.id, value: y });
    }
  }
}

function wallPolicyAt(config: { walls?: WallConfig }, edge: "top" | "right" | "bottom" | "left"): WallPolicy {
  const w = config.walls;
  return w ? w[edge] : "solid";
}

export class PhysiologySystem implements System {
  readonly contract: SystemContract = {
    systemId: "physiology",
    phases: ["UPDATE"],
    reads: ["organisms"],
    writes: [
      "organism.energy",
      "organism.age",
      "organism.maturity",
      "organism.developmentCompleted",
      "organism.constructionProgress",
      "organism.constructionQueue",
      "organism.molecules",
      "organism.nodeLevels",
      "organism.lifecycle",
      "organism",
      "resource",
      "field",
    ],
  };
  constructor(
    private readonly world: World,
    private readonly corpseEnergyFraction: number,
  ) {}

  run(ctx: TickContext): void {
    for (const o of this.world.liveOrganisms()) {
      // A victim killed by predation this tick is resolved by PredationSystem;
      // skip so metabolism isn't double-billed.
      if (this.world.ephemeral.predationVictims?.has(o.id)) continue;
      const movement = this.world.config.movementCost * (o.vx * o.vx + o.vy * o.vy);
      const devScale = phenotypeScale(o.maturity);
      // Bigger bodies cost more to maintain (growth dynamics trade-off).
      const sizeCost = 0.004 * Math.max(0, o.biomass - 12);
      // Heritable size is a real trade-off: a scaled-up body maintains more
      // membrane, so upkeep scales super-linearly with the sizeScale gene.
      const scaleCost = 0.012 * Math.max(0, (o.genome.genes.sizeScale ?? 1) - 1) * (0.5 + 0.5 * o.biomass / 40);
      const moduleUpkeep = 0.01 * o.modules.length * o.genome.genes.metabolism;
      const zoneCost = this.world.zoneEffectsAt(o.x, o.y).metabolicCost;
      // Part 17 §17.1 E3: the temperature field is an environmental law —
      // warmer cells shed more heat and metabolize slightly faster.
      const temp = this.world.env.sample("temperature", o.x, o.y);
      const tempMod = 1 + temp * 0.05;
      // Day/night: photoreceptors need light to orient; metabolism is stable
      // but vision is day-gated (drives diurnal activity via the brain).
      const cost =
        (this.world.config.basalCost * o.genome.genes.metabolism) * (0.5 + 0.5 * devScale) * zoneCost * tempMod +
        movement +
        moduleUpkeep +
        sizeCost +
        scaleCost;
      ctx.assertWrite("organism.energy");
      ctx.stage({ kind: "adjust", scope: "organism.energy", key: o.id, amount: -cost });
      // Conservation ledger: basal + movement metabolism is a declared outflow.
      this.world.conservation.outflow += cost;
      // Environmental fields respond to organism activity (E4): bodies shed
      // heat and pheromone.
      this.world.env.deposit("temperature", o.x, o.y, 0.05 * devScale);
      ctx.assertWrite("organism.age");
      ctx.stage({ kind: "adjust", scope: "organism.age", key: o.id, amount: 1 });

      // Part 15 construction-queue development: only still-developing organisms
      // (non-empty queue) advance. Construction is PAID in complex molecules
      // (ProtoEvo): each tick the cell may advance its queue by up to
      // total/maturityAge units, but only as far as its molecule stock covers
      // (CONSTRUCTION_MOLECULE_COST per unit). Starved juveniles stall; fed
      // ones canalize on schedule (domain transition, M1/D3).
      if (o.constructionQueue.length > 0 && o.constructionTotal > 0) {
        const total = o.constructionTotal;
        const clockUnits = Math.max(total / Math.max(1, this.world.config.maturityAge), 0.01);
        const affordable = Math.min(clockUnits, o.molecules / CONSTRUCTION_MOLECULE_COST);
        let nextProgress = o.constructionProgress;
        if (affordable > 1e-5) {
          nextProgress = Math.min(total, o.constructionProgress + affordable);
          const spent = (nextProgress - o.constructionProgress) * CONSTRUCTION_MOLECULE_COST;
          ctx.assertWrite("organism.molecules");
          ctx.stage({ kind: "adjust", scope: "organism.molecules", key: o.id, amount: -spent });
          ctx.assertWrite("organism.constructionProgress");
          ctx.stage({ kind: "set", scope: "organism.constructionProgress", key: o.id, value: nextProgress });
          if (nextProgress >= total - 1e-6) {
            ctx.assertWrite("organism.constructionQueue");
            ctx.stage({ kind: "set", scope: "organism.constructionQueue", key: o.id, value: [] as unknown as number });
          }
        }
        const maturity = Math.min(1, Math.max(0, nextProgress / total));
        ctx.assertWrite("organism.maturity");
        ctx.stage({ kind: "set", scope: "organism.maturity", key: o.id, value: maturity });
        if (nextProgress >= total - 1e-6 && !o.developmentCompleted) {
          ctx.assertWrite("organism.developmentCompleted");
          ctx.stage({ kind: "set", scope: "organism.developmentCompleted", key: o.id, value: 1 });
          ctx.emit("DevelopmentCompleted", [o.id], [], { age: o.age + 1, stage: "MATURE", canalized: true });
        }
      }

      // ProtoEvo biosynthesis: cells manufacture complex molecules from
      // energy over time (MOLECULE_SYNTH_ENERGY per molecule), scaled by
      // their metabolism gene and maturity. A hard reserve floor keeps
      // starving cells from manufacturing instead of surviving — synthesis
      // only runs on genuine energy surplus.
      const molCapacity = moleculeCapacity(o.nodes, o.biomass);
      if (o.molecules < molCapacity && o.energy - cost > SYNTH_RESERVE_ENERGY) {
        const synthRate = SYNTH_BASE_RATE * o.genome.genes.metabolism * (0.5 + 0.5 * devScale);
        const synthCost = synthRate * MOLECULE_SYNTH_ENERGY;
        if (o.energy - cost - synthCost > SYNTH_RESERVE_ENERGY) {
          const made = Math.min(synthRate, molCapacity - o.molecules);
          if (made > 1e-5) {
            ctx.assertWrite("organism.energy");
            ctx.stage({ kind: "adjust", scope: "organism.energy", key: o.id, amount: -made * MOLECULE_SYNTH_ENERGY });
            ctx.assertWrite("organism.molecules");
            ctx.stage({ kind: "adjust", scope: "organism.molecules", key: o.id, amount: made });
            // Conservation: energy→molecule conversion is a declared outflow
            // (molecules are a structural currency outside the energy ledger).
            this.world.conservation.outflow += made * MOLECULE_SYNTH_ENERGY;
          }
        }
      }

      // ProtoEvo node upgrades: mature cells reinvest SURPLUS molecules —
      // those beyond what reproduction needs, with a small buffer — into
      // strengthening individual nodes. Each node rises to
      // NODE_UPGRADE_MAX_LEVEL; later levels cost more. The target is
      // deterministic: the least-upgraded node (ties break to array order),
      // so upgrades spread evenly across the body instead of stacking on an
      // arbitrary favourite. One level per tick: upgrading takes time, like
      // construction.
      if (o.developmentCompleted && o.energy > NODE_UPGRADE_MIN_ENERGY && o.nodeLevels.length === o.nodes.length) {
        const fee = reproductionMoleculeCost(o.nodes.length);
        const surplus = o.molecules - fee - 0.5;
        if (surplus > 0) {
          let best = -1;
          let bestLevel = Infinity;
          for (let i = 0; i < o.nodes.length; i++) {
            const level = o.nodeLevels[i] ?? 0;
            if (level >= NODE_UPGRADE_MAX_LEVEL) continue;
            if (level < bestLevel) {
              bestLevel = level;
              best = i;
            }
          }
          if (best >= 0) {
            const level = o.nodeLevels[best] ?? 0;
            const upCost = NODE_UPGRADE_BASE_COST + NODE_UPGRADE_COST_PER_LEVEL * level;
            if (surplus >= upCost - 1e-6) {
              const nextLevels = [...o.nodeLevels];
              nextLevels[best] = level + 1;
              ctx.assertWrite("organism.molecules");
              ctx.stage({ kind: "adjust", scope: "organism.molecules", key: o.id, amount: -upCost });
              ctx.assertWrite("organism.nodeLevels");
              ctx.stage({ kind: "set", scope: "organism.nodeLevels", key: o.id, value: nextLevels as unknown as number });
              ctx.emit("NodeUpgraded", [o.id], [], {
                nodeIndex: best,
                nodeKind: o.nodes[best]!.kind,
                fromLevel: level,
                toLevel: level + 1,
                cost: upCost,
              });
            }
          }
        }
      }

      this.world.field.deposit(o.x, o.y, 0.02 * devScale);

      const projectedEnergy = o.energy - cost;
      if (projectedEnergy <= 0 || o.age + 1 > this.world.config.maxAge) {
        ctx.assertWrite("organism.lifecycle");
        ctx.stage({ kind: "set", scope: "organism.lifecycle", key: o.id, value: "DYING" });
        ctx.assertWrite("organism");
        ctx.stage({ kind: "remove", scope: "organism", id: o.id });
        // ProtoEvo scavenging: a corpse forms whenever there is recoverable
        // material — energy from an old-age death OR the complex molecules of
        // the dead cell's body. A corpse's molecular body is digestible
        // biomass: even a cell that starved to zero energy leaves a scavenger
        // meal (energy from its structure + molecules), so corpse-scavenging
        // is a genuine feeding strategy instead of a starvation trap.
        const corpseMolecules = Math.max(0, o.molecules) * CORPSE_MOLECULE_FRACTION;
        const molecularEnergy = corpseMolecules * CORPSE_BIOMASS_ENERGY;
        const corpseQuantity = Math.max(0, projectedEnergy) * this.corpseEnergyFraction + molecularEnergy;
        if (corpseQuantity > 0.05 || corpseMolecules > 0.05) {
          const corpse: ResourcePatch = {
            id: `r:corpse-${o.id}-${ctx.tick.toString(36)}`,
            x: o.x,
            y: o.y,
            quantity: corpseQuantity,
            regenerationRate: 0,
            corpse: true,
            ...(corpseMolecules > 0.05 ? { molecules: corpseMolecules } : {}),
          };
          ctx.assertWrite("resource");
          ctx.stage({ kind: "add", scope: "resource", entity: corpse });
          // Conservation: the corpse's molecular body is stored energy that
          // becomes digestible on death — a declared inflow (energy the
          // organisms stored as molecules returns to the food economy).
          this.world.conservation.inflow += molecularEnergy;
        }
        this.world.field.deposit(o.x, o.y, 1.0);
        // Conservation: the unrecycled corpse fraction is a declared outflow
        // (death-as-resource redistributes `fraction`, the rest is lost).
        this.world.conservation.outflow += Math.max(0, projectedEnergy) * (1 - this.corpseEnergyFraction);
        ctx.emit("OrganismDied", [o.id], [], { age: o.age, energy: projectedEnergy });
      }
    }
  }
}

/**
 * Predation — resolves AttackIntents: spike damage transfers energy/biomass
 * from prey to attacker. Runs after PhysiologySystem so a kill isn't billed
 * twice in the same tick. The prey dies immediately when its energy drops to
 * zero (spikes are lethal up close).
 */
export class PredationSystem implements System {
  readonly contract: SystemContract = {
    systemId: "predation",
    phases: ["UPDATE"],
    reads: ["intents", "organisms"],
    writes: ["organism.energy", "organism.molecules", "organism.biomass", "organism.lifecycle", "organism", "resource"],
  };
  constructor(private readonly world: World) {}

  run(ctx: TickContext): void {
    this.world.ephemeral.predationVictims = this.world.ephemeral.predationVictims ?? new Set<string>();
    for (const intent of ctx.intents) {
      const a = intent as Partial<AttackIntent>;
      if (a.type !== "attack" || typeof a.actorId !== "string" || typeof a.targetId !== "string") continue;
      const atk = a as AttackIntent;
      const attacker = this.world.organism(atk.actorId);
      const prey = this.world.organism(atk.targetId);
      if (!attacker || !prey) continue;
      if (prey.lifecycle !== "ACTIVE" && prey.lifecycle !== "DEVELOPING") continue;
      if (this.world.ephemeral.predationVictims.has(prey.id)) continue;
      const damage = Math.min(atk.damage, prey.energy);
      if (damage <= 0) continue;
      // ProtoEvo theft: spike hits rip complex molecules out of the prey and
      // into the attacker's stores (capped by the attacker's storage).
      const steal = Math.min(prey.molecules, damage * attacker.genome.genes.growthEfficiency * 0.5);
      if (steal > 1e-4) {
        const atkRoom = Math.max(0, moleculeCapacity(attacker.nodes, attacker.biomass) - attacker.molecules);
        const taken = Math.min(steal, atkRoom);
        if (taken > 1e-4) {
          ctx.assertWrite("organism.molecules");
          ctx.stage({ kind: "adjust", scope: "organism.molecules", key: prey.id, amount: -taken });
          ctx.stage({ kind: "adjust", scope: "organism.molecules", key: attacker.id, amount: taken });
        }
      }
      this.world.ephemeral.predationVictims.add(prey.id);
      ctx.assertWrite("organism.energy");
      ctx.stage({ kind: "adjust", scope: "organism.energy", key: prey.id, amount: -damage });
      ctx.stage({ kind: "adjust", scope: "organism.energy", key: atk.actorId, amount: damage * attacker.genome.genes.growthEfficiency * 0.5 });
      // Biomass transfer: the predator grows, the prey shrinks.
      const mass = damage * attacker.genome.genes.growthEfficiency * 0.06;
      ctx.assertWrite("organism.biomass");
      ctx.stage({ kind: "adjust", scope: "organism.biomass", key: atk.actorId, amount: mass });
      ctx.stage({ kind: "adjust", scope: "organism.biomass", key: prey.id, amount: -mass });
      // Conservation: the prey loses `damage` but the predator gains only a
      // fraction; the unabsorbed remainder is a declared outflow (metabolic
      // inefficiency of predation).
      this.world.conservation.outflow += damage * (1 - attacker.genome.genes.growthEfficiency * 0.5);
      ctx.emit("PredationOccurred", [atk.actorId], [prey.id], { damage });
      // Part 17 I2: predation is consumption between organisms — record it.
      this.world.recordInteraction({
        interactionId: `i${ctx.tick.toString(36)}-${this.world.interactions.length.toString(36)}`,
        tick: ctx.tick,
        interactionType: "predation",
        initiator: atk.actorId,
        recipient: prey.id,
        locationX: prey.x,
        locationY: prey.y,
        transfer: damage,
      });
      if (prey.energy - damage <= 0) {
        ctx.assertWrite("organism.lifecycle");
        ctx.stage({ kind: "set", scope: "organism.lifecycle", key: prey.id, value: "DYING" });
        ctx.assertWrite("organism");
        ctx.stage({ kind: "remove", scope: "organism", id: prey.id });
        this.world.field.deposit(prey.x, prey.y, 1.2);
        ctx.emit("OrganismDied", [prey.id], [], { age: prey.age, energy: 0 });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// REPRODUCE — propose offspring when physiological conditions allow
// (stream: reproduction). Offspring are proposals; INHERIT executes.
// ---------------------------------------------------------------------------

export class ReproductionSystem implements System {
  readonly contract: SystemContract = {
    systemId: "reproduction",
    phases: ["REPRODUCE"],
    reads: ["organisms"],
    writes: [],
    stream: "reproduction",
  };
  constructor(
    private readonly world: World,
    private readonly maturityAge: number,
    private readonly probability = 0.9,
  ) {}

  run(ctx: TickContext): void {
    // Density dependence (soft carrying ceiling): reproduction probability
    // tapers smoothly to zero as the population approaches the ecosystem
    // ceiling. Full fertility below 60% of the ceiling, then a linear taper,
    // so growth saturates near the ceiling instead of exploding and crashing.
    // The ceiling is config-derived (deterministic): roughly the food the
    // plant ecology can sustain.
    const ceiling = Math.max(160, this.world.config.resourcePatches * 12);
    const live = this.world.liveOrganisms().length;
    const taper =
      live <= ceiling * 0.6
        ? 1
        : Math.max(0, Math.min(1, (ceiling - live) / (ceiling * 0.4)));
    for (const o of this.world.liveOrganisms()) {
      const roll = ctx.rng.next("reproduction");
      if (o.age < this.maturityAge) continue;
      const threshold = o.genome.genes.reproductionThreshold;
      // ProtoEvo: creating an offspring body costs complex molecules — the
      // parent must hold the molecular seed before it can reproduce.
      if (o.energy >= threshold && roll < this.probability * taper) {
        const intent: ReproductionIntent = {
          type: "reproduce",
          actorId: o.id,
          investmentShare: o.genome.genes.offspringInvestment,
          reproductionCost: this.world.config.reproductionCost,
        };
        ctx.recordIntent(intent);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// INHERIT — genetics: mutate the genome AND the brain, create offspring via
// division (stream: genetics).
// ---------------------------------------------------------------------------

/**
 * Find a mate for sexual recombination: the nearest live ACTIVE organism with
 * a different id. Deterministic (id-sorted iteration, min distance, tie →
 * smallest id). Falls back to null (asexual path) when no mate is available.
 */
function findMate(parent: OrganismRecord, world: World): OrganismRecord | undefined {
  let best: OrganismRecord | undefined;
  let bestDist = Infinity;
  for (const o of world.liveOrganisms()) {
    if (o.id === parent.id || o.lifecycle !== "ACTIVE") continue;
    const dx = o.x - parent.x;
    const dy = o.y - parent.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best = o;
    }
  }
  return best;
}

export class InheritanceSystem implements System {
  readonly contract: SystemContract = {
    systemId: "inheritance",
    phases: ["INHERIT"],
    reads: ["intents", "organisms"],
    writes: ["organism", "organism.energy", "organism.molecules", "organism.biomass"],
    stream: "genetics",
  };
  constructor(
    private readonly world: World,
    private readonly mutationRate: number,
    private readonly mutationSigma: number,
    /** Part 14 optional sexual recombination: probability per reproduction. */
    private readonly recombination = 0,
  ) {}

  run(ctx: TickContext): void {
    let seq = 0;
    for (const intent of ctx.intents) {
      const rep = intent as Partial<ReproductionIntent>;
      if (rep.type !== "reproduce" || typeof rep.actorId !== "string") continue;
      const repIntent = rep as ReproductionIntent;
      const parent = this.world.organisms.get(repIntent.actorId);
      if (!parent || parent.lifecycle !== "ACTIVE") continue;

      const share = repIntent.investmentShare;
      const offspringEnergy = parent.energy * share * 0.5;
      const totalCost = offspringEnergy + repIntent.reproductionCost;
      if (parent.energy - totalCost < 0) continue;
      // Molecular cost of building the offspring's node body (deducted from
      // the parent — reproduction is a molecular investment, not just energy).
      const molFee = reproductionMoleculeCost(parent.nodes.length);
      if (parent.molecules < molFee) continue;
      ctx.assertWrite("organism.molecules");
      ctx.stage({ kind: "adjust", scope: "organism.molecules", key: parent.id, amount: -molFee });

      const genomeId = `g:${ctx.tick.toString(36)}-${parent.genomeId.slice(2)}-${seq++}`;
      // Optional sexual recombination: when rolled, the offspring genome + brain
      // are produced by crossover with the nearest mate before mutation.
      let recombined = false;
      let baseGenome = parent.genome;
      let baseBrain = parent.brain;
      let parentIds: readonly string[] = [parent.id];
      if (this.recombination > 0 && ctx.rng.next("genetics") < this.recombination) {
        const mate = findMate(parent, this.world);
        if (mate) {
          baseGenome = recombineGenome(parent.genome, mate.genome, ctx.rng, genomeId);
          baseBrain = recombineBrain(parent.brain, mate.brain, ctx.rng);
          parentIds = [parent.id, mate.id];
          recombined = true;
        }
      }

      // Apply the operator model to the (possibly recombined) genome + brain.
      const { genome, mutated, operators } = mutateGenome(baseGenome, ctx.rng, genomeId, this.mutationRate, this.mutationSigma);
      const { brain, mutatedWeights } = mutateBrain(baseBrain, this.mutationRate, this.mutationSigma, ctx.rng);

      // Offspring spawns near the parent via division; jitter from genetics stream.
      const angle = ctx.rng.next("genetics") * Math.PI * 2;
      const ox = Math.min(Math.max(parent.x + Math.cos(angle) * parent.radius * 1.4, 0), this.world.config.width - 1);
      const oy = Math.min(Math.max(parent.y + Math.sin(angle) * parent.radius * 1.4, 0), this.world.config.height - 1);
      const facing = ctx.rng.next("genetics") * Math.PI * 2;
      const offspring = makeOrganism(
        `o:${ctx.tick.toString(36)}-${parent.id.slice(2)}-${(seq - 1).toString(36)}`,
        genome,
        ox,
        oy,
        offspringEnergy,
        parentIds,
        ctx.tick,
        ctx.rng,
        { age: 0, maturity: 0, developmentCompleted: false, brain, facing },
      );
      ctx.assertWrite("organism");
      ctx.stage({ kind: "add", scope: "organism", entity: offspring });
      ctx.assertWrite("organism.energy");
      ctx.stage({ kind: "adjust", scope: "organism.energy", key: parent.id, amount: -totalCost });
      // Conservation: the offspring-energy share is a neutral parent→child
      // transfer, but reproductionCost is a declared outflow (reproductive tax).
      this.world.conservation.outflow += repIntent.reproductionCost;
      // Biomass split: the child inherits body mass, the parent shrinks (division).
      const splitMass = Math.min(parent.biomass * share * 0.6, offspringEnergy);
      ctx.assertWrite("organism.biomass");
      ctx.stage({ kind: "adjust", scope: "organism.biomass", key: parent.id, amount: -splitMass });
      ctx.stage({ kind: "adjust", scope: "organism.biomass", key: offspring.id, amount: splitMass });
      ctx.emit("OrganismReproduced", parentIds as string[], [offspring.id], { offspringEnergy, recombined });
      ctx.emit("OrganismBorn", [], [offspring.id], {
        genomeId: genome.genomeId,
        parentIds: [...parentIds],
      });
      if (recombined) {
        ctx.emit("GenomeRecombined", parentIds as string[], [offspring.id], { genomeId: genome.genomeId });
      }
      const allOps: OperatorApplication[] = [...operators];
      if (mutatedWeights > 0) {
        allOps.push({ operator: "point", layer: "NEURAL", target: "brain" });
      }
      if (mutated || mutatedWeights > 0) {
        ctx.emit("GenomeMutated", [], [offspring.id], { genomeId: genome.genomeId });
        for (const op of allOps) {
          ctx.emit("MutationOperatorApplied", [], [offspring.id], { operator: op.operator, layer: op.layer, target: op.target });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Direct selection (Part 18 §18.1, S3) — OPTIONAL, disabled by default.
// ---------------------------------------------------------------------------

export class DirectSelectionSystem implements System {
  readonly contract: SystemContract = {
    systemId: "direct-selection",
    phases: ["UPDATE"],
    reads: ["organisms"],
    writes: ["organism.lifecycle", "organism"],
  };
  constructor(
    private readonly world: World,
    private readonly objective: (o: OrganismRecord) => number,
    private readonly cutoff: number,
  ) {}

  run(ctx: TickContext): void {
    for (const o of this.world.liveOrganisms()) {
      if (this.objective(o) < this.cutoff) {
        ctx.assertWrite("organism.lifecycle");
        ctx.stage({ kind: "set", scope: "organism.lifecycle", key: o.id, value: "DYING" });
        ctx.assertWrite("organism");
        ctx.stage({ kind: "remove", scope: "organism", id: o.id });
        ctx.emit("SelectionApplied", [o.id], [], { objective: "cutoff", cutoff: this.cutoff });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OBSERVE — metrics.
// ---------------------------------------------------------------------------

export interface TickMetrics {
  readonly tick: number;
  readonly population: number;
  readonly totalEnergy: number;
  readonly meanEnergy: number;
  readonly meanSpeed: number;
  readonly meanSenseRadius: number;
  readonly meanMetabolism: number;
  readonly meanReproductionThreshold: number;
  readonly births: number;
  readonly deaths: number;
  readonly resourceTotal: number;
  readonly founderDiversity: number;
  readonly lineageVariance: number;
  readonly lineageNodes: number;
  readonly fieldTotal: number;
  readonly meanMaturity: number;
  /** ProtoEvo observables. */
  readonly meanBiomass: number;
  readonly meanRadius: number;
  readonly meanNodeCount: number;
  readonly meanAggression: number;
  readonly carnivoreShare: number;
  readonly daylight: number;
  readonly predationEvents: number;
  /** Part 17 §17.6 I17-A conservation audit: drift = accounted − (initial+inflow−outflow). */
  readonly conservationDrift: number;
  /** Part 17 I1: interactions recorded so far. */
  readonly interactionCount: number;
  /** Part 18 §18.2 genome-cluster species (derived, never authoritative). */
  readonly speciesCount: number;
  readonly speciesDiversity: number;
  /** Part 18 §18.2 founder lineages with live descendants. */
  readonly survivingLineages: number;
}

export function computeMetrics(world: World, births: number, deaths: number): TickMetrics {
  const organisms = world.liveOrganisms();
  const n = organisms.length;
  const sum = (f: (o: OrganismRecord) => number): number =>
    organisms.reduce((acc, o) => acc + f(o), 0);
  const resourceTotal = world.resourceList().reduce((acc, r) => acc + r.quantity, 0);
  // I1.1: the per-cluster energy pools are authoritative stored energy and
  // must be counted in the audit (photosynthesis inflow lands there).
  let poolTotal = 0;
  for (const c of world.plantClusters.values()) poolTotal += c.energy;
  const fieldTotal = world.field.total();
  const liveIds = organisms.map((o) => o.id);
  const carnivores = organisms.filter((o) => o.trophic === "carnivore").length;
  const accounted = sum((o) => o.energy) + resourceTotal + poolTotal;
  const ledger = world.conservation;
  const conservationDrift = accounted - (ledger.initialEnergy + ledger.inflow - ledger.outflow);
  const species = clusterSpecies(organisms);
  return {
    tick: world.tick,
    population: n,
    totalEnergy: sum((o) => o.energy),
    meanEnergy: n > 0 ? sum((o) => o.energy) / n : 0,
    meanSpeed: n > 0 ? sum((o) => o.speed) / n : 0,
    meanSenseRadius: n > 0 ? sum((o) => o.senseRadius) / n : 0,
    meanMetabolism: n > 0 ? sum((o) => o.genome.genes.metabolism) / n : 0,
    meanReproductionThreshold: n > 0 ? sum((o) => o.genome.genes.reproductionThreshold) / n : 0,
    births,
    deaths,
    resourceTotal,
    founderDiversity: world.lineage.founderDiversity(liveIds),
    lineageVariance: world.lineage.reproductionVariance(),
    lineageNodes: world.lineage.stats().nodes,
    fieldTotal,
    meanMaturity: n > 0 ? sum((o) => o.maturity) / n : 0,
    meanBiomass: n > 0 ? sum((o) => o.biomass) / n : 0,
    meanRadius: n > 0 ? sum((o) => o.radius) / n : 0,
    meanNodeCount: n > 0 ? sum((o) => o.nodes.length) / n : 0,
    meanAggression: n > 0 ? sum((o) => o.genome.genes.aggression) / n : 0,
    carnivoreShare: n > 0 ? carnivores / n : 0,
    daylight: world.daylight(),
    predationEvents: 0,
    conservationDrift,
    interactionCount: world.interactions.length,
    speciesCount: species.speciesCount,
    speciesDiversity: species.speciesDiversity,
    survivingLineages: world.lineage.survivingLineages(liveIds),
  };
}

export function defaultSystems(
  world: World,
  cfg: {
    consumeRadius: number;
    biteSize: number;
    corpseEnergyFraction: number;
    maturityAge: number;
    mutationRate: number;
    mutationSigma: number;
    reproductionProbability?: number;
    /** Part 14 optional sexual recombination probability (0 = asexual). */
    recombination?: number;
    /** Part 16 lifetime plasticity: Hebbian learning rate (0 = no learning). */
    learningRate?: number;
    directSelection?: { objective: (o: OrganismRecord) => number; cutoff: number };
  },
): System[] {
  const systems: System[] = [
    new SpatialIndexSystem(world),
    new BehaviourSystem(world, cfg.learningRate ?? 0),
    new LocomotionSystem(),
    new ConsumptionDetectionSystem(world, cfg.consumeRadius, cfg.biteSize),
    new ResolutionSystem(world, world.config.pulseProbability, world.config.pulseAmount),
    new PlantEcologySystem(world),
    new PhysicsSystem(world),
    new PhysiologySystem(world, cfg.corpseEnergyFraction),
    new PredationSystem(world),
    new ReproductionSystem(world, cfg.maturityAge, cfg.reproductionProbability),
    new InheritanceSystem(world, cfg.mutationRate, cfg.mutationSigma, cfg.recombination ?? 0),
  ];
  if (cfg.directSelection) {
    systems.push(new DirectSelectionSystem(world, cfg.directSelection.objective, cfg.directSelection.cutoff));
  }
  return systems;
}

export { radiusFromBiomass };