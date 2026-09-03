// World plane — authoritative world state and organism aggregate
// (Part 12 §§12.3–12.5, §12.25). SoA-style storage keyed by stable EntityIds.
//
// State classification (Part 12 §12.24):
//   authoritative: organisms (id, position, velocity, energy, genome, age,
//                  lifecycle), resources, environment, RNG streams, tick
//   derived:       spatial hash (reconstructible), metrics (reconstructible)
//   ephemeral:     per-tick derived index, last-tick event copies
//
// The World is the SOLE applier of deltas (Part 12 §12.28; Part 13 §13.4):
// the kernel stages, commit applies. Delta scopes are canonical strings:
//   organism.position.x | organism.position.y | organism.velocity.x |
//   organism.velocity.y | organism.energy | organism.age |
//   organism.lifecycle  | organism (add/remove) | resource.quantity |
//   resource (add/remove)

import type { Delta } from "../kernel/kernel";
import { RngStreams, type RngStreamsState } from "../kernel/rng";
import { MODEL_VERSION, SCHEMA_VERSION } from "../kernel/version";
import type { DomainEvent } from "../kernel/events";
import type { SpatialHash } from "./spatial";
import { LineageBook, type LineageNode } from "./lineage";
import { PheromoneField, MultiField, type SerializedField, type SerializedMultiField, DEFAULT_FIELD_CONFIG, DEFAULT_MULTI_FIELD_CONFIG } from "./field";
import { Terrain, dayPhase, type SerializedTerrain } from "./terrain";
import type { CellNode, NeuralNet, TrophicStrategy } from "./body";

export type LifecycleState = "DEVELOPING" | "ACTIVE" | "DYING" | "DEAD";

/**
 * Boundary behavior of one world edge (§12.13: environment as first-class
 * mechanism; Part 17 §17.4 environmental laws). Deterministic per-edge policy.
 */
export type WallPolicy = "solid" | "wrap" | "reflect";

/** Heterogeneous environmental zone type (Part 17 §17.4: laws vary by region). */
export type ZoneKind = "fertile" | "harsh" | "viscous" | "plain";

/** Body size from biomass: radius grows sub-linearly as the cell accumulates mass. */
export function radiusFromBiomass(biomass: number): number {
  return 1.2 + 0.9 * Math.sqrt(Math.max(0, biomass) / 40);
}

/**
 * A rectangular region with distinct environmental dynamics. Zones are
 * authoritative configuration (state, not ephemera): they are serialized with
 * the world so checkpoints and branches reproduce them exactly (§12.39).
 */
