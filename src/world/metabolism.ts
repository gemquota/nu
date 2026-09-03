// World plane — ProtoEvo complex-molecule metabolism.
//
// Cells run on two currencies: ENERGY (metabolic fuel, tick-to-tick survival)
// and COMPLEX MOLECULES (structural currency — the materials body parts are
// made of). A cell cannot build anything — nodes during development, upgrades
// to mature nodes, or the seed of an offspring — without molecules. Molecules
// are scarce and acquired four ways:
//   - BIOSYNTHESIS  : spend energy over time to manufacture molecules
//                     (ProtoEvo "create molecules from energy"),
//   - COLLECTION    : eating food/plants grants the molecules stored in them,
//   - SCAVENGING    : corpses carry the dead cell's leftover molecules,
//   - THEFT         : spike attacks rip molecules out of prey.
// All rates are deterministic constants — no RNG — so the economy is
// replayable with the rest of the world.

/** Molecules gained per resource unit eaten (plants, spores, old corpses). */
export const MOLECULES_PER_FOOD = 0.35;
/** Fraction of a dead cell's molecules left in its corpse for scavengers. */
export const CORPSE_MOLECULE_FRACTION = 0.6;
/**
 * Energy a scavenger digests from one corpse molecule (a corpse's molecular
 * body is edible biomass). Makes scavenging rewarding even when the dead cell
 * starved to zero energy.
 */
export const CORPSE_BIOMASS_ENERGY = 1.0;
/** Complex molecules a corpse loses per tick (molecules break down). */
export const CORPSE_MOLECULE_DECAY = 0.08;
/** Corpse energy lost per tick (an unconsumed corpse decomposes away). */
export const CORPSE_ENERGY_DECAY = 0.08;
/** Energy a cell must spend to synthesize one complex molecule. */
export const MOLECULE_SYNTH_ENERGY = 2;
/** Base rate of molecule synthesis per tick (scaled by metabolism gene). */
export const SYNTH_BASE_RATE = 0.07;
/** Floor: cells refuse to synthesize below this energy reserve. */
export const SYNTH_RESERVE_ENERGY = 38;
/** Storage: base molecules every cell can hold. */
export const MOL_STORAGE_BASE = 6;
/** Storage: molecules per surface node (nodes are molecular scaffolding). */
export const MOL_STORAGE_PER_NODE = 3;
/** Storage: molecules per unit of body biomass. */
export const MOL_STORAGE_PER_BIOMASS = 0.4;
/** Molecules the parent must spend to create an offspring's body (per node). */
export const NODE_MOLECULE_COST = 0.6;
/** Molecules per construction unit the developing cell pays as it builds. */
export const CONSTRUCTION_MOLECULE_COST = 0.35;
/** Molecules an offspring is seeded with to begin construction. */
export const OFFSPRING_SEED_MOLECULES = 3;
/** Molecules a founder is born with (mature, free to upgrade). */
export const FOUNDER_SEED_MOLECULES = 10;
/** Node upgrade economics. */
export const NODE_UPGRADE_MAX_LEVEL = 5;
export const NODE_UPGRADE_BASE_COST = 0.8;
export const NODE_UPGRADE_COST_PER_LEVEL = 0.6;
export const NODE_UPGRADE_MIN_ENERGY = 48;
/** Per-level sensory gain boost: gain × (1 + 0.25·level). */
export const NODE_GAIN_PER_LEVEL = 0.25;
/** Per-level spike damage boost: × (1 + 0.08 · summed spike levels). */
export const SPIKE_DAMAGE_PER_LEVEL = 0.08;

/** Molecule storage capacity of a cell (nodes + biomass scale the stores). */
export function moleculeCapacity(nodes: { length: number }, biomass: number): number {
  return MOL_STORAGE_BASE + MOL_STORAGE_PER_NODE * nodes.length + MOL_STORAGE_PER_BIOMASS * Math.max(0, biomass);
}

/** Construction molecule cost of a developing cell's full queue. */
export function constructionMoleculeCost(total: number): number {
  return total * CONSTRUCTION_MOLECULE_COST;
}

/** Molecules the parent must hold + spend to create an offspring body. */
export function reproductionMoleculeCost(nodeCount: number): number {
  return nodeCount * NODE_MOLECULE_COST;
}
