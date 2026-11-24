// @ts-check
// The Sting Swarm's numbers that more than one file needs (the server brain, the browser renderer and the tests).
// Distances in blocks, speeds in blocks/s, times in ms unless the name says otherwise.

export const SWARM_PATH = 'sting_swarm';
export const SWARM = `creatures:${SWARM_PATH}`;
export const HONEY = 'creatures:wild_honey';
export const STINGER = 'creatures:swarm_stinger';
export const STING_EFFECT = 'creatures:swarm_sting';
export const STING_DAMAGE = 'creatures:swarm_sting';
export const SOUND_NAMES = ['buzz_idle', 'buzz_alarm', 'buzz_attack', 'sting', 'scatter', 'death'];
/** The full name of one of its sounds: swarm_buzz_idle, swarm_sting, ... */
export const sound = (name: string) => `creatures:swarm_${name}`;

/** The states the server sends as the mob's lasting pose (e.mob.setPose): the renderer shapes the swarm by it. */
export const POSES = Object.freeze(['idle', 'alarmed', 'attack', 'calm', 'flee']);

export const TUNING = Object.freeze({
  hover: 1.3, // blocks over the ground (the flowers) while it drifts
  sway: 0.25, // the slow rise and fall of its drifting height
  driftSpeed: 0.55, // its lazy wander over the meadow
  home: 6, // it drifts at most this far from where it was born
  alarmRange: 6, // a player this close (3D, in sight) alarms it: it tightens and rises, buzzing louder
  alarmHover: 2.1, // alarmed, it hangs higher
  provoke: 3, // a player this close while it is alarmed: it attacks
  alarmLeave: 9, // the player this far away for alarmForgetMs: it settles again
  alarmForgetMs: 2500,
  disturb: 8, // flowers broken this close to it (by a player): it attacks that player
  chaseSpeed: 4.4, // a sprinting player (5.6) can outrun it; a walking one (4.3) barely
  chaseAccel: 3.5, // 1/s: its inertia while chasing
  overlap: 1.25, // the swarm's centre this close to the player's chest: it is all over them
  stingEvery: 700, // ms between stings while it covers the player
  stingDamage: 1,
  venomEvery: 3, // every 3rd sting also adds a "Picada" level
  venomSeconds: 6,
  venomMax: 3,
  giveUp: 20, // the prey farther than this (or dead, creative, gone): it calms down
  attackMaxMs: 40000, // a chase never lasts longer than this
  waterSafeMs: 6000, // the prey stays under water this long: the swarm gives up and disperses
  waterHover: 1.6, // over the water surface, waiting
  fleeMs: 4000, // smoke / fire: it scatters and keeps away this long
  fleeSpeed: 4,
  smokeRadius: 2, // a fire / smoke source within this (cells around its centre) makes it flee
  smokeEveryMs: 1000,
  calmMs: 3000, // after giving up: back home, settling
  maxClimb: 4,
  hoverAccel: 2.2,
  scanDepth: 10,
  buzzEvery: Object.freeze({ idle: 2600, alarmed: 1300, attack: 1050, calm: 2000, flee: 1200 }), // ms between buzz bursts
  buzzHear: 14, // the idle buzz is only sent while a player is this close
});

/** The swarm's size on the server: one box for the whole cloud (the body the player hits). */
export const BOX = Object.freeze({ halfW: 0.75, height: 1.3, centre: 0.65 });
