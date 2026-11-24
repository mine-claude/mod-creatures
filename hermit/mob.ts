// @ts-check
// The Tide Hermit (creatures:tide_hermit, "Ermitão das Marés"): a big hermit crab of the beaches whose shell is a block of
// the world — when it first acts it takes over one of the blocks lying around it (SHELLS: stone and gravel of the shore,
// clay of the shallows, a crate from a wreck...) and that block's look rides its pose to every browser.
//
// A NEUTRAL scavenger. It scuttles SIDEWAYS from spot to spot along the waterline (sand next to water) and picks at the
// sand. It turns on a player who HITS it, or who TAKES something lying near it (an item within a few blocks vanishes with
// that player standing over it). Hostile, it closes in sideways — its body across its path, like a crab — and once close
// turns its claws on the player: the big claw SNAPS (a wind-up, then damage and a small knock up and back), the small claw
// PINCHES in between. Below 40% health it RETREATS into the shell: rooted, most of every blow stopped by the shell (it
// knocks and rocks), slowly mending; after a few seconds it PEEKS out (one eye first) and either resumes the fight or, if
// it already hid twice, scuttles off to the water.
//
// States in e.mob.data.s (the brain is shared by every hermit; each one's state lives in its own data):
//   forage -> hostile (hit / theft) -> retreat (health < 40%) -> peek -> hostile | flee -> forage
// The browser sees them in the POSE "h<shell>_<state>" (tuning.ts shellPose) and the cues 'snap' | 'pinch' | 'pick' |
// 'knock' (one-off motions).
import { MobType } from '../mineclaude-sdk.js';
import { BODY, CLAW, HERMIT_SOUNDS, MOB_PATH, SHELLS, SNAP_CAUSE, TUNING, hermitSound, shellPose } from './tuning.ts';
import { chooseShell, nearestWater, waterlineSpot } from './shore.ts';

export { HERMIT_SOUNDS };

const horiz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The yaw that walks the body SIDEWAYS along (wx, wz): the body's right side (or its left) leads. Of the two, the one
 * closest to the current yaw, so a crab that changes its mind does not spin round.
 */
export function sidewaysYaw(wx, wz, current = 0) {
  const right = Math.atan2(-wz, wx), left = Math.atan2(wz, -wx);
  return Math.abs(wrap(right - current)) <= Math.abs(wrap(left - current)) ? right : left;
}
/** The yaw that faces (dx, dz) (forward = (-sin yaw, -cos yaw)). */
export const facingYaw = (dx, dz) => Math.atan2(-dx, -dz);

export class TideHermit extends MobType {
  name = 'Ermitão das Marés';
  emoji = '🦀';
  halfW = BODY.halfW;
  height = BODY.height;
  behavior = /** @type {const} */ ('neutral');
  hp = 20;
  speed = 1.7;
  damage = 5; // the engine's number; the snap and the pinch are dealt by the brain
  xp = 6;
  aiEvery = 2; // the snap's wind-up is timed tick by tick (every 100 ms)
  // its first decision scans the blocks around it for its shell (a few hundred reads, once); the default 20 ms cut would
  // hand it to the plain neutral behaviour for 5 s on a loaded server. Every later call is well under 1 ms.
  aiBudget = 100;
  knockbackTaken = 0.35; // low and heavy with its shell
  sound = `${MOB_PATH}_scuttle`; // its voice: clicky legs on the sand
  drops = [[CLAW, 1, 2]];
  spawn;

  /** @param {{ spawn: any[] }} env */
  constructor(env) {
    super();
    this.spawn = env.spawn;
  }

  // ------------------------------------------------------------------------------------------- state changes
  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    m.setPose(shellPose(d.shell ?? 0, s));
    if (s === 'forage') { d.goal = null; d.sub = 'walk'; d.goalAt = e.now; }
    else if (s === 'hostile') { d.snapAt = null; }
    else if (s === 'retreat') { d.retreats = (d.retreats ?? 0) + 1; d.healAt = e.now + TUNING.healEveryMs; d.snapAt = null; this.#say(e, 'retreat'); }
    else if (s === 'peek') { /* the eyes come out first: the renderer's timeline */ }
    else if (s === 'flee') {
      // the water (it swims off), or straight away from whoever drove it out when the sea is too far
      d.goal = nearestWater(this.#getBlock(e), m.pos, TUNING.fleeWaterScan);
      d.fleeFrom = { x: m.pos.x, y: m.pos.y, z: m.pos.z, water: !!d.goal }; // where it set off (read by the tests)
      const p = d.goal ? null : this.#target(e);
      if (!d.goal && p) { const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, len = Math.hypot(dx, dz) || 1; d.goal = { x: m.pos.x + dx / len * 10, y: m.pos.y, z: m.pos.z + dz / len * 10 }; }
      this.#say(e, 'scuttle', 0.8);
    }
  }

  #say(e, name, volume = 1) {
    try { e.server?.playSound(hermitSound(name), { mob: e.mob.id, radius: 18, volume }); } catch { /* a full sound budget is not an error */ }
  }

