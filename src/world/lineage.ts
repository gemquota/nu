// World plane — lineage (Part 12 §12.16, Part 14 §14.5, Part 18).
//
// Lineage is authoritative, append-only history (Part 14 G12): nodes are added
// at birth, closed at death, and outlive organism records (G13 — dead
// organisms remain analyzable). There is NO fitness field anywhere (Part 18
// S1); selection observables are computed post hoc from these records.

export interface LineageNode {
  readonly nodeId: string;
  readonly organismId: string;
  readonly parentIds: readonly string[];
  /** Root founder id: the first organism in this ancestry chain. */
  readonly founderId: string;
  readonly birthTick: number;
  /** Set when the organism dies (Part 17 E5); undefined while alive. */
  deathTick?: number;
  readonly genomeId: string;
}

export interface LineageStats {
  readonly nodes: number;
  readonly openNodes: number;
  readonly closedNodes: number;
  readonly founders: number;
}

export class LineageBook {
  /** nodeId → node; iteration order is insertion (birth) order. */
  private readonly nodes = new Map<string, LineageNode>();
  /** organismId → nodeId for O(1) birth/death bookkeeping. */
  private readonly byOrganism = new Map<string, string>();

  /**
   * Record a birth. Founders (no parents) become their own root; descendants
   * inherit the founder of their first parent (asexual model — Part 14).
   */
  recordBirth(organismId: string, parentIds: readonly string[], genomeId: string, tick: number): LineageNode {
    let founderId: string;
    if (parentIds.length === 0) {
      founderId = organismId;
    } else {
      const parentNode = this.byOrganism.get(parentIds[0]!);
      const found = parentNode !== undefined ? this.nodes.get(parentNode) : undefined;
      founderId = found?.founderId ?? parentIds[0]!;
    }
    const node: LineageNode = {
      nodeId: `l:${organismId}`,
      organismId,
      parentIds: [...parentIds],
      founderId,
      birthTick: tick,
      genomeId,
    };
    this.nodes.set(node.nodeId, node);
    this.byOrganism.set(organismId, node.nodeId);
    return node;
  }

  /** Close a node at death (Part 17 E5). Idempotent. */
  recordDeath(organismId: string, tick: number): boolean {
    const nodeId = this.byOrganism.get(organismId);
    if (nodeId === undefined) return false;
    const node = this.nodes.get(nodeId);
    if (node === undefined || node.deathTick !== undefined) return false;
    node.deathTick = tick;
    return true;
  }

  /** Serialize authoritative lineage state (checkpointed with the world). */
  serialize(): LineageNode[] {
    return [...this.nodes.values()].map((n) => ({ ...n }));
  }

  static restore(data: LineageNode[] | undefined): LineageBook {
    const book = new LineageBook();
    if (!data) return book;
    for (const n of data) {
      const node: LineageNode = { ...n };
      book.nodes.set(node.nodeId, node);
      book.byOrganism.set(node.organismId, node.nodeId);
    }
    return book;
  }

  stats(): LineageStats {
    let openNodes = 0;
    let closedNodes = 0;
    const founders = new Set<string>();
    for (const n of this.nodes.values()) {
      if (n.deathTick === undefined) openNodes += 1;
      else closedNodes += 1;
      founders.add(n.founderId);
    }
    return { nodes: this.nodes.size, openNodes, closedNodes, founders: founders.size };
  }

  // -------------------------------------------------------------------------
  // Part 18 §18.2 — selection observables (pure projections over records).
  // -------------------------------------------------------------------------

  /** Fraction of LIVE population per founder lineage at a given tick. */
  founderShares(liveOrganismIds: readonly string[]): Map<string, number> {
    const shares = new Map<string, number>();
    if (liveOrganismIds.length === 0) return shares;
    for (const id of liveOrganismIds) {
      const nodeId = this.byOrganism.get(id);
      const node = nodeId !== undefined ? this.nodes.get(nodeId) : undefined;
      const founder = node?.founderId ?? id;
      shares.set(founder, (shares.get(founder) ?? 0) + 1);
    }
    for (const [k, v] of shares) shares.set(k, v / liveOrganismIds.length);
    return shares;
  }

