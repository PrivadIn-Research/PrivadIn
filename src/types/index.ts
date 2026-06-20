import type { Timestamp } from "@firebase/firestore";

export type AppLanguage = "pt-BR" | "en-US" | "es-ES" | "zh-Hans" | "ar" | "jam-JM" | "pap-CW";
export type AppTheme = "light" | "dark";

export type AppView = "dashboard" | "poopcoins" | "history" | "stats" | "cuiter" | "admin" | "profile" | "edit-profile" | "bet";

export type UserRole = "player" | "admin";

export interface WorkSchedule {
  horarioInicioExpediente: string;
  horarioFimExpediente: string;
  horarioInicioAlmoco: string;
  horarioFimAlmoco: string;
  timezone: string;
}

export interface PoopLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface AppUser {
  uid: string;
  name: string;
  nickname?: string;
  email: string;
  avatar: string;
  avatarStoragePath?: string | null;
  role: UserRole;
  totalPoints: number;
  weeklyPoints: number;
  currentDailyStreak: number;
  currentWeeklyStreak: number;
  bestStreak: number;
  createdAt: Timestamp;
  firstLogAt?: Timestamp;
  lastLogAt?: Timestamp;
  workSchedule?: WorkSchedule;
  termsAccepted?: boolean;
  acceptedAt?: Timestamp;
  acceptedTermsVersion?: number;
  cooldownUntil?: Timestamp;
  bathroomDurationMinutes?: number;
  isActive?: boolean;
  deactivatedAt?: Timestamp;
  deactivatedBy?: string;
  poopcoinBalance?: number;
  poopcoinMigratedAt?: Timestamp;
  bio?: string;
  /** Carteira-sistema (ex.: banca da PrivadIn Bet). Escondida em rankings/listas/transferencias. */
  isSystem?: boolean;
}

export interface PoopLog {
  id: string;
  userId: string;
  userName: string;
  createdAt: Timestamp;
  points: number;
  poopcoinsEarned?: number;
  isWeeklyActive: boolean;
  location?: PoopLocation;
  timezone?: string;
  localTime?: string;
  durationMinutes?: number;
  competitionEdition?: number;
  poopcoinTransactionHash?: string;
}

export interface CuiterPost {
  id: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: Timestamp;
  poopcoinTransactionHash?: string;
}

export type PoopcoinTransactionType =
  | "mint_log"
  | "legacy_mint"
  | "transfer"
  | "cuiter_spend"
  | "admin_adjustment"
  | "reversal";

export type PoopcoinTransactionStatus = "active" | "reversed";

export interface PoopcoinTransactionEntry {
  userId: string;
  delta: number;
}

export interface PoopcoinTransaction {
  id: string;
  hash: string;
  previousHash: string;
  sequence: number;
  createdAt: Timestamp;
  type: PoopcoinTransactionType;
  entries: PoopcoinTransactionEntry[];
  affectedUserIds: string[];
  fromUserId?: string | null;
  toUserId?: string | null;
  amount: number;
  createdBy: string;
  createdByRole: UserRole;
  status: PoopcoinTransactionStatus;
  reversesTransactionHash?: string | null;
  reversedByTransactionHash?: string | null;
  linkedLogId?: string | null;
  linkedPostId?: string | null;
  reason?: string | null;
  nonce: string;
}

export interface PoopcoinSupplySummary {
  totalSupply: number;
  mintedSupply: number;
  burnedSupply: number;
  circulatingSupply: number;
  availableSupply: number;
  supplyMigratedAt?: Timestamp | null;
}

