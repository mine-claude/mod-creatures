// @ts-check
// The Canopy Sentinel's behaviour as Goals (server only; per-mob state in e.mob.data with short keys, the goal objects
// keep nothing):
//   1. SentinelCoverGoal  — after a hit, or when a player points a bow at it, it ducks behind a solid block (a spot
//                           whose line to the threat is blocked, tactics.findCover) for a moment, then peeks out;
//   2. SentinelArcherGoal — a player noticed (24 blocks; a clear line beyond 8) or reported by a band mate: it whistles
//                           to the band the first time, keeps 10..18 blocks away (backpedals, hops back when closer than
//                           6, closes in beyond 18, strafes in the band), climbs to HIGH GROUND nearby when there is
//                           some (tactics.findHighGround), and shoots: reload -> a draw whose length grows with the
//                           distance (and makes the arrow faster, tactics.drawSpeed) -> hold until the line is clear and
//                           no band mate released in the last STAGGER s -> release, LEADING the target (e.shoot lead:
//                           its velocity measured here from its positions). Every SMOKE_EVERY-th arrow is a smoke arrow;
//   3. WanderGoal         — otherwise it strolls.
// Every step of the shot sends a cue (e.mob.cue) so the browser plays it: 'nock', 'draw_XX'/'drawsmoke_XX', 'release',
// 'whistle'.
import { Goal } from '../mineclaude-sdk.js';
import {
  ARROW, ARROW_PROJECTILE, COVER_COOLDOWN, COVER_TIME, GROUP_RADIUS, HIGH_EVERY, HIGH_GAIN, KEEP_MAX, KEEP_MIN, NOTICE,
  NOTICE_NEAR, RELOAD_TIME, SENTINEL, SMOKE, SMOKE_EVERY, SMOKE_PROJECTILE, SOUNDS, TOO_CLOSE, aimedAt, drawSpeed,
  drawTimeFor, findCover, findHighGround, staggerOk,
} from './tactics.ts';
import { drawCue } from './archery.ts';

export const BOWS = new Set(['mineclaude:bow', 'mineclaude:crossbow', 'creatures:sentinel_bow']);
const RELEASE_REST = 0.35; // s after a release before the hand goes to the quiver
const VEL_EVERY = 0.2; // s between the target's position samples (its velocity, for the lead)
const HOP_EVERY = 0.9;

const horiz = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const away = (from, to) => { const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
const secs = (e) => e.now / 1000;
const solidOf = (e) => (x, y, z) => e.solidAt(x + 0.5, y + 0.5, z + 0.5);
const valid = (p, me, range) => p && !p.dead && !p.creative && (!p.room || p.room === 'mundo') && Math.hypot(p.pos.x - me.x, p.pos.y - me.y, p.pos.z - me.z) <= range;

/** The other sentinels of its band (alive, within GROUP_RADIUS), as e.mob infos. */
export const bandOf = (e) => e.mobsNear(GROUP_RADIUS).filter((o) => o.name === SENTINEL && !o.dead);

/**
 * Its target: the one it has (while valid), else the nearest it notices (a clear line beyond NOTICE_NEAR), else the
 * one a band mate is shooting at. A new target makes it whistle to the band (once every few seconds per band).
 */
export function acquire(e) {
  const d = e.mob.data, me = e.mob.pos;
  if (d.tg !== undefined) {
    const p = e.player(d.tg);
    if (valid(p, me, NOTICE + 8)) return p;
    delete d.tg;
  }
  let p = e.nearestPlayer(NOTICE, 10);
  if (p && (p.creative || p.dead || (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) > NOTICE_NEAR && !e.canSee(p)))) p = null;
  let told = false;
  if (!p) {
    for (const o of bandOf(e)) {
      const q = o.data.tg !== undefined ? e.player(o.data.tg) : null;
      if (valid(q, me, NOTICE + 8)) { p = q; told = true; break; }
    }
  }
  if (!p) return null;
  d.tg = p.id;
  if (!told) whistle(e, bandOf(e));
  return p;
}

// The signal to the band: a whistle when it spots someone, and again (now and then) while a mate near it has no target
// yet — that mate then takes this one's (acquire). Never two whistles of the band within 4 s.
function whistle(e, band) {
  const now = secs(e), d = e.mob.data;
  if (!band.length || !band.every((o) => !(now - (o.data.wh ?? -99) < 4)) || now - (d.wh ?? -99) < 6) return;
  d.wh = now;
  e.mob.cue('whistle');
  e.server.playSound(SOUNDS.whistle, e.mob.pos, { radius: 32 });
}

