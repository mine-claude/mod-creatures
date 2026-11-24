// @ts-check
// The Lure Lantern (Lampiraço, creatures:lure_lantern): a FLOATING ambusher of the marshes at night. From afar it is a
// warm lantern bobbing over the water — a soft body with a glowing lure hanging from a stalk, tendrils trailing under
// it. When a player comes within TUNING.notice blocks (and in its sight), the "lantern" SPLITS OPEN into a toothed maw,
// it hangs there a breath, DIVES at them and bites, then RETREATS up and circles, and dives again. Lose it (far, dead,
// creative) and the maw closes: a lantern again.
//
// It flies with what the engine already gives a mod mob: `gravity = 0` (no fall) and `travel(e)` (the velocity, after
// the engine's own steering). The brain (ai, every tick) writes the WANTED velocity into e.mob.data.want and travel eases
// the real one toward it (flight.ts), so every turn, dive and climb has inertia. The browser never sees a pose: the
// code-built body (renderer.ts) is told by cues (e.mob.cue): 'reveal', 'dive', 'bite', 'close' and, while open, 'open'
// again every couple of seconds for whoever comes into view late.
//
// States (e.mob.data.s): drift -> reveal -> dive -> retreat -> stalk -> dive ... ; prey lost -> close -> drift.
import { MobType } from '../mineclaude-sdk.js';
import { GLAND, TUNING, sound } from './tuning.ts';
import { climbToward, driftHeight, easeVelocity, orbitPoint, surfaceBelow, toward } from './flight.ts';
import { isWater, swampNight } from './spawn.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