export interface EnvironmentalZone {
  readonly id: string;
  readonly kind: ZoneKind;
  /** Rectangle is [x, x + width) × [y, y + height). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Per-edge boundary policy: top, right, bottom, left. */
export interface WallConfig {
  readonly top: WallPolicy;
  readonly right: WallPolicy;
  readonly bottom: WallPolicy;
  readonly left: WallPolicy;
}

export type WallEdge = "top" | "right" | "bottom" | "left";

/** Zone multipliers by kind (declared laws — not hidden magic). */
export const ZONE_EFFECTS: Record<ZoneKind, { resourceRegen: number; metabolicCost: number; speed: number }> = {
  fertile: { resourceRegen: 1.75, metabolicCost: 1.0, speed: 1.0 },
  harsh: { resourceRegen: 0.35, metabolicCost: 1.6, speed: 1.0 },
  viscous: { resourceRegen: 1.0, metabolicCost: 1.25, speed: 0.55 },
  plain: { resourceRegen: 1.0, metabolicCost: 1.0, speed: 1.0 },
};

export interface OrganismRecord {
  readonly id: string;
  /** Part 12 §12.4: organism ≠ genome. */
  readonly genomeId: string;
  readonly genome: Genome;
  readonly parentIds: readonly string[];
  /** Part 12 §12.12: authoritative spatial state. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  /** Phenotype (Part 12 §§12.9–12.11): expressed, not inherited verbatim. */
  speed: number;
  senseRadius: number;
  age: number;
  lifecycle: LifecycleState;
  /** Part 15 §15.1: developmental maturity 0..1 (stage derived from age). */
  maturity: number;
  /** True once DevelopmentCompleted has fired (Part 15 D4). */
  developmentCompleted: boolean;
  /** Part 15 §15.1: ticks in development (developmental clock), independent of age. */
  developmentClock: number;
  /**
   * Part 15 §15.1 construction queue: phenotype modules still being paid for.
   * Canalization (M1/D3) drains this queue; DevelopmentCompleted fires when it
   * empties and maturity reaches 1.
   */
  constructionQueue: string[];
  /** Part 15 construction energy already invested (0 → constructionTotal). */
  constructionProgress: number;
  /** Part 15 total construction cost of the organism's module set (canalization cap). */
  readonly constructionTotal: number;
  /** Part 15 §15.2 constructed phenotype modules (M1: paid, not configured). */
  readonly modules: string[];
  /** Part 16 §16.4 authoritative internal state: hunger 0..1 (causal, never a score). */
  hunger: number;
  /** ProtoEvo node-based morphology: the organism's body. */
  readonly nodes: CellNode[];
  /** ProtoEvo neural network: the organism's brain. Mutable for lifetime plasticity. */
  brain: NeuralNet;
  /**
   * Part 16 recurrent memory: a decaying trace of recent sensory context,
   * checkpointed, dies with the organism (Baldwinian, not heritable).
   */
  memory: number[];
  /** Current facing direction (radians), for node orientation. */
  facing: number;
  /** Trophic strategy (emergent from genome bias). */
  readonly trophic: TrophicStrategy;
  /** Accumulated body mass — eating grows it, driving radius. */
  biomass: number;
  /** Body radius (presentation/physics size), derived from biomass. */
  radius: number;
  /**
   * ProtoEvo complex molecules — the structural currency. Spent to create
   * nodes (construction), upgrade mature nodes, and seed offspring bodies;
   * manufactured from energy, collected from food, scavenged from corpses,
   * or stolen by spike attacks. Authoritative, serialized state.
   */
  molecules: number;
  /** Per-node upgrade levels, parallel to `nodes` (0 = unupgraded). */
  nodeLevels: number[];
}

/**
 * Part 14 §14.3 — gene layers. The genome is a full multi-layer registry, not a
 * single flat blob: each gene is declared to live in exactly one layer so that
 * mutation operators act on a named layer and the regulatory/effector boundary
 * stays explicit (Part 15 M2). NEURAL has no numeric genes — its content is the
 * organism's brain (weights), mutated separately.
 */
export type GeneLayer = "REGULATION" | "MORPHOLOGY" | "NEURAL" | "BEHAVIOUR";

/** Names of the numeric genes carried in the `genes` union. */
export type GeneName =
  | "speed" | "senseRadius" | "metabolism" | "reproductionThreshold" | "offspringInvestment"
  | "nodeCount" | "aggression" | "trophic" | "attackPower" | "growthEfficiency" | "daySensitivity"
  | "photoreceptorCount" | "chemoreceptorCount" | "mechanoreceptorCount" | "flagellumCount" | "spikeCount";

/** The declared layer registry: which genes live in which layer. */
export const GENE_LAYERS: Record<GeneLayer, readonly GeneName[]> = {
  REGULATION: [
    "metabolism",
    "reproductionThreshold",
    "offspringInvestment",
    "growthEfficiency",
    "daySensitivity",
  ],
  MORPHOLOGY: [
    "nodeCount",
    "photoreceptorCount",
    "chemoreceptorCount",
    "mechanoreceptorCount",
    "flagellumCount",
    "spikeCount",
  ],
  NEURAL: [],
  BEHAVIOUR: ["speed", "senseRadius", "aggression", "trophic", "attackPower"],
};

/**
 * Part 15 §15.2 M2 — regulatory axes a sensory channel may be bound to. A
 * phenotype axis (speed / sense radius / metabolism) driven by a sensor channel.
 */
export type RegulatoryAxis = "speed" | "senseRadius" | "metabolism";

/**
 * Regulation/effector decoupling (Part 15 M2): which phenotype axis each
 * sensory channel boosts. Mutation can REBIND a channel to a different axis
 * (exaptation) without inventing new control structure.
 */
export interface RegulatoryBinding {
  readonly photoreceptorAxis: RegulatoryAxis;
  readonly chemoreceptorAxis: RegulatoryAxis;
  readonly mechanoreceptorAxis: RegulatoryAxis;
}

export type SensorChannel = "photoreceptor" | "chemoreceptor" | "mechanoreceptor";

export const SENSOR_CHANNELS: readonly SensorChannel[] = ["photoreceptor", "chemoreceptor", "mechanoreceptor"];

export const REGULATORY_AXES: readonly RegulatoryAxis[] = ["speed", "senseRadius", "metabolism"];

/** Canonical genome: the heritable information substrate (Part 12 §12.7). */
export interface Genome {
  readonly genomeId: string;
  /**
   * The union of all numeric genes across layers (Part 14 §14.3 G4). Kept as a
   * flat map for ergonomic expression reads; the authoritative LAYER registry
   * (`GENE_LAYERS`) declares each gene's layer so operators act per-layer.
   */
  readonly genes: {
    speed: number;
    senseRadius: number;
    metabolism: number;
    reproductionThreshold: number;
    offspringInvestment: number;
    /** Node-based body composition (ProtoEvo morphology). */
    nodeCount: number;
    aggression: number;
    /** Trophic bias: -1 herbivore … +1 carnivore. */
    trophic: number;
    attackPower: number;
    growthEfficiency: number;
    daySensitivity: number;
    photoreceptorCount: number;
    chemoreceptorCount: number;
    mechanoreceptorCount: number;
    flagellumCount: number;
    spikeCount: number;
  };
  /**
   * Part 15 M2 regulatory binding: sensory channel → phenotype axis. Rebound by
   * the regulatory-rewiring mutation operator (exaptation, mapping §2.2).
   */
  readonly regulatory: RegulatoryBinding;
}

/** Resource kinds (Part 17 §17.2 R3 — multi-resource ready). */
export type ResourceType = "mass" | "energy" | "molecules";

export interface ResourcePatch {
  readonly id: string;
  x: number;
  y: number;
  quantity: number;
  /** Resource type; defaults to "energy" for legacy patches (stage-0 single-type). */
  readonly type?: ResourceType;
  regenerationRate: number;
  /**
   * Plants are clusters of joined smaller leaf nodes (ProtoEvo morphology):
   * several ResourcePatches share a clusterId and together form one plant body.
   * Corpse resources and legacy single patches omit this. Optional for
   * backward compatibility with serialized checkpoints.
   */
  readonly clusterId?: string;
  /** Per-node food capacity. When omitted the world's patchCapacity applies. */
  readonly capacity?: number;
  /**
   * Part 17 plant ecology — a drifting spore (a detached plant clump). A spore
   * is an ordinary resource that drifts for `sporeLifespan` ticks, then settles
   * and sprouts a new plant cluster (propagation).
   */
  readonly spore?: boolean;
  /** True for corpses — finite scavenging resources that decay and are removed. */
  readonly corpse?: boolean;
  sporeAge?: number;
  readonly sporeLifespan?: number;
  sporeVx?: number;
  sporeVy?: number;
  /**
   * Ticks a leaf has stayed grazed below its wilt line. When it reaches
   * LEAF_DEPLETION_TICKS the node is removed — grazing can kill a plant.
   */
  depletedTicks?: number;
  /**
   * Complex molecules carried by this patch (corpses). Scavenging eats the
   * patch's quantity AND its molecule pool; plants use the uniform
   * MOLECULES_PER_FOOD rate instead (molecules are implicit in their food).
   */
  molecules?: number;
}

export interface WorldConfig {
  /** Arena is [0, width) × [0, height), bounded. */
  readonly width: number;
  readonly height: number;
  readonly resourcePatches: number;
  readonly initialPopulation: number;
  /** Basal metabolic cost per tick. */
  readonly basalCost: number;
  /** Movement cost proportional to speed² per tick. */
  readonly movementCost: number;
  /** Resource quantity per patch at regeneration cap. */
  readonly patchCapacity: number;
  /** Energy per unit resource consumed. */
  readonly energyPerResource: number;
  /** Offspring spawn cost in energy (Part 12 §12.20 reproductionCost). */
  readonly reproductionCost: number;
  /** Maximum age in ticks. */
  readonly maxAge: number;
  /** Ticks until DevelopmentCompleted fires (Part 15 §15.1 developmental clock). */
  readonly maturityAge: number;
  /** Environment stochasticity: resource pulse probability per tick. */
  readonly pulseProbability: number;
  readonly pulseAmount: number;
  /** Boundary behavior per edge; solid when omitted (backward compat). */
  readonly walls?: WallConfig;
  /** Heterogeneous environmental zones; empty/omitted = uniform plain world. */
  readonly zones?: readonly EnvironmentalZone[];
  /** When set, initialization generates this many deterministic zones (lab knob). */
  readonly zoneCount?: number;
  /** When set, initialization generates this many inaccessible terrain pockets. */
  readonly inaccessiblePocketCount?: number;
  /** Plants seeded inside each inaccessible pocket (when set). */
  readonly inaccessiblePocketInhabitants?: number;
  /** Plants seeded outside pockets (when set). */
  readonly outsidePlantCount?: number;
  /** Terrain (elevation/water/walls + day length). When absent a plain world is used. */
  readonly terrain?: import("./terrain").TerrainConfig;
  /** Incremental-locomotion scale: cells move a fraction of their speed per tick. */
  readonly moveScale?: number;
}

/**
 * Part 17 §17.4 I1 — a resolved interaction between organisms (or organism ↔
 * resource), recorded as a fact for causal analysis. Append-only; bounded so it
 * cannot grow without limit. Never consulted by the simulation's causal path.
 */
export interface InteractionRecord {
  readonly interactionId: string;
  readonly tick: number;
  readonly interactionType: "consume" | "predation";
  readonly initiator: string;
  readonly recipient: string;
  readonly locationX: number;
  readonly locationY: number;
  readonly transfer: number;
}

/**
 * Part 17 §17.5 + §17.6 I17-A — the conservation ledger. Tracks declared
 * inflows (environmental pulses) and outflows (basal metabolism) so the books
 * can be audited: total energy should equal initial + inflow − outflow within
 * float tolerance, up to corpse-recycling accounting.
 */
export interface ConservationLedger {
  initialEnergy: number;
  inflow: number;
  outflow: number;
}

export interface WorldSnapshotMeta {
  readonly worldId: string;
  readonly modelVersion: string;
  readonly schemaVersion: number;
  readonly tick: number;
  readonly experimentId: string;
  readonly replicateId: string;
  readonly seed: string;
}

/**
 * The World owns authoritative state and is the sole applier of deltas
 * (Part 12 §12.28; Part 13 §13.4: commit is the sole writer).
 */
export class World {
  tick = 0;
  readonly config: WorldConfig;
  readonly organisms = new Map<string, OrganismRecord>();
  readonly resources = new Map<string, ResourcePatch>();
  readonly rng: RngStreams;
  /** Authoritative terrain: elevation, water, and organic barrier walls. */
  readonly terrain: Terrain;
  /** Authoritative append-only lineage history (Part 14 §14.5, G12–G13). */
  lineage: LineageBook = new LineageBook();
  /** Authoritative pheromone field (Part 17 §17.1, E1–E4). */
  readonly field: PheromoneField;
  /** Authoritative multi-field environment: temperature + chemical (Part 17 §17.1). */
  env: MultiField;
  /** Authoritative append-only interaction log (Part 17 §17.4, I1). Bounded. */
  readonly interactions: InteractionRecord[] = [];
  /** Authoritative conservation ledger (Part 17 §17.6, I17-A). */
  conservation: ConservationLedger = { initialEnergy: 0, inflow: 0, outflow: 0 };
  /** Ephemeral per-tick buffers (Part 12 §12.24). */
  readonly ephemeral = {
    /** Derived spatial index over resource patches, rebuilt each OBSERVE. */
    resourceIndex: null as SpatialHash<string> | null,
    /** Derived spatial index over live organisms, rebuilt each OBSERVE. */
    organismIndex: null as SpatialHash<string> | null,
    /** Organisms killed by predation in the current tick (skip re-billing). */
    predationVictims: null as Set<string> | null,
    /** Copies of the last committed tick's events (for observation systems). */
    lastEvents: [] as DomainEvent[],
  };
  /** Clear per-tick ephemera (presentation convenience, never authoritative). */
  resetEphemera(): void {
    this.ephemeral.resourceIndex = null;
    this.ephemeral.organismIndex = null;
    this.ephemeral.predationVictims = null;
  }
  /**
   * Cached id-sorted live list, invalidated only when organism membership
   * changes. Positions don't affect membership, so the cache stays hot across
   * a whole tick's system passes (K5 deterministic order preserved).
   */
  private liveCache: OrganismRecord[] | null = null;

