import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "@firebase/firestore";
import { db } from "./firebase";
import type { AdminAuditAction, AppUser, BonusTimeRange, PoopLocation, PoopLog } from "../types";
import {
  DAILY_LIMIT,
  calculateDailyStreak,
  calculateWeeklyStreak,
  countToday,
  getCooldownSeconds,
} from "../utils/date";
import {
  assertActiveWorkTime,
  hasCompleteWorkSchedule,
  isBetweenMinutes,
  minutesOfDay,
  resolveWorkSchedule,
} from "../utils/workSchedule";
import i18n from "../i18n";
import { RegisterPoopError } from "../utils/registerPoopError";
import { getCurrentTermsVersion, hasAcceptedCurrentTerms } from "../utils/terms";

export const usersRef = collection(db, "users");
export const logsRef = collection(db, "poop_logs");
export const adminLogsRef = collection(db, "admin_audit_logs");

export function createAuditLog({
  action,
  admin,
  targetUser,
  delta,
  points,
  removedLogId,
  cooldownMinutes,
  pointsPerLog,
  edition,
}: {
  action: AdminAuditAction;
  admin: AppUser;
  targetUser?: Pick<AppUser, "uid">;
  delta?: number;
  points?: number;
  removedLogId?: string;
  cooldownMinutes?: number;
  pointsPerLog?: number;
  edition?: number;
}) {
  return {
    action,
    adminId: admin.uid,
    targetUserId: targetUser?.uid ?? null,
    delta: delta ?? null,
    points: points ?? null,
    removedLogId: removedLogId ?? null,
    cooldownMinutes: cooldownMinutes ?? null,
    pointsPerLog: pointsPerLog ?? null,
    edition: edition ?? null,
    createdAt: Timestamp.now(),
  };
}

export function usersQuery() {
  return query(usersRef, orderBy("totalPoints", "desc"));
}

export function userLogsQuery(uid: string) {
  return query(logsRef, where("userId", "==", uid));
}

export function latestUserLogQuery(uid: string) {
  return query(logsRef, where("userId", "==", uid), orderBy("createdAt", "desc"), limit(1));
}

export function allLogsQuery() {
  return query(logsRef, orderBy("createdAt", "desc"));
}

export function adminAuditLogsQuery() {
  return query(adminLogsRef, orderBy("createdAt", "desc"));
}

export function competitionResetAuditLogsQuery() {
  return query(adminLogsRef, where("action", "==", "reset_weekly"), orderBy("createdAt", "desc"));
}

function resolvePointsPerLog(
  settings: Record<string, unknown> | undefined,
  localTime: string,
  fallback: number,
) {
  let pointsPerLog = Math.max(1, Number(settings?.pointsPerLog ?? fallback));
  const bonusRanges = Array.isArray(settings?.bonusTimeRanges)
    ? (settings.bonusTimeRanges as BonusTimeRange[])
    : [];
  const currentMinutes = minutesOfDay(localTime);

  for (const range of bonusRanges) {
    const start = typeof range.start === "string" ? range.start : "00:00";
    const end = typeof range.end === "string" ? range.end : "00:00";
    const points = Number(range.points) || pointsPerLog;
    if (isBetweenMinutes(currentMinutes, minutesOfDay(start), minutesOfDay(end))) {
      pointsPerLog = Math.max(pointsPerLog, Math.trunc(points));
    }
  }

  return pointsPerLog;
}

function assertLocation(location: PoopLocation) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = location.accuracy == null ? null : Number(location.accuracy);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RegisterPoopError("location_invalid", "Latitude invalida.");
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RegisterPoopError("location_invalid", "Longitude invalida.");
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

