import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  writeBatch,
} from "@firebase/firestore";
import { db } from "./firebase";
import { adminLogsRef, createAuditLog } from "./poopService";
import { HOUSE_UID } from "../utils/betSystem";
import type { AppUser, BetGameConfig, BetGameId, PrivadInBetConfig } from "../types";

export const betConfigDocRef = doc(db, "privadin_bet", "config");
export const betStatsDocRef = doc(db, "privadin_bet", "stats");
export const houseWalletDocRef = doc(db, "users", HOUSE_UID);

export const HOUSE_NAME = "PrivadIn Bet (Banca)";
export const HOUSE_EMAIL = "house@privadin.bet";

const MAX_POOPCOIN_BALANCE = 1_000_000;
const RTP_MIN = 0.5;
const RTP_MAX = 0.99;

function defaultGame(overrides: Partial<BetGameConfig> & Pick<BetGameConfig, "id" | "label" | "order">): BetGameConfig {
  return {
    icon: "🎰",
    enabled: true,
    rtp: 0.95,
    minPayoutMultiplier: 1.1,
    maxPayoutMultiplier: 50,
    minBet: 5,
    maxBet: 500,
    volatility: "medium",
    ...overrides,
  };
}

/** Jogos portados de assets/joguinhos_para_adicionar/*. */
export const DEFAULT_BET_GAMES: Record<BetGameId, BetGameConfig> = {
  tigrinho: defaultGame({
    id: "tigrinho",
    label: "Tigrinho da Sorte",
    icon: "🐯",
    order: 10,
    rtp: 0.95,
    minPayoutMultiplier: 2,
    maxPayoutMultiplier: 50,
    volatility: "high",
  }),
  fortune_ox: defaultGame({
    id: "fortune_ox",
    label: "Fortune Ox",
    icon: "🐂",
    order: 20,
    rtp: 0.95,
    minPayoutMultiplier: 2,
    maxPayoutMultiplier: 50,
    volatility: "high",
  }),
  spaceman: defaultGame({
    id: "spaceman",
    label: "Spaceman",
    icon: "👨‍🚀",
    order: 30,
    rtp: 0.96,
    minPayoutMultiplier: 1.1,
    maxPayoutMultiplier: 100,
    volatility: "high",
  }),
  jetx: defaultGame({
    id: "jetx",
    label: "JetX",
    icon: "🚀",
    order: 40,
    rtp: 0.96,
    minPayoutMultiplier: 1.1,
    maxPayoutMultiplier: 25000,
    maxBet: 200,
    volatility: "high",
  }),
  mines: defaultGame({
    id: "mines",
    label: "Mines",
    icon: "💣",
    order: 50,
    rtp: 0.97,
    minPayoutMultiplier: 1.05,
    maxPayoutMultiplier: 200,
    volatility: "medium",
    extra: { mines: 3, tiles: 25 },
  }),
  plinko: defaultGame({
    id: "plinko",
    label: "Plinko",
    icon: "🔵",
    order: 60,
    rtp: 0.97,
    minPayoutMultiplier: 0.2,
    maxPayoutMultiplier: 100,
    volatility: "medium",
    extra: { rows: 12, risk: 1 },
  }),
  blackjack: defaultGame({
    id: "blackjack",
    label: "Blackjack",
    icon: "🃏",
    order: 70,
    rtp: 0.99,
    minPayoutMultiplier: 1,
    maxPayoutMultiplier: 2.5,
    minBet: 10,
    volatility: "low",
    extra: { decks: 6, blackjackPays: 1.5 },
  }),
};