// The target's horizontal velocity from its positions (sampled every VEL_EVERY s, smoothed): what the lead uses.
function trackVelocity(e, p) {
  const d = e.mob.data, now = secs(e);
  if (!d.lp || d.lp[3] !== p.id || now - d.lp[2] > 1) { d.lp = [p.pos.x, p.pos.z, now, p.id]; d.pv = [0, 0]; return; }
  const dt = now - d.lp[2];
  if (dt < VEL_EVERY) return;
  const vx = (p.pos.x - d.lp[0]) / dt, vz = (p.pos.z - d.lp[1]) / dt;
  const k = 0.6;
  d.pv = [(d.pv?.[0] ?? 0) * (1 - k) + vx * k, (d.pv?.[1] ?? 0) * (1 - k) + vz * k];
  d.lp = [p.pos.x, p.pos.z, now, p.id];
}

export class SentinelCoverGoal extends Goal {
  canUse(e, mem) {
    const d = e.mob.data, now = secs(e);
    if (d.cu !== undefined && now < d.cu) { mem.p = d.tg !== undefined ? e.player(d.tg) : null; return true; }
    if (d.cu !== undefined) { delete d.cu; delete d.cs; }
    if (!d.cr) return false;
    d.cr = 0;
    const p = d.tg !== undefined ? e.player(d.tg) : e.nearestPlayer(NOTICE, 10);
    if (!p || p.dead || p.creative) return false;
    const spot = findCover(solidOf(e), e.mob.pos, p.pos);
    const hide = COVER_TIME[0] + e.random() * (COVER_TIME[1] - COVER_TIME[0]);
    d.cu = now + (spot ? hide : 0.7); // no cover: a quick dodge aside instead
    d.cc = d.cu + COVER_COOLDOWN;
    d.cs = spot ? [spot.x, spot.y, spot.z] : null;
    d.ds = e.random() < 0.5 ? -1 : 1;
    mem.p = p;
    return true;
  }
  tick(e, mem) {
    const d = e.mob.data, p = mem.p;
    d.mode = 'cover';
    d.hid = p ? (e.canSee(p) ? 0 : 1) : 0;
    if (d.cs) return { moveTo: { x: d.cs[0], y: d.cs[1], z: d.cs[2] }, moveSpeed: 1.4, moveStop: 0.15, keepCd: true };
    if (!p) return { stay: true };
    const [ux, uz] = away(e.mob.pos, p.pos), s = d.ds ?? 1;
    const side = e.fits(-uz * s, ux * s) ? [-uz * s, ux * s] : [uz * s, -ux * s];
    return { walk: side, speed: 1.4, look: p.pos, jump: 7 };
  }
}

export class SentinelArcherGoal extends Goal {
  canUse(e, mem) {
    mem.p = acquire(e);
    return !!mem.p;
  }
  tick(e, mem) {
    const p = mem.p, d = e.mob.data, me = e.mob.pos, now = secs(e), dt = e.dt;
    const dist = horiz(me, p.pos);
    trackVelocity(e, p);
    // a bow pointed at it: duck behind something (next tick, the cover goal)
    if (!(now < (d.cc ?? -1))) {
      let held = null;
      try { held = p.heldItem?.() ?? null; } catch { held = null; }
      if (held && BOWS.has(held) && aimedAt(p.eye, p.look, { x: me.x, y: me.y + 1, z: me.z })) d.cr = 1;
    }
    const see = e.canSee(p);
    this.shoot(e, p, d, dist, see, now, dt);
    // a mate near it that has not seen anyone yet: whistle it in (checked once a second)
    d.wc = (d.wc ?? 0) - dt;
    if (d.wc <= 0) { d.wc = 1; const band = bandOf(e); if (band.some((o) => o.data.tg === undefined)) whistle(e, band); }

    // ---- where to stand
    const look = { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z };
    // high ground: search now and then; walk there when it found some
    d.hc = (d.hc ?? 0) - dt;
    if (d.hc <= 0 && !d.hs) {
      d.hc = HIGH_EVERY;
      if (me.y < p.pos.y + HIGH_GAIN - 0.5 && dist > TOO_CLOSE) {
        const spot = findHighGround(solidOf(e), me, p.pos, { avoid: (d.ha ?? []).map(([x, y, z]) => ({ x, y, z })) });
        if (spot) { d.hs = [spot.x, spot.y, spot.z]; d.hu = now + 9; }
      }
    }
    if (d.hs) {
      const [hx, hy, hz] = d.hs;
      if (Math.hypot(me.x - hx, me.z - hz) < 0.7 && Math.abs(me.y - hy) < 0.6) { delete d.hs; d.hc = HIGH_EVERY * 2; d.perch = 1; }
      else if (now > d.hu || dist < TOO_CLOSE) { // did not get there (or the player is on it): skip that spot for a while
        d.ha = [...(d.ha ?? []).slice(-3), [Math.floor(hx), hy, Math.floor(hz)]];
        delete d.hs;
      } else { d.mode = 'climb'; return { moveTo: { x: hx, y: hy, z: hz }, moveSpeed: 1.2, moveStop: 0.2, look, keepCd: true }; }
    }
    const [ux, uz] = away(me, p.pos);
    const roomBehind = e.fits(-ux * 1.2, -uz * 1.2);
    if (dist < 1.8 && !roomBehind) { // cornered: the knife
      d.mode = 'melee';
      return { keepCd: true, attack: { target: p, reach: 1.6, every: 1.1, knock: 5, speed: 1, nav: 'direct' } };
    }
    if (dist < TOO_CLOSE) { // too close: hop back, still facing it
      d.mode = 'hop';
      d.jc = (d.jc ?? 0) - dt;
      const out = { look, walk: [-ux, -uz], speed: 1.35, keepCd: true };
      if (d.jc <= 0 && roomBehind) { d.jc = HOP_EVERY; return { ...out, jump: 7.5 }; }
      return out;
    }
    if (dist < KEEP_MIN) { d.mode = 'back'; return { look, walk: [-ux, -uz], speed: 0.85, keepCd: true }; }
    if (dist > KEEP_MAX) { d.mode = 'close'; return { look, walk: [ux, uz], speed: 0.9, keepCd: true }; }
    // in the band: strafe now and then, never off a ledge it does not fit
    d.mode = d.perch && me.y >= p.pos.y + HIGH_GAIN - 0.5 ? 'perch' : 'strafe';
    d.st = (d.st ?? 0) - dt;
    if (d.st <= 0) { d.st = 1.5 + e.random() * 1.5; d.sd = e.random() < 0.3 ? 0 : (e.random() < 0.5 ? -1 : 1); }
    const s = d.mode === 'perch' ? 0 : (d.sd ?? 0);
    const walk = s && e.fits(-uz * s, ux * s) ? [-uz * s, ux * s] : [0, 0];
    return { look, walk, speed: 0.5, keepCd: true };
  }

