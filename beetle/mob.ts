// @ts-check
// The Crystal Beetle (creatures:crystal_beetle, "Escaravelho de Cristal"): a heavy cave beetle with a faceted crystal
// shell that glows in the dark. It wanders slowly over the rock; when it sees a player within TUNING.sight blocks it
// CURLS into a ball and ROLLS straight at them — a fast charge that slams (damage + knockback) and stops on whatever it
// hits, a player or a wall. The impact leaves it STUNNED, FLIPPED on its back with its legs flailing for TUNING.flipMs:
// the only window when its shell does not protect it (otherwise only TUNING.armor of a blow gets through). Then it rolls
// back onto its legs and, after a breather, does it again.
//
// States in e.mob.data.s (the brain is shared by every beetle; each one's state lives in its own data):
//   wander -> curl -> roll -> flipped -> uncurl -> wander
// The browser sees the same states as the mob's POSE (e.mob.setPose: 'curl' | 'roll' | 'flipped' | 'uncurl' | null),
// which rides every `mobs` entry: a player who walks in mid-stun still sees it on its back.
import { MobType } from '../mineclaude-sdk.js';
import { BODY, MOB_PATH, POSES, TUNING } from './tuning.ts';
import { ROCK_FLOOR, crystalCave, geodeHome } from './spawn.ts';
import { FEATURE_GROUND, featureHomeRules } from '../src/biome-homes.ts';

export const BEETLE_SOUNDS = ['click', 'roll', 'impact', 'chime', 'death'];
export const beetleSound = (name) => `creatures:${MOB_PATH}_${name}`;

