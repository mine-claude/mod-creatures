// @ts-check
// The Ruin Colossus's numbers, shared by the server brain (mob.ts), the browser renderer (renderer.ts) and the tests.
// Pure data and tiny pure helpers: no game code, no SDK, nothing that reads the block tables (this file is reachable
// from the mod loader). Distances in blocks, speeds in blocks/s, times in ms unless the name says otherwise.

export const COLOSSUS_PATH = 'ruin_colossus';
export const COLOSSUS = `creatures:${COLOSSUS_PATH}`;
export const RUNE_CORE = 'creatures:rune_core';
export const ROCK = 'creatures:colossus_rock';
export const DUST = 'creatures:colossus_dust';
export const EMBER = 'creatures:colossus_ember';
export const SLAM_DAMAGE_TYPE = 'creatures:colossus_slam';

export const SOUND_NAMES = Object.freeze(['step', 'wake', 'slam', 'throw', 'crumble', 'hurt']);
/** A sound's full name: creatures:colossus_step, ... */
export const sound = (name: string) => `creatures:colossus_${name}`;

// The body (the engine's box: halfW 0.2..1.5, height 0.3..3).
export const BODY = Object.freeze({ halfW: 0.75, height: 2.8 });
export const DEATH_MS = 2900; // the crumble (the engine keeps a code-built body at most 3000 ms)

// Its states (e.mob.data.s on the server). What the browser must see rides as the mob's POSE, `<state>_<tier>`
// (e.mob.setPose, a code-built look takes any [a-z0-9_] name): the tier is how many plate tiers it has lost.
//   dormant -> wake -> walk -> (windup -> slam | lift -> hurl) -> walk ... ; nobody for a while -> settle -> dormant
export const STATES = Object.freeze(['dormant', 'wake', 'walk', 'windup', 'slam', 'lift', 'hurl', 'settle']);
export const poseName = (state: string, tier: number) => `${state}_${Math.max(0, Math.min(3, tier | 0))}`;
/** 'windup_2' -> { state: 'windup', tier: 2 }; anything else -> { state: null, tier: 0 }. */
export function parsePose(pose: string | null | undefined) {
  const m = typeof pose === 'string' ? /^([a-z]+)_([0-3])$/.exec(pose) : null;
  return m && STATES.includes(m[1]) ? { state: m[1], tier: Number(m[2]) } : { state: null, tier: 0 };
}

export const TUNING = Object.freeze({
  wakeRange: 6, // a player (not in creative) this close wakes it
  wakeMs: 2000, // rising from the kneel
  sight: 24, // it keeps a target this close
  giveUp: 30, // a target this far (or gone) is forgotten
  walkPace: 1.35, // its slow, heavy pursuit (blocks/s)
  slamRange: 2.9, // a target this close (horizontal, centre to centre) gets the slam
  windupMs: 800, // the telegraph: fists raised over the head
  slamRadius: 3.6, // the area hit by the slam (horizontal, from the impact point)
  slamMaxDy: 2.0, // and this high above/below its feet
  slamDamage: 9, // at the centre; falls to slamEdge at the rim
  slamEdge: 0.45,
  slamKnock: 11, // horizontal push (blocks/s) at the centre
  slamLift: 7, // and up
  slamReach: 1.3, // the impact point: this far ahead of its feet
  slamRecoverMs: 900, // fists in the ground, pulling them out
  slamCooldownMs: 1400,
  throwMin: 7, // a target farther than this (and in sight) gets a rock
  throwMax: 22,
  liftMs: 900, // tearing a chunk of rock out of its own back and raising it
  hurlRecoverMs: 600,
  throwCooldownMs: 3800,
  rockSpeed: 15,
  rockDamage: 6,
  rockError: 0.06,
  settleAfterMs: 12000, // no target for this long: it kneels back down
  settleMs: 1800,
});

// Health tiers: below each fraction of its health one more tier of stone plates breaks off (renderer: the plates of that
// tier fall as debris and the core shows). Armour: the fraction of a blow that gets through, by tier (all plates on:
// very little; the core bare: all of it).
export const TIER_AT = Object.freeze([0.75, 0.5, 0.25]);
export const ARMOR = Object.freeze([0.3, 0.45, 0.65, 1.0]);

/** The tier (0..3) for a health fraction: deterministic, monotonic, and exact at the thresholds (below = lost). */
export function tierFor(fraction: number) {
  const f = Number.isFinite(fraction) ? fraction : 1;
  let t = 0;
  for (const at of TIER_AT) if (f < at) t++;
  return t;
}
/** The damage that gets through for a blow of `damage` at `tier`. */
export const armored = (damage: number, tier: number) => damage * ARMOR[Math.max(0, Math.min(3, tier | 0))];

/** The slam's damage and push for a player `dist` blocks (horizontal) from the impact point; null = outside the radius. */
export function slamFalloff(dist: number) {
  if (!(dist >= 0) || dist > TUNING.slamRadius) return null;
  const k = 1 - dist / TUNING.slamRadius; // 1 at the centre, 0 at the rim
  return {
    damage: Math.max(1, Math.round(TUNING.slamDamage * (TUNING.slamEdge + (1 - TUNING.slamEdge) * k))),
    knock: TUNING.slamKnock * (0.45 + 0.55 * k),
    lift: TUNING.slamLift * (0.6 + 0.4 * k),
  };
}
