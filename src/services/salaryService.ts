import { Timestamp, collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import type { AppUser, SalarySummary } from "../types";
import { decryptSalaryCents, encryptSalaryCents } from "../utils/salaryCrypto";
import { dailyWorkMinutes, resolveWorkSchedule } from "../utils/workSchedule";
import { auth, db } from "./firebase";

const userPrivateRef = (uid: string) => doc(db, "user_private", uid);

export async function saveEncryptedMonthlySalary(monthlySalaryCents: number) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Faça login para salvar o salário.");
  }

  const normalized = Math.round(monthlySalaryCents);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100_000_000) {
    throw new Error("Salário mensal inválido.");
  }

  await setDoc(
    userPrivateRef(uid),
    {
      salary: await encryptSalaryCents(normalized),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function getSalarySummary(user?: Pick<AppUser, "uid" | "workSchedule" | "bathroomDurationMinutes">) {
  const uid = user?.uid ?? auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Faça login para consultar o salário.");
  }

  const [userSnapshot, privateSnapshot, logsSnapshot] = await Promise.all([
    user
      ? Promise.resolve(null)
      : getDoc(doc(db, "users", uid)),
    getDoc(userPrivateRef(uid)),
    getDocs(query(collection(db, "poop_logs"), where("userId", "==", uid))),
  ]);

  const userData = user ?? (userSnapshot?.data() as AppUser | undefined);
  const schedule = resolveWorkSchedule(userData?.workSchedule);
  const monthlySalaryCents = await decryptSalaryCents(privateSnapshot.data()?.salary);
  const durationFallback = Math.max(1, Math.min(180, Number(userData?.bathroomDurationMinutes ?? 10)));
  const totalBathroomMinutes = logsSnapshot.docs.reduce((sum, logDoc) => {
    const duration = Number(logDoc.data().durationMinutes ?? durationFallback);
    return sum + (Number.isFinite(duration) ? duration : durationFallback);
  }, 0);
  const monthlyWorkMinutes = dailyWorkMinutes(schedule) * 22;
  const hourlyRateCents = monthlySalaryCents / Math.max(1, monthlyWorkMinutes / 60);
  const estimatedEarnedCents = Math.round((monthlySalaryCents / monthlyWorkMinutes) * totalBathroomMinutes);

  const summary: SalarySummary = {
    monthlySalaryCents,
    estimatedEarnedCents,
    hourlyRateCents: Math.round(hourlyRateCents),
    totalBathroomMinutes,
  };

  return summary;
}
