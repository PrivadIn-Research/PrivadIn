import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const DEFAULT_SCHEDULE = {
  horarioInicioExpediente: "09:00",
  horarioFimExpediente: "18:00",
  horarioInicioAlmoco: "12:00",
  horarioFimAlmoco: "13:00",
  timezone: "America/Sao_Paulo",
};

type WorkSchedule = typeof DEFAULT_SCHEDULE;

function requireUid(uid?: string) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  return uid;
}

function parseTime(value: unknown, fallback: string) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  return value;
}

function minutesOfDay(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isBetweenMinutes(current: number, start: number, end: number) {
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

function resolveSchedule(data: FirebaseFirestore.DocumentData): WorkSchedule {
  const raw = data.workSchedule ?? {};
  return {
    horarioInicioExpediente: parseTime(raw.horarioInicioExpediente, DEFAULT_SCHEDULE.horarioInicioExpediente),
    horarioFimExpediente: parseTime(raw.horarioFimExpediente, DEFAULT_SCHEDULE.horarioFimExpediente),
    horarioInicioAlmoco: parseTime(raw.horarioInicioAlmoco, DEFAULT_SCHEDULE.horarioInicioAlmoco),
    horarioFimAlmoco: parseTime(raw.horarioFimAlmoco, DEFAULT_SCHEDULE.horarioFimAlmoco),
    timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_SCHEDULE.timezone,
  };
}

function localTimeInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return formatter.format(date);
}

function assertActiveWorkTime(schedule: WorkSchedule, now: Date) {
  const localTime = localTimeInTimezone(now, schedule.timezone);
  const current = minutesOfDay(localTime);
  const workStart = minutesOfDay(schedule.horarioInicioExpediente);
  const workEnd = minutesOfDay(schedule.horarioFimExpediente);
  const lunchStart = minutesOfDay(schedule.horarioInicioAlmoco);
  const lunchEnd = minutesOfDay(schedule.horarioFimAlmoco);

  if (!isBetweenMinutes(current, workStart, workEnd)) {
    throw new HttpsError("failed-precondition", "Registro bloqueado fora do horário de expediente.");
  }

  if (isBetweenMinutes(current, lunchStart, lunchEnd)) {
    throw new HttpsError("failed-precondition", "Registro bloqueado durante o horário de almoço.");
  }

  return localTime;
}

function assertLocation(data: unknown) {
  const location = data as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const accuracy = location?.accuracy == null ? null : Number(location.accuracy);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new HttpsError("invalid-argument", "Latitude inválida.");
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpsError("invalid-argument", "Longitude inválida.");
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

function encryptionKey() {
  const raw = process.env.SALARY_ENCRYPTION_KEY;
  if (!raw) {
    throw new HttpsError("failed-precondition", "Chave de criptografia salarial não configurada.");
  }
  const key = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  if (key.length !== 32) {
    throw new HttpsError("failed-precondition", "SALARY_ENCRYPTION_KEY deve ter 32 bytes em hex ou base64.");
  }
  return key;
}

function encryptSalaryCents(value: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptSalaryCents(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data?.salary?.ciphertext || !data.salary.iv || !data.salary.tag) return 0;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(data.salary.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(data.salary.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data.salary.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return Number(decrypted);
}

function dailyWorkMinutes(schedule: WorkSchedule) {
  const workStart = minutesOfDay(schedule.horarioInicioExpediente);
  const workEnd = minutesOfDay(schedule.horarioFimExpediente);
  const lunchStart = minutesOfDay(schedule.horarioInicioAlmoco);
  const lunchEnd = minutesOfDay(schedule.horarioFimAlmoco);
  const work = workEnd >= workStart ? workEnd - workStart : 1440 - workStart + workEnd;
  const lunch = lunchEnd >= lunchStart ? lunchEnd - lunchStart : 1440 - lunchStart + lunchEnd;
  return Math.max(1, work - lunch);
}

export const registerPoopSecure = onCall(async (request) => {
  const uid = requireUid(request.auth?.uid);
  const location = assertLocation(request.data?.location);
  const userRef = db.collection("users").doc(uid);
  const settingsRef = db.collection("app_settings").doc("global");
  const now = Timestamp.now();
  const nowDate = now.toDate();

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(settingsRef),
    ]);
    const user = userSnapshot.data();
    const settings = settingsSnapshot.data() ?? {};

    if (!user) {
      throw new HttpsError("not-found", "Perfil do usuário não encontrado.");
    }

    if (user.termsAccepted !== true) {
      throw new HttpsError("failed-precondition", "Aceite os termos de uso e privacidade antes de registrar.");
    }

    const cooldownUntil = user.cooldownUntil as Timestamp | undefined;
    if (cooldownUntil && cooldownUntil.toMillis() > now.toMillis()) {
      throw new HttpsError("failed-precondition", `Usuário em cooldown até ${cooldownUntil.toDate().toLocaleString("pt-BR")}.`);
    }

    const schedule = resolveSchedule(user);
    const localTime = assertActiveWorkTime(schedule, nowDate);
    let pointsPerLog = Math.max(1, Number(settings.pointsPerLog ?? 1));
    // Check bonus time ranges (if configured) and apply the highest matching points
    try {
      const bonusRanges = Array.isArray(settings.bonusTimeRanges) ? settings.bonusTimeRanges : [];
      const currentMinutes = minutesOfDay(localTime);
      for (const r of bonusRanges) {
        const start = typeof r.start === "string" ? r.start : "00:00";
        const end = typeof r.end === "string" ? r.end : "00:00";
        const pts = Number(r.points) || pointsPerLog;
        const startMin = minutesOfDay(start);
        const endMin = minutesOfDay(end);
        if (isBetweenMinutes(currentMinutes, startMin, endMin)) {
          pointsPerLog = Math.max(pointsPerLog, Math.trunc(pts));
        }
      }
    } catch (e) {
      // ignore malformed bonus ranges
    }
    const cooldownMinutes = Math.max(0, Number(settings.cooldownMinutes ?? 15));
    const durationMinutes = Math.max(1, Math.min(180, Number(user.bathroomDurationMinutes ?? 10)));
    const nextCooldown = Timestamp.fromMillis(now.toMillis() + cooldownMinutes * 60_000);

    const logRef = db.collection("poop_logs").doc();
    transaction.set(logRef, {
      userId: uid,
      userName: user.name,
      createdAt: now,
      points: pointsPerLog,
      isWeeklyActive: true,
      location,
      timezone: schedule.timezone,
      localTime,
      durationMinutes,
    });
    transaction.update(userRef, {
      totalPoints: FieldValue.increment(pointsPerLog),
      weeklyPoints: FieldValue.increment(pointsPerLog),
      firstLogAt: user.firstLogAt ?? now,
      lastLogAt: now,
      cooldownUntil: nextCooldown,
    });
  });

  return { ok: true };
});

