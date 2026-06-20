/**
 * Matematica compartilhada da PrivadIn Bet.
 *
 * Cada jogo decide o `multiplier` da rodada com estas funcoes (guiadas pela
 * BetGameConfig: rtp, faixas de payout, teto). O betService apenas liquida o
 * resultado em poopcoins — o visual nunca pode contradizer o valor liquidado.
 *
 * Convencao de multiplicador:
 *   0   => o jogador perdeu (prêmio = 0)
 *   1   => devolveu a aposta (push)
 *   >1  => ganhou (prêmio = wager * multiplier)
 */

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function randomInt(minInclusive: number, maxInclusive: number) {
  const lo = Math.ceil(minInclusive);
  const hi = Math.floor(maxInclusive);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Aplica as faixas de payout de um jogo a um multiplicador de vitoria.
 * Perdas (mult <= 0) continuam 0. Vitorias sao presas em [min, max].
 */
export function clampWinMultiplier(
  multiplier: number,
  minPayoutMultiplier: number,
  maxPayoutMultiplier: number,
) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;
  const min = Math.max(0, minPayoutMultiplier);
  const max = Math.max(min, maxPayoutMultiplier);
  return clamp(multiplier, Math.max(1e-9, min), max);
}

/**
 * Estima o retorno medio (RTP intrinseco) de um gerador de multiplicadores via
 * Monte Carlo. Usado pelos slots/plinko para derivar um fator de escala que faz
 * o RTP efetivo bater com `config.rtp`.
 */
export function estimateMeanMultiplier(roll: () => number, iterations = 20000) {
  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += roll();
  return sum / Math.max(1, iterations);
}

/**
 * Cria um fator de escala que converte um RTP intrinseco medido no RTP alvo.
 * Retorna 1 quando a base e desprezivel (evita divisao por zero).
 */
export function makeRtpScaler(measuredRtp: number, targetRtp: number) {
  if (!Number.isFinite(measuredRtp) || measuredRtp <= 1e-6) return 1;
  return targetRtp / measuredRtp;
}

/**
 * Ponto de explosao para crash games (aviator/spaceman/jetx).
 *
 * crashPoint = clamp( rtp / (1 - random()), 1, maxMultiplier )
 * com pequena chance de crash instantaneo (bust em 1.0).
 * `rtp` e a borda da casa; quanto menor, mais cedo costuma explodir.
 */
export function generateCrashPoint(
  rtp: number,
  maxMultiplier: number,
  instantCrashChance = 0.02,
) {
  if (Math.random() < instantCrashChance) return 1;
  const r = Math.random();
  const raw = rtp / Math.max(1e-9, 1 - r);
  return clamp(raw, 1, Math.max(1, maxMultiplier));
}

/**
 * Multiplicador justo do Mines apos revelar `revealed` casas seguras.
 * total = casas no tabuleiro, mines = bombas.
 * Justo = produto((total - i) / (total - mines - i)) para i em [0, revealed).
 * O RTP da casa entra multiplicando o resultado (clampado pelas faixas depois).
 */
export function minesFairMultiplier(total: number, mines: number, revealed: number) {
  const safe = total - mines;
  if (revealed <= 0 || mines <= 0 || safe <= 0) return 1;
  let mult = 1;
  for (let i = 0; i < revealed; i++) {
    const remaining = total - i;
    const remainingSafe = safe - i;
    if (remainingSafe <= 0) break;
    mult *= remaining / remainingSafe;
  }
  return mult;
}

/** Coeficientes binomiais para `rows` (numero de pinos => rows+1 casas). */
export function binomialProbabilities(rows: number) {
  const probs: number[] = [];
  let coeff = 1;
  for (let k = 0; k <= rows; k++) {
    if (k > 0) coeff = (coeff * (rows - k + 1)) / k;
    probs.push(coeff / Math.pow(2, rows));
  }
  return probs;
}

/** Sorteia a casa final do Plinko simulando `rows` quedas (0..rows). */
export function samplePlinkoBin(rows: number) {
  let bin = 0;
  for (let i = 0; i < rows; i++) if (Math.random() < 0.5) bin++;
  return bin;
}

/**
 * Reescala uma tabela de payout para que o retorno esperado seja exatamente
 * `targetRtp`, preservando o formato (distribuicao binomial do Plinko).
 */
export function normalizeTableToRtp(table: number[], probs: number[], targetRtp: number) {
  const expected = table.reduce((sum, mult, i) => sum + mult * (probs[i] ?? 0), 0);
  const scale = expected > 1e-9 ? targetRtp / expected : 1;
  return table.map((mult) => mult * scale);
}
