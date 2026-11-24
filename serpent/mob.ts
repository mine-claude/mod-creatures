// @ts-check
// The Root Serpent (Serpente de Raízes, creatures:root_serpent): a long serpent of twisted roots and bark that hunts the
// floor of forests and jungles. It wanders the leaf litter; a player within TUNING.notice blocks makes it rattle its
// tail, DIVE into the soil (grass or dirt) and travel under the surface — only a moving mound and a spray of soil betray
// it, and nothing reaches it down there — then BURST OUT next to the player, rear up into an S-coil and STRIKE (a lunge
// and a bite: moderate damage, armour and a raised shield count). A bite from BEHIND (the player facing away) or on a
// player already low makes it CONSTRICT: it coils around them for ~2 s, rooting them (the "Constrição" effect: much
// slower, no jump) and squeezing (damage over time) — every hit the coiled player lands shortens the coil. Below 30%
// health it dives and flees under the ground, healing, and leaves that player alone for a while.
//
// The browser never sees a state machine: the code-built body (renderer.ts) reads two POSES ('burrowed', 'coil' — state,
// sent with every entry, so whoever comes into view late sees them) and a few CUES ('rattle', 'surface', 'rear',
// 'strike', 'squeeze', 'release').
//
// States (e.mob.data.s): wander -> (prey) dive -> tunnel -> surface -> rear -> lunge -> recover -> stalk -> rear ...
//   lunge (bite from behind / low prey) -> coil -> recover ; stalk (some strikes) -> dive (ambush again from elsewhere)
//   health < fleeAt -> dive -> flee (under the ground) -> surface -> wander (calm for a while)
import { DamageType, EffectType, MobType, ParticleType } from '../mineclaude-sdk.js';
import { BARK, BITE_CAUSE, COIL_EFFECT, SOIL_PARTICLE, SQUEEZE_CAUSE, TUNING, isDiggable, sound } from './tuning.ts';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const UNDER = new Set(['tunnel', 'flee_under']); // states in which it is under the surface (nothing reaches it)
const isAirBlock = (name) => name === null || name === undefined || /(^|:)air$/.test(String(name));

/** Whether a player facing `look` (horizontal) at `from` has their back to `serpent` (the dot below TUNING.behindDot). */
export function fromBehind(look, from, serpent) {
  const dx = serpent.x - from.x, dz = serpent.z - from.z, h = Math.hypot(dx, dz), lh = Math.hypot(look.x, look.z);
  if (h < 1e-6 || lh < 1e-6) return false;
  return (look.x * dx + look.z * dz) / (h * lh) < TUNING.behindDot;
}

/** Whether a bite should turn into a constriction: from behind, or the prey already low. */
export const shouldCoil = (behind, healthAfter) => behind || healthAfter <= TUNING.lowHealth;

/** The coil's end after a hit by the coiled player at `now`: shortened by coilHitMs, never sooner than coilMinMs. */
export const shortenCoil = (end, now) => Math.max(Math.min(end, now + TUNING.coilMinMs), end - TUNING.coilHitMs);

export default class RootSerpent extends MobType {
  name = 'Serpente de Raízes';
  emoji = '🐍';
  halfW = 0.45;
  height = 0.6;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // a forest animal, day and night
  hp = 24;
  speed = 2.2;
  damage = 4; // the engine's number for a hostile; the bite is dealt by the brain (TUNING.biteDamage)
  xp = 7;
  aiEvery = 1; // the lunge, the bite and the squeeze are timed tick by tick
  // Its declared ai budget (ms): its work is a few comparisons and block reads per tick, but a burst of soil + a sound on a
  // freshly loaded chunk spiked past the engine's default 20 ms in the tests; past it the engine hands it the zombie's
  // chase for 5 s, which is exactly what an ambusher underground must never do.
  aiBudget = 100;
  knockbackTaken = 0.5; // long and low: a blow moves it less
  sound = 'serpent_hiss'; // its voice: a dry hiss through wood (the ambient sound, and on every hit)
  drops = [[BARK, 1, 3]];
  spawn;

  /** @param {{ spawn: any[] }} env */
  constructor(env) {
    super();
    this.spawn = env.spawn;
  }

