import {
  Timestamp,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  type Transaction,
} from "@firebase/firestore";
import { db } from "./firebase";
import { adminLogsRef, createAuditLog } from "./poopService";
import type {
  AppUser,
  PoopLog,
  PoopcoinTransaction,
  PoopcoinTransactionEntry,
  PoopcoinTransactionType,
  UserRole,
} from "../types";

export const poopcoinTransactionsRef = collection(db, "poopcoin_transactions");
export const poopcoinChainHeadRef = doc(db, "poopcoin_chain", "head");
export const POOPCOIN_LEDGER_PAGE_SIZE = 50;
export const POOPCOIN_MIGRATION_BATCH_SIZE = 25;

const GENESIS_HASH = "0".repeat(64);
const MAX_TRANSFER_AMOUNT = 100000;
const MAX_REASON_LENGTH = 240;

type AppendPoopcoinInput = {
  type: PoopcoinTransactionType;
  entries: PoopcoinTransactionEntry[];
  amount: number;
  createdBy: string;
  createdByRole: UserRole;
  createdAt?: Timestamp;
  fromUserId?: string | null;
  toUserId?: string | null;
  linkedLogId?: string | null;
  linkedPostId?: string | null;
  reversesTransactionHash?: string | null;
  reason?: string | null;
};

export function poopcoinTransactionsQuery(pageSize = POOPCOIN_LEDGER_PAGE_SIZE) {
  return query(poopcoinTransactionsRef, orderBy("sequence", "desc"), limit(pageSize));
}

export function normalizePoopcoinAmount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_TRANSFER_AMOUNT, Math.trunc(value)));
}

export function normalizePoopcoinReason(value: string) {
  return value.trim().slice(0, MAX_REASON_LENGTH);
}

