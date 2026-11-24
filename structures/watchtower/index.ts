// @ts-check
// The two small outposts of the creatures mod, registered in two calls so the mod's entries stay one line each:
//   registerOutposts(ctx)        content (src/main.ts, every side: server, page, mesher Worker, hosted Worker): the textures and
//                                blocks, the Torn Map, the chests' loot tables, the generator stage with its two structure
//                                kinds, the home spawn rules; on the server also the garrison
//   registerOutpostsClient(ctx)  browser (src/client.ts): the swinging lantern and the floating relic
//
//   Torre de Vigia (creatures:watchtower)            the Canopy Sentinels' tower: three rooms joined by stairs, a lookout with
//                                                     railings and a swinging lantern, weapon racks, an archery target, the
//                                                     archers' chest on top; sentinels post a watch there at dusk and at night
//   Santuário Esquecido (creatures:forgotten_shrine)  a ring of mossy pillars around an offering altar with a floating relic,
//                                                     candles, vines and the offerings' chest; moss lurkers lie disguised in it
// Only in worlds WITH biomes (every new world): see stage.ts. Details and the design in README.md.
import { ItemType } from '../../mineclaude-sdk.js';
import { registerOutpostBlocks } from './blocks.ts';
import { registerOutpostLoot } from './loot.ts';
import { registerOutpostSpawns } from './spawns.ts';
import { LanternRenderer, RelicRenderer } from './renderer.ts';
import Outposts from './stage.ts';
import { BLOCK, ITEM, KIND, LOCATOR, LOOT, ROLE, STAGE } from './names.ts';

export class TornMapItem extends ItemType {
  name = 'Mapa Rasgado';
  icon = ITEM.tornMap;
  stack = 16;
  lore: any[] = ['Um canto do mapa das Sentinelas.', 'Marca uma torre e uma trilha que some no rasgo.'];
}

/** @param {any} ctx */
export function registerOutposts(ctx: any) {
  registerOutpostBlocks(ctx);
  const map = new TornMapItem();
  map.lore = map.lore.map((text, i) => ctx.lang.text(`structures.watchtower.torn_map.lore${i + 1}`, undefined, text));
  ctx.items.register(ITEM.tornMap.split(':')[1], map);
  registerOutpostLoot(ctx);
  // the stage (last in the pipeline) and the two kinds the engine knows them by: their lookups, a role of their own (what
  // world.nearestStructure asks for), `protects` (the declarative structures of other mods keep out of their chunks) and the
  // chest's table (the engine rolls it into the chest on its first open, loot.ts)
  ctx.worldgen.stage(STAGE, Outposts);
  ctx.worldgen.structureKind(KIND.tower, { locator: LOCATOR.towerAt, near: LOCATOR.towersNear, role: ROLE.tower, protects: true, loot: { chest: LOOT.tower } });
  ctx.worldgen.structureKind(KIND.shrine, { locator: LOCATOR.shrineAt, near: LOCATOR.shrinesNear, role: ROLE.shrine, protects: true, loot: { chest: LOOT.shrine } });
  registerOutpostSpawns(ctx);
}

/** @param {any} ctx */
export function registerOutpostsClient(ctx: any) {
  ctx.render.blockEntity(BLOCK.lantern.split(':')[1], new LanternRenderer());
  ctx.render.blockEntity(BLOCK.altar.split(':')[1], new RelicRenderer());
}
