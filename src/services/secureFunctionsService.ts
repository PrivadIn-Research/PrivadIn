import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { PoopLocation, SalarySummary } from "../types";

const registerPoopSecureCallable = httpsCallable<
  { location: PoopLocation },
  { ok: boolean }
>(functions, "registerPoopSecure");

const saveSalaryCallable = httpsCallable<
  { monthlySalaryCents: number },
  { ok: boolean }
>(functions, "saveSalary");

const getSalarySummaryCallable = httpsCallable<
  void,
  SalarySummary
>(functions, "getSalarySummary");

export async function registerPoopWithBackendValidation(location: PoopLocation) {
  await registerPoopSecureCallable({ location });
}

export async function saveEncryptedMonthlySalary(monthlySalaryCents: number) {
  await saveSalaryCallable({ monthlySalaryCents });
}

export async function getSalarySummary() {
  const result = await getSalarySummaryCallable();
  return result.data;
}