export async function registerPoopWithValidation(
  user: AppUser,
  userLogs: PoopLog[],
  location: PoopLocation,
  cooldownMinutes: number,
  pointsPerLog: number,
) {
  if (user.isActive === false) {
    throw new RegisterPoopError("deactivated_user", i18n.t("auth:deactivated_user"));
  }

  if (!hasCompleteWorkSchedule(user.workSchedule)) {
    throw new RegisterPoopError(
      "missing_work_schedule",
      i18n.t("services:poop.missingWorkSchedule", {
        defaultValue: "Preencha seu horario de expediente no perfil antes de registrar.",
      }),
      "profile",
    );
  }

  const cooldown = getCooldownSeconds(userLogs, cooldownMinutes);
  if (cooldown > 0) {
    throw new RegisterPoopError(
      "cooldown",
      i18n.t("services:poop.cooldown", { count: Math.ceil(cooldown / 60) }),
    );
  }

  if (user.cooldownUntil && user.cooldownUntil.toMillis() > Date.now()) {
    throw new RegisterPoopError(
      "cooldown",
      `Usuario em cooldown ate ${user.cooldownUntil.toDate().toLocaleString("pt-BR")}.`,
    );
  }

  if (countToday(userLogs) >= DAILY_LIMIT) {
    throw new RegisterPoopError(
      "daily_limit",
      i18n.t("services:poop.dailyLimit", { count: DAILY_LIMIT }),
    );
  }

  const validatedLocation = assertLocation(location);
  const schedule = resolveWorkSchedule(user.workSchedule);
  const now = Timestamp.now();
  const nowDate = now.toDate();
  const localTime = assertActiveWorkTime(schedule, nowDate);
  const userRef = doc(db, "users", user.uid);
  const settingsRef = doc(db, "app_settings", APP_SETTINGS_DOC_ID);

  await runTransaction(db, async (transaction) => {
    const [userSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(settingsRef),
    ]);
    const currentUser = userSnapshot.data() as AppUser | undefined;
    if (!currentUser) {
      throw new RegisterPoopError("invalid_work_schedule", "Perfil do usuario nao encontrado.");
    }

    if (!hasCompleteWorkSchedule(currentUser.workSchedule)) {
      throw new RegisterPoopError(
        "missing_work_schedule",
        i18n.t("services:poop.missingWorkSchedule", {
          defaultValue: "Preencha seu horario de expediente no perfil antes de registrar.",
        }),
        "profile",
      );
    }

    const settings = settingsSnapshot.data();
    const currentTermsVersion = getCurrentTermsVersion({
      termsOfUseVersion: Number(settings?.termsOfUseVersion ?? undefined),
    });
    if (!hasAcceptedCurrentTerms(currentUser, { termsOfUseVersion: currentTermsVersion })) {
      throw new RegisterPoopError(
        "missing_terms",
        i18n.t("services:poop.missingTerms", {
          defaultValue: "Aceite os termos atualizados para continuar registrando.",
        }),
        "terms",
      );
    }
    const resolvedPoints = resolvePointsPerLog(settings, localTime, pointsPerLog);
    const resolvedCooldownMinutes = Math.max(0, Number(settings?.cooldownMinutes ?? cooldownMinutes));
    const currentEdition = Math.max(1, Math.trunc(Number(settings?.edition ?? 1)));
    const durationMinutes = Math.max(1, Math.min(180, Number(currentUser.bathroomDurationMinutes ?? 10)));
    const nextCooldown = Timestamp.fromMillis(now.toMillis() + resolvedCooldownMinutes * 60_000);
    const nextLogs = [
      {
        id: "pending",
        userId: user.uid,
        userName: currentUser.name,
        createdAt: now,
        points: resolvedPoints,
        isWeeklyActive: true,
        competitionEdition: currentEdition,
      },
      ...userLogs,
    ];

    transaction.set(doc(logsRef), {
      userId: user.uid,
      userName: currentUser.name,
      createdAt: now,
      points: resolvedPoints,
      isWeeklyActive: true,
      location: validatedLocation,
      timezone: schedule.timezone,
      localTime,
      durationMinutes,
      competitionEdition: currentEdition,
    });
    transaction.update(userRef, {
      totalPoints: increment(resolvedPoints),
      weeklyPoints: increment(resolvedPoints),
      firstLogAt: currentUser.firstLogAt ?? now,
      lastLogAt: now,
      cooldownUntil: nextCooldown,
      currentDailyStreak: calculateDailyStreak(nextLogs),
      currentWeeklyStreak: calculateWeeklyStreak(nextLogs),
      bestStreak: Math.max(currentUser.bestStreak ?? 0, calculateDailyStreak(nextLogs)),
    });
  });
}

export async function registerPoop(
  user: AppUser,
  userLogs: PoopLog[],
  cooldownMinutes: number,
  pointsPerLog: number,
) {
  if (user.isActive === false) {
    throw new RegisterPoopError("deactivated_user", i18n.t("auth:deactivated_user"));
  }

  const cooldown = getCooldownSeconds(userLogs, cooldownMinutes);
  if (cooldown > 0) {
    throw new RegisterPoopError(
      "cooldown",
      i18n.t("services:poop.cooldown", { count: Math.ceil(cooldown / 60) }),
    );
  }

  if (countToday(userLogs) >= DAILY_LIMIT) {
    throw new RegisterPoopError(
      "daily_limit",
      i18n.t("services:poop.dailyLimit", { count: DAILY_LIMIT }),
    );
  }

  const now = Timestamp.now();
  const settingsSnapshot = await getDoc(appSettingsDocRef);
  const currentEdition = Math.max(1, Math.trunc(Number(settingsSnapshot.data()?.edition ?? 1)));
  const nextLogs = [
    {
      id: "pending",
      userId: user.uid,
      userName: user.name,
      createdAt: now,
      points: pointsPerLog,
      isWeeklyActive: true,
      competitionEdition: currentEdition,
    },
    ...userLogs,
  ];

  const userDoc = doc(db, "users", user.uid);
  const logDoc = await addDoc(logsRef, {
    userId: user.uid,
    userName: user.name,
    createdAt: now,
    points: pointsPerLog,
    isWeeklyActive: true,
    competitionEdition: currentEdition,
  });

  await updateDoc(userDoc, {
    totalPoints: increment(pointsPerLog),
    weeklyPoints: increment(pointsPerLog),
    firstLogAt: user.firstLogAt ?? now,
    lastLogAt: now,
    currentDailyStreak: calculateDailyStreak(nextLogs),
    currentWeeklyStreak: calculateWeeklyStreak(nextLogs),
    bestStreak: Math.max(user.bestStreak ?? 0, calculateDailyStreak(nextLogs)),
  });

  return logDoc.id;
}