  private invalidateLiveCache(): void {
    this.liveCache = null;
  }

  constructor(
    readonly meta: WorldSnapshotMeta,
    config: WorldConfig,
    rng: RngStreams,
    field?: PheromoneField,
    terrain?: Terrain,
  ) {
    this.meta = meta;
    this.config = config;
    this.rng = rng;
    this.field = field ?? new PheromoneField(config.width, config.height, DEFAULT_FIELD_CONFIG);
    this.terrain = terrain ?? Terrain.plain(config.width, config.height);
    this.env = new MultiField(config.width, config.height, DEFAULT_MULTI_FIELD_CONFIG);
  }

  /** Record a resolved interaction (Part 17 I1). Bounded to the last 4096. */
  recordInteraction(rec: InteractionRecord): void {
    this.interactions.push(rec);
    if (this.interactions.length > 4096) this.interactions.splice(0, this.interactions.length - 4096);
  }

  organism(id: string): OrganismRecord | undefined {
    return this.organisms.get(id);
  }

  liveOrganisms(): OrganismRecord[] {
    if (this.liveCache) return this.liveCache;
    // K5: deterministic iteration order by entity id.
    this.liveCache = [...this.organisms.values()]
      .filter((o) => o.lifecycle === "ACTIVE" || o.lifecycle === "DEVELOPING")
      .sort((a, b) => a.id.localeCompare(b.id));
    return this.liveCache;
  }

