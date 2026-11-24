// @ts-check
// Trading with a Musgarrete: right-click opens a screen (ctx.screens, a ScreenHandlerType with one button per offer) with
// the offers of its job. The price is in GOLD INGOTS (mineclaude:gold_ingot): the game has no coin item, gold is what
// every player can mine, and it is not the base merchant's barter (that one is per zone and per camp, ctx.trades). Each
// offer has a STOCK that comes back when the NPC goes to work after a night (state.data.restock, musgarrete.ts), and a
// REPUTATION per player (the NPC's relationship with the player's name, -1..1): every trade raises it, a hit lowers it; a
// good name makes gold prices up to 30% lower (never under 1) and a bad one (below -0.3) closes the trade.
// The screen's labels go in its `data` (512 bytes at most): a few short offers per job.
import { ScreenHandlerType } from '../mineclaude-sdk.js';
import { setTradeOpener } from './musgarrete.ts';

export const GOLD = 'mineclaude:gold_ingot';
export const SCREEN = 'creatures:folk_trade';
export const MAX_OFFERS = 4;
export const REP_STEP = 0.08;
export const REP_DISCOUNT = 0.3;
export const REP_REFUSE = -0.3;

// [give item, n, get item, n, stock] — the player gives, the NPC gives back
export const OFFERS: Record<string, [string, number, string, number, number][]> = {
  miner: [[GOLD, 1, 'mineclaude:cobblestone', 16, 8], [GOLD, 2, 'mineclaude:coal', 8, 6], [GOLD, 4, 'mineclaude:iron_ore', 3, 3], ['mineclaude:bread', 6, GOLD, 1, 4]],
  builder: [[GOLD, 1, 'creatures:mossy_cobble', 12, 8], [GOLD, 2, 'creatures:glowcap_lamp', 3, 5], [GOLD, 3, 'creatures:moss_nest', 1, 2], ['mineclaude:log', 16, GOLD, 1, 4]],
  grower: [[GOLD, 1, 'mineclaude:bread', 5, 8], [GOLD, 1, 'mineclaude:seeds', 12, 6], ['mineclaude:apple', 6, GOLD, 1, 4], ['mineclaude:wheat', 20, GOLD, 1, 4]],
};
const SHORT: Record<string, string> = { // short words: the default screen lays the buttons side by side
  [GOLD]: 'Ouro', 'mineclaude:cobblestone': 'Pedra', 'mineclaude:coal': 'Carvão', 'mineclaude:iron_ore': 'Ferro', 'mineclaude:bread': 'Pão',
  'creatures:mossy_cobble': 'Musgo', 'creatures:glowcap_lamp': 'Lâmpada', 'creatures:moss_nest': 'Ninho', 'mineclaude:log': 'Tora',
  'mineclaude:seeds': 'Semente', 'mineclaude:apple': 'Maçã', 'mineclaude:wheat': 'Trigo',
};

/** The price of an offer for a reputation: gold given by the player gets cheaper with a good name. */
export function priceFor(offer: [string, number, string, number, number], rep: number) {
  if (offer[0] !== GOLD) return offer[1];
  return Math.max(1, Math.round(offer[1] * (1 - REP_DISCOUNT * Math.max(0, rep))));
}

/** The stock left of each offer (state.data.stock), restocked when the NPC went to work after the night. */
export function stockOf(st: any) {
  const offers = OFFERS[st.role] ?? [];
  const d = st.data;
  if (!Array.isArray(d.stock) || d.stock.length !== offers.length || d.restock) { d.stock = offers.map((o) => o[4]); d.restock = false; }
  return d.stock as number[];
}

/** The screen's data for one player: the labels and the reputation. */
export function screenData(st: any, player: string) {
  const offers = OFFERS[st.role] ?? [], rep = st.rel[player] ?? 0, stock = stockOf(st);
  const buttons = offers.slice(0, MAX_OFFERS).map((o, i) => `${priceFor(o, rep)} ${SHORT[o[0]] ?? o[0]}: ${o[3]} ${SHORT[o[2]] ?? o[2]} (${stock[i]})`);
  return { buttons, rep: Math.round(rep * 100) / 100 };
}

/** One trade (server): checks, takes, gives, counts. Returns a message for the player. */
export function trade(st: any, player: any, index: number) {
  const offers = OFFERS[st.role] ?? [];
  const o = offers[index];
  if (!o) return 'Essa troca não existe.';
  const rep = st.rel[player.name] ?? 0;
  if (rep < REP_REFUSE) return `${st.name} não quer negociar com você.`;
  const stock = stockOf(st);
  if (stock[index] <= 0) return `${st.name}: acabou por hoje, volte amanhã.`;
  const price = priceFor(o, rep);
  if (!player.has(o[0], price)) return `Você precisa de ${price} ${SHORT[o[0]] ?? o[0]}.`;
  // the goods first (all or nothing): a full bag refuses before anything is paid
  if (!player.give(o[2], o[3])) return 'Sua mochila está cheia.';
  if (!player.take(o[0], price)) { player.take(o[2], o[3]); return 'Não deu para tirar o pagamento.'; }
  stock[index]--;
  const r = Math.max(-1, Math.min(1, rep + REP_STEP));
  delete st.rel[player.name]; st.rel[player.name] = r;
  st.data.trades = (st.data.trades ?? 0) + 1;
  return null;
}

/** @param {any} ctx */
export function registerFolkTrade(ctx: any) {
  const sessions = new Map<string, any>(); // player name -> { npc, pos }
  class FolkTrade extends ScreenHandlerType {
    title = 'Troca';
    slots = [];
    buttons = MAX_OFFERS;
    playerInventory = true;
    onButton(e: any) {
      const s = sessions.get(e.player.name);
      if (!s) return;
      const pp = e.player.pos;
      if (Math.hypot(pp.x - s.pos.x, pp.y - s.pos.y, pp.z - s.pos.z) > 6) { e.player.closeScreen?.(); return; }
      const why = trade(s.npc.state, e.player, e.id);
      if (why) { e.player.message(why); return; }
      s.npc.save();
      e.player.openScreen(SCREEN, { data: screenData(s.npc.state, e.player.name), title: `${s.npc.state.name} · ${s.job}` });
    }
    onClose(e: any) { sessions.delete(e.player.name); }
  }
  ctx.screens.register('folk_trade', new FolkTrade());
  setTradeOpener((e: any, npc: any) => {
    const st = npc.state;
    if (!OFFERS[st.role]) return 'pass';
    if ((st.rel[e.player.name] ?? 0) < REP_REFUSE) return { refuse: `${st.name} vira o rosto. Não quer negociar com você.` };
    const job = ({ miner: 'Escavador', builder: 'Pedreiro', grower: 'Cultivador' } as any)[st.role] ?? '';
    sessions.set(e.player.name, { npc, pos: { ...e.mob.pos }, job });
    const ok = e.player.openScreen(SCREEN, { data: screenData(st, e.player.name), title: `${st.name} · ${job}` });
    npc.save();
    return ok ? 'success' : 'pass';
  });
}
