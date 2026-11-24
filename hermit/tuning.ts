// @ts-check
// The Tide Hermit's numbers and wire format, shared by the server brain (mob.ts), the browser renderer (renderer.ts) and
// the tests. Pure data: no game code, no SDK, nothing that reads the block tables (this file is reachable from the mod
// loader, which evaluates it before the blocks are registered).

export const HERMIT = 'creatures:tide_hermit';
export const MOB_PATH = 'tide_hermit';
export const CLAW = 'creatures:hermit_claw';
export const SNAP_CAUSE = 'creatures:hermit_snap';

// The blocks its shell may be made of. A hermit takes over a block it finds near where it is born (a beach: stone and
// gravel from the shore, clay from the shallows, a crate washed up from a wreck...). The ORDER IS THE WIRE FORMAT: the
// pose carries the index (shellPose below), so a new kind is APPENDED, never inserted. A name that no loaded mod
// registers is simply never found nearby (the client draws such an index as the first entry).
export const SHELLS = Object.freeze([
  'mineclaude:stone',
  'mineclaude:cobblestone',
  'mineclaude:gravel',
  'mineclaude:clay',
  'mineclaude:chest', // the "crate" of a wreck
  'mineclaude:planks', // driftwood
  'mineclaude:bricks',
  'mineclaude:sand',
  'mineclaude:ancient_stone',
  'mineclaude:log',
  // appended for its home, the Costa de Corais (mods/biomes/coral_coast): the reef's cube corals and the palm and driftwood
  // of the beach. Without the biomes mod these names are never found nearby, so the draw is the same as before.
  'biomes:coral_block',
  'biomes:brain_coral_block',
  'biomes:driftwood',
  'biomes:palm_log',
  // appended for the worlds that grow NATURAL trunks (terrain 2: docs/modding.md §5.1): the same logs, drawn in 3D
  'mineclaude:tree_log',
  'biomes:palm_tree_log',
]);
/** How much a block found near the spawn spot counts for (per cell, capped at SHELL_SCAN.capPerKind cells). */
export const SHELL_WEIGHT = Object.freeze({
  'mineclaude:stone': 1, 'mineclaude:cobblestone': 1.4, 'mineclaude:gravel': 1, 'mineclaude:clay': 1.2, 'mineclaude:chest': 10,
  'mineclaude:planks': 2, 'mineclaude:bricks': 2, 'mineclaude:sand': 0.05, 'mineclaude:ancient_stone': 3, 'mineclaude:log': 1.5,
  'biomes:coral_block': 3, 'biomes:brain_coral_block': 3, 'biomes:driftwood': 4, 'biomes:palm_log': 1.5,
  'mineclaude:tree_log': 1.5, 'biomes:palm_tree_log': 1.5,
});
/** Nothing of the list nearby (a hermit summoned in the middle of nowhere): what the sea leaves on any beach. */
export const SHELL_FALLBACK = Object.freeze(['mineclaude:stone', 'mineclaude:cobblestone', 'mineclaude:planks', 'mineclaude:chest']);
export const SHELL_SCAN = Object.freeze({ radius: 5, below: 3, above: 2, capPerKind: 10 });

// Its states (e.mob.data.s on the server). The browser sees them as the mob's POSE, which also carries the shell:
//   "h<shell index>_<state>"  (e.g. "h4_forage": a crate shell, foraging) — any [a-z0-9_] name up to 24 characters
//   rides every `mobs` entry (protocol 98), so the shell reaches whoever walks in later without a new message field.
export const STATES = Object.freeze(['forage', 'hostile', 'retreat', 'peek', 'flee']);
export const shellPose = (shell: number, state: string) => `h${shell | 0}_${state}`;
/** The pose back into { shell, state }; null when it is not one of ours (no pose yet, someone else's name). */
export function parsePose(pose: string | null | undefined) {
  if (typeof pose !== 'string') return null;
  const m = /^h(\d{1,3})_([a-z]+)$/.exec(pose);
  if (!m) return null;
  const shell = Number(m[1]);
  if (!(shell >= 0 && shell < SHELLS.length) || !STATES.includes(m[2])) return null;
  return { shell, state: m[2] };
}

export const TUNING = Object.freeze({
  // foraging (neutral): it scuttles between spots on the waterline and picks at the sand
  waterlineScan: 8, // blocks around it searched for "sand next to water"
  forageSpeed: 0.75, // times its own speed
  pickMs: 1600, // standing at a spot, picking
  forageTimeoutMs: 7000, // a spot it cannot reach in this long is given up
  theftRadius: 4, // an item near it that vanishes with a player standing over it: something was TAKEN
  theftPlayerReach: 2.2,
  theftMemoryMs: 3000, theftLookRadius: 12, // it remembers an item it saw for this long; gone = not within this radius
  // hostile: sideways approach, then the claws
  giveUp: 16, // blocks: a target this far is forgotten
  faceAt: 2.1, // blocks: closer than this it turns its claws to the player instead of walking sideways
  approachSpeed: 1.0,
  snapReach: 2.3, snapEveryMs: 1900, snapWindupMs: 260, snapDamage: 5, snapKnock: 3.2, snapLift: 1.6,
  pinchReach: 1.9, pinchEveryMs: 650, pinchDamage: 1.5,
  // retreat: below this fraction of its health it pulls into the shell
  retreatAt: 0.4,
  retreatMs: 4200, // rooted in the shell
  peekMs: 1300, // the peek out before it acts again
  maxRetreats: 2, // after this many it peeks and runs for the water instead
  armor: 0.12, // fraction of a blow that gets through the shell while it is inside
  healEveryMs: 700, // inside: one point of health this often
  fleeSpeed: 1.25, fleeMs: 7000, fleeWaterScan: 16, // blocks searched for the sea when it runs
  calmMs: 9000, // after fleeing, back to foraging
  shellDropChance: 0.35, // the block of its shell falls with it this often
});

// The body, in blocks: the hitbox and the rig the renderer and the gait share.
export const BODY = Object.freeze({ halfW: 0.55, height: 1.0 });
export const DEATH_MS = 1800;
export const HERMIT_SOUNDS = Object.freeze(['scuttle', 'snap', 'pinch', 'knock', 'retreat', 'death']);
export const hermitSound = (name: string) => `creatures:${MOB_PATH}_${name}`;
