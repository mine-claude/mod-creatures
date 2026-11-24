// @ts-check
import { MobType } from '../mineclaude-sdk.js';
import { MOB_PATH } from './anatomy.ts';
import MossLurkerModel from './lurker-model.ts';
import { forestFloor, inOpenOverworld } from './spawn.ts';
import { HOME, HOME_GROUND, homeRules } from './biome-homes.ts';

// The Moss Lurker (Espreitador do Musgo): a forest ambusher. It lies flat on the forest floor looking like a mossy mound
// (no health bar, no name over it), springs up when a player comes close and in sight, leaps at them and bites. Every
// hit makes it dart back before it comes again; badly hurt it runs for the trees and, once nobody follows, lies down and
// becomes a mound again, healing slowly while it waits.
//
// States (kept in e.mob.data.s, one mob at a time; the goal object is shared by every lurker):
//   hidden -> reveal -> (leap | stalk) <-> leap ; any hit -> dart -> stalk ; low health -> flee -> settle -> hidden
//   stalk/dart with the prey gone or far -> settle -> hidden
export const TUNING = Object.freeze({
  notice: 5, // blocks: a player this close (and in sight) springs the ambush
  revealMs: 750, // standing up before it moves
  leapMin: 2.2, leapMax: 6.5, // the distances it leaps from
  leapUp: 7.5, // blocks/s up at take-off
  leapCdMs: 3500,
  leapMaxMs: 1400, // a leap that never lands still ends
  biteReach: 1.5, biteEvery: 1.1, knock: 5, chaseSpeed: 1.25,
  giveUp: 20, // the prey this far away: it gives up and hides again
  dartMs: 1200, dartSpeed: 1.6, // the step back after a hit
  fleeAt: 0.4, // fraction of its health under which it runs and hides
  fleeSpeed: 1.7, lostMs: 2500, safe: 14, // out of sight this long, this far away = lost
  hideMs: 1000, // the hide animation
  healEveryMs: 2000, // while disguised: one point of health this often
});
const GRAVITY = 28; // blocks/s² (the engine's mob gravity)

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export default class MossLurker extends MobType {
  name = 'Espreitador do Musgo';
  emoji = '🌿';
  halfW = 0.6;
  height = 0.9;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // a forest animal: the sun does not hurt it
  hp = 22;
  speed = 2.6;
  damage = 4;
  aiEvery = 1; // the leap is timed tick by tick
  knockbackTaken = 0.6;
  model = MossLurkerModel;
  animations = `models/${MOB_PATH}.animation.json`;
  sound = `${MOB_PATH}_rustle`; // its voice: moss and dry leaves shifting (the ambient sound, and on every hit)
  drops = [['creatures:moss_hide', 1, 2]];
  spawn;
  _sound = (name: string) => name; // the full name of one of its sounds (set by the constructor; `_` keeps it out of the engine's fields)

  /** @param {{ getBlock: (pos: { x: number, y: number, z: number }) => string | null, sound: (name: string) => string }} env */
  constructor(env) {
    super();
    const test = forestFloor(env.getBlock);
    this._sound = env.sound;
    // On the grass of a forest floor, under the canopy: more at night (its own rule) than by day (a named condition of
    // the 'day' situation, since a hostile mob's own rules are for the night). At most 2 / 1 of them near a player.
    this.spawn = [
      { when: 'night', weight: 12, cap: 2, ground: ['mineclaude:grass'], test },
      { when: 'creatures:forest_day', weight: 4, cap: 1, ground: ['mineclaude:grass'], test },
      // home: the Floresta Musgosa (biome worlds only; elsewhere these never match and the draw is the old one)
      ...homeRules(HOME.mossy_forest, HOME_GROUND.mossy_forest, [
        { when: 'night', weight: 40, cap: 3, test: inOpenOverworld },
        { when: 'creatures:home_day', weight: 16, cap: 2, test: inOpenOverworld },
      ]),
      // second home: the Bosque de Cogumelos Gigantes, where a mossy mound among the mushroom stems is just one more lump of
      // the floor; a little less than in the mossy forest (its real home), mostly at night under the caps
      ...homeRules(HOME.mushroom_grove, HOME_GROUND.mushroom_grove, [
        { when: 'night', weight: 30, cap: 3, test: inOpenOverworld },
        { when: 'creatures:home_day', weight: 10, cap: 1, test: inOpenOverworld },
      ]),
    ];
  }

  // ------------------------------------------------------------------------------------------- state changes
  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    if (s === 'hidden') { m.setPose('disguised'); m.setHealthBar(false); d.target = null; d.healAt = e.now + TUNING.healEveryMs; }
    else if (s === 'reveal') { m.setPose(null); m.setHealthBar(true); m.play('reveal'); this.#say(e, 'hiss'); }
    else if (s === 'stalk') m.setPose('stalk');
    else if (s === 'leap') { m.setPose(null); m.play('leap'); this.#say(e, 'leap'); }
    else if (s === 'dart' || s === 'flee') m.setPose(null);
    else if (s === 'settle') { m.play('hide'); m.setPose('disguised'); m.setHealthBar(false); this.#say(e, 'rustle'); }
  }

  #say(e, name, volume = 1) {
    try { e.server?.playSound(this._sound(name), { mob: e.mob.id, radius: 16, volume }); } catch { /* a full sound budget is not an error */ }
  }

  // the prey it still has: alive, in the world, not in creative, within reach of the chase
  #prey(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return dist(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  #grounded(e) {
    const { x, y, z } = e.mob.pos;
    return Math.abs(e.mob.velocity.y) < 0.5 && e.solidAt(x, y - 0.1, z);
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e) {
    const m = e.mob, d = m.data;
    if (!d.s) this.#enter(e, 'hidden');
    const since = e.now - d.t;
    switch (d.s) {
      case 'hidden': {
        let best = null, bd = Infinity;
        for (const p of e.nearbyPlayers) {
          if (p.dead || p.creative) continue;
          const pd = dist3(p.pos, m.pos);
          if (pd <= TUNING.notice && pd < bd && e.canSee(p)) { best = p; bd = pd; }
        }
        if (best) { d.target = best.id; this.#enter(e, 'reveal'); return { walk: [0, 0], look: best.pos }; }
        if (e.now >= (d.healAt ?? 0)) { d.healAt = e.now + TUNING.healEveryMs; if (m.health < m.maxHealth) m.heal(1); }
        return { stay: true };
      }
      case 'reveal': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'settle'); return { stay: true }; }
        if (since < TUNING.revealMs) return { walk: [0, 0], look: p.pos };
        return this.#engage(e, p);
      }
      case 'leap': {
        const p = this.#prey(e);
        const landed = since > 250 && this.#grounded(e);
        if (landed || since > TUNING.leapMaxMs) { this.#enter(e, p ? 'stalk' : 'settle'); return p ? this.#chase(e, p) : { stay: true }; }
        const [wx, wz] = d.dir;
        const out: any = { walk: [wx, wz], pace: d.pace, look: { x: m.pos.x + wx, y: m.pos.y, z: m.pos.z + wz } };
        if (since === 0 || !d.launched) { d.launched = true; out.jump = TUNING.leapUp; }
        if (p) Object.assign(out, { attack: { target: p, nav: 'none', reach: TUNING.biteReach + 0.3, every: TUNING.biteEvery, knock: TUNING.knock + 2 } });
        if (p) this.#biteAnim(e, p);
        return out;
      }
      case 'stalk': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'settle'); return { stay: true }; }
        return this.#engage(e, p);
      }
      case 'dart': {
        const p = this.#prey(e);
        if (since > TUNING.dartMs) { if (p) { this.#enter(e, 'stalk'); return this.#chase(e, p); } this.#enter(e, 'settle'); return { stay: true }; }
        return this.#away(e, p, TUNING.dartSpeed);
      }
      case 'flee': {
        const id = d.target, p = id === null || id === undefined ? null : e.player(id);
        const near = p && !p.dead && dist(p.pos, m.pos) < TUNING.safe;
        if (near && e.canSee(p)) d.seen = e.now;
        const lost = !p || p.dead || (!near && e.now - (d.seen ?? 0) > TUNING.lostMs) || dist(p.pos, m.pos) > TUNING.giveUp;
        if (lost) { this.#enter(e, 'settle'); return { stay: true }; }
        return this.#away(e, p, TUNING.fleeSpeed);
      }
      case 'settle': {
        if (since >= TUNING.hideMs) { this.#enter(e, 'hidden'); }
        return { stay: true };
      }
      default: this.#enter(e, 'hidden'); return { stay: true };
    }
  }

  // revealed and with prey: leap when the distance is right, else close in and bite
  #engage(e, p) {
    const m = e.mob, d = m.data, r = dist(p.pos, m.pos);
    if (r >= TUNING.leapMin && r <= TUNING.leapMax && e.now >= (d.leapReady ?? 0) && this.#grounded(e) && e.canSee(p)) {
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, len = Math.hypot(dx, dz) || 1;
      const air = (2 * TUNING.leapUp) / GRAVITY; // time in the air on flat ground
      d.dir = [dx / len, dz / len];
      d.pace = Math.min(12, Math.max(2, (r - 0.8) / air));
      d.launched = false;
      d.leapReady = e.now + TUNING.leapCdMs;
      this.#enter(e, 'leap');
      return this.ai(e); // take off this very tick
    }
    if (d.s !== 'stalk') this.#enter(e, 'stalk');
    return this.#chase(e, p);
  }

  #chase(e, p) {
    this.#biteAnim(e, p);
    return { attack: { target: p, reach: TUNING.biteReach, every: TUNING.biteEvery, knock: TUNING.knock, speed: TUNING.chaseSpeed }, look: p.pos };
  }

  // the bite's animation and sound, on the same beat as the engine's attack (the same reach and cooldown)
  #biteAnim(e, p) {
    const m = e.mob, d = m.data;
    if (dist(p.pos, m.pos) > TUNING.biteReach + 0.2 || Math.abs(p.pos.y - m.pos.y) > 1.6) return;
    if (e.now - (d.bitAt ?? -Infinity) < TUNING.biteEvery * 1000) return;
    d.bitAt = e.now;
    m.play('bite');
    this.#say(e, 'bite');
  }

  // runs straight away from the prey (or from where it was standing), looking where it goes
  #away(e, p, speed) {
    const m = e.mob, from = p ? p.pos : (m.data.from ?? m.pos);
    const dx = m.pos.x - from.x, dz = m.pos.z - from.z, len = Math.hypot(dx, dz) || 1;
    const wx = dx / len, wz = dz / len;
    return { walk: [wx, wz], speed, look: { x: m.pos.x + wx * 4, y: m.pos.y, z: m.pos.z + wz * 4 } };
  }

  // ------------------------------------------------------------------------------------------- hooks
  onHurt(e) {
    const m = e.mob, d = m.data;
    if (e.attacker) { d.target = e.attacker.id; d.from = { x: e.attacker.pos.x, y: e.attacker.pos.y, z: e.attacker.pos.z }; }
    if (m.health <= 0) return;
    try { m.play('hurt'); } catch { /* no model data (a test double) */ }
    this.#say(e, 'hurt');
    if (!d.s || d.s === 'hidden' || d.s === 'settle') { // stepped on, or shot from afar: it is found out
      if (e.attacker) this.#enter(e, 'reveal'); else this.#enter(e, 'dart');
      return;
    }
    if (m.health <= m.maxHealth * TUNING.fleeAt) { d.seen = e.now; this.#enter(e, 'flee'); return; }
    if (d.s !== 'flee') this.#enter(e, 'dart');
  }

  onDeath(e) {
    try { e.server?.playSound(this._sound('death'), e.mob.pos, { radius: 16 }); } catch { /* sound budget */ }
  }
}
