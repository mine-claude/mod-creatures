// @ts-check
// Musgarrete names: Portuguese-flavoured, from the things of their world (moss, stone, root, mud, sprout) — a given name and
// the name of their hollow (the family's "barranco"). Seeded: the same seed, the same name.
const FIRST_A = ['Seix', 'Lim', 'Brot', 'Calh', 'Musg', 'Raiz', 'Tuf', 'Lod', 'Gram', 'Pedr', 'Sarr', 'Junc', 'Lasc', 'Fet'];
const FIRST_B = ['inho', 'ota', 'elo', 'ucho', 'ana', 'ito', 'ela', 'ão', 'olina', 'ico', 'usca', 'aldo'];
const FAMILY = ['do Barranco', 'da Grota', 'do Limo', 'da Laje', 'do Brejinho', 'da Fenda', 'do Musgal', 'da Toca Funda', 'do Seixal', 'da Raizada'];

export function musgarreteName(rand: () => number) {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length) % a.length];
  return `${pick(FIRST_A)}${pick(FIRST_B)} ${pick(FAMILY)}`;
}

export const ROLE_NAMES: Record<string, string> = { miner: 'Escavador', builder: 'Pedreiro', grower: 'Cultivador' };
