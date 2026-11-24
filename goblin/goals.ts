// @ts-check
// The goblin's behaviour as Goals (server only; per-mob state in e.mob.data, the goal objects keep nothing):
//   1. GoblinFleeGoal      — a goblin whose band is gone (it had company, now none within BAND_RADIUS) or that carries
//                            loot runs from the nearest player;
//   2. GoblinStealGoal     — a dropped item nearby (and no player on top of it): go and pick it up (e.mob.pickUp);
//   3. GoblinSkirmishGoal  — a player in sight: keep THROW_MIN..THROW_MAX blocks away and throw pebbles; closer, back off;
//                            cornered (too close, or no room behind) it stabs in melee;
//   4. WanderGoal          — otherwise it strolls.
// The throw and the stab send a cue (e.mob.cue) so the browser plays the arm motion; the pebble leaves after the wind-up.
import { Goal } from '../mineclaude-sdk.js';

export const GOBLIN = 'creatures:goblin';
export const PEBBLE_PROJECTILE = 'creatures:goblin_pebble';
export const SOUNDS = Object.freeze({ chatter: 'creatures:goblin_chatter', throw: 'creatures:goblin_throw', hurt: 'creatures:goblin_hurt', death: 'creatures:goblin_death' });
export const BAND_RADIUS = 16;
export const SIGHT = 20; // sharp-eyed: it notices you from farther than it throws
export const THROW_MIN = 4, THROW_MAX = 10; // blocks (horizontal): the throwing band
export const CORNERED = 2.2; // closer than this it stabs
export const THROW_EVERY = [1.7, 2.6]; // s between throws (drawn)
export const THROW_WINDUP = 0.3; // s from the cue to the pebble leaving the hand (the browser's release)
export const STEAL_RADIUS = 8, STEAL_REACH = 1.3, THIEF_SIGHT = 24; // a thief keeps running from anyone this close
export const PEBBLE = { speed: 15, damage: 2, error: 0.08 };

const horiz = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const away = (from, to) => { const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };

/** The goblins of its band near it (other goblins within BAND_RADIUS), remembered as the most it ever had. */
// Counted every BAND_EVERY s (the ai runs every tick; the count is a scan of the mobs near it).
export const BAND_EVERY = 0.5;
export function bandState(e) {
  const d = e.mob.data;
  d.bandT = (d.bandT ?? 0) - e.dt;
  if (d.bandT <= 0 || d.mates === undefined) {
    d.bandT = BAND_EVERY;
    d.mates = e.mobsNear(BAND_RADIUS).filter((o) => o.name === GOBLIN && !o.dead).length;
    d.peak = Math.max(d.peak ?? 0, d.mates);
  }
  return { mates: d.mates, alone: d.mates === 0 && d.peak >= 1 };
}

// a target worth bothering: alive, not in creative
const nearestTarget = (e, range) => {
  const p = e.nearestPlayer(range, 8);
  return p && !p.creative && !p.dead ? p : null;
};

// The direction to run (away from `p`), turned aside when the body would not fit that way (a wall behind).
function escape(e, p) {
  let [x, z] = away(p.pos, e.mob.pos);
  if (!e.fits(x * 1.2, z * 1.2)) {
    for (const [ax, az] of [[-z, x], [z, -x]]) if (e.fits(ax * 1.2, az * 1.2)) { [x, z] = [ax, az]; break; }
  }
  return [x, z];
}

export class GoblinFleeGoal extends Goal {
  canUse(e, mem) {
    const carrying = e.mob.carried.length > 0;
    const band = bandState(e);
    mem.band = band;
    if (!carrying && !band.alone) return false;
    mem.p = nearestTarget(e, carrying ? THIEF_SIGHT : 14);    return !!mem.p;
  }
  tick(e, mem) {
    const dir = escape(e, mem.p);
    e.mob.data.mode = 'flee';
    return { walk: dir, speed: 1.4 };
  }
}

export class GoblinStealGoal extends Goal {
  canUse(e, mem) {
    if (e.mob.carried.length >= 3) return false;
    const close = e.nearestPlayer(2.5, 3);
    if (close && !close.creative) return false; // someone is standing on it: fight first
    mem.item = e.itemsNear(STEAL_RADIUS).find((it) => it.item !== null) ?? null;
    return !!mem.item;
  }
  tick(e, mem) {
    const it = mem.item, d = Math.hypot(it.pos.x - e.mob.pos.x, it.pos.y - e.mob.pos.y, it.pos.z - e.mob.pos.z);
    e.mob.data.mode = 'steal';
    if (d <= STEAL_REACH) {
      const got = e.mob.pickUp(it.id);
      if (got) { e.server.playSound(SOUNDS.chatter, e.mob.pos, { radius: 16 }); return { stay: true }; }
    }
    return { walk: away(e.mob.pos, it.pos), speed: 1.3, look: it.pos };
  }
}

export class GoblinSkirmishGoal extends Goal {
  canUse(e, mem) {
    mem.p = nearestTarget(e, SIGHT);
    return !!mem.p;
  }
  tick(e, mem) {
    const p = mem.p, data = e.mob.data, me = e.mob.pos;
    const d = horiz(me, p.pos);
    data.cd = (data.cd ?? THROW_WINDUP + 0.6) - e.dt;
    data.scd = (data.scd ?? 0) - e.dt;
    // a throw that was wound up: the pebble leaves now
    if (data.windup !== undefined) {
      data.windup -= e.dt;
      if (data.windup <= 0) {
        delete data.windup;
        if (e.shoot(p, { projectile: PEBBLE_PROJECTILE, ...PEBBLE })) e.server.playSound(SOUNDS.throw, me, { radius: 16 });
      }
    }
    const [ux, uz] = away(me, p.pos);
    const roomBehind = e.fits(-ux * 1.2, -uz * 1.2);
    // cornered: stab
    if (d < CORNERED || (d < THROW_MIN && !roomBehind)) {
      data.mode = 'melee';
      if (d <= 1.8 && data.scd <= 0) { e.mob.cue('stab'); data.scd = 0.9; }
      return { keepCd: true, attack: { target: p, reach: 1.6, every: 0.9, knock: 4, speed: 1.15, nav: 'direct' } };
    }
    // too close for a throw: back off, facing them
    if (d < THROW_MIN) { data.mode = 'back'; return { look: p.pos, walk: [-ux, -uz], speed: 1.1 }; }
    // too far: close in
    if (d > THROW_MAX) { data.mode = 'close'; return { look: p.pos, walk: [ux, uz], speed: 1 }; }
    // the throwing band: sidestep now and then, and throw when the arm is ready and the line is clear
    data.mode = 'throw';
    data.side = data.side ?? (e.random() < 0.5 ? -1 : 1);
    data.sideT = (data.sideT ?? 0) - e.dt;
    if (data.sideT <= 0) { data.sideT = 1 + e.random() * 2; data.side = e.random() < 0.35 ? 0 : (e.random() < 0.5 ? -1 : 1); }
    if (data.cd <= 0 && data.windup === undefined && e.canSee(p)) {
      e.mob.cue('throw');
      data.windup = THROW_WINDUP;
      data.cd = THROW_EVERY[0] + e.random() * (THROW_EVERY[1] - THROW_EVERY[0]);
    }
    const s = data.side ?? 0;
    const walk = s && e.fits(-uz * s, ux * s) ? [-uz * s, ux * s] : [0, 0];
    return { look: p.pos, walk, speed: 0.7 };
  }
}
