// @ts-check
// The Sting Swarm (Enxame-Ferrão, creatures:sting_swarm): ONE server mob that is a whole swarm of small wasp-like insects
// (the browser draws them: renderer.ts + boids.ts). It lives over the meadows by day, mostly NEUTRAL:
//   idle     drifts over the flowers near where it was born (the browser dips insects to the flowers);
//   alarmed  a player came within TUNING.alarmRange (and in sight): it tightens, rises and buzzes louder — a warning;
//   attack   provoked — hit, flowers broken near it, or the alarmed swarm approached within TUNING.provoke — it CHASES the
//            player flying (gravity 0 + travel, the lantern's flight) and, while it covers them, STINGS: a little damage
//            every TUNING.stingEvery ms and, every few stings, one more level of "Picada" (an effect: slow damage, a bit slower);
//   calm     gave up (prey too far, dead, creative, gone, too long): back home, settling, then idle again;
//   flee     smoke or fire near (a torch, a fire, lava): it breaks up and keeps away for a while, then calms.
// Water is safety: a prey whose head is under water is not stung; the swarm hovers over the surface and, after
// TUNING.waterSafeMs, disperses (calm). The browser never sees the state machine: the swarm's SHAPE follows the mob's
// lasting pose (e.mob.setPose: idle | alarmed | attack | calm | flee), sent in every `mobs` entry; a sting is a cue.
//
// States are e.mob.data.s; the pose mirrors it. Everything kept in data is numbers and ids (the 2048-char limit).
import { MobType } from '../mineclaude-sdk.js';
import { BOX, HONEY, STINGER, STING_DAMAGE, STING_EFFECT, TUNING, sound } from './tuning.ts';
import { climbToward, driftHeight, easeVelocity, surfaceBelow, toward } from '../lantern/flight.ts';
import { isWater } from '../lantern/spawn.ts';

const STALE_S = 0.3, HOLD = Object.freeze([0, 0, 0]);
const SMOKE = /(^|:)(fire|soul_fire|campfire|[a-z_]*_campfire|lava(_\d+)?|smoke[a-z_]*|torch|powder_keg_lit|tnt_lit)$/;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Flowers broken by players (the blockBreak event, index.ts) — read by every swarm's brain. Kept short: the last 16
 * within DISTURB_TTL ms. Server only (the browser never registers the listener).
 */
export const DISTURB_TTL = 5000;
export const disturbances: Array<{ x: number, y: number, z: number, id: any, at: number }> = [];
export function noteDisturbance(x: number, y: number, z: number, id: any, at = Date.now()) {
  disturbances.push({ x, y, z, id, at });
  while (disturbances.length > 16) disturbances.shift();
}

export class StingSwarm extends MobType {
  name = 'Enxame-Ferrão';
  emoji = '🐝';
  halfW = BOX.halfW;
  height = BOX.height;
  behavior = /** @type {const} */ ('neutral'); // with its own ai: no default charge, the brain decides
  hp = 16; // moderate: a few sword hits
  speed = 2.5;
  damage = 1;
  xp = 5;
  gravity = 0; // it flies: the engine's fall is off, travel() moves it
  aiEvery = 1;
  // Declared ai budget (ms): the first calls on a fresh server (cold code, a chunk's first block reads, the smoke scan) can
  // pass the default 20 ms cut, which would switch the brain off for 5 s while travel() held it still.
  aiBudget = 150;
  knockbackTaken = 0.25; // a blow scatters the insects (the browser), it barely moves the swarm
  sound = 'swarm_buzz_idle';
  drops = [[HONEY, 1, 2], [STINGER, 0, 1, 0.35]];
  spawn;
  _getBlock = (pos: { x: number, y: number, z: number }): string | null => null; // `_` keeps it out of the engine's fields

  /** @param {{ getBlock: (pos: { x: number, y: number, z: number }) => string | null, spawn?: any[] }} env */
  constructor(env) {
    super();
    this._getBlock = env.getBlock;
    this.spawn = env.spawn ?? [];
  }