  #cue(e, name) { try { e.mob.cue(name); } catch { /* a test double */ } }

  #getBlock(e) {
    return (pos) => { try { return e.world?.getBlock(pos) ?? null; } catch { return null; } };
  }

  // the target it still has: alive, in the world, not in creative, not too far
  #target(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return horiz(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  // Theft: an item it saw lying within theftRadius (in the last theftMemoryMs) is gone from the ground now, with a player
  // standing over where it was. "Gone" is checked against everything within ITEMS_NEAR's wider radius, so an item it just
  // walked away from is not mistaken for a stolen one.
  #theft(e) {
    const m = e.mob, d = m.data;
    let all = [];
    try { all = e.itemsNear(TUNING.theftLookRadius); } catch { all = []; }
    const here = new Set(all.map((it) => it.id));
    let thief = null;
    const kept = [];
    for (const rec of d.items ?? []) {
      const [id, x, y, z, seen] = rec;
      if (here.has(id)) { if (e.now - seen <= TUNING.theftMemoryMs) kept.push(rec); continue; }
      for (const p of e.nearbyPlayers) {
        if (p.dead || p.creative) continue;
        if (Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z) <= TUNING.theftPlayerReach) { thief = p; break; }
      }
      if (thief) break;
    }
    // what it sees close by now refreshes its memory
    for (const it of all) {
      if (Math.hypot(it.pos.x - m.pos.x, it.pos.y - m.pos.y, it.pos.z - m.pos.z) > TUNING.theftRadius) continue;
      const i = kept.findIndex((r) => r[0] === it.id);
      const rec = [it.id, it.pos.x, it.pos.y, it.pos.z, e.now];
      if (i >= 0) kept[i] = rec; else kept.push(rec);
    }
    d.items = kept.slice(-8);
    return thief;
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e): any {
    const m = e.mob, d = m.data;
    if (d.shell === undefined) {
      const info: any = {};
      d.shell = chooseShell(this.#getBlock(e), m.pos, () => e.random(), info);
      d.shellFrom = info.from; d.shellSeen = info.seen; // where it came from (read by the tests)
    }
    if (!d.s) this.#enter(e, 'forage');
    const since = e.now - d.t;
    switch (d.s) {
      case 'forage': {
        const thief = this.#theft(e);
        if (thief && e.now >= (d.calmUntil ?? 0)) { d.target = thief.id; d.why = 'theft'; this.#enter(e, 'hostile'); return this.#hostile(e, thief); }
        return this.#forage(e);
      }
      case 'hostile': {
        const p = this.#target(e);
        if (!p) { d.target = null; this.#enter(e, 'forage'); return { stay: true }; }
        return this.#hostile(e, p);
      }
      case 'retreat': {
        if (e.now >= (d.healAt ?? 0)) { d.healAt = e.now + TUNING.healEveryMs; if (m.health < m.maxHealth) m.heal(1); }
        if (since >= TUNING.retreatMs) this.#enter(e, 'peek');
        return { stay: true };
      }
      case 'peek': {
        if (since < TUNING.peekMs) return { stay: true };
        const p = this.#target(e);
        if ((d.retreats ?? 0) >= TUNING.maxRetreats) this.#enter(e, 'flee');
        else if (p) this.#enter(e, 'hostile');
        else this.#enter(e, 'forage');
        return { stay: true };
      }
      case 'flee': {
        const goal = d.goal;
        if (!goal || since > TUNING.fleeMs || horiz(goal, m.pos) < 0.8) {
          d.target = null; d.calmUntil = e.now + TUNING.calmMs;
          this.#enter(e, 'forage');
          return { stay: true };
        }
        return this.#walkTo(e, goal, TUNING.fleeSpeed);
      }
      default: this.#enter(e, 'forage'); return { stay: true };
    }
  }

  // sideways towards a point
  #walkTo(e, goal, speed) {
    const m = e.mob, dx = goal.x - m.pos.x, dz = goal.z - m.pos.z, len = Math.hypot(dx, dz) || 1;
    const wx = dx / len, wz = dz / len;
    return { walk: [wx, wz], speed, yaw: sidewaysYaw(wx, wz, m.yaw ?? 0) };
  }

  // foraging: walk to a spot on the waterline, pick at the sand there, pick another
  #forage(e) {
    const m = e.mob, d = m.data;
    if (d.sub === 'pick') {
      const since = e.now - d.goalAt;
      if (since >= TUNING.pickMs) { d.sub = 'walk'; d.goal = null; d.goalAt = e.now; }
      else {
        if (since >= TUNING.pickMs * 0.5 && !d.picked2) { d.picked2 = true; this.#cue(e, 'pick'); }
        return { stay: true };
      }
    }
    if (!d.goal || e.now - d.goalAt > TUNING.forageTimeoutMs) {
      d.goal = waterlineSpot(this.#getBlock(e), m.pos, TUNING.waterlineScan, () => e.random());
      if (!d.goal) { const a = e.random() * Math.PI * 2, r = 2 + e.random() * 3; d.goal = { x: m.pos.x + Math.cos(a) * r, y: m.pos.y, z: m.pos.z + Math.sin(a) * r }; }
      d.goalAt = e.now;
      if (e.random() < 0.35) this.#say(e, 'scuttle', 0.6);
    }
    if (horiz(d.goal, m.pos) < 0.6) {
      d.sub = 'pick'; d.goalAt = e.now; d.picked2 = false; d.picks = (d.picks ?? 0) + 1;
      this.#cue(e, 'pick');
      return { stay: true };
    }
    return this.#walkTo(e, d.goal, TUNING.forageSpeed);
  }

  // hostile: sideways until close, then claws to the player — a big snap now and then, quick pinches between
  #hostile(e, p) {
    const m = e.mob, d = m.data;
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, r = Math.hypot(dx, dz) || 1e-6;
    // a snap that was wound up lands (or misses) now
    if (d.snapAt && e.now >= d.snapAt) {
      d.snapAt = null; d.lastSnap = e.now;
      this.#say(e, 'snap');
      if (r <= TUNING.snapReach + 0.3 && Math.abs(p.pos.y - m.pos.y) < 1.8) {
        const before = p.health;
        try { p.damage(TUNING.snapDamage, SNAP_CAUSE); } catch { /* not a live player any more */ }
        if (p.health < before) {
          d.snaps = (d.snaps ?? 0) + 1;
          try { if (p.push((dx / r) * TUNING.snapKnock, TUNING.snapLift, (dz / r) * TUNING.snapKnock) !== false) d.pushes = (d.pushes ?? 0) + 1; } catch { /* gone */ }
        }
      }
    }
    if (r > TUNING.faceAt) {
      d.sideways = (d.sideways ?? 0) + 1; // ticks spent closing in sideways (read by the tests)
      const out = this.#walkTo(e, p.pos, TUNING.approachSpeed);
      return out;
    }
    const yaw = facingYaw(dx, dz);
    if (!d.snapAt && e.now - (d.lastSnap ?? -Infinity) >= TUNING.snapEveryMs && r <= TUNING.snapReach && e.canSee(p)) {
      d.snapAt = e.now + TUNING.snapWindupMs;
      this.#cue(e, 'snap');
    } else if (!d.snapAt && r <= TUNING.pinchReach && e.now - (d.lastPinch ?? -Infinity) >= TUNING.pinchEveryMs && e.now - (d.lastSnap ?? -Infinity) > 400 && e.canSee(p)) {
      d.lastPinch = e.now;
      this.#cue(e, 'pinch');
      this.#say(e, 'pinch', 0.7);
      const before = p.health;
      try { p.damage(TUNING.pinchDamage, SNAP_CAUSE); } catch { /* gone */ }
      if (p.health < before) d.pinches = (d.pinches ?? 0) + 1;
    }
    // close: it shuffles to keep the player at claw's length, facing them
    const want = r > 1.3 ? 1 : r < 0.9 ? -1 : 0;
    return { walk: [(dx / r) * want, (dz / r) * want], speed: 0.5, yaw };
  }

  // ------------------------------------------------------------------------------------------- hooks
  // Inside the shell, the shell takes the blow: only TUNING.armor of it gets through, and it knocks (and rocks).
  onHit(e) {
    const d = e.mob?.data;
    if (d?.s !== 'retreat') return;
    e.damage = Math.min(100, e.damage * TUNING.armor);
    d.knocks = (d.knocks ?? 0) + 1;
    this.#cue(e, 'knock');
    this.#say(e, 'knock');
  }

  onHurt(e) {
    const m = e.mob, d = m.data;
    if (e.attacker) d.target = e.attacker.id;
    if (m.health <= 0 || d.s === 'retreat' || d.s === 'peek') return;
    if (m.health <= m.maxHealth * TUNING.retreatAt) {
      if ((d.retreats ?? 0) < TUNING.maxRetreats) { this.#enter(e, 'retreat'); return; }
      if (d.s !== 'flee') { this.#enter(e, 'flee'); return; }
    }
    if (e.attacker && (d.s === 'forage' || d.s === 'flee' || !d.s)) { d.why = 'hit'; d.calmUntil = 0; this.#enter(e, 'hostile'); }
  }

  // The drops: the claws (the class's `drops`) and, sometimes, the block its shell was made of.
  onDeath(e) {
    try { e.server?.playSound(hermitSound('death'), e.mob.pos, { radius: 18 }); } catch { /* sound budget */ }
    const d = e.mob?.data ?? {};
    const name = SHELLS[d.shell ?? -1];
    const chance = typeof d.shellDrop === 'number' ? d.shellDrop : TUNING.shellDropChance;
    if (name && Array.isArray(e.drops) && Math.random() < chance) e.drops.push({ item: name, n: 1 });
  }
}