  // The shot's state machine: reload -> ready -> draw -> hold -> (release) -> rest -> reload.
  shoot(e, p, d, dist, see, now, dt) {
    d.pt = (d.pt ?? 0) - dt;
    if (d.ph === undefined) { d.ph = 'reload'; d.pt = RELOAD_TIME; e.mob.cue('nock'); return; }
    if (d.ph === 'rest' && d.pt <= 0) { d.ph = 'reload'; d.pt = RELOAD_TIME; e.mob.cue('nock'); if (e.random() < 0.3) e.server.playSound(SOUNDS.rustle, e.mob.pos, { radius: 12 }); return; }
    if (d.ph === 'reload' && d.pt <= 0) d.ph = 'ready';
    if (d.ph === 'ready' && see && dist <= NOTICE + 2 && dist >= 2) {
      d.dd = Math.round(drawTimeFor(dist) * 10) / 10;
      d.n = d.n ?? 0;
      d.sm = d.n % SMOKE_EVERY === SMOKE_EVERY - 1 && dist >= 8 ? 1 : 0;
      d.ph = 'draw'; d.pt = d.dd;
      e.mob.cue(drawCue(d.dd, !!d.sm));
      e.server.playSound(SOUNDS.draw, e.mob.pos, { radius: 16 });
      return;
    }
    if (d.ph === 'draw' && d.pt <= 0) { d.ph = 'hold'; d.ht = 0; }
    if (d.ph === 'hold') {
      d.ht = (d.ht ?? 0) + dt;
      if (d.ht > 5) { d.ph = 'ready'; return; } // held too long with nothing to loose at: ease off (it draws again)
      if (!see) return;
      const mates = bandOf(e).map((o) => o.data.ls);
      if (!staggerOk(now, mates)) return;
      const opts = { projectile: d.sm ? SMOKE_PROJECTILE : ARROW_PROJECTILE, speed: drawSpeed(d.dd), damage: d.sm ? SMOKE.damage : ARROW.damage, error: ARROW.error, lead: { x: clampV(d.pv?.[0]), z: clampV(d.pv?.[1]) } };
      e.mob.cue('release');
      const shot = e.shoot(p, opts);
      if (shot) e.server.playSound(SOUNDS.release, e.mob.pos, { radius: 20 });
      d.ls = now; d.n = (d.n ?? 0) + 1; d.shots = (d.shots ?? 0) + (shot ? 1 : 0);
      d.rl = [...(d.rl ?? []).slice(-5), Math.round(now * 100) / 100]; // its last releases (s, the tick clock)
      d.ph = 'rest'; d.pt = RELEASE_REST;
    }
  }
}

const clampV = (v) => (Number.isFinite(v) ? Math.max(-12, Math.min(12, v)) : 0);
