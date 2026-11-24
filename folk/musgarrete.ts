// @ts-check
// The MUSGARRETE (creatures:musgarrete): small folk of moss, stone and root from the Floresta Musgosa. Slow, patient, they
// quarry their own stone and raise round stone huts; they sleep curled up in moss nests like boulders, and ring a hollow
// stone at dawn. An NPC of the engine's foundation (ctx.npcs, docs/modding.md §44): this file is only CONTENT — their day,
// their jobs and their trades; walking, digging, building, chests, doors and the safety of every edit are the engine's.
//
// The day (fractions of the game day; 0 = dawn, 0.25 noon, 0.5 dusk):
//   0.98-0.03 wake (the bell-ringer rings the Sino de Pedra-Oca, the others stretch) · 0.03-0.20 work · 0.20-0.29 the
//   plaza (they gather, face each other, talk and gesture) · 0.29-0.46 work · 0.46-0.52 home (eat) · 0.52-0.98 sleep.
// Jobs (the station of the hut): Escavador (miner: digs the village's tunnel into natural stone, block by block, and brings
// the stone and the ore to the village chest), Pedreiro (builder: takes stone from the chest and raises new huts from a
// blueprint on the staked lot, a few blocks a day), Cultivador (grower: harvests ripe wheat and plants it again).
// Always: a hostile mob near (or a hit) sends them home to hide; a player close by gets a look and a wave; one in the
// way, a step aside.
import { musgarreteName, ROLE_NAMES } from './names.ts';
import { tunnelCells } from './village.ts';

export const MUSGARRETE = 'creatures:musgarrete';
export const SCHEDULE: [number, number, string][] = [[0.98, 0.03, 'wake'], [0.03, 0.2, 'work'], [0.2, 0.29, 'plaza'], [0.29, 0.46, 'work'], [0.46, 0.52, 'home'], [0.52, 0.98, 'sleep']];
export const STONE = 'mineclaude:cobblestone';
export const FOOD = ['mineclaude:apple', 'mineclaude:bread', 'mineclaude:wheat'];
export const BELL_SOUND = 'creatures:folk_bell';
const VALUABLE = /ore$|coal|diamond|gold|iron/;
const ANNEX_DX = 5;

// The two blueprints of the builders (cobblestone only: what their miners dig). Origin = the lot's corner + 1, ground + 1.
export const HUT_BLUEPRINT = {
  palette: { c: STONE },
  layers: [
    ['ccccc', 'c   c', 'c   c', 'c   c', 'cc cc'],
    ['ccccc', 'c   c', 'c   c', 'c   c', 'cc cc'],
    ['ccccc', 'c   c', 'c   c', 'c   c', 'ccccc'],
    ['ccccc', 'ccccc', 'ccccc', 'ccccc', 'ccccc'],
  ],
};
export const ANNEX_BLUEPRINT = {
  palette: { c: STONE },
  layers: [['ccc', 'c c', 'c c'], ['ccc', 'c c', 'c c'], ['ccc', 'ccc', 'ccc']],
};

export const phaseAt = (L: any, t: number) => L.scheduleAt(SCHEDULE, t) ?? 'work';
const P = (c: any) => ({ x: c.x, y: c.y, z: c.z });