export function formatPoopcoins(value?: number | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uniqueUserIds(entries: PoopcoinTransactionEntry[]) {
  return Array.from(new Set(entries.map((entry) => entry.userId))).sort();
}

function assertValidEntries(entries: PoopcoinTransactionEntry[]) {
  if (entries.length === 0) {
    throw new Error("Transacao sem lancamentos.");
  }

  entries.forEach((entry) => {
    if (!entry.userId || !Number.isInteger(entry.delta) || entry.delta === 0) {
      throw new Error("Lancamento de Poopcoins invalido.");
    }
  });
}

export async function appendPoopcoinTransaction(
  transaction: Transaction,
  input: AppendPoopcoinInput,
) {
  assertValidEntries(input.entries);

  const headSnapshot = await transaction.get(poopcoinChainHeadRef);
  const previousHash = String(headSnapshot.data()?.lastHash ?? GENESIS_HASH);
  const previousSequence = Number(headSnapshot.data()?.lastSequence ?? 0);
  const sequence = Math.max(0, Math.trunc(previousSequence)) + 1;
  const createdAt = input.createdAt ?? Timestamp.now();
  const nonce = randomNonce();
  const reason = input.reason ? normalizePoopcoinReason(input.reason) : null;
  const affectedUserIds = uniqueUserIds(input.entries);

  const unsignedPayload = {
    previousHash,
    sequence,
    createdAt,
    type: input.type,
    entries: input.entries,
    affectedUserIds,
    fromUserId: input.fromUserId ?? null,
    toUserId: input.toUserId ?? null,
    amount: input.amount,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    status: "active",
    reversesTransactionHash: input.reversesTransactionHash ?? null,
    linkedLogId: input.linkedLogId ?? null,
    linkedPostId: input.linkedPostId ?? null,
    reason,
    nonce,
  };
  const hash = await sha256Hex(canonicalJson(unsignedPayload));
  const transactionData: Omit<PoopcoinTransaction, "id"> = {
    hash,
    previousHash,
    sequence,
    createdAt,
    type: input.type,
    entries: input.entries,
    affectedUserIds,
    fromUserId: input.fromUserId ?? null,
    toUserId: input.toUserId ?? null,
    amount: input.amount,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    status: "active",
    reversesTransactionHash: input.reversesTransactionHash ?? null,
    reversedByTransactionHash: null,
    linkedLogId: input.linkedLogId ?? null,
    linkedPostId: input.linkedPostId ?? null,
    reason,
    nonce,
  };

  transaction.set(doc(db, "poopcoin_transactions", hash), transactionData);
  transaction.set(
    poopcoinChainHeadRef,
    {
      lastHash: hash,
      lastSequence: sequence,
      updatedAt: createdAt,
    },
    { merge: true },
  );

  return { hash, data: transactionData };
}

export async function transferPoopcoins(
  sender: AppUser,
  recipientUid: string,
  amountValue: number,
) {
  const amount = normalizePoopcoinAmount(amountValue);
  const targetUid = recipientUid.trim();

  if (amount <= 0) {
    throw new Error("Informe uma quantidade inteira positiva de Poopcoins.");
  }

  if (!targetUid) {
    throw new Error("Informe o ID do destinatario.");
  }

  if (targetUid === sender.uid) {
    throw new Error("Voce nao pode transferir Poopcoins para si mesmo.");
  }

  await runTransaction(db, async (transaction) => {
    const senderRef = doc(db, "users", sender.uid);
    const recipientRef = doc(db, "users", targetUid);
    const [senderSnapshot, recipientSnapshot] = await Promise.all([
      transaction.get(senderRef),
      transaction.get(recipientRef),
    ]);
    const senderData = senderSnapshot.data() as AppUser | undefined;
    const recipientData = recipientSnapshot.data() as AppUser | undefined;

    if (!senderData || senderData.isActive === false) {
      throw new Error("Seu usuario nao esta ativo para transferir Poopcoins.");
    }

    if (!recipientData || recipientData.isActive === false) {
      throw new Error("Destinatario nao encontrado ou fora da competicao.");
    }

    const currentBalance = Number(senderData.poopcoinBalance ?? 0);
    if (currentBalance < amount) {
      throw new Error("Saldo insuficiente para transferir essa quantidade.");
    }

    await appendPoopcoinTransaction(transaction, {
      type: "transfer",
      entries: [
        { userId: sender.uid, delta: -amount },
        { userId: targetUid, delta: amount },
      ],
      amount,
      createdBy: sender.uid,
      createdByRole: senderData.role,
      fromUserId: sender.uid,
      toUserId: targetUid,
    });

    transaction.update(senderRef, { poopcoinBalance: increment(-amount) });
    transaction.update(recipientRef, { poopcoinBalance: increment(amount) });
  });
}

export async function adjustPoopcoins(
  admin: AppUser,
  targetUser: AppUser,
  amountValue: number,
  reasonValue: string,
) {
  const amount = Math.trunc(amountValue);
  const reason = normalizePoopcoinReason(reasonValue);

  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("Informe um ajuste inteiro diferente de zero.");
  }

  if (!reason) {
    throw new Error("Informe o motivo do ajuste.");
  }

  await runTransaction(db, async (transaction) => {
    const targetRef = doc(db, "users", targetUser.uid);
    const targetSnapshot = await transaction.get(targetRef);

    if (!targetSnapshot.exists()) {
      throw new Error("Usuario alvo nao encontrado.");
    }

    const { hash } = await appendPoopcoinTransaction(transaction, {
      type: "admin_adjustment",
      entries: [{ userId: targetUser.uid, delta: amount }],
      amount: Math.abs(amount),
      createdBy: admin.uid,
      createdByRole: admin.role,
      toUserId: amount > 0 ? targetUser.uid : null,
      fromUserId: amount < 0 ? targetUser.uid : null,
      reason,
    });

    transaction.update(targetRef, { poopcoinBalance: increment(amount) });
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({
        action: "adjust_poopcoins",
        admin,
        targetUser,
        delta: amount,
        poopcoins: amount,
        poopcoinTransactionHash: hash,
      }),
    );
  });
}

