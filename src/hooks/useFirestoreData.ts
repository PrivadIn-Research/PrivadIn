import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "@firebase/firestore";
import type {
  AdminAuditLog,
  AppSettings,
  AppUser,
  BetRound,
  BetStats,
  PoopLog,
  PoopcoinSupplySummary,
  PoopcoinTransaction,
  PrivadInBetConfig,
  RankedUser,
  RegistrationAttempt,
  RegistrationRequest,
} from "../types";
import { db } from "../services/firebase";
import { withoutSystemUsers } from "../utils/betSystem";
import {
  DEFAULT_BET_CONFIG,
  betConfigDocRef,
  betStatsDocRef,
  houseWalletDocRef,
  parseBetConfig,
} from "../services/betConfigService";
import {
  adminAuditLogsQuery,
  allLogsQuery,
  userLogsQuery,
  usersQuery,
} from "../services/poopService";
import { isFirebaseConfigured } from "../services/firebase";
import { rankUsers } from "../utils/ranking";
import {
  registrationAttemptsQuery,
  registrationRequestsQuery,
} from "../services/registrationService";
import {
  appSettingsDocRef,
  defaultAppSettings,
  parseAppSettings,
} from "../services/settingsService";
import {
  parsePoopcoinSupplySummary,
  poopcoinChainHeadRef,
  poopcoinTransactionsQuery,
} from "../services/poopcoinService";

function sortLogs(logs: PoopLog[]) {
  return [...logs].sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

export function useUsers(enabled = true) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<PoopLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setUsers([]);
      setLogs([]);
      setLoading(false);
      return;
    }

    const unsubscribeUsers = onSnapshot(
      usersQuery(),
      (snapshot) => {
        // Esconde carteiras-sistema (ex.: a banca da PrivadIn Bet) de toda a UI.
        setUsers(withoutSystemUsers(snapshot.docs.map((doc) => doc.data() as AppUser)));
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao ler ranking de usuarios:", error);
        setLoading(false);
      },
    );

    const unsubscribeLogs = onSnapshot(
      allLogsQuery(),
      (snapshot) => {
        const nextLogs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PoopLog);
        setLogs(sortLogs(nextLogs));
      },
      (error) => {
        console.error("Erro ao ler logs para desempate do ranking:", error);
      },
    );

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
    };
  }, [enabled]);

  const rankedUsers = useMemo<RankedUser[]>(() => rankUsers(users, logs), [logs, users]);
  return { users, rankedUsers, loading };
}

export function useUserLogs(uid?: string, enabled = true) {
  const [logs, setLogs] = useState<PoopLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !uid || !isFirebaseConfigured) {
      setLogs([]);
      setLoading(false);
      return;
    }

    return onSnapshot(
      userLogsQuery(uid),
      (snapshot) => {
        const nextLogs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PoopLog);
        setLogs(sortLogs(nextLogs));
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao ler historico do usuario:", error);
        setLoading(false);
      },
    );
  }, [enabled, uid]);

  return { logs, loading };
}

export function useAllLogs(enabled = true) {
  const [logs, setLogs] = useState<PoopLog[]>([]);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setLogs([]);
      return;
    }

    return onSnapshot(
      allLogsQuery(),
      (snapshot) => {
        const nextLogs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PoopLog);
        setLogs(sortLogs(nextLogs));
      },
      (error) => {
        console.error("Erro ao ler registros gerais:", error);
      },
    );
  }, [enabled]);

  return logs;
}

export function useAdminAuditLogs(enabled = true) {
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setAuditLogs([]);
      return;
    }

    return onSnapshot(
      adminAuditLogsQuery(),
      (snapshot) => {
        setAuditLogs(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AdminAuditLog),
        );
      },
      (error) => {
        console.error("Erro ao ler auditoria admin:", error);
      },
    );
  }, [enabled]);

  return auditLogs;
}

export function useRegistrationRequests(enabled = true) {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setRequests([]);
      return;
    }

    return onSnapshot(
      registrationRequestsQuery(),
      (snapshot) => {
        setRequests(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RegistrationRequest),
        );
      },
      (error) => {
        console.error("Erro ao ler solicitacoes de cadastro:", error);
      },
    );
  }, [enabled]);

  return requests;
}

export function useRegistrationAttempts(enabled = true) {
  const [attempts, setAttempts] = useState<RegistrationAttempt[]>([]);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setAttempts([]);
      return;
    }

    return onSnapshot(
      registrationAttemptsQuery(),
      (snapshot) => {
        setAttempts(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RegistrationAttempt),
        );
      },
      (error) => {
        console.error("Erro ao ler tentativas de cadastro:", error);
      },
    );
  }, [enabled]);

  return attempts;
}

