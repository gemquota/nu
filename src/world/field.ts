// World plane — the authoritative pheromone field (Part 17 §17.1, E1–E4).
//
// A coarse-grid scalar field over the arena. It is authoritative state:
// organisms deposit into it (feeding, deaths, reproduction), it decays and
// diffuses by declared dynamics (E3), and organisms sense it only through the
// sensory interface (E2, Part 16 B1). Niche construction is permitted, not
// special-cased (E4): anything that writes to the field changes the
// environment other organisms perceive.
//
// Checkpointed with the world (authoritative, §12.39). Diffusion/decay run in
// the RESOLVE phase on the `environment` stream discipline — the update itself
// is fully deterministic (no draws), so K4/K5 hold trivially.

export interface FieldConfig {
  /** Grid cell size in world units (world is width×height). */
  readonly cellSize: number;
  /** Fraction of each cell's value that decays per tick (0..1). */
  readonly decayPerTick: number;
  /** Fraction of value diffused to each of 4 neighbours per tick (0..0.25). */
  readonly diffusionPerTick: number;
}

export const DEFAULT_FIELD_CONFIG: FieldConfig = {
  cellSize: 10,
  decayPerTick: 0.05,
  diffusionPerTick: 0.06,
};

export class PheromoneField {
  readonly cols: number;
  readonly rows: number;
  private current: Float64Array;
  private staged: Float64Array;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly config: FieldConfig,
  ) {
    this.cols = Math.max(1, Math.ceil(width / config.cellSize));
    this.rows = Math.max(1, Math.ceil(height / config.cellSize));
    this.current = new Float64Array(this.cols * this.rows);
    this.staged = new Float64Array(this.cols * this.rows);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  /** Add pheromone at a world position (staged; applied at commit). */
  deposit(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.config.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.config.cellSize)));
    this.staged[this.idx(cx, cy)] += amount;
  }

  /** Sense the field value at a world position (read-only, sensory interface). */
  sense(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.config.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.config.cellSize)));
    return this.current[this.idx(cx, cy)]!;
  }

  /**
   * Sense the local gradient as a unit-ish direction (E2: gradient following
   * is a strategy over observations, not world access). Returns the weighted
   * direction toward higher concentrations among the 4 neighbours + self.
   * Zero vector when the field is locally flat or empty.
   */
  gradient(x: number, y: number): { gx: number; gy: number } {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.config.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.config.cellSize)));
    const here = this.current[this.idx(cx, cy)]!;
    let gx = 0;
    let gy = 0;
    if (cx > 0) gx -= this.current[this.idx(cx - 1, cy)]! - here;
    if (cx < this.cols - 1) gx += this.current[this.idx(cx + 1, cy)]! - here;
    if (cy > 0) gy -= this.current[this.idx(cx, cy - 1)]! - here;
    if (cy < this.rows - 1) gy += this.current[this.idx(cx, cy + 1)]! - here;
    return { gx, gy };
  }

  /** Apply staged deposits, then decay + diffusion. Deterministic. */
  step(): void {
    // 1. Commit staged deposits.
    for (let i = 0; i < this.staged.length; i++) {
      if (this.staged[i] !== 0) {
        this.current[i]! += this.staged[i]!;
        this.staged[i] = 0;
      }
    }
    // 2. Decay in place.
    const keep = 1 - this.config.decayPerTick;
    for (let i = 0; i < this.current.length; i++) {
      this.current[i]! *= keep;
    }
    // 3. Diffusion via double buffer (deterministic 4-neighbour spread).
    const d = this.config.diffusionPerTick;
    const next = this.staged; // reuse as scratch (it is all zeros now)
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const v = this.current[this.idx(cx, cy)]!;
        next[this.idx(cx, cy)]! += v * (1 - 4 * d);
        if (cx > 0) next[this.idx(cx - 1, cy)]! += v * d;
        if (cx < this.cols - 1) next[this.idx(cx + 1, cy)]! += v * d;
        if (cy > 0) next[this.idx(cx, cy - 1)]! += v * d;
        if (cy < this.rows - 1) next[this.idx(cx, cy + 1)]! += v * d;
      }
    }
    // Swap: next becomes current; old current becomes the (zeroed) staging buffer.
    // Note: `next` aliases the staging buffer and was fully overwritten by the
    // diffusion loop (every cell gets v*(1-4d)), so only the OLD current buffer
    // — which now becomes the staging buffer — needs zeroing, AFTER the swap.
    const tmp = this.current;
    this.current = next;
    this.staged = tmp;
    this.staged.fill(0);
  }

  total(): number {
    let t = 0;
    for (let i = 0; i < this.current.length; i++) t += this.current[i]!;
    return t;
  }

  /** Snapshot for observation/visualization (row-major, rows×cols). */
  snapshot(): { cols: number; rows: number; values: number[] } {
    return { cols: this.cols, rows: this.rows, values: Array.from(this.current) };
  }

  serialize(): SerializedField {
    return {
      config: this.config,
      cols: this.cols,
      rows: this.rows,
      values: Array.from(this.current),
      staged: Array.from(this.staged),
    };
  }

  static restore(data: SerializedField): PheromoneField {
    const f = new PheromoneField(data.cols * data.config.cellSize, data.rows * data.config.cellSize, data.config);
    f.current = Float64Array.from(data.values);
    f.staged = Float64Array.from(data.staged);
    return f;
  }
}

export interface SerializedField {
  config: FieldConfig;
  cols: number;
  rows: number;
  values: number[];
  staged: number[];
}

