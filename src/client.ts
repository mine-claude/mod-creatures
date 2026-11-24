// @ts-check
// Browser only: the Moss Lurker's eyes glow once it is revealed. A render LAYER (ctx.render.mobFeature) over whoever
// draws the mob: four small unlit boxes hung on the head bone of the file model, right over the painted eyes, so they
// follow the head when it rears, bites or tucks under. Hidden while it lies disguised (no glint betrays the mound), while
// it hides again and when it dies.
import { MobFeatureRenderer } from '../mineclaude-sdk.js';
import { EYES, HEAD_PIVOT, MOB_PATH } from './anatomy.ts';
import { registerGoblinClient } from '../goblin/index.ts';
import { registerBeetleClient } from '../beetle/index.ts';
import { registerLanternClient } from '../lantern/index.ts';
import { registerSentinelClient } from '../sentinel/index.ts';
import { registerSwarmClient } from '../swarm/index.ts';
import { registerSerpentClient } from '../serpent/index.ts';
import { registerColossusClient } from '../colossus/index.ts';
import { registerHermitClient } from '../hermit/index.ts';
import { registerStructuresClient } from '../structures/client.ts';
import { registerOutpostsClient } from '../structures/watchtower/index.ts';
import { registerRuinedCastleClient } from '../structures/ruined_castle/index.ts';
import { registerCreatureItemModels } from './item-models.ts';
import { registerFolkClient } from '../folk/index.ts';

const PX = 1 / 16;
const GLOW = 0xd9ff5c; // a lime, bioluminescent glow
const DARK_FOR = new Set(['hide', 'death']);
// editor units -> the game's (x mirrored), as the engine draws file models
const ours = (v: readonly number[]) => [-v[0] * PX, v[1] * PX, v[2] * PX];

class EyeGlow extends MobFeatureRenderer {
  priority = 5;

  /** @param {any} e @param {any} kit */
  build(e, { THREE }) {
    const head = e.model?.fileModel?.bones?.get('head')?.group;
    const eyes = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: GLOW });
    const pivot = ours(HEAD_PIVOT);
    for (const [origin, size] of EYES) {
      const [w, h, d] = size;
      const box = new THREE.Mesh(new THREE.BoxGeometry((w + 0.2) * PX, (h + 0.2) * PX, (d + 0.2) * PX), material);
      const c = ours([origin[0] + w / 2, origin[1] + h / 2, origin[2] + d / 2]);
      box.position.set(c[0] - pivot[0], c[1] - pivot[1], c[2] - pivot[2] - 0.1 * PX);
      eyes.add(box);
    }
    eyes.visible = false;
    if (head) { head.add(eyes); e.store.onHead = true; } // the file model: ride the head bone
    else { eyes.position.set(pivot[0], pivot[1], pivot[2]); } // drawn some other way: at least in the right place
    e.store.eyes = eyes;
    return { object: head ? null : eyes, dispose: () => { eyes.parent?.remove(eyes); eyes.traverse((o) => o.geometry?.dispose?.()); material.dispose(); } };
  }

  /** @param {any} e */
  render(e) {
    const eyes = e.store.eyes;
    if (!eyes) return;
    const playing = e.model?.fileModel?.playing?.name ?? null;
    eyes.visible = e.mob?.pose !== 'disguised' ? !DARK_FOR.has(playing) : playing === 'reveal';
  }
}

/** @param {any} ctx */
export default function registerClient(ctx) {
  ctx.render.mobFeature(`creatures:${MOB_PATH}`, 'eye_glow', new EyeGlow());
  registerGoblinClient(ctx); // the Goblin's procedural body (goblin/renderer.ts)
  registerBeetleClient(ctx); // the Crystal Beetle's procedural body (beetle/renderer.ts)
  registerLanternClient(ctx); // the Lure Lantern's procedural body (lantern/renderer.ts)
  registerSentinelClient(ctx); // the Canopy Sentinel's procedural archer (sentinel/renderer.ts)
  registerSwarmClient(ctx); // the Sting Swarm's procedural flock (swarm/renderer.ts)
  registerSerpentClient(ctx); // the Root Serpent's procedural spine (serpent/renderer.ts)
  registerColossusClient(ctx); // the Ruin Colossus's procedural body, camera shake and debris (colossus/)
  registerHermitClient(ctx); // the Tide Hermit's procedural crab (hermit/renderer.ts)
  registerStructuresClient(ctx); // the goblin campfire's flames and smoke (structures/client.ts)
  registerOutpostsClient(ctx); // the Watchtower's swinging lantern and the Forgotten Shrine's floating relic (structures/watchtower/)
  registerCreatureItemModels(ctx); // the sculpted 3D models of the mod's items: the Torn Map, the Old Tome, the drops (src/item-models.ts)
  registerRuinedCastleClient(ctx); // the Ruined Castle's brazier fire (structures/ruined_castle/renderer.ts)
  registerFolkClient(ctx); // the Musgarrete's procedural body (folk/renderer.ts)
}