const horiz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class CrystalBeetle extends MobType {
  name = 'Escaravelho de Cristal';
  emoji = '🪲';
  halfW = BODY.halfW;
  height = BODY.height;
  behavior = /** @type {const} */ ('hostile');
  burn = false; // it lives in the dark, but the sun does not hurt it
  hp = 30;
  speed = 1.6;
  damage = 5; // the slam of the roll
  xp = 8;
  aiEvery = 1; // the roll is steered and checked tick by tick
  // its first decision pays for warming up the line-of-sight and fit checks (seen at ~28 ms under load); the default
  // 20 ms cut would hand it to the plain hostile chase for 5 s. Every later call is well under 1 ms.
  aiBudget = 100;
  knockbackTaken = 0.25; // heavy: a blow barely moves it
  sound = `${MOB_PATH}_click`; // its voice: dry chitin clicks
  drops = [['creatures:crystal_shard', 1, 3]];
  spawn;

  /** @param {{ getBlock: (pos: { x: number, y: number, z: number }) => string | null }} env */
  constructor(env) {
    super();
    // only in caves: the 'underground' situation (dark, well below the surface), on rock, in a cave in the rock.
    // Rare: at most 2 near a player.
    this.spawn = [
      { when: 'underground', weight: 8, cap: 2, group: [1, 1], ground: ROCK_FLOOR.slice(), test: crystalCave(env.getBlock) },
      // home: the crystal geodes of the `biomes` mod (biome worlds only). Not a biome, so it is found by its floor (amethyst,
      // calcite); without geodes no spot stands on them and the draw is the old one. Much more common there, a few at a time
      ...featureHomeRules(FEATURE_GROUND.crystal_geodes, [
        { when: 'underground', weight: 40, cap: 4, group: [1, 2], test: geodeHome(env.getBlock) },
      ]),
    ];
  }

  // ------------------------------------------------------------------------------------------- state changes
  #enter(e, s) {
    const m = e.mob, d = m.data;
    d.s = s; d.t = e.now;
    if (s === 'wander') { m.setPose(null); d.target = d.target ?? null; }
    else if (s === 'curl') { m.setPose(POSES.curl); this.#say(e, 'click'); }
    else if (s === 'roll') { m.setPose(POSES.roll); this.#say(e, 'roll'); d.moved = e.now; d.last = { x: m.pos.x, z: m.pos.z }; d.contact = false; }
    else if (s === 'flipped') { m.setPose(POSES.flipped); this.#say(e, 'impact'); }
    else if (s === 'uncurl') { m.setPose(POSES.uncurl); this.#say(e, 'click', 0.7); }
  }

  #say(e, name, volume = 1) {
    try { e.server?.playSound(beetleSound(name), { mob: e.mob.id, radius: 18, volume }); } catch { /* a full sound budget is not an error */ }
  }

  // the target it still has: alive, in the world, not in creative, not too far
  #target(e) {
    const id = e.mob.data.target;
    if (id === null || id === undefined) return null;
    const p = e.player(id);
    if (!p || p.dead || p.creative || (p.room && p.room !== 'mundo')) return null;
    return horiz(p.pos, e.mob.pos) <= TUNING.giveUp ? p : null;
  }

  // a player worth curling up for: in range, in sight, not in creative
  #spot(e) {
    let best = null, bd = Infinity;
    for (const p of e.nearbyPlayers) {
      if (p.dead || p.creative) continue;
      const pd = horiz(p.pos, e.mob.pos);
      if (pd <= TUNING.sight && Math.abs(p.pos.y - e.mob.pos.y) < 4 && pd < bd && e.canSee(p)) { best = p; bd = pd; }
    }
    return best;
  }

  #end(e, why) {
    e.mob.data.end = why; // 'player' | 'wall' | 'tired' (read by the tests)
    this.#enter(e, 'flipped');
    return { stay: true };
  }

  // ------------------------------------------------------------------------------------------- the brain
  ai(e) {
    const m = e.mob, d = m.data;
    if (!d.s) this.#enter(e, 'wander');
    const since = e.now - d.t;
    switch (d.s) {
      case 'wander': {
        if (since >= (d.rest ?? 0)) {
          const p = this.#spot(e) ?? this.#target(e);
          if (p && e.canSee(p)) { d.target = p.id; d.rest = 0; this.#enter(e, 'curl'); return { walk: [0, 0], look: p.pos }; }
        }
        return { wander: true, speed: TUNING.wanderSpeed };
      }
      case 'curl': {
        const p = this.#target(e);
        if (!p) { this.#enter(e, 'uncurl'); return { stay: true }; }
        if (since < TUNING.curlMs) return { walk: [0, 0], look: p.pos };
        const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, len = Math.hypot(dx, dz) || 1;
        d.dir = [dx / len, dz / len]; // the roll is a STRAIGHT charge: it is aimed once and never steers
        this.#enter(e, 'roll');
        return this.#roll(e, p);
      }
      case 'roll': {
        if (d.contact) return this.#end(e, 'player'); // last tick the slam landed (the engine's hit runs after the ai)
        const [wx, wz] = d.dir;
        if (!e.fits(wx * TUNING.wallAhead, wz * TUNING.wallAhead)) return this.#end(e, 'wall');
        const moved = Math.hypot(m.pos.x - d.last.x, m.pos.z - d.last.z);
        if (moved > 0.08) { d.moved = e.now; d.last = { x: m.pos.x, z: m.pos.z }; }
        else if (since > 200 && e.now - d.moved > TUNING.stuckMs) return this.#end(e, 'wall');
        if (since > TUNING.rollMaxMs) return this.#end(e, 'tired');
        return this.#roll(e, this.#target(e));
      }
      case 'flipped': {
        if (since >= TUNING.flipMs) this.#enter(e, 'uncurl');
        return { stay: true };
      }
      case 'uncurl': {
        if (since >= TUNING.uncurlMs) { d.rest = TUNING.rechargeMs; this.#enter(e, 'wander'); }
        return { stay: true };
      }
      default: this.#enter(e, 'wander'); return { stay: true };
    }
  }

  // one tick of the charge: straight along d.dir at the roll's pace; the engine slams whoever is in reach
  #roll(e, p) {
    const m = e.mob, d = m.data, [wx, wz] = d.dir;
    const out: any = { walk: [wx, wz], pace: TUNING.rollPace, yaw: Math.atan2(-wx, -wz) };
    if (p) {
      out.attack = { target: p, nav: 'none', reach: TUNING.rollReach, every: 0.5, knock: TUNING.rollKnock, speed: 1 };
      if (horiz(p.pos, m.pos) < TUNING.rollReach && Math.abs(p.pos.y - m.pos.y) < 1.6) d.contact = true;
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------- hooks
  // The shell: everywhere but on its back, only TUNING.armor of a blow gets through (and it rings like crystal).
  onHit(e) {
    const s = e.mob.data.s;
    if (s === 'flipped') return;
    e.damage = Math.min(100, e.damage * TUNING.armor);
    this.#say(e, 'chime');
  }

  onHurt(e) {
    const d = e.mob.data;
    // hit while strolling: it turns on whoever did it (the roll starts as soon as it can see them)
    if (e.attacker && (d.s === 'wander' || !d.s)) { d.target = e.attacker.id; d.rest = 0; }
  }

  onDeath(e) {
    try { e.server?.playSound(beetleSound('death'), e.mob.pos, { radius: 18 }); } catch { /* sound budget */ }
  }
}