  // ------------------------------------------------------------------------------------------- helpers
  #say(e, name, volume = 1) {
    try { e.server?.playSound(sound(name), { mob: e.mob.id, radius: 18, volume }); } catch { /* a full sound budget is not an error */ }
  }

  #cue(e, name) {
    try { e.mob.cue(name); } catch { /* a test double without cues */ }
  }

  #pose(e, name) {
    try { if ((e.mob.pose ?? null) !== name) e.mob.setPose(name); } catch { /* a test double */ }
  }

  #soil(e, count, up = 0.1) {
    const p = e.mob.pos;
    try { e.world?.spawnParticles(SOIL_PARTICLE, { x: p.x, y: p.y + up, z: p.z }, { count }); } catch { /* the particle budget */ }
  }

  // the block under it: grass or dirt lets it dig in
  #under(e, dy = 0.3) {
    const p = e.mob.pos;
    try { return e.world?.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y - dy), z: Math.floor(p.z) }) ?? null; } catch { return null; }
  }

  #canDig(e) { return isDiggable(this.#under(e)); }

  // travelling under the surface, it must come up only where the soil ENDS: rock, water, wood under it. Air under it is
  // the edge of a step it is going down (it falls back into the soil a moment later), not a reason to come up.
  #soilEnds(e) {
    let b = this.#under(e);
    if (isAirBlock(b)) b = this.#under(e, 1.3);
    return !(isDiggable(b) || isAirBlock(b));
  }

  // the prey it still has: alive, in the world, not in creative, not too far
  #prey(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = typeof e.player === 'function' ? e.player(id) : null;
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return dist3(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    switch (s) {
      case 'wander': this.#pose(e, null); m.setHealthBar(true); d.target = null; break;
      case 'dive': // into the soil: the body follows the head down as it keeps moving
        this.#pose(e, 'burrowed'); m.setHealthBar(false); this.#say(e, 'burrow'); this.#soil(e, 26, 0.2);
        d.dug = true;
        break;
      case 'tunnel': case 'flee_under': this.#pose(e, 'burrowed'); m.setHealthBar(false); d.soilAt = 0; break;
      case 'surface':
        this.#pose(e, null); m.setHealthBar(true); this.#cue(e, 'surface'); this.#say(e, 'burrow'); this.#soil(e, 40, 0.4);
        d.dug = false; d.surfaces = (d.surfaces ?? 0) + 1;
        break;
      case 'rear': this.#cue(e, 'rear'); this.#say(e, 'hiss'); break;
      case 'lunge': this.#cue(e, 'strike'); this.#say(e, 'strike'); d.bit = false; d.strikes = (d.strikes ?? 0) + 1; break;
      case 'coil': this.#pose(e, 'coil'); this.#say(e, 'squeeze'); d.coilEnd = e.now + TUNING.coilMs; d.squeezeAt = e.now + TUNING.squeezeEveryMs; d.coils = (d.coils ?? 0) + 1; break;
      case 'stalk': this.#pose(e, null); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e) {
    const m = e.mob, d = m.data, pos = m.pos;
    if (!d.s) { this.#enter(e, 'wander'); d.hissAt = e.now + TUNING.hissEveryMs; }
    const since = e.now - d.t;
    switch (d.s) {
      case 'wander': {
        if (e.now >= (d.calmUntil ?? 0)) {
          let best = null, bd = Infinity;
          for (const p of e.nearbyPlayers) {
            if (p.dead || p.creative || (p.room && p.room !== 'mundo')) continue;
            const pd = dist3(p.pos, pos);
            if (pd <= TUNING.notice && Math.abs(p.pos.y - pos.y) <= TUNING.noticeDy && pd < bd) { best = p; bd = pd; }
          }
          if (best) {
            d.target = best.id; d.strikes = 0;
            this.#cue(e, 'rattle'); this.#say(e, 'hiss');
            // the ambush: under the ground when it can dig, else straight at them over the surface
            if (this.#canDig(e) && bd > TUNING.surfaceAt + 1) { this.#enter(e, 'dive'); d.fleeing = false; return this.#walkTo(e, best.pos, TUNING.divePace); }
            this.#enter(e, 'stalk');
            return { moveTo: best.pos, moveStop: 1.4, moveSpeed: TUNING.chaseSpeed, look: best.pos };
          }
        }
        if (e.now >= (d.slitherAt ?? 0)) { d.slitherAt = e.now + 3500 + e.random() * 3000; this.#say(e, 'slither', 0.6); }
        return { wander: true };
      }
      case 'dive': {
        const p = d.fleeing ? null : this.#prey(e);
        const away = d.fleeing ? this.#awayFrom(e) : null;
        if (since >= TUNING.diveMs) { this.#enter(e, d.fleeing ? 'flee_under' : 'tunnel'); return this.ai(e); }
        if (away) return this.#walkTo(e, away, TUNING.divePace);
        if (!p) { this.#enter(e, 'surface'); return { stay: true }; }
        return this.#walkTo(e, p.pos, TUNING.divePace);
      }
      case 'tunnel': {
        const p = this.#prey(e);
        this.#underground(e);
        if (!p) { this.#enter(e, 'surface'); return { stay: true }; }
        // rock or water under it, or close enough, or too long: up it comes
        if (flat(p.pos, pos) <= TUNING.surfaceAt || since >= TUNING.tunnelMaxMs || this.#soilEnds(e)) {
          this.#enter(e, 'surface');
          return { stay: true, look: p.pos };
        }
        return { moveTo: p.pos, moveStop: TUNING.surfaceAt * 0.6, moveSpeed: Math.min(4, TUNING.tunnelPace / this.speed), look: p.pos };
      }
      case 'surface': {
        const p = this.#prey(e);
        if (since < TUNING.surfaceMs) return p ? { stay: true, look: p.pos } : { stay: true };
        if (!p) { this.#enter(e, 'wander'); return { wander: true }; }
        if (flat(p.pos, pos) <= TUNING.strikeRange + 0.6 && e.canSee(p)) { this.#enter(e, 'rear'); return { stay: true, look: p.pos }; }
        this.#enter(e, 'stalk');
        return this.ai(e);
      }
      case 'stalk': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'wander'); return { wander: true }; }
        const r = flat(p.pos, pos);
        if (r <= TUNING.strikeRange && Math.abs(p.pos.y - pos.y) < 2 && e.now >= (d.nextStrike ?? 0) && e.canSee(p)) {
          this.#enter(e, 'rear');
          return { stay: true, look: p.pos };
        }
        // a few strikes on the surface: down again, to come up somewhere else
        if ((d.strikes ?? 0) >= TUNING.reburrowAfter && r > TUNING.surfaceAt + 1 && this.#canDig(e)) {
          d.strikes = 0;
          this.#enter(e, 'dive');
          return this.#walkTo(e, p.pos, TUNING.divePace);
        }
        if (e.now >= (d.hissAt ?? 0)) { d.hissAt = e.now + TUNING.hissEveryMs + e.random() * 1500; this.#say(e, 'slither', 0.7); }
        return { moveTo: p.pos, moveStop: 1.6, moveSpeed: TUNING.chaseSpeed, look: p.pos };
      }
      case 'rear': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'wander'); return { wander: true }; }
        if (since >= TUNING.rearMs) { this.#enter(e, 'lunge'); d.aim = { x: p.pos.x, z: p.pos.z }; return this.ai(e); }
        return { stay: true, look: p.pos };
      }
      case 'lunge': {
        const p = this.#prey(e);
        if (!p || since >= TUNING.lungeMs) { this.#enter(e, 'recover'); d.nextStrike = e.now + TUNING.strikeEveryMs; return { stay: true }; }
        if (!d.bit && flat(p.pos, pos) <= TUNING.biteReach && Math.abs(p.pos.y - pos.y) <= TUNING.biteMaxDy && e.canSee(p)) {
          d.bit = true;
          if (this.#bite(e, p)) return { stay: true, look: p.pos };
        }
        if (d.bit) return { stay: true, look: p.pos };
        return this.#walkTo(e, p.pos, TUNING.lungePace);
      }
      case 'recover': {
        const p = this.#prey(e);
        if (since < TUNING.recoverMs) return p ? { stay: true, look: p.pos } : { stay: true };
        if (!p) { this.#enter(e, 'wander'); return { wander: true }; }
        this.#enter(e, 'stalk');
        return { stay: true, look: p.pos };
      }
      case 'coil': {
        const p = this.#prey(e);
        if (!p || e.now >= d.coilEnd) { this.#release(e, p); return p ? { stay: true, look: p.pos } : { stay: true }; }
        // squeeze: damage over time (armour counts; it never finishes anyone below 1 point on its own)
        if (e.now >= d.squeezeAt) {
          d.squeezeAt = e.now + TUNING.squeezeEveryMs;
          this.#cue(e, 'squeeze');
          if (p.health > 1) { try { p.damage(Math.min(TUNING.squeezeDamage, p.health - 1), SQUEEZE_CAUSE); d.squeezes = (d.squeezes ?? 0) + 1; } catch { /* not a live player any more */ } }
          if ((d.squeezes ?? 0) % 2 === 1) this.#say(e, 'squeeze', 0.8);
        }
        // the coiled player is held: pulled back when they get away, and it stays on them
        const r = flat(p.pos, pos);
        if (r > TUNING.coilHold) {
          const k = Math.min(6, 2.5 * r) / r;
          try { p.push((pos.x - p.pos.x) * k, 0, (pos.z - p.pos.z) * k); } catch { /* not a live player */ }
        }
        return r > 0.25 ? { walk: [(p.pos.x - pos.x) / r, (p.pos.z - pos.z) / r], pace: Math.min(6, r * 5), look: p.pos } : { stay: true, look: p.pos };
      }
      case 'flee_under': {
        this.#underground(e);
        if (e.now >= (d.healAt ?? 0)) { d.healAt = e.now + TUNING.healEveryMs; if (m.health < m.maxHealth) m.heal(1); }
        if (since >= TUNING.fleeMs || this.#soilEnds(e)) {
          d.fleeing = false; d.target = null; d.calmUntil = e.now + TUNING.calmMs;
          this.#enter(e, 'surface');
          return { stay: true };
        }
        return this.#walkTo(e, this.#awayFrom(e), TUNING.fleePace);
      }
      case 'flee': { // no soil to dive into: it flees over the surface
        if (since >= TUNING.fleeMs) { d.fleeing = false; d.calmUntil = e.now + TUNING.calmMs; this.#enter(e, 'wander'); return { wander: true }; }
        return this.#walkTo(e, this.#awayFrom(e), TUNING.fleePace);
      }
      default: this.#enter(e, 'wander'); return { wander: true };
    }
  }

  // a straight walk toward a point at a pace (blocks/s); the engine faces the way it walks
  #walkTo(e, to, pace) {
    const p = e.mob.pos, dx = to.x - p.x, dz = to.z - p.z, h = Math.hypot(dx, dz);
    if (h < 0.05) return { stay: true };
    return { walk: [dx / h, dz / h], pace };
  }

  // a point away from whoever it flees (or straight ahead when nobody)
  #awayFrom(e) {
    const p = e.mob.pos, d = e.mob.data, q = d.fleeFrom;
    if (q) { const dx = p.x - q.x, dz = p.z - q.z, h = Math.hypot(dx, dz) || 1; return { x: p.x + (dx / h) * 8, y: p.y, z: p.z + (dz / h) * 8 }; }
    const a = d.fleeDir ?? (d.fleeDir = e.random() * Math.PI * 2);
    return { x: p.x + Math.cos(a) * 8, y: p.y, z: p.z + Math.sin(a) * 8 };
  }

  // travelling under the surface: the moving mound throws up a little soil now and then
  #underground(e) {
    const d = e.mob.data;
    if (e.now >= (d.soilAt ?? 0)) { d.soilAt = e.now + TUNING.soilEveryMs; this.#soil(e, 5, 0.15); }
  }

  // the bite: damage through armour and shield; when it went through, maybe the constriction. Returns whether it coiled.
  #bite(e, p) {
    const m = e.mob, d = m.data;
    const behind = fromBehind(p.look ?? { x: 0, z: 0 }, p.pos, m.pos);
    const before = p.health;
    try { p.damage(TUNING.biteDamage, BITE_CAUSE); } catch { return false; }
    d.bites = (d.bites ?? 0) + 1;
    if (!(p.health < before) || p.dead) return false;
    if (e.now >= (d.coilReady ?? 0) && shouldCoil(behind, p.health)) {
      d.coilBehind = behind;
      try { p.addEffect(COIL_EFFECT, TUNING.coilMs / 1000 + 0.5, 1); } catch { /* the effect cap */ }
      this.#enter(e, 'coil');
      return true;
    }
    return false;
  }

  #release(e, p) {
    const d = e.mob.data;
    if (p) { try { p.removeEffect(COIL_EFFECT); } catch { /* gone */ } }
    d.coilReady = e.now + TUNING.coilCdMs;
    d.lastCoilMs = e.now - d.t;
    this.#pose(e, null);
    this.#cue(e, 'release');
    this.#enter(e, d.fleeing ? 'dive' : 'recover');
    d.nextStrike = e.now + TUNING.strikeEveryMs;
  }

  // ------------------------------------------------------------------------------------------- hooks
  // under the surface nothing reaches it
  onHit(e) {
    if (UNDER.has(e.mob?.data?.s)) e.cancel();
  }

  onHurt(e) {
    const m = e.mob, d = m.data;
    if (m.health <= 0) return;
    // the coiled player fights back: each hit shortens the coil
    if (d.s === 'coil' && e.attacker && e.attacker.id === d.target) {
      d.coilEnd = shortenCoil(d.coilEnd, e.now);
      d.coilHits = (d.coilHits ?? 0) + 1;
    }
    if (e.attacker && !e.attacker.creative && (d.target === null || d.target === undefined) && !d.fleeing) d.target = e.attacker.id;
    this.#cue(e, 'rattle');
    // badly hurt: under the ground and away
    if (!d.fleeing && m.health <= m.maxHealth * TUNING.fleeAt) {
      d.fleeing = true;
      d.fleeFrom = e.attacker ? { x: e.attacker.pos.x, z: e.attacker.pos.z } : null;
      if (d.s === 'coil') this.#release(e, e.attacker && e.attacker.id === d.target ? e.attacker : null);
      if (this.#canDig(e)) this.#enter(e, 'dive');
      else this.#enter(e, 'flee');
      d.flees = (d.flees ?? 0) + 1;
      return;
    }
    if (d.s === 'wander' && e.attacker && !e.attacker.creative) this.#enter(e, 'stalk');
  }

  onDeath(e) {
    try { e.server?.playSound(sound('death'), e.mob.pos, { radius: 18 }); } catch { /* sound budget */ }
  }
}

// ------------------------------------------------------------------------------------------- what it brings with it

// the soil it throws up: crumbs of dark earth, leaf litter and a few root fibres, falling back fast
export class SerpentSoil extends ParticleType {
  colors = ['#4a3424', '#5c4330', '#3a2a1c', '#6b5a3a', '#4f6a2e', '#7a6a48'];
  size = 0.08; life = 0.8; gravity = 1.3; speed = 2.6; spread = 0.45; rise = 2.4; drag = 0.6;
  collide = true; bounce = 0.1; shrink = true; burst = 48;
}

// "Constrição": coiled by a Root Serpent — the legs held (much slower, no jump) while it lasts
export class SerpentCoil extends EffectType {
  name = 'Constrição';
  color = '#6b5a2e';
  beneficial = false;
  attributes = [
    { attribute: 'mineclaude:movement_speed', amount: -0.8, operation: 'add_multiplied_total' },
    { attribute: 'mineclaude:jump_strength', amount: -1, operation: 'add_multiplied_total' },
  ];
}

export class SerpentBite extends DamageType {
  name = 'Bote';
  armored = true;
  shield = true;
  pvp = false;
  deathMessage(e) { return `${e.player} levou o bote de uma Serpente de Raízes`; }
}

export class SerpentSqueeze extends DamageType {
  name = 'Constrição';
  armored = true; // armour helps a little against the squeeze
  shield = false; // a shield does nothing against coils
  pvp = false;
  deathMessage(e) { return `${e.player} foi esmagado por uma Serpente de Raízes`; }
}