export interface AppSettings {
  cooldownMinutes: number;
  pointsPerLog: number;
  poopcoinsPerLog: number;
  cuiterPostCost: number;
  edition: number;
  overallRankingVisible?: boolean;
  termsOfUseText?: string;
  termsOfUseVersion?: number;
  termsOfUseUpdatedAt?: Timestamp;
  termsOfUseUpdatedBy?: string;
  competitionAnnouncement?: string;
  competitionAnnouncementUpdatedAt?: Timestamp;
  competitionAnnouncementUpdatedBy?: string;
  poopcoinsPerLogUpdatedAt?: Timestamp;
  poopcoinsPerLogUpdatedBy?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface BonusTimeRange {
  start: string; // HH:MM
  end: string; // HH:MM
  points: number;
}

// extend AppSettings with optional bonus ranges
export interface AppSettingsExtended extends AppSettings {
  bonusTimeRanges?: BonusTimeRange[];
}

export type AdminAuditAction =
  | "adjust_points"
  | "remove_log"
  | "reset_weekly"
  | "update_cooldown"
  | "update_points_per_log"
  | "update_terms_of_use"
  | "deactivate_user"
  | "reactivate_user"
  | "update_competition_announcement"
  | "update_poopcoin_rules"
  | "adjust_poopcoins"
  | "reverse_poopcoin_transaction"
  | "migrate_poopcoins"
  | "recalculate_poopcoin_supply"
  | "update_bet_config"
  | "set_bet_bankroll"
  | "toggle_bet_game";

export interface AdminAuditLog {
  id: string;
  action: AdminAuditAction;
  adminId: string;
  /** @deprecated Resolvido em tempo de exibição via adminId */
  adminName?: string;
  targetUserId?: string | null;
  /** @deprecated Resolvido em tempo de exibição via targetUserId */
  targetUserName?: string | null;
  delta?: number | null;
  points?: number | null;
  removedLogId?: string | null;
  cooldownMinutes?: number | null;
  pointsPerLog?: number | null;
  poopcoinsPerLog?: number | null;
  cuiterPostCost?: number | null;
  edition?: number | null;
  poopcoins?: number | null;
  poopcoinTransactionHash?: string | null;
  createdAt: Timestamp;
  /** @deprecated Mensagens antigas; novas entradas usam action + ids */
  description?: string;
}

export type RegistrationRequestStatus = "pending" | "used";

export interface RegistrationRequest {
  id: string;
  email: string;
  name: string;
  approvalCode: string;
  status: RegistrationRequestStatus;
  createdAt: Timestamp;
  usedAt?: Timestamp;
  claimedBy?: string;
}

export type RegistrationAttemptStatus =
  | "code_requested"
  | "invalid_code"
  | "account_created"
  | "failed";

export interface RegistrationAttempt {
  id: string;
  email: string;
  status: RegistrationAttemptStatus;
  createdAt: Timestamp;
  approvalCodeProvided?: string;
  requestId?: string;
  message?: string;
}

export interface RankedUser extends AppUser {
  rank: number;
  weeklyRank: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export interface DailyBucket {
  label: string;
  count: number;
}

export interface StatSummary {
  king?: RankedUser;
  streakLeader?: RankedUser;
  productiveHour: string;
  weeklyTotal: number;
  dailyAverage: number;
}

// ----------------------------------------
// PRIVADIN BET (mini casa de apostas em poopcoins)
// ----------------------------------------

export type BetGameId = string; // ex.: "tigrinho", "fortune_ox", "spaceman", "jetx", "mines", "plinko", "blackjack"

export interface BetGameConfig {
  id: BetGameId;
  label: string;
  icon?: string;
  order: number;
  enabled: boolean;
  /** RTP esperado 0..1 (para crash games equivale ao fator de borda da casa). */
  rtp: number;
  minPayoutMultiplier: number;
  maxPayoutMultiplier: number;
  minBet: number;
  maxBet: number;
  winChance?: number;
  volatility?: "low" | "medium" | "high";
  extra?: Record<string, number>;
}

export interface PrivadInBetConfig {
  enabled: boolean;
  houseUid: string;
  globalMinBet: number;
  globalMaxBet: number;
  maxPayoutPerRound: number;
  maxExposureFractionOfBankroll: number;
  games: Record<BetGameId, BetGameConfig>;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/** Metricas agregadas e ANONIMAS, guardadas em `privadin_bet/stats` (gravavel pelo jogador na liquidacao). */
export interface BetStats {
  totalWagered: number;
  totalPaidOut: number;
  houseProfit: number;
  updatedAt?: Timestamp;
}

export interface BetRound {
  id: string;
  gameId: BetGameId;
  createdAt: Timestamp;
  wager: number;
  multiplier: number;
  payout: number;
  net: number;
  balanceAfter: number;
  meta?: Record<string, unknown>;
}

export interface BetSettlement {
  payout: number;
  net: number;
  balanceAfter: number;
  cappedByBankroll: boolean;
}

export interface BetRoundInput {
  wager: number;
  multiplier: number;
  meta?: Record<string, unknown>;
}

export interface BetGameProps {
  user: AppUser;
  balance: number;
  config: BetGameConfig;
  globalConfig: PrivadInBetConfig;
  muted: boolean;
  onSettle: (round: BetRoundInput) => Promise<BetSettlement>;
}

export interface SalarySummary {
  monthlySalaryCents: number;
  currentCompetitionEarnedCents: number;
  totalEarnedCents: number;
  hourlyRateCents: number;
  totalBathroomMinutes: number;
  competitionHistory: {
    edition: number;
    earnedCents: number;
    totalBathroomMinutes: number;
    logsCount: number;
  }[];
}