  resource(id: string): ResourcePatch | undefined {
    return this.resources.get(id);
  }

  /** Daylight factor (0..1) for the current tick (deterministic day/night cycle). */
  daylight(): number {
    return this.terrain.config.dayLength > 0 ? 0.5 - 0.5 * Math.cos(dayPhase(this.tick, this.terrain.config.dayLength) * Math.PI * 2) : 1;
  }

  /** True if (x, y) lies inside an impassable barrier formation. */
  blocked(x: number, y: number): boolean {
    return this.terrain.blocked(x, y);
  }

  /** Speed multiplier at a point (water slows movement). */
  terrainSpeed(x: number, y: number): number {
    return this.terrain.speedFactor(x, y);
  }

  /** Resource-regeneration multiplier near water. */
  terrainResource(x: number, y: number): number {
    return this.terrain.resourceFactor(x, y);
  }

  /** Authoritative zone containing (x, y); outermost = plain (§12.13). */
  zoneAt(x: number, y: number): ZoneKind {
    const zones = this.config.zones ?? [];
    for (const z of zones) {
      if (x >= z.x && x < z.x + z.width && y >= z.y && y < z.y + z.height) return z.kind;
      }
    return "plain";
  }

  /** Declared zone multipliers at a point. */
  zoneEffectsAt(x: number, y: number): { resourceRegen: number; metabolicCost: number; speed: number } {
    return ZONE_EFFECTS[this.zoneAt(x, y)];
  }
  resourceList(): ResourcePatch[] {
    return [...this.resources.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Apply a delta during COMMIT. The kernel stages; the world applies —
   * state transition ownership (Part 12 §12.28). Unknown scopes are ignored
   * (forward compatibility), never thrown.
   */
  applyDelta(delta: Delta): void {
    switch (delta.kind) {
      case "set": {
        const o = this.organisms.get(delta.key);
        if (o) {
          switch (delta.scope) {
            case "organism.position.x":
              o.x = delta.value as number;
              break;
            case "organism.position.y":
              o.y = delta.value as number;
              break;
            case "organism.velocity.x":
              o.vx = delta.value as number;
              break;
            case "organism.velocity.y":
              o.vy = delta.value as number;
              break;
            case "organism.energy":
              o.energy = delta.value as number;
              break;
            case "organism.molecules":
              o.molecules = delta.value as number;
              break;
            case "organism.nodeLevels":
              o.nodeLevels = delta.value as unknown as number[];
              break;
            case "organism.age":
              o.age = delta.value as number;
              break;
            case "organism.maturity":
              o.maturity = delta.value as number;
              break;
            case "organism.developmentCompleted":
              o.developmentCompleted = delta.value === 1;
              break;
            case "organism.constructionProgress":
              o.constructionProgress = delta.value as number;
              break;
            case "organism.constructionQueue":
              o.constructionQueue = delta.value as unknown as string[];
              break;
            case "organism.memory":
              o.memory = delta.value as unknown as number[];
              break;
            case "organism.brain":
              o.brain = { weights: delta.value as unknown as number[] };
              break;
            case "organism.lifecycle":
              o.lifecycle = delta.value as LifecycleState;
              this.invalidateLiveCache();
              break;
          }
          break;
        }
        const r = this.resources.get(delta.key);
        if (r) {
          if (delta.scope === "resource.quantity") r.quantity = delta.value as number;
          else if (delta.scope === "resource.position.x") r.x = delta.value as number;
          else if (delta.scope === "resource.position.y") r.y = delta.value as number;
          else if (delta.scope === "resource.molecules") r.molecules = delta.value as number;
        }
        break;
      }
      case "adjust": {
        const o = this.organisms.get(delta.key);
        if (o) {
          switch (delta.scope) {
            case "organism.position.x":
              o.x += delta.amount;
              break;
            case "organism.position.y":
              o.y += delta.amount;
              break;
            case "organism.velocity.x":
              o.vx += delta.amount;
              break;
            case "organism.velocity.y":
              o.vy += delta.amount;
              break;
            case "organism.energy":
              o.energy += delta.amount;
              break;
            case "organism.molecules":
              o.molecules = Math.max(0, o.molecules + delta.amount);
              break;
            case "organism.biomass":
              o.biomass += delta.amount;
              o.radius = radiusFromBiomass(o.biomass);
              break;
            case "organism.facing":
              o.facing += delta.amount;
              break;
            case "organism.age":
              o.age += delta.amount;
              break;
          }
          break;
        }
        const r = this.resources.get(delta.key);
        if (r) {
          if (delta.scope === "resource.quantity") {
            // Conservation: quantity clamps at [0, ∞).
            r.quantity = Math.max(0, r.quantity + delta.amount);
          } else if (delta.scope === "resource.position.x") {
            r.x += delta.amount;
          } else if (delta.scope === "resource.position.y") {
            r.y += delta.amount;
          } else if (delta.scope === "resource.sporeAge") {
            r.sporeAge = (r.sporeAge ?? 0) + delta.amount;
          } else if (delta.scope === "resource.depletedTicks") {
            r.depletedTicks = Math.max(0, (r.depletedTicks ?? 0) + delta.amount);
          } else if (delta.scope === "resource.molecules") {
            r.molecules = Math.max(0, (r.molecules ?? 0) + delta.amount);
          }
        }
        break;
      }
      case "add": {
        if (delta.scope === "organism" && isOrganismRecord(delta.entity)) {
          this.organisms.set(delta.entity.id, delta.entity);
          this.invalidateLiveCache();
          // Lineage is written at commit alongside the organism (Part 14 G12).
          this.lineage.recordBirth(delta.entity.id, delta.entity.parentIds, delta.entity.genomeId, this.tick);
        } else if (delta.scope === "resource" && isResourcePatch(delta.entity)) {
          this.resources.set(delta.entity.id, delta.entity);
        }
        break;
      }
      case "remove": {
        if (delta.scope === "organism") {
          // Close the lineage node at death (Part 17 E5, Part 18 I18-B).
          this.invalidateLiveCache();
          this.lineage.recordDeath(delta.id, this.tick);
          this.organisms.delete(delta.id);
        } else if (delta.scope === "resource") {
          this.resources.delete(delta.id);
        }
        break;
      }
    }
  }

  advanceTime(): void {
    this.tick += 1;
  }

  /** Serialize authoritative state (Part 12 §12.39 checkpoint contract). */
  serialize(): SerializedWorld {
    return {
      meta: { ...this.meta, tick: this.tick },
      config: this.config,
      tick: this.tick,
      organisms: [...this.organisms.values()].map((o) => ({
        ...o,
        parentIds: [...o.parentIds],
        modules: [...o.modules],
        constructionQueue: [...o.constructionQueue],
        nodeLevels: [...o.nodeLevels],
        genome: { ...o.genome, genes: { ...o.genome.genes }, regulatory: { ...o.genome.regulatory } },
        nodes: [...o.nodes],
        brain: { weights: [...o.brain.weights] },
      })),
      resources: [...this.resources.values()].map((r) => ({ ...r })),
      lineage: this.lineage.serialize(),
      field: this.field.serialize(),
      env: this.env.serialize(),
      terrain: this.terrain.serialize(),
      interactions: [...this.interactions],
      conservation: { ...this.conservation },
      rngState: this.rng.state(),
    };
  }

  static restore(data: SerializedWorld): World {
    const rng = RngStreams.restore(data.rngState);
    const world = new World(
      data.meta,
      data.config,
      rng,
      data.field ? PheromoneField.restore(data.field) : undefined,
      data.terrain ? Terrain.restore(data.terrain) : undefined,
    );
    world.tick = data.tick;
    for (const o of data.organisms) world.organisms.set(o.id, o as OrganismRecord);
    for (const r of data.resources) world.resources.set(r.id, r as ResourcePatch);
    world.lineage = LineageBook.restore(data.lineage);
    if (data.env) world.env = MultiField.restore(data.env);
    if (data.interactions) world.interactions.splice(0, world.interactions.length, ...data.interactions);
    if (data.conservation) world.conservation = { ...data.conservation };
    return world;
  }
}

export interface SerializedWorld {
  meta: WorldSnapshotMeta;
  config: WorldConfig;
  tick: number;
  organisms: OrganismRecord[];
  resources: ResourcePatch[];
  lineage?: LineageNode[];
  field?: SerializedField;
  env?: SerializedMultiField;
  terrain?: SerializedTerrain;
  interactions?: InteractionRecord[];
  conservation?: ConservationLedger;
  rngState: RngStreamsState;
}

/**
 * Apply the world's per-edge wall policy to a candidate position (§12.13:
 * environment as mechanism; Part 17 §17.4 environmental laws). Deterministic:
 * edges are processed in fixed order (left, right, top, bottom); a corner hit
 * reports the first edge in that order. Missing policy = solid (backward
 * compatible with pre-topology worlds: clamp into the arena).
 */
export function applyWalls(
  x: number,
  y: number,
  config: Pick<WorldConfig, "width" | "height" | "walls">,
): { x: number; y: number; edge: WallEdge | null; wrapped: boolean } {
  const walls = config.walls;
  const w = config.width;
  const h = config.height;
  let nx = x;
  let ny = y;
  let edge: WallEdge | null = null;
  let wrapped = false;

  if (nx < 0) {
    edge = "left";
    if (walls?.left === "wrap") {
      nx = ((nx % w) + w) % w;
      wrapped = true;
    } else if (walls?.left === "reflect") {
      nx = -nx;
    } else {
      nx = 0;
    }
  } else if (nx > w - 1) {
    edge = "right";
    if (walls?.right === "wrap") {
      nx = nx % w;
      wrapped = true;
    } else if (walls?.right === "reflect") {
      nx = 2 * (w - 1) - nx;
    } else {
      nx = w - 1;
    }
  }

  if (ny < 0) {
    edge = edge ?? "top";
    if (walls?.top === "wrap") {
      ny = ((ny % h) + h) % h;
      wrapped = true;
    } else if (walls?.top === "reflect") {
      ny = -ny;
    } else {
      ny = 0;
    }
  } else if (ny > h - 1) {
    edge = edge ?? "bottom";
    if (walls?.bottom === "wrap") {
      ny = ny % h;
      wrapped = true;
    } else if (walls?.bottom === "reflect") {
      ny = 2 * (h - 1) - ny;
    } else {
      ny = h - 1;
    }
  }

  return { x: nx, y: ny, edge, wrapped };
}

function isOrganismRecord(v: unknown): v is OrganismRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as OrganismRecord).id === "string" &&
    typeof (v as OrganismRecord).genomeId === "string"
  );
}

function isResourcePatch(v: unknown): v is ResourcePatch {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as ResourcePatch).id === "string" &&
    typeof (v as ResourcePatch).quantity === "number"
  );
}

export { MODEL_VERSION, SCHEMA_VERSION };