  /** Gini–Simpson diversity of founder shares: 0 = one lineage, →1 = even mix. */
  founderDiversity(liveOrganismIds: readonly string[]): number {
    const shares = this.founderShares(liveOrganismIds);
    let h = 0;
    for (const s of shares.values()) h += s * s;
    return 1 - h;
  }

  /** Offspring count per node that reached reproduction (by birth events). */
  reproductionCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const n of this.nodes.values()) {
      for (const p of n.parentIds) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return counts;
  }

  /** Variance of per-parent offspring counts — selection intensity proxy. */
  reproductionVariance(): number {
    const counts = [...this.reproductionCounts().values()];
    if (counts.length === 0) return 0;
    const n = counts.length;
    const mean = counts.reduce((a, b) => a + b, 0) / n;
    const sq = counts.reduce((a, b) => a + b * b, 0);
    return sq / n - mean * mean;
  }

  /** Extinction tick per founder lineage, where extinct. */
  extinctions(): Map<string, number> {
    const lastDeath = new Map<string, number>();
    for (const n of this.nodes.values()) {
      if (n.deathTick === undefined) {
        lastDeath.delete(n.founderId);
        continue;
      }
      if (!lastDeath.has(n.founderId)) lastDeath.set(n.founderId, n.deathTick);
      else lastDeath.set(n.founderId, Math.max(lastDeath.get(n.founderId)!, n.deathTick));
    }
    return lastDeath;
  }

  /**
   * Part 18 §18.2 — full lineage observables, one per founder. All pure
   * projections over records: no stored fitness, ever (S1).
   */
  lineageObservables(liveOrganismIds: readonly string[]): LineageObservable[] {
    const shares = this.founderShares(liveOrganismIds);
    const counts = this.reproductionCounts();
    const byFounder = new Map<string, LineageNode[]>();
    for (const n of this.nodes.values()) {
      const arr = byFounder.get(n.founderId) ?? [];
      arr.push(n);
      byFounder.set(n.founderId, arr);
    }
    const out: LineageObservable[] = [];
    for (const [founder, nodes] of byFounder) {
      let births = 0;
      let reproductions = 0;
      let oldest = -Infinity;
      let lastAlive = -Infinity;
      let alive = 0;
      for (const n of nodes) {
        if (n.deathTick === undefined) {
          alive += 1;
          lastAlive = Infinity;
        } else {
          lastAlive = Math.max(lastAlive, n.deathTick);
        }
        births += 1;
        reproductions += counts.get(n.organismId) ?? 0;
        oldest = Math.max(oldest, n.birthTick);
      }
      const birth = nodes[0]?.birthTick ?? 0;
      out.push({
        founderId: founder,
        descendants: births - 1,
        lineageSurvival: Number.isFinite(lastAlive) ? lastAlive - birth : (oldest >= 0 ? oldest - birth : 0),
        founderShare: shares.get(founder) ?? 0,
        reproductions,
        extinct: alive === 0,
        extinctionTick: alive === 0 ? lastAlive : undefined,
      });
    }
    return out;
  }

  /** Number of founder lineages with at least one live descendant. */
  survivingLineages(liveOrganismIds: readonly string[]): number {
    const shares = this.founderShares(liveOrganismIds);
    return shares.size;
  }
}

/** Part 18 §18.2 — a founder lineage's derived observables. */
export interface LineageObservable {
  readonly founderId: string;
  /** Count of non-founder descendants (offspring reaching reproduction). */
  readonly descendants: number;
  /** Ticks between founder birth and last descendant death (0 if still alive). */
  readonly lineageSurvival: number;
  /** Fraction of the live population in this lineage. */
  readonly founderShare: number;
  readonly reproductions: number;
  readonly extinct: boolean;
  readonly extinctionTick?: number;
}