/** @param {any} ctx */
export function registerMusgarrete(ctx: any) {
  const L = ctx.npcs.lib;
  const hut = ctx.npcs.blueprint('mossfolk_hut', HUT_BLUEPRINT);
  const annex = ctx.npcs.blueprint('mossfolk_annex', ANNEX_BLUEPRINT);
  const phase = (n: any) => phaseAt(L, n.host.time);
  const awake = (n: any) => phase(n) !== 'sleep';

  // ---------------------------------------------------------------- the actions of their own
  // tunnel: dig the next cells of the village mine (state.data.tun), up to `count` this session
  ctx.npcs.action('tunnel', {
    tick(n: any, s: any) {
      const a = n.mem.a, d = n.state.data, cells = tunnelCells(d.mine);
      if (d.tun >= cells.length) return 'done';
      a.done ??= 0;
      if (a.done >= (s.count ?? 6)) return 'done';
      const c = cells[d.tun];
      a.sub ??= {};
      const outer = a;
      n.mem.a = a.sub;
      let r;
      try { r = n.type.actions.get('dig').tick(n, { do: 'dig', at: c }); } finally { n.mem.a = outer; }
      n.mem.target = c;
      if (r === 'run') return 'run';
      n.type.actions.get('dig').stop?.(n, {});
      a.sub = {};
      if (r === 'done' || r === '!nothing_there') { d.tun++; a.done++; n.dirty = true; return 'run'; }
      if (r === '!not_natural' || r === '!unbreakable') { d.tun++; d.skipped = (d.skipped ?? 0) + 1; n.dirty = true; return 'run'; } // someone's block: never taken, the tunnel goes round
      return r;
    },
    stop(n: any) { n.host.pose(null); n.mem.target = null; },
  });

  // sow: put a seed in an empty furrow (the seed's own planting: world.placeItem through the host)
  ctx.npcs.action('sow', {
    tick(n: any, s: any) {
      const a = n.mem.a, c = s.at;
      n.mem.target = c;
      if (!a.there) { const r = L.walkTo(n, c, 2); if (r !== 'done') return r; a.there = true; }
      const why = L.refusal(n, 'place', c);
      if (why) return L.fail(why);
      a.t = (a.t ?? 0) + n.host.dt;
      n.out.look = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }; n.out.stay = true;
      if (!a.cued) { n.host.cue('harvest'); a.cued = true; }
      if (a.t < 0.6) return 'run';
      if (L.takeItem(n.state, 'mineclaude:seeds', 1) < 1) return L.fail('need:mineclaude:seeds');
      if (!n.host.plant(c, 'mineclaude:seeds')) { L.addItem(n.state, 'mineclaude:seeds', 1); return L.fail('cannot_plant'); }
      n.host.markEdit(c.x, c.y, c.z); n.dirty = true;
      return 'done';
    },
  });

  // ---------------------------------------------------------------- the goals
  const goal = (name: string, def: any) => ctx.npcs.goal(name, def);

  goal('shelter', {
    score(n: any) {
      const danger = n.host.threats(12).length > 0 || n.state.needs.safety < 0.3;
      if (!danger || !n.state.home) return 0;
      // asleep at home already: that IS hiding (the sleep goal keeps them in the nest)
      const p = n.host.pos(), h = n.state.home;
      if (phase(n) === 'sleep' && Math.hypot(p.x - h.x - 0.5, p.z - h.z - 0.5) < 2.5) return 0;
      return 0.95;
    },
    plan(n: any) { return [{ do: 'walk', to: P(n.state.home), near: 1, pace: 1.3 }, { do: 'wait', seconds: 6, pose: 'cower', cue: 'shiver', every: 1.5 }]; },
    rest: 1,
  });
  goal('step_aside', {
    score(n: any) { return awake(n) && n.host.playersNear(1.2).length ? 0.9 : 0; },
    plan(n: any) { const p = n.host.playersNear(1.2)[0]; return [{ do: 'flee', from: p, seconds: 0.7 }]; },
    rest: 2,
  });
  goal('sleep', {
    score(n: any) { return phase(n) === 'sleep' && n.state.home ? 0.8 : 0; },
    plan(n: any) { return [{ do: 'sleep', bed: P(n.state.home), onTop: false, pose: 'sleep' }]; },
  });
  goal('wake', {
    score(n: any) { return phase(n) === 'wake' ? 0.75 : 0; },
    plan(n: any) {
      const bell = n.state.places.bell;
      if (n.state.data.ringer && bell) return [{ do: 'work', at: P(bell), seconds: 5, cue: 'ring', every: 1.2 }, { do: 'wait', seconds: 30 }];
      return [{ do: 'wait', seconds: 2.5, cue: 'stretch', every: 3 }, { do: 'wait', seconds: 30, cue: 'look_around', every: 6 }];
    },
  });
  goal('home', {
    score(n: any) { return phase(n) === 'home' && n.state.home ? 0.7 : 0; },
    plan(n: any) {
      const plan: any[] = [{ do: 'walk', to: P(n.state.home), near: 2 }];
      if (n.state.needs.hunger < 0.7) {
        const food = FOOD.find((f) => L.countOf(n.state, f) > 0);
        if (food) plan.push({ do: 'eat', item: food, food: 0.7 });
        else if (n.state.places.chest) plan.unshift({ do: 'take', chest: P(n.state.places.chest), item: 'mineclaude:wheat', n: 3 });
      }
      plan.push({ do: 'wait', seconds: 40, cue: 'look_around', every: 7 });
      return plan;
    },
  });
  goal('plaza', {
    score(n: any) { return phase(n) === 'plaza' && n.state.places.plaza ? 0.6 : 0; },
    plan(n: any) {
      const spot = n.state.places.plaza;
      const friends = n.host.friendsNear(10), me = n.host.pos();
      friends.sort((a: any, b: any) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
      const f = friends[0];
      return [{ do: 'walk', to: P(spot), near: 0 }, { do: 'talk', with: f ? { x: f.x, y: f.y + 0.9, z: f.z } : { x: n.state.places.bell.x + 0.5, y: n.state.places.bell.y + 0.5, z: n.state.places.bell.z + 0.5 }, seconds: 12 }];
    },
    stick: 0.2,
  });
  goal('greet', {
    score(n: any) {
      if (!awake(n)) return 0;
      const p = n.host.playersNear(5)[0];
      if (!p) return 0;
      const g = (n.mem.greeted ??= {});
      return n.host.now - (g[p.name] ?? -Infinity) > 60000 ? 0.66 : 0;
    },
    plan(n: any) {
      const p = n.host.playersNear(5)[0];
      n.mem.greeted[p.name] = n.host.now;
      return [{ do: 'wait', seconds: 2.2, cue: 'wave', every: 5, look: { x: p.x, y: p.y + 1.5, z: p.z } }];
    },
  });
  goal('work', {
    score(n: any) { return phase(n) === 'work' ? 0.6 : 0; },
    plan(n: any) { return workPlan(n); },
    rest: 4,
    failed(n: any, why: string) { n.mem.lastWorkFail = why; },
  });
  goal('idle', {
    score() { return 0.05; },
    plan(n: any) { const cue = ['look_around', 'scratch', 'stretch'][Math.floor(n.host.random() * 3)]; return [{ do: 'wait', seconds: 3, cue, every: 4 }]; },
  });

  // the work of each job
  function workPlan(n: any): any[] | null {
    const st = n.state, d = st.data, chest = st.places.chest;
    const stuff = st.inv.reduce((a: number, [i, k]: [string, number]) => a + (FOOD.includes(i) ? 0 : k), 0);
    if (st.role === 'miner') {
      if (!d.mine) return [{ do: 'wait', seconds: 6, cue: 'work_sharpen', every: 1.5 }];
      if (chest && (stuff >= 24 || (d.tun >= tunnelCells(d.mine).length && stuff > 0))) return [{ do: 'store', chest: P(chest), keep: FOOD }];
      if (d.tun >= tunnelCells(d.mine).length) return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_sharpen', every: 1.4 }];
      return [{ do: 'walk', to: { x: d.mine.x, y: d.mine.y, z: d.mine.z }, near: 2 }, { do: 'creatures:tunnel', count: 6 }];
    }
    if (st.role === 'builder') {
      const lot = d.lot;
      if (!lot) return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_chisel', every: 1.3 }];
      const jobs = [{ bp: hut, origin: { x: lot.x0 + 1, y: lot.y + 1, z: lot.z0 + 1 } }, { bp: annex, origin: { x: lot.x0 + ANNEX_DX + 1, y: lot.y + 1, z: lot.z0 + 2 } }];
      const get = (x: number, y: number, z: number) => n.host.getBlock(x, y, z);
      const job = jobs.find((j) => Object.keys(L.missingMaterials(ctx.npcs.blueprintOf(j.bp), j.origin, 0, get)).length || L.nextCell(ctx.npcs.blueprintOf(j.bp), j.origin, 0, get, (b: any) => n.host.isAir(b)).cell);
      if (!job) { d.built = true; return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_chisel', every: 1.3 }]; }
      const missing = L.missingMaterials(ctx.npcs.blueprintOf(job.bp), job.origin, 0, get)[STONE] ?? 0;
      const have = L.countOf(st, STONE);
      if (missing > 0 && have === 0) {
        if (chest) return [{ do: 'take', chest: P(chest), item: STONE, n: Math.min(32, missing) }, { do: 'build', blueprint: job.bp, origin: job.origin }];
        return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_chisel', every: 1.3 }];
      }
      return [{ do: 'build', blueprint: job.bp, origin: job.origin }];
    }
    if (st.role === 'grower') {
      const f = d.field;
      if (!f) return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_sort', every: 1.6 }];
      if (chest && L.countOf(st, 'mineclaude:wheat') >= 12) return [{ do: 'store', chest: P(chest), keep: ['mineclaude:seeds', ...FOOD.filter((x) => x !== 'mineclaude:wheat')] }];
      const ripe: any[] = [];
      for (let z = f.z0; z <= f.z1 && ripe.length < 5; z++) for (let x = f.x0; x <= f.x1 && ripe.length < 5; x++) if (n.host.getBlock(x, f.y + 1, z) === 'mineclaude:wheat_3') ripe.push({ x, y: f.y + 1, z });
      if (ripe.length) return ripe.map((c) => ({ do: 'harvest', at: c, ripe: 'mineclaude:wheat_3', loot: 'mineclaude:wheat_ripe', seed: 'mineclaude:seeds' }));
      // an empty furrow (a crop someone took): plant it again with a seed it carries
      if (L.countOf(st, 'mineclaude:seeds') > 0) {
        for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
          if (n.host.getBlock(x, f.y, z) === 'mineclaude:farmland' && n.host.getBlock(x, f.y + 1, z) === 'mineclaude:air') return [{ do: 'creatures:sow', at: { x, y: f.y + 1, z } }];
        }
      }
      return [{ do: 'work', at: P(st.work), seconds: 8, cue: 'work_sort', every: 1.6 }];
    }
    return null;
  }

  ctx.npcs.register('musgarrete', {
    name: 'Musgarrete', emoji: '🪨', halfW: 0.34, height: 1.2, hp: 24, speed: 1.6, walkSpeed: 2.1, bodyCells: 2, reach: 4.2, digSpeed: 2.5,
    drops: [['creatures:moss_hide', 0, 1, 0.5]],
    goals: ['shelter', 'step_aside', 'sleep', 'wake', 'home', 'plaza', 'greet', 'work', 'idle'],
    feedRefusal: 'O Musgarrete olha a comida, educado, e recusa.',
    // a summoned one (no village): a name, a seed, a wanderer's life
    init(n: any) {
      const st = n.state;
      if (!st.name) st.name = musgarreteName(L.rng(st.seed));
      if (!st.role) st.role = 'grower';
    },
    // every tick: the stock comes back when work starts after the night; the ringer rings
    tick(n: any) {
      const ph = phase(n), d = n.state.data;
      if (ph === 'work' && d.lastPhase === 'wake') { d.restock = true; n.dirty = true; }
      if (ph !== d.lastPhase) { d.lastPhase = ph; n.dirty = true; }
      // the ringer at the bell: a peal every 1.2 s while it works the bell (the 'ring' cue is the body's swing)
      if (n.mem.goal === 'creatures:wake' && d.ringer && n.mem.i === 0 && n.mem.a?.there && Math.floor(n.host.now / 1200) !== n.mem.lastRing) {
        n.mem.lastRing = Math.floor(n.host.now / 1200);
        n.host.sound?.(BELL_SOUND);
      }
    },
    view(st: any, mem: any) {
      const carry = mem?.goal === 'creatures:work' && st.role === 'builder' && L.countOf(st, STONE) > 0 ? STONE : null;
      return { carry, t: mem?.target ?? null, job: ROLE_NAMES[st.role] ?? '' };
    },
    onInteract(e: any, npc: any) { return openTradeFor?.(e, npc) ?? 'success'; },
  });
}

/** Set by trade.ts: right-click opens the trade screen. */
export let openTradeFor: ((e: any, npc: any) => any) | null = null;
export function setTradeOpener(fn: (e: any, npc: any) => any) { openTradeFor = fn; }
