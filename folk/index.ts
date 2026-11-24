// @ts-check
// The FOLK of the world (mods/creatures/folk): peoples that live their own lives on the engine's NPC foundation (ctx.npcs).
// v1: the Musgarretes of the Floresta Musgosa — their blocks, their village (a generator stage), their NPC type (the day,
// the jobs, the trades) and the moving-in of each village; the browser half is their procedural body.
//   registerFolk(ctx)        content (src/main.ts, both sides)
//   registerFolkClient(ctx)  browser (src/client.ts)
import { registerFolkBlocks } from './blocks.ts';
import { registerMusgarrete, MUSGARRETE } from './musgarrete.ts';
import { registerFolkTrade } from './trade.ts';
import { registerFolkSpawner } from './spawner.ts';
import FolkVillageStage from './village.ts';
import { MusgarreteRenderer } from './renderer.ts';

export const FOLK_ROLE = 'mossfolk_village';

/** @param {any} ctx */
export function registerFolk(ctx: any) {
  registerFolkBlocks(ctx);
  // the dawn bell: a PLACEHOLDER synth (two hollow knocks and a low hum); the ambience work will replace it with a file
  ctx.sounds.synth('folk_bell', { layers: [
    { kind: 'tone', freq: 196, end: 180, dur: 1.4, type: 'sine', gain: 0.22 },
    { kind: 'tone', freq: 392, end: 370, dur: 0.9, type: 'triangle', gain: 0.08 },
    { kind: 'noise', freq: 420, q: 6, dur: 0.08, gain: 0.12 },
  ] });
  registerMusgarrete(ctx);
  registerFolkTrade(ctx);
  ctx.worldgen.stage('mossfolk_village', FolkVillageStage);
  ctx.worldgen.structureKind('mossfolk_village', { locator: 'creaturesMossfolkVillageAt', near: 'creaturesMossfolkVillagesNear', role: FOLK_ROLE });
  return registerFolkSpawner(ctx);
}

/** @param {any} ctx */
export function registerFolkClient(ctx: any) {
  ctx.render.mobModel(MUSGARRETE, new MusgarreteRenderer(ctx));
}
