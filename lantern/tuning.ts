// @ts-check
// The Lure Lantern's numbers that more than one file needs (the server brain, the browser renderer and the tests).
// Distances in blocks, speeds in blocks/s, times in ms unless the name says otherwise.

export const LANTERN_PATH = 'lure_lantern';
export const LANTERN = `creatures:${LANTERN_PATH}`;
export const GLAND = 'creatures:glow_gland';
export const SOUND_NAMES = ['hum', 'reveal', 'bite', 'death'];
/** The full name of one of its sounds: lantern_hum, lantern_reveal, lantern_bite, lantern_death. */
export const sound = (name: string) => `creatures:lantern_${name}`;

export const TUNING = Object.freeze({
  hover: 2.6, // blocks above the ground or the water it drifts over
  sway: 0.35, // the slow rise and fall of its drifting height (blocks)
  driftSpeed: 0.7, // the lazy wander
  notice: 5, // a player this close (3D) and in sight springs the trap
  revealMs: 650, // the body splits open, it hangs there a moment, then dives
  diveSpeed: 8.5,
  diveAccel: 7, // 1/s: how fast its velocity turns toward the dive (inertia)
  diveMaxMs: 1700, // a dive that never reaches the prey still ends
  biteReach: 1.5, biteMaxDy: 2.2, biteEvery: 1.2, knock: 4,
  retreatMs: 1300, retreatUp: 4.5, retreatAway: 3.5, // after a bite (or a miss): up and away
  stalkRadius: 4.5, stalkAbove: 3.2, stalkOrbit: 0.5, // rad/s around the prey while it waits
  diveEvery: [2200, 3400], // ms between dives
  diveRange: 10, // the prey must be this close (horizontal) and in sight for another dive
  giveUp: 18, // the prey this far away (or gone): the maw closes, it drifts again
  closeMs: 900,
  maxClimb: 5, // the fastest it rises or sinks while hovering
  hoverAccel: 2.5, // 1/s: how softly it settles toward its hover height (inertia)
  scanDepth: 12, // how far down it looks for ground or water
  recueMs: 2000, // re-sends 'open' this often while open, for whoever comes into view late
});
