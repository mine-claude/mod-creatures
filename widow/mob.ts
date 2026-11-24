// @ts-check
// The Dune Widow (Viúva das Dunas, creatures:dune_widow): a large sand-coloured arachnid of the desert that waits BURIED.
// Only its two eye stalks and its antennae stick out of the sand (no health bar, no name over it). A player who comes
// within a few blocks makes it ERUPT out of the sand, shoot its long jackknife palps out and PULL the player in, then
// STING with the tail: the sting hurts and poisons (damage over time). Badly hurt it BURROWS back into the sand, travels
// under it out of reach and resurfaces a few blocks away, buried again, to ambush once more.
//
// States (in e.mob.data.s; the class itself keeps nothing per mob):
//   hidden -> erupt -> grab -> fight <-> grab ; fight: sting when in reach
//   a hit while hidden -> erupt ; health <= burrowAt (at most maxBurrows times) -> burrow -> tunnel -> (moved) hidden
//   the prey gone -> burrow (in place) -> hidden
import { MobType } from '../mineclaude-sdk.js';
import { ANIM_FILE, MOB_PATH } from './anatomy.ts';
import DuneWidowModel from './model.ts';

export const TUNING = Object.freeze({
  notice: 4, noticeDy: 2.5, // blocks: a player this close (and not far above/below) feels the footsteps and wakes it
  eruptMs: 800, // the burst out of the sand before it acts
  grabMin: 1.6, grabReach: 5.5, // the palps strike a player between these distances...
  grabCdMs: 5000, // ...at most this often
  grabHitMs: 220, grabMs: 600, // the moment the hooks close (the pull) and the length of the grab
  pullMin: 4, pullMax: 10, pullPerBlock: 1.8, pullUp: 3.5, // the pull: blocks/s towards it (grows with the distance)
  stingReach: 1.9, stingEveryMs: 1400, stingDamage: 3, // the sting
  venomSeconds: 6, venomLevel: 1, // what the sting leaves in the blood
  chaseSpeed: 1.1, // multiplier of its speed while it closes in
  giveUp: 16, // the prey this far away (or dead, or in creative): it buries itself again
  burrowAt: 0.5, maxBurrows: 2, // the fraction of its health under which it digs in (at most this many times)
  burrowMs: 1000, tunnelMs: 2500, // the dig-in animation, then the time under the sand
  resurfaceMin: 4, resurfaceMax: 8, // how far from where it dug in it comes up
  rearmMs: 700, // just come up: it does not wake again before this
  healEveryMs: 2500, // buried: one point of health this often
});

// the effect and damage types it brings (registered by widow/index.ts)
export const VENOM = 'creatures:widow_venom';
export const STING_CAUSE = 'creatures:widow_sting';
export const SAND_PARTICLE = 'creatures:widow_sand';
export const CHITIN = 'creatures:chitin';
export const STINGER = 'creatures:widow_stinger';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const isSand = (name) => typeof name === 'string' && /(^|[:_])sand$/.test(name);
const isAir = (name) => name === null || name === undefined || name === 'mineclaude:air' || /(^|:)air$/.test(String(name));

/** The pull of the grab: a horizontal impulse from the player towards the mob, stronger the farther they are. */
export function pullVector(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
  const k = Math.min(TUNING.pullMax, Math.max(TUNING.pullMin, len * TUNING.pullPerBlock));
  return { x: (dx / len) * k, y: TUNING.pullUp, z: (dz / len) * k };
}

