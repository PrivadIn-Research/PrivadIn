import confetti from "canvas-confetti";
import toast from "react-hot-toast";
import { Loader2, Share2, TimerReset } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, MetricCard } from "../components/Card";
import { RankingList } from "../components/RankingList";
import type { AppUser, PoopLog, RankedUser } from "../types";
import { countThisWeek, formatDateTime, formatHour, getCooldownSeconds, getLastLog } from "../utils/date";
import { formatNumber } from "../utils/format";
import { toRoman } from "../utils/roman";
import { requestCurrentLocation } from "../services/locationService";
import { registerPoopWithValidation } from "../services/poopService";

export function DashboardPage({
  user,
  rankedUsers,
  userLogs,
  cooldownMinutes,
  pointsPerLog,
  edition,
  onPlaySound,
}: {
  user: AppUser;
  rankedUsers: RankedUser[];
  userLogs: PoopLog[];
  cooldownMinutes: number;
  pointsPerLog: number;
  edition: number;
  onPlaySound: () => void;
}) {
  const { t } = useTranslation(["dashboard", "common"]);
  const currentRank = rankedUsers.find((ranked) => ranked.uid === user.uid);
  const lastLog = getLastLog(userLogs);
  const logCooldownSeconds = getCooldownSeconds(userLogs, cooldownMinutes);
  const userCooldownSeconds = user.cooldownUntil
    ? Math.max(0, Math.ceil((user.cooldownUntil.toMillis() - Date.now()) / 1000))
    : 0;
  const cooldownSeconds = Math.max(logCooldownSeconds, userCooldownSeconds);
  const formattedPointsPerLog = formatNumber(pointsPerLog);
  const [isRegistering, setIsRegistering] = useState(false);
  const isOnCooldown = cooldownSeconds > 0;
  const cooldownWarningMessage = t("cooldownWarning");

  async function handleRegister() {
    if (isOnCooldown || isRegistering) {
      if (isOnCooldown) {
        toast.error(cooldownWarningMessage);
      }
      return;
    }
    setIsRegistering(true);

    const previousRank = currentRank?.rank ?? rankedUsers.length;
    try {
      const location = await requestCurrentLocation();
      await registerPoopWithValidation(user, userLogs, location, cooldownMinutes, pointsPerLog);
      onPlaySound();
      toast.success(t("registerSuccess"));
      if ((currentRank?.rank ?? previousRank) <= previousRank) {
        confetti({ particleCount: 140, spread: 75, origin: { y: 0.72 }, colors: ["#fde047", "#f59e0b", "#14b8a6"] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericRegisterError"));
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleShareRanking() {
    const rankingText = rankedUsers
      .sort((a, b) => a.rank - b.rank)
      .map((ranked) =>
        t("shareLine", {
          rank: ranked.rank,
          name: ranked.name,
          nickname: ranked.nickname?.trim() ? t("shareNickname", { nickname: ranked.nickname.trim() }) : "",
          points: formatNumber(ranked.totalPoints),
        }),
      )
      .join("\n");
    const text = t("shareText", {
      edition: toRoman(edition),
      ranking: rankingText || t("shareEmpty"),
    });

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("shareTitle"),
          text,
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      toast.success(t("shareCopied"));
    } catch {
      toast.error(t("shareError"));
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section className="order-3 grid grid-cols-2 gap-3 sm:gap-4 md:order-1 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="💩" label={t("metric.total")} value={formatNumber(user.totalPoints)} hint={t("metric.totalHint", { points: formattedPointsPerLog })} />
        <MetricCard icon="🏆" label={t("metric.rank")} value={`#${currentRank?.rank ?? "-"}`} hint={t("metric.rankHint")} />
        <MetricCard icon="🔥" label={t("metric.streak")} value={`${user.currentDailyStreak}d`} hint={t("metric.streakHint", { count: user.currentWeeklyStreak })} />
        <MetricCard icon="🕘" label={t("metric.lastLog")} value={formatHour(lastLog?.createdAt)} hint={formatDateTime(lastLog?.createdAt)} />
      </section>

      <section className="order-1 grid gap-4 sm:gap-5 md:order-2 xl:grid-cols-[1fr_380px]">
        <Card className="relative overflow-hidden p-4 sm:p-6">
          <div className="absolute right-4 top-4 hidden text-8xl opacity-10 sm:right-6 sm:top-6 sm:block">🚽</div>
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft/35 px-3 py-1 text-xs font-bold text-accent-strong sm:text-sm">
              <TimerReset size={15} />
              {t("cooldownBadge", { count: cooldownMinutes })}
            </span>
            <h2 className="mt-4 text-2xl font-black leading-tight text-fg sm:text-5xl">{t("heroTitle")}</h2>
            <p className="mt-3 text-sm text-fg-soft sm:text-base">
              {t("heroDescription", { points: formattedPointsPerLog })}
            </p>
            <button
              onClick={handleRegister}
              aria-disabled={isOnCooldown || isRegistering}
              title={isOnCooldown ? cooldownWarningMessage : t("registerTooltip")}
              disabled={isOnCooldown || isRegistering}
              className={`mt-6 w-full rounded-2xl bg-accent px-5 py-4 text-base font-black text-accent-fg shadow-accent transition sm:w-auto sm:rounded-3xl sm:px-6 sm:py-6 sm:text-xl ${
                isOnCooldown || isRegistering
                  ? "cursor-not-allowed opacity-60"
                  : "hover:-translate-y-1 hover:bg-accent-strong"
              }`}
            >
              {isRegistering ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label={t("loading")} />
              ) : isOnCooldown ? (
                t("registerButtonCooldown", { minutes: Math.ceil(cooldownSeconds / 60) })
              ) : (
                t("registerButtonReady", { points: formattedPointsPerLog })
              )}
            </button>
          </div>
        </Card>
      </section>

      <section className="order-2 grid gap-4 sm:gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4">
            <p className="text-sm font-bold text-accent-strong">{t("weeklyEyebrow", { count: countThisWeek(userLogs) })}</p>
            <h2 className="text-2xl font-black text-fg">{t("weeklyTitle")}</h2>
          </div>
          <RankingList users={rankedUsers} mode="weekly" currentUid={user.uid} />
          <button
              onClick={handleShareRanking}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent-soft/35 px-4 py-3 text-sm font-black text-accent-strong transition hover:bg-accent hover:text-accent-fg sm:w-auto"
              title={t("shareTitle")}
            >
              <Share2 size={18} />
              {t("shareAction")}
            </button>
        </Card>
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-accent-strong">{t("overallEyebrow")}</p>
              <h2 className="text-2xl font-black text-fg">{t("overallTitle")}</h2>
            </div>
            
          </div>
          <RankingList users={rankedUsers} currentUid={user.uid} />
        </Card>
      </section>
    </div>
  );
}