export const DEFAULT_BET_CONFIG: PrivadInBetConfig = {
  enabled: false,
  houseUid: HOUSE_UID,
  globalMinBet: 5,
  globalMaxBet: 1000,
  maxPayoutPerRound: 100_000,
  maxExposureFractionOfBankroll: 0.25,
  games: DEFAULT_BET_GAMES,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

function parseGameConfig(id: BetGameId, data: Partial<BetGameConfig> | undefined, base: BetGameConfig): BetGameConfig {
  const merged = { ...base, ...(data ?? {}) };
  const minBet = clampInt(merged.minBet, 1, MAX_POOPCOIN_BALANCE, base.minBet);
  const maxBet = Math.max(minBet, clampInt(merged.maxBet, 1, MAX_POOPCOIN_BALANCE, base.maxBet));
  const minPayoutMultiplier = clampNumber(merged.minPayoutMultiplier, 0, 1_000_000, base.minPayoutMultiplier);
  const maxPayoutMultiplier = Math.max(
    minPayoutMultiplier,
    clampNumber(merged.maxPayoutMultiplier, 0.0001, 1_000_000, base.maxPayoutMultiplier),
  );
  const extra =
    merged.extra && typeof merged.extra === "object"
      ? Object.fromEntries(
          Object.entries(merged.extra).map(([key, value]) => [key, Number(value) || 0]),
        )
      : base.extra;

  return {
    id,
    label: String(merged.label ?? base.label).slice(0, 60),
    icon: merged.icon ? String(merged.icon).slice(0, 8) : base.icon,
    order: clampInt(merged.order, 0, 100000, base.order),
    enabled: merged.enabled !== false,
    rtp: clampNumber(merged.rtp, RTP_MIN, RTP_MAX, base.rtp),
    minPayoutMultiplier,
    maxPayoutMultiplier,
    minBet,
    maxBet,
    winChance:
      merged.winChance == null ? base.winChance : clampNumber(merged.winChance, 0, 1, base.winChance ?? 0),
    volatility: merged.volatility ?? base.volatility,
    extra,
  };
}

export function parseBetConfig(data?: Partial<PrivadInBetConfig> | null): PrivadInBetConfig {
  const incomingGames = (data?.games ?? {}) as Record<string, Partial<BetGameConfig>>;
  // Une os defaults com o que o admin salvou: novos jogos aparecem, overrides persistem.
  const gameIds = new Set<string>([...Object.keys(DEFAULT_BET_GAMES), ...Object.keys(incomingGames)]);
  const games: Record<BetGameId, BetGameConfig> = {};
  for (const id of gameIds) {
    const base = DEFAULT_BET_GAMES[id] ?? defaultGame({ id, label: id, order: 999 });
    games[id] = parseGameConfig(id, incomingGames[id], base);
  }

  const globalMinBet = clampInt(data?.globalMinBet, 1, MAX_POOPCOIN_BALANCE, DEFAULT_BET_CONFIG.globalMinBet);
  const globalMaxBet = Math.max(
    globalMinBet,
    clampInt(data?.globalMaxBet, 1, MAX_POOPCOIN_BALANCE, DEFAULT_BET_CONFIG.globalMaxBet),
  );

  return {
    enabled: data?.enabled === true,
    houseUid: HOUSE_UID,
    globalMinBet,
    globalMaxBet,
    maxPayoutPerRound: clampInt(
      data?.maxPayoutPerRound,
      1,
      MAX_POOPCOIN_BALANCE,
      DEFAULT_BET_CONFIG.maxPayoutPerRound,
    ),
    maxExposureFractionOfBankroll: clampNumber(
      data?.maxExposureFractionOfBankroll,
      0.01,
      1,
      DEFAULT_BET_CONFIG.maxExposureFractionOfBankroll,
    ),
    games,
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
  };
}

/** Resolve a faixa de aposta efetiva (jogo sobrescreve o global quando definido). */
export function resolveBetLimits(config: PrivadInBetConfig, game: BetGameConfig) {
  const minBet = Math.max(1, game.minBet || config.globalMinBet);
  const maxBet = Math.max(minBet, Math.min(game.maxBet || config.globalMaxBet, config.globalMaxBet || game.maxBet));
  return { minBet, maxBet };
}

// ----------------------------------------
// ESCRITAS DO ADMIN (geram auditoria)
// ----------------------------------------

export async function updateBetConfig(admin: AppUser, partial: Partial<PrivadInBetConfig>) {
  const batch = writeBatch(db);
  batch.set(
    betConfigDocRef,
    { ...partial, updatedAt: Timestamp.now(), updatedBy: admin.uid },
    { merge: true },
  );
  batch.set(doc(adminLogsRef), createAuditLog({ action: "update_bet_config", admin }));
  await batch.commit();
}

export async function updateGameConfig(admin: AppUser, gameId: BetGameId, partial: Partial<BetGameConfig>) {
  const batch = writeBatch(db);
  batch.set(
    betConfigDocRef,
    {
      games: { [gameId]: { ...partial, id: gameId } },
      updatedAt: Timestamp.now(),
      updatedBy: admin.uid,
    },
    { merge: true },
  );
  batch.set(doc(adminLogsRef), createAuditLog({ action: "update_bet_config", admin }));
  await batch.commit();
}

export async function setGameEnabled(admin: AppUser, gameId: BetGameId, enabled: boolean) {
  const batch = writeBatch(db);
  batch.set(
    betConfigDocRef,
    {
      games: { [gameId]: { id: gameId, enabled } },
      updatedAt: Timestamp.now(),
      updatedBy: admin.uid,
    },
    { merge: true },
  );
  batch.set(doc(adminLogsRef), createAuditLog({ action: "toggle_bet_game", admin }));
  await batch.commit();
}

/** Cria a carteira-sistema da banca se ainda nao existir. */
export async function ensureHouseWallet(admin: AppUser, initialBankroll = 0) {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(houseWalletDocRef);
    if (snapshot.exists()) return;
    const houseUser: AppUser = {
      uid: HOUSE_UID,
      name: HOUSE_NAME,
      email: HOUSE_EMAIL,
      avatar: "",
      role: "player",
      totalPoints: 0,
      weeklyPoints: 0,
      currentDailyStreak: 0,
      currentWeeklyStreak: 0,
      bestStreak: 0,
      createdAt: Timestamp.now(),
      isActive: false,
      isSystem: true,
      poopcoinBalance: Math.min(MAX_POOPCOIN_BALANCE, Math.max(0, Math.trunc(initialBankroll))),
    };
    transaction.set(houseWalletDocRef, houseUser);
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({ action: "set_bet_bankroll", admin, poopcoins: houseUser.poopcoinBalance ?? 0 }),
    );
  });
}