export const saveSalary = onCall({ secrets: ["SALARY_ENCRYPTION_KEY"] }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const monthlySalaryCents = Math.round(Number(request.data?.monthlySalaryCents));
  if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents < 0 || monthlySalaryCents > 100_000_000) {
    throw new HttpsError("invalid-argument", "Salário mensal inválido.");
  }

  await db.collection("user_private").doc(uid).set(
    {
      salary: encryptSalaryCents(monthlySalaryCents),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { ok: true };
});

export const getSalarySummary = onCall({ secrets: ["SALARY_ENCRYPTION_KEY"] }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const [userSnapshot, privateSnapshot, logsSnapshot] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("user_private").doc(uid).get(),
    db.collection("poop_logs").where("userId", "==", uid).get(),
  ]);
  const user = userSnapshot.data() ?? {};
  const schedule = resolveSchedule(user);
  const monthlySalaryCents = decryptSalaryCents(privateSnapshot.data());
  const durationFallback = Math.max(1, Math.min(180, Number(user.bathroomDurationMinutes ?? 10)));
  const totalBathroomMinutes = logsSnapshot.docs.reduce((sum, doc) => {
    const duration = Number(doc.data().durationMinutes ?? durationFallback);
    return sum + (Number.isFinite(duration) ? duration : durationFallback);
  }, 0);
  const monthlyWorkMinutes = dailyWorkMinutes(schedule) * 22;
  const hourlyRateCents = monthlySalaryCents / Math.max(1, monthlyWorkMinutes / 60);
  const estimatedEarnedCents = Math.round((monthlySalaryCents / monthlyWorkMinutes) * totalBathroomMinutes);

  return {
    monthlySalaryCents,
    estimatedEarnedCents,
    hourlyRateCents: Math.round(hourlyRateCents),
    totalBathroomMinutes,
  };
});