export async function reversePoopcoinTransaction(
  admin: AppUser,
  transactionHash: string,
  reasonValue: string,
) {
  const normalizedHash = transactionHash.trim();
  const reason = normalizePoopcoinReason(reasonValue);

  if (!normalizedHash) {
    throw new Error("Informe o hash da transacao.");
  }

  if (!reason) {
    throw new Error("Informe o motivo da reversao.");
  }

  await runTransaction(db, async (transaction) => {
    const originalRef = doc(db, "poopcoin_transactions", normalizedHash);
    const originalSnapshot = await transaction.get(originalRef);
    const original = originalSnapshot.data() as Omit<PoopcoinTransaction, "id"> | undefined;

    if (!original) {
      throw new Error("Transacao nao encontrada.");
    }

    if (original.status === "reversed" || original.reversedByTransactionHash) {
      throw new Error("Esta transacao ja foi revertida.");
    }

    if (original.type === "reversal") {
      throw new Error("Transacoes de reversao nao podem ser revertidas.");
    }

    const inverseEntries = original.entries.map((entry) => ({
      userId: entry.userId,
      delta: -entry.delta,
    }));

    const { hash } = await appendPoopcoinTransaction(transaction, {
      type: "reversal",
      entries: inverseEntries,
      amount: original.amount,
      createdBy: admin.uid,
      createdByRole: admin.role,
      reversesTransactionHash: original.hash,
      fromUserId: original.toUserId ?? null,
      toUserId: original.fromUserId ?? null,
      linkedLogId: original.linkedLogId ?? null,
      linkedPostId: original.linkedPostId ?? null,
      reason,
    });

    inverseEntries.forEach((entry) => {
      transaction.update(doc(db, "users", entry.userId), {
        poopcoinBalance: increment(entry.delta),
      });
    });
    transaction.update(originalRef, {
      status: "reversed",
      reversedByTransactionHash: hash,
    });
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({
        action: "reverse_poopcoin_transaction",
        admin,
        delta: 0,
        poopcoins: original.amount,
        poopcoinTransactionHash: hash,
      }),
    );
  });
}

export async function migratePoopcoinsForLogs(admin: AppUser, logs: PoopLog[]) {
  const pendingLogs = logs
    .filter((log) => !log.poopcoinTransactionHash && log.userId)
    .slice(0, POOPCOIN_MIGRATION_BATCH_SIZE);
  let migrated = 0;

  for (const log of pendingLogs) {
    await runTransaction(db, async (transaction) => {
      const logRef = doc(db, "poop_logs", log.id);
      const userRef = doc(db, "users", log.userId);
      const [logSnapshot, userSnapshot] = await Promise.all([
        transaction.get(logRef),
        transaction.get(userRef),
      ]);
      const latestLog = logSnapshot.data() as PoopLog | undefined;
      const targetUser = userSnapshot.data() as AppUser | undefined;

      if (!latestLog || latestLog.poopcoinTransactionHash || !targetUser) {
        return;
      }

      const { hash } = await appendPoopcoinTransaction(transaction, {
        type: "legacy_mint",
        entries: [{ userId: log.userId, delta: 1 }],
        amount: 1,
        createdBy: admin.uid,
        createdByRole: admin.role,
        toUserId: log.userId,
        linkedLogId: log.id,
        createdAt: latestLog.createdAt ?? Timestamp.now(),
        reason: "Migracao inicial de logs antigos.",
      });

      transaction.update(logRef, { poopcoinTransactionHash: hash });
      transaction.update(userRef, {
        poopcoinBalance: increment(1),
        poopcoinMigratedAt: Timestamp.now(),
      });
    });
    migrated += 1;
  }

  if (migrated > 0) {
    await runTransaction(db, async (transaction) => {
      transaction.set(
        doc(adminLogsRef),
        createAuditLog({
          action: "migrate_poopcoins",
          admin,
          delta: migrated,
          poopcoins: migrated,
        }),
      );
    });
  }

  return migrated;
}

export async function fetchRecentPoopcoinTransactions(limitCount = POOPCOIN_LEDGER_PAGE_SIZE) {
  const snapshot = await getDocs(poopcoinTransactionsQuery(limitCount));
  return snapshot.docs.map((transactionDoc) => ({
    id: transactionDoc.id,
    ...transactionDoc.data(),
  })) as PoopcoinTransaction[];
}

export async function markPoopcoinMigrationTouched(uid: string) {
  await updateDoc(doc(db, "users", uid), { poopcoinMigratedAt: Timestamp.now() });
}