export async function adjustUserPoints(admin: AppUser, targetUser: AppUser, delta: number) {
  const userDoc = doc(db, "users", targetUser.uid);
  const targetSnapshot = await getDoc(userDoc);
  const settingsSnapshot = await getDoc(appSettingsDocRef);
  const targetData = targetSnapshot.data() as AppUser | undefined;
  const targetName = targetData?.name ?? targetUser.name;
  const currentEdition = Math.max(1, Math.trunc(Number(settingsSnapshot.data()?.edition ?? 1)));
  const now = Timestamp.now();

  if (delta > 0) {
    const batch = writeBatch(db);
    batch.set(doc(logsRef), {
      userId: targetUser.uid,
      userName: targetName,
      createdAt: now,
      points: delta,
      isWeeklyActive: true,
      competitionEdition: currentEdition,
    });
    batch.update(userDoc, {
      totalPoints: increment(delta),
      weeklyPoints: increment(delta),
      firstLogAt: targetData?.firstLogAt ?? now,
      lastLogAt: now,
    });
    batch.set(
      doc(adminLogsRef),
      createAuditLog({
        action: "adjust_points",
        admin,
        targetUser,
        delta,
      }),
    );
    await batch.commit();
    return;
  }

  if (delta < 0) {
    const latestSnapshot = await getDocs(latestUserLogQuery(targetUser.uid));
    const latestLog = latestSnapshot.docs[0];
    if (!latestLog) {
      throw new Error(i18n.t("services:poop.noLogToRemove"));
    }

    const logData = latestLog.data() as Omit<PoopLog, "id">;
    const batch = writeBatch(db);
    batch.delete(latestLog.ref);
    batch.update(userDoc, {
      totalPoints: increment(delta),
      weeklyPoints: logData.isWeeklyActive ? increment(delta) : increment(0),
    });
    batch.set(
      doc(adminLogsRef),
      createAuditLog({
        action: "adjust_points",
        admin,
        targetUser,
        delta,
      }),
    );
    await batch.commit();
  }
}

export async function removeLog(admin: AppUser, log: PoopLog) {
  await runTransaction(db, async (transaction) => {
    transaction.delete(doc(db, "poop_logs", log.id));
    transaction.update(doc(db, "users", log.userId), {
      totalPoints: increment(-log.points),
      weeklyPoints: log.isWeeklyActive ? increment(-log.points) : increment(0),
    });
    transaction.set(
      doc(adminLogsRef),
      createAuditLog({
        action: "remove_log",
        admin,
        targetUser: { uid: log.userId },
        points: log.points,
        removedLogId: log.id,
      }),
    );
  });
}

const APP_SETTINGS_DOC_ID = "global";
const appSettingsDocRef = doc(db, "app_settings", APP_SETTINGS_DOC_ID);

export async function resetWeeklyRanking(admin: AppUser, logs: PoopLog[], users: AppUser[]) {
  const settingsSnapshot = await getDoc(appSettingsDocRef);
  const currentEdition = Number(settingsSnapshot.data()?.edition ?? 17);
  const nextEdition = Math.max(1, Math.trunc(currentEdition)) + 1;

  const batch = writeBatch(db);
  users.forEach((user) => {
    batch.update(doc(db, "users", user.uid), { weeklyPoints: 0 });
  });
  logs.forEach((log) => {
    if (log.isWeeklyActive) {
      batch.update(doc(db, "poop_logs", log.id), { isWeeklyActive: false });
    }
  });
  batch.set(
    appSettingsDocRef,
    {
      edition: nextEdition,
      overallRankingVisible: true,
      updatedAt: Timestamp.now(),
      updatedBy: admin.uid,
    },
    { merge: true },
  );
  batch.set(
    doc(adminLogsRef),
    createAuditLog({
      action: "reset_weekly",
      admin,
      edition: nextEdition,
    }),
  );
  await batch.commit();
}