const STALE_S = 0.3, HOLD = Object.freeze([0, 0, 0]);
const OPEN = new Set(['reveal', 'dive', 'retreat', 'stalk']);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class LureLantern extends MobType {
  name = 'Lampiraço';
  emoji = '🏮';
  halfW = 0.4;
  height = 0.9;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // a night creature, but the sun does not burn it: it simply is not born by day
  hp = 14;
  speed = 2;
  damage = 4;
  xp = 6;
  gravity = 0; // it floats: the engine's fall is off, travel() flies it
  aiEvery = 1; // the dive and the bite are timed tick by tick
  // Its declared ai budget (ms): the first calls of a fresh server (cold code, the first block reads of a chunk) can pass the
  // engine's default 20 ms cut, which would switch its brain off for 5 s while travel() kept flying the last decision.
  aiBudget = 150;
  knockbackTaken = 0.5;
  sound = 'lantern_hum'; // its voice: a soft, warm hum (the ambient sound, and on every hit)
  drops = [[GLAND, 1, 2]];
  spawn;
  _getBlock = (pos: { x: number, y: number, z: number }): string | null => null; // `_` keeps it out of the engine's fields

  /** @param {{ getBlock: (pos: { x: number, y: number, z: number }) => string | null }} env */
  constructor(env) {
    super();
    this._getBlock = env.getBlock;
    // at night, over the wet low ground (spawn.ts); rare: at most 2 near a player, one or two at a time
    const test = swampNight(env.getBlock);
    this.spawn = [
      { when: 'night', weight: 8, cap: 2, group: [1, 2], ground: null, light: { max: 0.3 }, test },
      // home: the Brejo Luminoso (biome worlds only; elsewhere this never matches and the draw is the old one). Same test: the
      // spot must have water near it (inside a marsh one water cell is enough), so they gather over its pools
      ...homeRules(HOME.glow_marsh, HOME_GROUND.glow_marsh, [
        { when: 'night', weight: 40, cap: 4, group: [1, 3], light: { max: 0.3 }, test },
      ]),
    ];
  }

  // ------------------------------------------------------------------------------------------- helpers
  #say(e, name) {
    try { e.server?.playSound(sound(name), { mob: e.mob.id, radius: 20 }); } catch { /* a full sound budget is not an error */ }
  }

  #cue(e, name) {
    try { e.mob.cue(name); } catch { /* a test double without cues */ }
  }

  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    if (s === 'drift') { m.setHealthBar(false); d.target = null; }
    else if (s === 'reveal') { m.setHealthBar(true); this.#cue(e, 'reveal'); this.#say(e, 'reveal'); d.cueAt = e.now; }
    else if (s === 'dive') { this.#cue(e, 'dive'); d.cueAt = e.now; }
    else if (s === 'stalk') { d.next = e.now + TUNING.diveEvery[0] + e.random() * (TUNING.diveEvery[1] - TUNING.diveEvery[0]); }
    else if (s === 'close') { this.#cue(e, 'close'); m.setHealthBar(false); }
  }

  // what it floats over (ground or water), looked up every quarter second
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

  // the decision: the wanted velocity goes to travel() through data; the engine steers the same way (walk + pace) and faces `look`
  #fly(e, want, rate, look, extra: any = null) {
    const d = e.mob.data, h = Math.hypot(want[0], want[2]);
    d.want = [+want[0].toFixed(3), +want[1].toFixed(3), +want[2].toFixed(3)];
    d.rate = rate;
    d.age = 0; // travel() counts how long ago the brain last spoke
    const out: any = { walk: h > 1e-3 ? [want[0] / h, want[2] / h] : [0, 0], pace: Math.max(0.01, h) };
    if (look) out.look = look;
    return extra ? Object.assign(out, extra) : out;
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e) {
    const m = e.mob, d = m.data, pos = m.pos;
    if (!d.s) { d.ph = e.random() * Math.PI * 2; d.dir = e.random() * Math.PI * 2; this.#enter(e, 'drift'); }
    const ground = this.#surface(e);
    const since = e.now - d.t;
    if (OPEN.has(d.s) && e.now - (d.cueAt ?? 0) > TUNING.recueMs) { d.cueAt = e.now; this.#cue(e, 'open'); }
    switch (d.s) {
      case 'drift': {
        // a player near and in sight springs the trap
        let best = null, bd = Infinity;
        for (const p of e.nearbyPlayers) {
          if (p.dead || p.creative) continue;
          const pd = dist3(p.pos, pos);
          if (pd <= TUNING.notice && pd < bd && e.canSee(p)) { best = p; bd = pd; }
        }
        if (best) { d.target = best.id; this.#enter(e, 'reveal'); return this.#fly(e, [0, 0.4, 0], 3, best.pos); }
        // the lazy wander: a new heading now and then, turned back from walls
        d.turnT = (d.turnT ?? 0) - (e.dt ?? 0.05);
        if (d.turnT <= 0) { d.turnT = 3 + e.random() * 4; d.dir += (e.random() - 0.5) * 2.2; }
        let hx = Math.cos(d.dir), hz = Math.sin(d.dir);
        if (this.#blocked(e, hx, hz)) { d.dir += Math.PI * (0.6 + e.random() * 0.8); hx = Math.cos(d.dir); hz = Math.sin(d.dir); }
        const y = driftHeight(ground, TUNING.hover, TUNING.sway, e.now / 1000, d.ph);
        const vy = climbToward(pos.y, y, TUNING.maxClimb * 0.5);
        const s = TUNING.driftSpeed;
        return this.#fly(e, [hx * s, vy, hz * s], TUNING.hoverAccel, { x: pos.x + hx * 4, y: pos.y, z: pos.z + hz * 4 });
      }
      case 'reveal': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'close'); return this.#fly(e, [0, 0, 0], 3, null); }
        if (since >= TUNING.revealMs) { this.#enter(e, 'dive'); return this.ai(e); }
        return this.#fly(e, [0, 0.4, 0], 4, p.pos); // hangs there, rising a little: the maw opens
      }
      case 'dive': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'close'); return this.#fly(e, [0, 0, 0], 3, null); }
        if (since > TUNING.diveMaxMs) { this.#enter(e, 'retreat'); return this.ai(e); }
        const aim = { x: p.pos.x, y: p.pos.y + 1.0, z: p.pos.z };
        const want = toward({ x: pos.x, y: pos.y + 0.45, z: pos.z }, aim, TUNING.diveSpeed);
        const inReach = dist2(p.pos, pos) < TUNING.biteReach && Math.abs(p.pos.y - pos.y) < TUNING.biteMaxDy;
        if (inReach && e.canSee(p)) {
          // the bite lands this very tick (the engine's attack, armour and shield count), then up and away
          this.#cue(e, 'bite'); this.#say(e, 'bite');
          d.bites = (d.bites ?? 0) + 1;
          this.#enter(e, 'retreat');
          return this.#fly(e, want, TUNING.diveAccel, p.pos, { attack: { target: p, nav: 'none', reach: TUNING.biteReach + 0.1, maxDy: TUNING.biteMaxDy, every: TUNING.biteEvery, knock: TUNING.knock } });
        }
        return this.#fly(e, want, TUNING.diveAccel, p.pos);
      }
      case 'retreat': {
        const p = this.#prey(e);
        if (since > TUNING.retreatMs) { if (p) { this.#enter(e, 'stalk'); return this.ai(e); } this.#enter(e, 'close'); return this.#fly(e, [0, 0, 0], 3, null); }
        const from = p ? p.pos : pos;
        const dx = pos.x - from.x, dz = pos.z - from.z, h = Math.hypot(dx, dz) || 1;
        const top = (p ? p.pos.y : ground) + TUNING.retreatUp + 1;
        const vy = pos.y < top ? TUNING.retreatUp : climbToward(pos.y, top, TUNING.maxClimb);
        return this.#fly(e, [dx / h * TUNING.retreatAway, vy, dz / h * TUNING.retreatAway], 5, p ? p.pos : null);
      }
      case 'stalk': {
        const p = this.#prey(e);
        if (!p) { this.#enter(e, 'close'); return this.#fly(e, [0, 0, 0], 3, null); }
        if (e.now >= d.next && dist2(p.pos, pos) <= TUNING.diveRange && e.canSee(p)) { this.#enter(e, 'dive'); return this.ai(e); }
        d.orb = (d.orb ?? Math.atan2(pos.z - p.pos.z, pos.x - p.pos.x)) + TUNING.stalkOrbit * (e.dt ?? 0.05);
        const spot = orbitPoint(p.pos, TUNING.stalkRadius, TUNING.stalkAbove, d.orb);
        spot.y = Math.max(spot.y, ground + TUNING.hover);
        const gx = (spot.x - pos.x) * 1.2, gz = (spot.z - pos.z) * 1.2, gh = Math.hypot(gx, gz), k = gh > 3.5 ? 3.5 / gh : 1;
        return this.#fly(e, [gx * k, climbToward(pos.y, spot.y, TUNING.maxClimb), gz * k], 3, p.pos);
      }
      case 'close': {
        if (since >= TUNING.closeMs) this.#enter(e, 'drift');
        const y = driftHeight(ground, TUNING.hover, TUNING.sway, e.now / 1000, d.ph);
        return this.#fly(e, [0, climbToward(pos.y, y, TUNING.maxClimb * 0.5), 0], 3, null);
      }
      default: this.#enter(e, 'drift'); return this.#fly(e, [0, 0, 0], 3, null);
    }
  }

  // a wall (or a trunk) ahead at body height: the drift turns away from it
  #blocked(e, hx, hz) {
    const { x, y, z } = e.mob.pos;
    try { return e.solidAt(x + hx * 1.2, y + 0.45, z + hz * 1.2); } catch { return false; }
  }

  // every tick, after the engine's steering (and with no gravity): ease toward the wanted velocity
  // (a decision older than STALE_S — the brain cut off by the engine, or not called yet — is not flown: it holds still in
  // the air, so it can never keep climbing or diving on an old order, and never falls)
  travel(e) {
    const d = e.mob.data;
    d.age = (d.age ?? 0) + e.dt;
    const want = d.age <= STALE_S ? d.want : null;
    if (!Array.isArray(want) || want.length !== 3 || !want.every(Number.isFinite)) { easeVelocity(e.velocity, HOLD, 4, e.dt); return; }
    easeVelocity(e.velocity, want, d.rate ?? 3, e.dt);
  }

  // ------------------------------------------------------------------------------------------- hooks
  onHurt(e) {
    const m = e.mob, d = m.data;
    if (m.health <= 0) return;
    if (e.attacker && (d.target === null || d.target === undefined)) d.target = e.attacker.id;
    if (!d.s || d.s === 'drift' || d.s === 'close') { if (e.attacker) this.#enter(e, 'reveal'); return; }
    if (d.s === 'dive') this.#enter(e, 'retreat'); // struck mid-dive: it breaks off and climbs
  }

  onDeath(e) {
    try { e.server?.playSound(sound('death'), e.mob.pos, { radius: 20 }); } catch { /* sound budget */ }
  }
}