// ---------------------------------------------------------------------------
// Part 17 §17.1 — the multi-field environment.
//
// Beyond the pheromone trail (a single `PheromoneField`), the environment
// carries a set of named scalar fields — temperature and chemical signal — each
// with its own declared diffusion/decay dynamics (E3). All are authoritative,
// checkpointed state. Organisms sense them only through the sensory interface
// (E2); nothing special-cases "niche construction" — any organism emission
// writes to a field and changes what others perceive (E4).
// ---------------------------------------------------------------------------

export type FieldName = "temperature" | "chemical";

export interface MultiFieldConfig {
  readonly cellSize: number;
  /** per-field decay per tick */
  readonly decay: Record<FieldName, number>;
  /** per-field diffusion per tick */
  readonly diffusion: Record<FieldName, number>;
}

export const DEFAULT_MULTI_FIELD_CONFIG: MultiFieldConfig = {
  cellSize: 12,
  decay: { temperature: 0.02, chemical: 0.06 },
  diffusion: { temperature: 0.12, chemical: 0.06 },
};

/** A set of independent authoritative scalar fields sharing one grid. */
export class MultiField {
  readonly cols: number;
  readonly rows: number;
  private current: Record<FieldName, Float64Array>;
  private staged: Record<FieldName, Float64Array>;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly config: MultiFieldConfig,
  ) {
    this.cols = Math.max(1, Math.ceil(width / config.cellSize));
    this.rows = Math.max(1, Math.ceil(height / config.cellSize));
    this.current = {
      temperature: new Float64Array(this.cols * this.rows),
      chemical: new Float64Array(this.cols * this.rows),
    };
    this.staged = {
      temperature: new Float64Array(this.cols * this.rows),
      chemical: new Float64Array(this.cols * this.rows),
    };
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private cell(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.config.cellSize))),
      cy: Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.config.cellSize))),
    };
  }

  /** Stage a deposit into a named field (applied at commit). */
  deposit(field: FieldName, x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const { cx, cy } = this.cell(x, y);
    this.staged[field][this.idx(cx, cy)] += amount;
  }

  /** Read the current value of a named field at a position. */
  sample(field: FieldName, x: number, y: number): number {
    const { cx, cy } = this.cell(x, y);
    return this.current[field][this.idx(cx, cy)]!;
  }

  /** Gradient of a named field (for gradient-following strategies). */
  gradient(field: FieldName, x: number, y: number): { gx: number; gy: number } {
    const { cx, cy } = this.cell(x, y);
    const arr = this.current[field];
    const here = arr[this.idx(cx, cy)]!;
    let gx = 0;
    let gy = 0;
    if (cx > 0) gx -= arr[this.idx(cx - 1, cy)]! - here;
    if (cx < this.cols - 1) gx += arr[this.idx(cx + 1, cy)]! - here;
    if (cy > 0) gy -= arr[this.idx(cx, cy - 1)]! - here;
    if (cy < this.rows - 1) gy += arr[this.idx(cx, cy + 1)]! - here;
    return { gx, gy };
  }

  /** Apply staged deposits, then decay + diffusion for every field. */
  step(): void {
    for (const f of Object.keys(this.current) as FieldName[]) {
      const cur = this.current[f];
      const stg = this.staged[f];
      // commit staged
      for (let i = 0; i < stg.length; i++) {
        if (stg[i] !== 0) { cur[i]! += stg[i]!; stg[i] = 0; }
      }
      // decay
      const keep = 1 - this.config.decay[f];
      for (let i = 0; i < cur.length; i++) cur[i]! *= keep;
      // diffuse into a fresh scratch
      const d = this.config.diffusion[f];
      const next = new Float64Array(this.cols * this.rows);
      for (let cy = 0; cy < this.rows; cy++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const v = cur[this.idx(cx, cy)]!;
          next[this.idx(cx, cy)]! += v * (1 - 4 * d);
          if (cx > 0) next[this.idx(cx - 1, cy)]! += v * d;
          if (cx < this.cols - 1) next[this.idx(cx + 1, cy)]! += v * d;
          if (cy > 0) next[this.idx(cx, cy - 1)]! += v * d;
          if (cy < this.rows - 1) next[this.idx(cx, cy + 1)]! += v * d;
        }
      }
      this.current[f] = next;
    }
  }

  total(field: FieldName): number {
    let t = 0;
    const cur = this.current[field];
    for (let i = 0; i < cur.length; i++) t += cur[i]!;
    return t;
  }

  serialize(): SerializedMultiField {
    return {
      config: this.config,
      cols: this.cols,
      rows: this.rows,
      values: {
        temperature: Array.from(this.current.temperature),
        chemical: Array.from(this.current.chemical),
      },
      staged: {
        temperature: Array.from(this.staged.temperature),
        chemical: Array.from(this.staged.chemical),
      },
    };
  }

  static restore(data: SerializedMultiField): MultiField {
    const f = new MultiField(data.cols * data.config.cellSize, data.rows * data.config.cellSize, data.config);
    f.current = {
      temperature: Float64Array.from(data.values.temperature),
      chemical: Float64Array.from(data.values.chemical),
    };
    f.staged = {
      temperature: Float64Array.from(data.staged.temperature),
      chemical: Float64Array.from(data.staged.chemical),
    };
    return f;
  }
}

export interface SerializedMultiField {
  config: MultiFieldConfig;
  cols: number;
  rows: number;
  values: Record<FieldName, number[]>;
  staged: Record<FieldName, number[]>;
}
