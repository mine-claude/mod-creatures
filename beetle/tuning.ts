// @ts-check
// The Crystal Beetle's numbers, shared by the server brain (mob.ts), the browser renderer (renderer.ts) and the tests.
// Pure data: no game code, no SDK, nothing that reads the block tables (this file is reachable from the mod loader).

export const BEETLE = 'creatures:crystal_beetle';
export const MOB_PATH = 'crystal_beetle';
export const SHARD = 'creatures:crystal_shard';

// Its states (e.mob.data.s on the server). The ones the browser must see ride as the mob's POSE (e.mob.setPose):
//   wander (no pose) -> curl -> roll -> flipped -> uncurl -> wander
export const POSES = Object.freeze({ curl: 'curl', roll: 'roll', flipped: 'flipped', uncurl: 'uncurl' });

export const TUNING = Object.freeze({
  sight: 10, // blocks: a player this close (and in sight) makes it curl up
  wanderSpeed: 0.6, // times its own speed: a slow, heavy stroll
  curlMs: 650, // curling into a ball before it rolls
  rollPace: 9, // blocks/s: the charge
  rollMaxMs: 2600, // a roll that never hits anything still ends (and leaves it dizzy on its back all the same)
  rollReach: 1.45, // blocks (horizontal, centre to centre): close enough to slam into the player
  rollKnock: 12, // knockback of the slam
  wallAhead: 0.55, // blocks ahead of its body that must be clear while rolling; not clear = it hits the wall
  stuckMs: 350, // rolling but not moving for this long = a wall it did not see coming (a step, a corner)
  flipMs: 3000, // stunned on its back: the window when the shell does not protect it
  uncurlMs: 700, // rolling back onto its legs
  rechargeMs: 1800, // after getting up, before it may curl again
  armor: 0.2, // fraction of the damage that gets through the shell (all of it while flipped)
  giveUp: 18, // blocks: a target this far is forgotten
});

// The body, in blocks: the ball it curls into (the renderer rolls it by distance / BALL_R) and the hitbox.
export const BODY = Object.freeze({ halfW: 0.5, height: 0.8, ballR: 0.42 });
export const DEATH_MS = 1600;