/** Define o saldo absoluto da banca. */
export async function setBankroll(admin: AppUser, targetAmount: number) {
  const target = Math.min(MAX_POOPCOIN_BALANCE, Math.max(0, Math.trunc(targetAmount)));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(houseWalletDocRef);
    if (!snapshot.exists()) {
      throw new Error("Crie a carteira da banca antes de definir o saldo.");
    }
    transaction.update(houseWalletDocRef, { poopcoinBalance: target });
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({ action: "set_bet_bankroll", admin, poopcoins: target }),
    );
  });
}

/** Adiciona (delta > 0) ou retira (delta < 0) poopcoins da banca. */
export async function topUpBankroll(admin: AppUser, delta: number) {
  const change = Math.trunc(delta);
  if (!Number.isFinite(change) || change === 0) {
    throw new Error("Informe um ajuste diferente de zero.");
  }
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(houseWalletDocRef);
    if (!snapshot.exists()) {
      throw new Error("Crie a carteira da banca antes de ajustar o saldo.");
    }
    const current = Number((snapshot.data() as AppUser).poopcoinBalance ?? 0);
    const next = Math.min(MAX_POOPCOIN_BALANCE, Math.max(0, current + change));
    transaction.update(houseWalletDocRef, { poopcoinBalance: next });
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({ action: "set_bet_bankroll", admin, delta: change, poopcoins: next }),
    );
  });
}

export async function fetchHouseBalance() {
  const snapshot = await getDoc(houseWalletDocRef);
  if (!snapshot.exists()) return null;
  return Number((snapshot.data() as AppUser).poopcoinBalance ?? 0);
}