/**
 * Where to come up: a cell `resurfaceMin`..`resurfaceMax` blocks from `at` with sand under it and room for the body, the
 * first of a few tries at random angles (rnd in [0, 1)). null when none (it then comes up where it dug in).
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function resurfaceSpot(getBlock, at, rnd) {
  const fx = Math.floor(at.x), fy = Math.floor(at.y), fz = Math.floor(at.z);
  for (let i = 0; i < 12; i++) {
    const ang = rnd() * Math.PI * 2, r = TUNING.resurfaceMin + rnd() * (TUNING.resurfaceMax - TUNING.resurfaceMin);
    const x = Math.floor(at.x + Math.cos(ang) * r), z = Math.floor(at.z + Math.sin(ang) * r);
    if (x === fx && z === fz) continue;
    for (const dy of [0, 1, -1, 2, -2]) {
      const y = fy + dy;
      if (isSand(getBlock({ x, y: y - 1, z })) && isAir(getBlock({ x, y, z })) && isAir(getBlock({ x, y: y + 1, z }))) return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}

export default class DuneWidow extends MobType {
  name = 'Viúva das Dunas';
  emoji = '🦂';
  halfW = 0.7;
  height = 0.95;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // a desert animal: the sun is its home
  hp = 30;
  speed = 2.4;
  damage = 3; // the engine's number for a hostile; the sting itself is dealt by the brain (stingDamage)
  xp = 8;
  aiEvery = 1; // the grab and the sting are timed tick by tick
  knockbackTaken = 0.4; // a heavy body low on the sand
  // The ai's declared time budget (ms; the engine's default is 20). An ai cut for slowness falls back to the plain hostile
  // chase-and-hit for 5 s, which is exactly what this ambusher must never do (it would beat a player like a zombie instead
  // of waiting buried): the eruption's sound + sand burst on a loaded server spiked past 20 ms in the tests. Its ai is
  // a few comparisons per tick; this only buys headroom for those spikes.
  aiBudget = 100;
  model = DuneWidowModel;
  animations = ANIM_FILE;
  sound = 'widow_hiss'; // its voice: dry sand hissing through chitin (the ambient sound, and on every hit)
  drops = [[CHITIN, 1, 3], [STINGER, 0, 1, 0.35]];
  spawn;
  _sound = (name: string) => name; // the full name of one of its sounds (set by the constructor; `_` keeps it out of the engine's fields)

  /** @param {{ spawn: any[], sound: (name: string) => string }} env */
  constructor(env) {
    super();
    this.spawn = env.spawn;
    this._sound = env.sound;
  }

  // ------------------------------------------------------------------------------------------- state changes
  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    if (s === 'hidden') { m.setPose('buried'); m.setHealthBar(false); d.target = null; d.healAt = e.now + TUNING.healEveryMs; }
    else if (s === 'erupt') { m.setPose(null); m.setHealthBar(true); m.play('erupt'); this.#say(e, 'erupt'); this.#sand(e, 40); }
    else if (s === 'grab') { m.play('grab'); this.#say(e, 'grab'); d.pulled = false; d.grabAt = e.now; }
    else if (s === 'fight') m.setPose(null);
    else if (s === 'burrow') { m.setPose('submerged'); m.play('burrow'); this.#say(e, 'burrow'); this.#sand(e, 28); }
    else if (s === 'tunnel') { m.setPose('submerged'); m.setHealthBar(false); }
  }

  #say(e, name, volume = 1) {
    try { e.server?.playSound(this._sound(name), { mob: e.mob.id, radius: 18, volume }); } catch { /* a full sound budget is not an error */ }
  }

  #sand(e, count) {
    const p = e.mob.pos;
    try { e.world?.spawnParticles(SAND_PARTICLE, { x: p.x, y: p.y + 0.3, z: p.z }, { count }); } catch { /* the particle budget */ }
  }

  // the prey it still has: alive, in the world, not in creative, within reach of the chase
  #prey(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return flat(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  #getBlock(e) {
    return (pos) => { try { return e.world?.getBlock(pos) ?? null; } catch { return null; } };
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e): any {
    const m = e.mob, d = m.data;
    if (!d.s) this.#enter(e, 'hidden');
    const since = e.now - d.t;
    switch (d.s) {
      case 'hidden': {
        if (e.now < (d.rearm ?? 0)) return { stay: true };
        let best = null, bd = Infinity;
        for (const p of e.nearbyPlayers) {
          if (p.dead || p.creative || (p.room && p.room !== 'mundo')) continue;
          const pd = dist3(p.pos, m.pos);
          if (pd <= TUNING.notice && Math.abs(p.pos.y - m.pos.y) <= TUNING.noticeDy && pd < bd) { best = p; bd = pd; }
        }
        if (best) { d.target = best.id; this.#enter(e, 'erupt'); return { stay: true, look: best.pos }; }
        if (e.now >= (d.healAt ?? 0)) { d.healAt = e.now + TUNING.healEveryMs; if (m.health < m.maxHealth) m.heal(1); }
        return { stay: true };
      }
      case 'erupt': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'burrow'); d.relocate = false; return { stay: true }; }
        if (since < TUNING.eruptMs) return { stay: true, look: p.pos };
        return this.#engage(e, p);
      }
      case 'grab': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'burrow'); d.relocate = false; return { stay: true }; }
        if (!d.pulled && since >= TUNING.grabHitMs) {
          d.pulled = true;
          const r = flat(p.pos, m.pos);
          if (r <= TUNING.grabReach + 0.5) { // still within the palps' reach when the hooks close: pulled in
            const v = pullVector(p.pos, m.pos);
            try { if (p.push(v.x, v.y, v.z)) d.pulls = (d.pulls ?? 0) + 1; } catch { /* not a live player any more */ }
          }
        }
        if (since >= TUNING.grabMs) { this.#enter(e, 'fight'); return this.#fight(e, p); }
        return { stay: true, look: p.pos };
      }
      case 'fight': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'burrow'); d.relocate = false; return { stay: true }; }
        return this.#engage(e, p);
      }
      case 'burrow': {
        if (since >= TUNING.burrowMs) this.#enter(e, 'tunnel');
        return { stay: true };
      }
      case 'tunnel': {
        if (d.relocate === false) { this.#surface(e, null); return { stay: true }; } // only buried itself again where it was
        if (since < TUNING.tunnelMs) return { stay: true };
        const to = resurfaceSpot(this.#getBlock(e), m.pos, () => e.random());
        this.#surface(e, to);
        return { stay: true };
      }
      default: this.#enter(e, 'hidden'); return { stay: true };
    }
  }

  // back under the sand with only the stalks out, ready to ambush again (moved to `to` when there is one)
  #surface(e, to) {
    const m = e.mob, d = m.data;
    if (to) { try { if (m.teleport(to.x, to.y, to.z)) d.moved = (d.moved ?? 0) + 1; } catch { /* the cell changed under it */ } }
    d.relocate = undefined;
    this.#enter(e, 'hidden');
    d.rearm = e.now + TUNING.rearmMs;
    if (to) { this.#sand(e, 14); this.#say(e, 'hiss', 0.7); }
  }

  // awake and with prey: grab when it is at the palps' distance and the hooks are ready, else close in and sting
  #engage(e, p) {
    const m = e.mob, d = m.data, r = flat(p.pos, m.pos);
    if (r >= TUNING.grabMin && r <= TUNING.grabReach && e.now >= (d.grabReady ?? 0) && Math.abs(p.pos.y - m.pos.y) < 2.5 && e.canSee(p)) {
      d.grabReady = e.now + TUNING.grabCdMs;
      this.#enter(e, 'grab');
      return { stay: true, look: p.pos };
    }
    if (d.s !== 'fight') this.#enter(e, 'fight');
    return this.#fight(e, p);
  }

  #fight(e, p) {
    const m = e.mob, d = m.data, r = flat(p.pos, m.pos);
    if (r <= TUNING.stingReach && Math.abs(p.pos.y - m.pos.y) < 1.8 && e.now - (d.stungAt ?? -Infinity) >= TUNING.stingEveryMs && e.canSee(p)) {
      d.stungAt = e.now;
      this.#sting(e, p);
    }
    return { moveTo: p.pos, moveStop: TUNING.stingReach * 0.7, moveSpeed: TUNING.chaseSpeed, look: p.pos };
  }

  // the tail comes over the head and stabs: damage (armour and a raised shield count: it is a sting, not a curse) and,
  // when it went through, the venom
  #sting(e, p) {
    const m = e.mob, d = m.data;
    m.play('sting');
    this.#say(e, 'sting');
    const before = p.health;
    try { p.damage(TUNING.stingDamage, STING_CAUSE); } catch { return; }
    if (p.health < before && !p.dead) {
      try { p.addEffect(VENOM, TUNING.venomSeconds, TUNING.venomLevel); d.stings = (d.stings ?? 0) + 1; } catch { /* effect cap */ }
    }
  }

  // ------------------------------------------------------------------------------------------- hooks
  // under the sand nothing reaches it
  onHit(e) {
    if (e.mob?.data?.s === 'tunnel') e.cancel();
  }

  onHurt(e) {
    const m = e.mob, d = m.data;
    if (e.attacker) d.target = e.attacker.id;
    if (m.health <= 0) return;
    if (d.s === 'burrow' || d.s === 'tunnel') return;
    if (!d.s || d.s === 'hidden') { // stepped on or shot while it waited: found out
      if (e.attacker) { d.t = e.now; this.#enter(e, 'erupt'); }
      return;
    }
    if (m.health <= m.maxHealth * TUNING.burrowAt && (d.burrows ?? 0) < TUNING.maxBurrows) {
      d.burrows = (d.burrows ?? 0) + 1;
      d.relocate = true;
      this.#enter(e, 'burrow');
      return;
    }
    try { m.play('hurt'); } catch { /* no model data (a test double) */ }
    this.#say(e, 'hurt');
  }

  onDeath(e) {
    try { e.server?.playSound(this._sound('death'), e.mob.pos, { radius: 18 }); } catch { /* sound budget */ }
  }
}

export { MOB_PATH };
