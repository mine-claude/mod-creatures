// @ts-check
// The Ruin Colossus (creatures:ruin_colossus, "Colosso de Ruína"): a rare stone guardian that kneels by the old ruins like
// a weathered statue. It has no health bar and does nothing until a player comes within TUNING.wakeRange blocks (or hits
// it); then it WAKES (2 s, rising from the kneel) and comes after them — slowly, heavily, immune to knockback.
//   - close (TUNING.slamRange): the SLAM — both fists raised over the head for TUNING.windupMs (the telegraph: get out),
//     then brought down: everyone within TUNING.slamRadius of the impact (and not too far above/below) takes damage that
//     falls off to the rim and is thrown out and up; nobody outside the radius is touched;
//   - out of reach (TUNING.throwMin..throwMax, in sight): it tears a ROCK out of its own back and throws it (e.shoot with
//     the mod's projectile);
//   - ARMOUR: its plates let only ARMOR[tier] of a blow through; every lost tier (health below 75 / 50 / 25 %) breaks
//     more plates off (the browser drops them as debris) and bares more of the core: it takes more damage;
//   - nobody around for TUNING.settleAfterMs: it SETTLES back into the kneel and sleeps again, health bar hidden.
// States in e.mob.data.s (one brain for every colossus, each one's state in its own data); the browser sees
// `<state>_<tier>` as the mob's POSE (tuning.ts), so a player who arrives late still sees the statue, the wind-up or
// the missing plates.
import { MobType, ProjectileType, ParticleType, DamageType } from '../mineclaude-sdk.js';
import { BODY, DUST, ROCK, RUNE_CORE, SLAM_DAMAGE_TYPE, TUNING, armored, poseName, slamFalloff, sound, tierFor } from './tuning.ts';
import { colossusSpawnRules } from './spawn.ts';

export const COLOSSUS_DROPS = [[RUNE_CORE, 1, 1, 0.4], ['mineclaude:cobblestone', 3, 8], ['mineclaude:stone', 1, 3]];
const horiz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

export class RuinColossus extends MobType {
  name = 'Colosso de Ruína';
  emoji = '🗿';
  halfW = BODY.halfW;
  height = BODY.height;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // stone: the sun does nothing to it
  hp = 160; // a mini-boss (and the plates take most of every blow at first)
  speed = TUNING.walkPace;
  damage = 9; // the slam's (the slam itself is the mod's own; the engine never melees for it)
  xp = 40;
  aiEvery = 1; // the wind-up and the slam are timed tick by tick
  // Its declared ai budget (ms): the first decisions of a fresh server (cold code, the first canSee of a chunk) can pass
  // the engine's default 20 ms cut, which would hand it to the zombie's chase for 5 s — a colossus that forgot its slam.
  aiBudget = 120;
  knockbackTaken = 0; // nothing moves it
  sound = 'colossus_hurt'; // its voice: a grinding of stone
  drops = COLOSSUS_DROPS;
  spawn;

  /** @param {{ getBlock: (pos: { x: number, y: number, z: number }) => string | null, ruinsDay: string }} env */
  constructor(env) {
    super();
    this.spawn = colossusSpawnRules(env.getBlock, env.ruinsDay);
  }

