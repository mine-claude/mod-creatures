// @ts-check
// The Root Serpent's numbers that more than one file needs (the server brain, the browser renderer, the tests).
// Distances in blocks, speeds in blocks/s, times in ms unless the name says otherwise.

export const SERPENT_PATH = 'root_serpent';
export const SERPENT = `creatures:${SERPENT_PATH}`;
export const BARK = 'creatures:living_bark';
export const COIL_EFFECT = 'creatures:serpent_coil';
export const BITE_CAUSE = 'creatures:serpent_bite';
export const SQUEEZE_CAUSE = 'creatures:serpent_squeeze';
export const SOIL_PARTICLE = 'creatures:serpent_soil';
export const SOUND_NAMES = ['slither', 'hiss', 'strike', 'squeeze', 'burrow', 'death'];
/** The full name of one of its sounds: serpent_slither, serpent_hiss, ... */
export const sound = (name: string) => `creatures:serpent_${name}`;

/** The body the browser draws (and the pure spine math lays out): segment count, spacing along the path, radii. */
export const BODY = Object.freeze({
  segments: 20, // 14..24 asked; 20 reads as long without costing too many ground queries
  spacing: 0.2, // blocks between segment centres, along the path
  neck: 0.3, // blocks from the head's point (the mob's position) back to the first segment
  headLift: 0.16, // the head's centre above the ground
  rMax: 0.165, rTip: 0.035, // radius just behind the head / at the tail's tip
  wavelength: 2.3, // the serpentine track's wavelength (blocks; fixed in space, so its frequency grows with speed)
  sink: 1.45, // how far under the surface the body travels while burrowed
});

export const TUNING = Object.freeze({
  notice: 12, // a player this close (3D) is hunted
  noticeDy: 5,
  giveUp: 20, // farther than this (or gone, dead, creative): it forgets them
  diveMs: 900, // the dive into the soil (it keeps moving forward, so the body follows the head down)
  divePace: 1.3,
  tunnelPace: 3.6, // under the surface, towards the prey
  tunnelMaxMs: 7000, // it comes up after this even if it did not get close
  surfaceAt: 2.4, // it comes up this close to the prey (horizontal)
  surfaceMs: 650, // bursting out: no strike before this
  rearMs: 520, // the head raised, the S-coil drawn back, before the lunge
  lungeMs: 260, lungePace: 7.5, // the lunge itself
  biteReach: 1.9, biteMaxDy: 1.8,
  biteDamage: 4, // moderate (armour and a raised shield count)
  recoverMs: 650, // after a strike (hit or miss)
  strikeEveryMs: 1800, // between strikes on the surface
  strikeRange: 3.2, // it rears when the prey is this close (horizontal) and in sight
  chaseSpeed: 1.0, // multiplier of its own speed while closing in on the surface
  reburrowAfter: 3, // strikes on the surface before it dives again to ambush from elsewhere
  // the constriction: after a bite from BEHIND (the player facing away) or on a player this low (health after the bite)
  lowHealth: 8,
  behindDot: -0.2, // the player's look . (player -> serpent) below this = facing away
  coilMs: 2000, // how long it squeezes
  coilHitMs: 600, // each hit by the coiled player takes this much off the rest
  coilMinMs: 250, // the coil ends at most this soon after the hit that broke it
  squeezeEveryMs: 500, squeezeDamage: 1,
  coilCdMs: 9000, // between two coils
  coilHold: 1.0, // the coiled player more than this far from it is pulled back (blocks)
  // fleeing
  fleeAt: 0.3, // under this fraction of its health it dives and flees under the ground
  fleeMs: 4500, fleePace: 3.8,
  calmMs: 15000, // after fleeing it does not hunt again for this long
  healEveryMs: 1500, // under the ground it heals one point this often
  // wandering
  wanderEveryMs: [2500, 5500],
  // sounds and particles
  soilEveryMs: 200, // the moving mound's puff of soil while it travels under the surface
  hissEveryMs: 2600,
  recueMs: 2000, // the persistent cues ('coil', 'burrowed') are re-sent this often for whoever comes into view late
});

/** Blocks it can dig into (forest and jungle floors): grass, dirt and their kin, from any mod. */
export const isDiggable = (name: unknown) => typeof name === 'string'
  && /(^|[:_])(grass|grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mud|moss_block|moss_carpet|mycelium|farmland)$/.test(name);