export function useAppSettings(enabled = true) {
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setAppSettings(defaultAppSettings);
      setLoading(false);
      return;
    }

    return onSnapshot(
      appSettingsDocRef,
      (snapshot) => {
        setAppSettings(parseAppSettings(snapshot.data() as Partial<AppSettings> | undefined));
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao ler configuracoes do app:", error);
        setAppSettings(defaultAppSettings);
        setLoading(false);
      },
    );
  }, [enabled]);

  return { appSettings, loading };
}

export function usePoopcoinTransactions(enabled = true) {
  const [transactions, setTransactions] = useState<PoopcoinTransaction[]>([]);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setTransactions([]);
      return;
    }

    return onSnapshot(
      poopcoinTransactionsQuery(),
      (snapshot) => {
        setTransactions(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PoopcoinTransaction),
        );
      },
      (error) => {
        console.error("Erro ao ler ledger de Poopcoins:", error);
      },
    );
  }, [enabled]);

  return transactions;
}

export function usePoopcoinSupply(enabled = true) {
  const [supply, setSupply] = useState<PoopcoinSupplySummary>(() => parsePoopcoinSupplySummary());

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setSupply(parsePoopcoinSupplySummary());
      return;
    }

    return onSnapshot(
      poopcoinChainHeadRef,
      (snapshot) => {
        setSupply(parsePoopcoinSupplySummary(snapshot.data() as Record<string, unknown> | undefined));
      },
      (error) => {
        console.error("Erro ao ler suprimento de Poopcoins:", error);
        setSupply(parsePoopcoinSupplySummary());
      },
    );
  }, [enabled]);

  return supply;
}

export function useBetConfig(enabled = true) {
  const [config, setConfig] = useState<PrivadInBetConfig>(DEFAULT_BET_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setConfig(DEFAULT_BET_CONFIG);
      setLoading(false);
      return;
    }

    return onSnapshot(
      betConfigDocRef,
      (snapshot) => {
        setConfig(parseBetConfig(snapshot.data() as Partial<PrivadInBetConfig> | undefined));
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao ler configuracao da PrivadIn Bet:", error);
        setConfig(DEFAULT_BET_CONFIG);
        setLoading(false);
      },
    );
  }, [enabled]);

  return { config, loading };
}

export function useBetHistory(uid?: string, enabled = true) {
  const [rounds, setRounds] = useState<BetRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !uid || !isFirebaseConfigured) {
      setRounds([]);
      setLoading(false);
      return;
    }

    const roundsQuery = query(
      collection(db, "user_private", uid, "bet_rounds"),
      orderBy("createdAt", "desc"),
      limit(100),
    );

    return onSnapshot(
      roundsQuery,
      (snapshot) => {
        setRounds(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as BetRound));
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao ler historico de apostas:", error);
        setLoading(false);
      },
    );
  }, [enabled, uid]);

  return { rounds, loading };
}

/** Saldo da carteira-sistema da banca (apenas para o painel do Admin). */
export function useHouseWallet(enabled = true) {
  const [balance, setBalance] = useState<number | null>(null);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setBalance(null);
      setExists(false);
      return;
    }

    return onSnapshot(
      houseWalletDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setBalance(null);
          setExists(false);
          return;
        }
        setExists(true);
        setBalance(Number((snapshot.data() as AppUser).poopcoinBalance ?? 0));
      },
      (error) => {
        console.error("Erro ao ler a banca da PrivadIn Bet:", error);
      },
    );
  }, [enabled]);

  return { balance, exists };
}

/** Metricas agregadas e anonimas da PrivadIn Bet (privadin_bet/stats). */
export function useBetStats(enabled = true) {
  const [stats, setStats] = useState<BetStats>({ totalWagered: 0, totalPaidOut: 0, houseProfit: 0 });

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) {
      setStats({ totalWagered: 0, totalPaidOut: 0, houseProfit: 0 });
      return;
    }

    return onSnapshot(
      betStatsDocRef,
      (snapshot) => {
        const data = snapshot.data() as Partial<BetStats> | undefined;
        setStats({
          totalWagered: Number(data?.totalWagered ?? 0),
          totalPaidOut: Number(data?.totalPaidOut ?? 0),
          houseProfit: Number(data?.houseProfit ?? 0),
          updatedAt: data?.updatedAt,
        });
      },
      (error) => {
        console.error("Erro ao ler metricas da PrivadIn Bet:", error);
      },
    );
  }, [enabled]);

  return stats;
}
