import type { AdminAuditLog, AppSettings, PoopLog, SalarySummary } from "../types";

interface CompetitionResetBoundary {
  createdAtMs: number;
  nextEdition: number;
}

function resolveLogEdition(
  log: PoopLog,
  currentEdition: number,
  resetBoundaries: CompetitionResetBoundary[],
) {
  if (typeof log.competitionEdition === "number" && Number.isFinite(log.competitionEdition)) {
    return Math.max(1, Math.trunc(log.competitionEdition));
  }

  const createdAtMs = log.createdAt?.toMillis?.() ?? 0;
  const nextReset = resetBoundaries.find((boundary) => createdAtMs < boundary.createdAtMs);
  if (nextReset) {
    return Math.max(1, nextReset.nextEdition - 1);
  }

  return currentEdition;
}

export function buildSalarySummaryFromLogs(
  logs: PoopLog[],
  monthlySalaryCents: number,
  monthlyWorkMinutes: number,
  durationFallback: number,
  appSettings: Pick<AppSettings, "edition">,
  resetAuditLogs: AdminAuditLog[],
): SalarySummary {
  const resetBoundaries = resetAuditLogs
    .filter((auditLog) => auditLog.action === "reset_weekly" && typeof auditLog.edition === "number")
    .map((auditLog) => ({
      createdAtMs: auditLog.createdAt?.toMillis?.() ?? 0,
      nextEdition: Math.max(1, Math.trunc(auditLog.edition ?? 1)),
    }))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const currentEdition = Math.max(1, Number(appSettings.edition ?? 1));
  const totalBathroomMinutes = logs.reduce((sum, log) => {
    const duration = Number(log.durationMinutes ?? durationFallback);
    return sum + (Number.isFinite(duration) ? duration : durationFallback);
  }, 0);
  const hourlyRateCents = monthlySalaryCents / Math.max(1, monthlyWorkMinutes / 60);
  const centsPerMinute = monthlySalaryCents / Math.max(1, monthlyWorkMinutes);

  const historyByEdition = new Map<number, { earnedCents: number; totalBathroomMinutes: number; logsCount: number }>();

  for (const log of logs) {
    const edition = resolveLogEdition(log, currentEdition, resetBoundaries);
    const duration = Number(log.durationMinutes ?? durationFallback);
    const safeDuration = Number.isFinite(duration) ? duration : durationFallback;
    const current = historyByEdition.get(edition) ?? {
      earnedCents: 0,
      totalBathroomMinutes: 0,
      logsCount: 0,
    };
    current.earnedCents += Math.round(centsPerMinute * safeDuration);
    current.totalBathroomMinutes += safeDuration;
    current.logsCount += 1;
    historyByEdition.set(edition, current);
  }

  const competitionHistory = [...historyByEdition.entries()]
    .map(([edition, values]) => ({
      edition,
      ...values,
    }))
    .sort((a, b) => b.edition - a.edition);

  return {
    monthlySalaryCents,
    currentCompetitionEarnedCents: competitionHistory.find((entry) => entry.edition === currentEdition)?.earnedCents ?? 0,
    totalEarnedCents: competitionHistory.reduce((sum, entry) => sum + entry.earnedCents, 0),
    hourlyRateCents: Math.round(hourlyRateCents),
    totalBathroomMinutes,
    competitionHistory,
  };
}