  // ------------------------------------------------------------------------------------------- helpers
  #say(e, name, radius = 24) {
    try { e.server?.playSound(sound(name), e.mob.pos, { radius }); } catch { /* a full sound budget is not an error */ }
  }

  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    try { m.setPose(poseName(s, d.tier ?? 0)); } catch { /* a test double without poses */ }
    try { m.setHealthBar(s !== 'dormant'); } catch { /* idem */ }
    if (s === 'wake') this.#say(e, 'wake', 28);
    else if (s === 'lift') this.#say(e, 'step', 16);
  }

  // a player worth waking for / chasing: alive, in the world, not in creative
  #fair(p) { return !!p && !p.dead && !p.creative && !(p.room && p.room !== 'mundo'); }

  #target(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!this.#fair(p)) return null;
    return horiz(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  #nearest(e, range, needSight) {
    let best = null, bd = Infinity;
    for (const p of e.nearbyPlayers) {
      if (!this.#fair(p)) continue;
      const pd = horiz(p.pos, e.mob.pos);
      if (pd <= range && Math.abs(p.pos.y - e.mob.pos.y) < 6 && pd < bd && (!needSight || e.canSee(p))) { best = p; bd = pd; }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e: any): any {
    const m = e.mob, d = m.data;
    if (!d.s) { d.tier = 0; this.#enter(e, 'dormant'); }
    this.#retier(e);
    const since = e.now - d.t;
    const hold = { walk: [0, 0] };
    switch (d.s) {
      case 'dormant':
      case 'settle': {
        const p = this.#nearest(e, TUNING.wakeRange, false);
        if (p) { d.target = p.id; this.#enter(e, 'wake'); return { ...hold, look: p.pos }; }
        if (d.s === 'settle' && since >= TUNING.settleMs) this.#enter(e, 'dormant');
        return { stay: true };
      }
      case 'wake': {
        const p = this.#target(e);
        if (since >= TUNING.wakeMs) this.#enter(e, 'walk');
        return p ? { ...hold, look: p.pos } : { stay: true };
      }
      case 'walk': {
        let p = this.#target(e);
        if (!p) { p = this.#nearest(e, TUNING.sight, true); if (p) d.target = p.id; }
        if (!p) {
          d.lost ??= e.now;
          if (e.now - d.lost >= TUNING.settleAfterMs) { d.lost = null; d.target = null; this.#enter(e, 'settle'); }
          return { stay: true };
        }
        d.lost = null;
        const dist = horiz(p.pos, m.pos), dy = p.pos.y - m.pos.y;
        if (dist <= TUNING.slamRange && Math.abs(dy) < TUNING.slamMaxDy && e.now >= (d.slamCd ?? 0)) {
          d.yaw = yawTo(m.pos, p.pos);
          this.#enter(e, 'windup');
          return { ...hold, yaw: d.yaw };
        }
        if (dist >= TUNING.throwMin && dist <= TUNING.throwMax && e.now >= (d.throwCd ?? 0) && e.canSee(p)) {
          this.#enter(e, 'lift');
          return { ...hold, look: p.pos };
        }
        return { moveTo: p.pos, moveStop: Math.max(0.5, TUNING.slamRange - 0.8), moveSpeed: 1, look: p.pos };
      }
      case 'windup': {
        if (since >= TUNING.windupMs) { this.#slam(e); this.#enter(e, 'slam'); }
        return { ...hold, yaw: d.yaw };
      }
      case 'slam': {
        if (since >= TUNING.slamRecoverMs) { d.slamCd = e.now + TUNING.slamCooldownMs; this.#enter(e, 'walk'); }
        return { ...hold, yaw: d.yaw };
      }
      case 'lift': {
        const p = this.#target(e);
        if (since >= TUNING.liftMs) {
          let thrown = false;
          if (p && e.canSee(p)) {
            const v = p.velocity, lim = (n) => Math.max(-20, Math.min(20, n));
            const lead = v && Number.isFinite(v.x) && Number.isFinite(v.z) ? { x: lim(v.x), z: lim(v.z) } : undefined;
            try { thrown = !!e.shoot(p, { projectile: ROCK, speed: TUNING.rockSpeed, damage: TUNING.rockDamage, error: TUNING.rockError, lead }); } catch { thrown = false; }
          }
          d.throws = (d.throws ?? 0) + (thrown ? 1 : 0);
          if (thrown) this.#say(e, 'throw', 24);
          d.throwCd = e.now + TUNING.throwCooldownMs;
          this.#enter(e, thrown ? 'hurl' : 'walk');
        }
        return p ? { ...hold, look: p.pos } : hold;
      }
      case 'hurl': {
        if (since >= TUNING.hurlRecoverMs) this.#enter(e, 'walk');
        const p = this.#target(e);
        return p ? { ...hold, look: p.pos } : hold;
      }
      default: this.#enter(e, 'dormant'); return { stay: true };
    }
  }

  // the tier its health is in now (plates lost); a new tier changes the pose at once (the browser drops the plates)
  #retier(e) {
    const m = e.mob, d = m.data;
    const max = m.maxHealth || this.hp;
    const tier = Math.max(d.tier ?? 0, tierFor((m.health ?? m.hp) / max));
    if (tier !== d.tier) {
      d.tier = tier;
      if (tier > 0) this.#say(e, 'crumble', 20);
    }
    // the pose always says the state and the tier (also after a hook that could not set it)
    const want = poseName(d.s ?? 'walk', d.tier);
    if (m.pose !== want) { try { m.setPose(want); } catch { /* a test double */ } }
    const bar = d.s !== 'dormant';
    if (m.healthBar !== bar) { try { m.setHealthBar(bar); } catch { /* idem */ } }
  }

  // The slam lands: the impact point is ahead of its feet along the yaw it locked at the wind-up. Everyone inside the
  // radius (and within slamMaxDy of its feet) takes the fallen-off damage and is thrown away from the impact.
  #slam(e) {
    const m = e.mob, d = m.data, f = fwd(d.yaw ?? 0);
    const at = { x: m.pos.x + f.x * TUNING.slamReach, y: m.pos.y, z: m.pos.z + f.z * TUNING.slamReach };
    const hits = [];
    for (const p of e.nearbyPlayers) {
      if (!this.#fair(p)) continue;
      const dist = horiz(p.pos, at);
      const fo = slamFalloff(dist);
      if (!fo || Math.abs(p.pos.y - m.pos.y) > TUNING.slamMaxDy) continue;
      try { p.damage(fo.damage, SLAM_DAMAGE_TYPE); } catch { /* a dead player */ }
      const dx = p.pos.x - at.x, dz = p.pos.z - at.z, h = Math.hypot(dx, dz);
      const ux = h > 0.05 ? dx / h : f.x, uz = h > 0.05 ? dz / h : f.z;
      try { p.push(ux * fo.knock, fo.lift, uz * fo.knock); } catch { /* creative or dead */ }
      hits.push({ id: p.id, dist: +dist.toFixed(2), damage: fo.damage });
    }
    d.slams = (d.slams ?? 0) + 1;
    d.lastSlam = { at: { x: +at.x.toFixed(2), z: +at.z.toFixed(2) }, hits };
    try { e.world.spawnParticles(DUST, { x: at.x, y: at.y + 0.2, z: at.z }, { count: 60 }); } catch { /* no viewers */ }
    this.#say(e, 'slam', 32);
  }

  // ------------------------------------------------------------------------------------------- hooks
  // The plates: only ARMOR[tier] of a blow gets through. A blow on the sleeping statue wakes it (onHurt).
  onHit(e) {
    const tier = e.mob.data?.tier ?? 0;
    e.damage = Math.min(100, armored(e.damage, tier));
  }

  onHurt(e) {
    const m = e.mob, d = m.data;
    // anything that cracks the statue wakes it; a player who did it becomes its target
    if (e.attacker && !e.attacker.creative) d.target = e.attacker.id;
    if (d.s === 'dormant' || d.s === 'settle' || !d.s) { d.tier ??= 0; this.#enter(e, 'wake'); }
    this.#retier(e);
  }

  onDeath(e) {
    try { e.server?.playSound(sound('crumble'), e.mob.pos, { radius: 28 }); } catch { /* sound budget */ }
    try { e.world?.spawnParticles(DUST, { x: e.mob.pos.x, y: e.mob.pos.y + 1, z: e.mob.pos.z }, { count: 80 }); } catch { /* no viewers */ }
  }
}

// The rock it throws: a heavy chunk of mossy stone on a high arc; it bursts into dust where it lands.
export class ColossusRock extends ProjectileType {
  name = 'Pedra do Colosso';
  gravity = 1.1;
  life = 6;
  damage = TUNING.rockDamage;
  size = 0.42;
  color = '#7d786b';
  // a colossus's rock (no player owner) does not hurt another colossus
  onHitEntity(e) {
    if (!e.owner && e.target?.mob?.name === `creatures:ruin_colossus`) { e.cancel(); return; }
    try { e.world.spawnParticles(DUST, e.projectile.pos, { count: 24 }); } catch { /* no viewers */ }
  }
  onHitBlock(e) {
    try { e.world.spawnParticles(DUST, { x: e.pos.x + 0.5, y: e.pos.y + 1, z: e.pos.z + 0.5 }, { count: 24 }); } catch { /* no viewers */ }
  }
}

// Stone dust: footfalls, the slam, the rock, the crumble.
export class ColossusDust extends ParticleType {
  colors = ['#9a9484', '#7f7a6c', '#b5ad98', '#6a665c'];
  size = 0.16;
  life = 1.1;
  gravity = 0.25;
  speed = 2.2;
  spread = 0.5;
  rise = 1.4;
  drag = 2.6;
  collide = true;
  bounce = 0.1;
  burst = 96;
}

// Embers from a bared core: amber and teal sparks that float up and fade.
export class ColossusEmber extends ParticleType {
  colors = ['#ffa63d', '#ffd27a', '#46e0cc', '#8ff5e6'];
  size = 0.07;
  life = 1.3;
  gravity = -0.12;
  speed = 1.6;
  spread = 0.4;
  rise = 1.2;
  drag = 1.4;
  blend = 'add';
  burst = 48;
}

// The slam's damage: armour softens it, a raised shield does not stop it (it comes from above).
export class ColossusSlam extends DamageType {
  name = 'Golpe do Colosso';
  armored = true;
  shield = false;
  deathMessage(e) { return `${e.player} foi esmagado por um Colosso de Ruína`; }
}