  // ------------------------------------------------------------------------------------------- helpers
  #say(e, name, radius = 16) {
    try { e.server?.playSound(sound(name), { mob: e.mob.id, radius }); } catch { /* a full sound budget is not an error */ }
  }

  #cue(e, name) {
    try { e.mob.cue(name); } catch { /* a test double without cues */ }
  }

  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    try { m.setPose(s); } catch { /* a test double */ }
    if (s === 'idle') { d.target = null; d.wet = 0; }
    else if (s === 'alarmed') { d.far = 0; this.#say(e, 'buzz_alarm'); d.buzz = e.now; }
    else if (s === 'attack') { d.stings = 0; d.wet = 0; d.nextSting = e.now + 350; this.#cue(e, 'attack'); this.#say(e, 'buzz_attack'); d.buzz = e.now; }
    else if (s === 'calm') { d.target = null; d.wet = 0; }
    else if (s === 'flee') { this.#cue(e, 'scatter'); this.#say(e, 'scatter'); }
  }

  // what it flies over (ground or water), looked up every quarter second
  #surface(e) {
    const m = e.mob, d = m.data;
    d.gT = (d.gT ?? 0) - (e.dt ?? 0.05);
    if (d.gT > 0 && d.gy !== undefined) return d.gy;
    d.gT = 0.25;
    const isSurface = (x, y, z) => {
      try { if (e.solidAt(x + 0.5, y + 0.5, z + 0.5)) return true; } catch { /* outside the world */ }
      return isWater(this._getBlock({ x, y, z }));
    };
    const g = surfaceBelow(isSurface, m.pos.x, m.pos.y + 0.2, m.pos.z, TUNING.scanDepth);
    d.gy = g ?? d.gy ?? m.pos.y - TUNING.hover;
    return d.gy;
  }

  // the prey it still has: alive, in the world, not in creative, not too far
  #prey(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return dist2(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  // is the player's head under water? (the water is their refuge)
  #underWater(p) {
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    try { return isWater(this._getBlock({ x, y: Math.floor(p.pos.y + 1.5), z })); } catch { return false; }
  }

  // a fire / smoke source near its centre (a 5 x 3 x 5 look, once a second)
  #smoke(e) {
    const m = e.mob, d = m.data;
    if (e.now - (d.smokeAt ?? 0) < TUNING.smokeEveryMs) return d.smoke ?? null;
    d.smokeAt = e.now; d.smoke = null;
    const r = TUNING.smokeRadius, cx = Math.floor(m.pos.x), cy = Math.floor(m.pos.y + BOX.centre), cz = Math.floor(m.pos.z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      let b = null;
      try { b = this._getBlock({ x: cx + dx, y: cy + dy, z: cz + dz }); } catch { b = null; }
      if (typeof b === 'string' && SMOKE.test(b)) { d.smoke = [cx + dx + 0.5, cz + dz + 0.5]; return d.smoke; }
    }
    return null;
  }

  // a player broke flowers near it in the last moments: that player
  #disturbed(e) {
    const m = e.mob, d = m.data;
    for (let i = disturbances.length - 1; i >= 0; i--) {
      const q = disturbances[i];
      if (e.now - q.at > DISTURB_TTL) break;
      if (q.at <= (d.seenDisturb ?? 0)) break;
      if (Math.hypot(q.x - m.pos.x, q.y - m.pos.y, q.z - m.pos.z) <= TUNING.disturb) { d.seenDisturb = q.at; return q.id; }
    }
    return null;
  }

  // the decision: the wanted velocity goes to travel() through data; the engine faces `look`
  #fly(e, want, rate, look) {
    const d = e.mob.data, h = Math.hypot(want[0], want[2]);
    d.want = [+want[0].toFixed(3), +want[1].toFixed(3), +want[2].toFixed(3)];
    d.rate = rate;
    d.age = 0; // travel() counts how long ago the brain last spoke
    const out: any = { walk: h > 1e-3 ? [want[0] / h, want[2] / h] : [0, 0], pace: Math.max(0.01, h) };
    if (look) out.look = look;
    return out;
  }

  #hoverAt(e, ground, height, rate: number = TUNING.hoverAccel, vx = 0, vz = 0, look: any = null) {
    const m = e.mob, d = m.data;
    const y = driftHeight(ground, height, TUNING.sway, e.now / 1000, d.ph ?? 0);
    return this.#fly(e, [vx, climbToward(m.pos.y, y, TUNING.maxClimb), vz], rate, look);
  }

  // the buzz: a short burst that follows the swarm, again and again (sfx cannot loop; the bursts overlap into a drone)
  #buzz(e) {
    const m = e.mob, d = m.data, s = d.s;
    const every = TUNING.buzzEvery[s] ?? 2000;
    if (e.now - (d.buzz ?? 0) < every) return;
    if (s === 'idle' || s === 'calm') {
      let near = false;
      for (const p of e.nearbyPlayers ?? []) if (dist3(p.pos, m.pos) <= TUNING.buzzHear) { near = true; break; }
      if (!near) return;
    }
    d.buzz = e.now;
    this.#say(e, s === 'attack' ? 'buzz_attack' : s === 'alarmed' || s === 'flee' ? 'buzz_alarm' : 'buzz_idle', s === 'idle' || s === 'calm' ? 12 : 18);
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e) {
    const m = e.mob, d = m.data, pos = m.pos;
    if (!d.s) {
      d.ph = e.random() * Math.PI * 2; d.dir = e.random() * Math.PI * 2;
      d.hx = +pos.x.toFixed(2); d.hz = +pos.z.toFixed(2);
      this.#enter(e, 'idle');
    }
    const ground = this.#surface(e);
    const since = e.now - d.t;
    this.#buzz(e);
    // smoke / fire near: it breaks up and keeps away (whatever it was doing)
    if (d.s !== 'flee') { const smoke = this.#smoke(e); if (smoke) { d.from = smoke; this.#enter(e, 'flee'); } }
    // broken flowers near: that player is the prey
    if (d.s !== 'flee' && d.s !== 'attack') {
      const who = this.#disturbed(e);
      if (who !== null && who !== undefined) { const p = e.player(who); if (p && !p.dead && !p.creative) { d.target = p.id; this.#enter(e, 'attack'); } }
    }
    switch (d.s) {
      case 'idle': case 'calm': {
        // a player close and in sight: the warning
        if (d.s === 'idle' || since > 1200) {
          let best = null, bd = Infinity;
          for (const p of e.nearbyPlayers ?? []) {
            if (p.dead || p.creative) continue;
            const pd = dist3(p.pos, pos);
            if (pd <= TUNING.alarmRange && pd < bd && e.canSee(p)) { best = p; bd = pd; }
          }
          if (best) { d.target = best.id; this.#enter(e, 'alarmed'); return this.#hoverAt(e, ground, TUNING.alarmHover, 3, 0, 0, best.pos); }
        }
        if (d.s === 'calm' && since >= TUNING.calmMs) this.#enter(e, 'idle');
        // the lazy wander over the meadow, kept near home
        d.turnT = (d.turnT ?? 0) - (e.dt ?? 0.05);
        if (d.turnT <= 0) { d.turnT = 2.5 + e.random() * 4; d.dir += (e.random() - 0.5) * 2.4; }
        const hx = d.hx ?? pos.x, hz = d.hz ?? pos.z;
        if (Math.hypot(pos.x - hx, pos.z - hz) > TUNING.home) d.dir = Math.atan2(hz - pos.z, hx - pos.x);
        let dx = Math.cos(d.dir), dz = Math.sin(d.dir);
        if (this.#blocked(e, dx, dz)) { d.dir += Math.PI * (0.6 + e.random() * 0.8); dx = Math.cos(d.dir); dz = Math.sin(d.dir); }
        const s = d.s === 'calm' ? TUNING.driftSpeed * 1.6 : TUNING.driftSpeed;
        return this.#hoverAt(e, ground, TUNING.hover, TUNING.hoverAccel, dx * s, dz * s, { x: pos.x + dx * 4, y: pos.y, z: pos.z + dz * 4 });
      }
      case 'alarmed': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'calm'); return this.#hoverAt(e, ground, TUNING.hover); }
        const pd = dist3(p.pos, pos);
        // "too close": within `provoke` blocks on the ground's plane (it hangs high while alarmed: under it counts)
        if (dist2(p.pos, pos) <= TUNING.provoke && Math.abs(p.pos.y + 1 - (pos.y + BOX.centre)) <= 2.5 && e.canSee(p)) { this.#enter(e, 'attack'); return this.ai(e); }
        d.far = pd > TUNING.alarmLeave ? (d.far ?? 0) + (e.dt ?? 0.05) * 1000 : 0;
        if (d.far >= TUNING.alarmForgetMs) { this.#enter(e, 'calm'); return this.#hoverAt(e, ground, TUNING.hover); }
        return this.#hoverAt(e, ground, TUNING.alarmHover, 3, 0, 0, p.pos); // hangs there, higher, facing the intruder
      }
      case 'attack': {
        const p = this.#prey(e);
        if (!p || since > TUNING.attackMaxMs) { this.#enter(e, 'calm'); return this.#hoverAt(e, ground, TUNING.hover); }
        const chest = { x: p.pos.x, y: p.pos.y + 1.0, z: p.pos.z };
        const centre = { x: pos.x, y: pos.y + BOX.centre, z: pos.z };
        if (this.#underWater(p)) {
          // the refuge: it hangs over the water above them, then gives up
          d.wet = (d.wet ?? 0) + (e.dt ?? 0.05) * 1000;
          if (d.wet >= TUNING.waterSafeMs) { this.#enter(e, 'calm'); return this.#hoverAt(e, ground, TUNING.hover); }
          const over = toward(centre, { x: p.pos.x, y: centre.y, z: p.pos.z }, TUNING.chaseSpeed * 0.6);
          const surf = this.#surface(e);
          return this.#fly(e, [over[0], climbToward(pos.y, surf + TUNING.waterHover, TUNING.maxClimb), over[2]], 3, p.pos);
        }
        d.wet = 0;
        const gap = dist3(centre, chest);
        const want = gap > 0.35 ? toward(centre, chest, Math.min(TUNING.chaseSpeed, gap * 3)) : [0, 0, 0];
        if (gap <= TUNING.overlap && e.now >= (d.nextSting ?? 0)) this.#sting(e, p);
        return this.#fly(e, want, TUNING.chaseAccel, p.pos);
      }
      case 'flee': {
        if (since >= TUNING.fleeMs) { this.#enter(e, 'calm'); return this.#hoverAt(e, ground, TUNING.hover); }
        const [fx, fz] = d.from ?? [pos.x, pos.z];
        const dx = pos.x - fx, dz = pos.z - fz, hl = Math.hypot(dx, dz) || 1;
        return this.#hoverAt(e, ground, TUNING.alarmHover, 3, dx / hl * TUNING.fleeSpeed, dz / hl * TUNING.fleeSpeed, null);
      }
      default: this.#enter(e, 'idle'); return this.#fly(e, [0, 0, 0], 3, null);
    }
  }

  // a sting: a little damage (armour helps, a shield does not: they come from every side) and, every few, more Picada
  #sting(e, p) {
    const d = e.mob.data;
    d.nextSting = e.now + TUNING.stingEvery;
    d.stings = (d.stings ?? 0) + 1;
    d.total = (d.total ?? 0) + 1;
    try { p.damage(TUNING.stingDamage, STING_DAMAGE); } catch { /* a test double */ }
    if (d.stings % TUNING.venomEvery === 1) {
      let level = 0;
      try { level = (p.effects?.() ?? []).find((x) => x.name === STING_EFFECT)?.level ?? 0; } catch { level = 0; }
      try { p.addEffect(STING_EFFECT, TUNING.venomSeconds, Math.min(TUNING.venomMax, level + 1)); } catch { /* effects off */ }
    }
    this.#cue(e, 'sting');
    this.#say(e, 'sting', 12);
  }

  // a wall (or a trunk) ahead: the drift turns away from it
  #blocked(e, hx, hz) {
    const { x, y, z } = e.mob.pos;
    try { return e.solidAt(x + hx * 1.4, y + BOX.centre, z + hz * 1.4); } catch { return false; }
  }

  // every tick, after the engine's steering (and with no gravity): ease toward the wanted velocity; a decision older than
  // STALE_S (the brain cut off, or not called yet) is not flown — it holds still in the air, never falls
  travel(e) {
    const d = e.mob.data;
    d.age = (d.age ?? 0) + e.dt;
    const want = d.age <= STALE_S ? d.want : null;
    if (!Array.isArray(want) || want.length !== 3 || !want.every(Number.isFinite)) { easeVelocity(e.velocity, HOLD, 4, e.dt); return; }
    easeVelocity(e.velocity, want, d.rate ?? 3, e.dt, 9);
  }

  // ------------------------------------------------------------------------------------------- hooks
  onHurt(e) {
    const m = e.mob, d = m.data;
    if (m.health <= 0) return;
    // the browser scatters the insects on the hit itself (mobHurt); this is the sound of it
    try { e.server?.playSound(sound('scatter'), m.pos, { radius: 16 }); } catch { /* sound budget */ }
    if (!e.attacker || e.attacker.creative) return;
    d.target = e.attacker.id;
    if (d.s !== 'attack') this.#enter(e, 'attack');
  }

  onDeath(e) {
    try { e.server?.playSound(sound('death'), e.mob.pos, { radius: 16 }); } catch { /* sound budget */ }
  }
}
