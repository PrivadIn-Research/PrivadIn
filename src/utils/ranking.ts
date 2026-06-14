import type { AppUser, PoopLog, RankedUser } from "../types";
import i18n from "../i18n";

const DICEBEAR_URL_PREFIX = "https://api.dicebear.com/";

export function rankUsers(users: AppUser[], logs: PoopLog[] = []): RankedUser[] {
  const activeUsers = users.filter((user) => user.isActive !== false);
  const currentCompetitionFirstLogAt = new Map<string, number>();

  for (const log of logs) {
    if (!log.isWeeklyActive) continue;
    const createdAtMs = log.createdAt?.toMillis?.() ?? 0;
    const previous = currentCompetitionFirstLogAt.get(log.userId);
    if (previous == null || createdAtMs < previous) {
      currentCompetitionFirstLogAt.set(log.userId, createdAtMs);
    }
  }

  const overall = [...activeUsers].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const aFirst = a.firstLogAt?.toMillis() ?? a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const bFirst = b.firstLogAt?.toMillis() ?? b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    return aFirst - bFirst;
  });

  const weekly = [...activeUsers].sort((a, b) => {
    if (b.weeklyPoints !== a.weeklyPoints) return b.weeklyPoints - a.weeklyPoints;
    const aFirst = currentCompetitionFirstLogAt.get(a.uid) ?? Number.MAX_SAFE_INTEGER;
    const bFirst = currentCompetitionFirstLogAt.get(b.uid) ?? Number.MAX_SAFE_INTEGER;
    return aFirst - bFirst;
  });

  const weeklyRanks = new Map(weekly.map((user, index) => [user.uid, index + 1]));

  return overall.map((user, index) => ({
    ...user,
    rank: index + 1,
    weeklyRank: weeklyRanks.get(user.uid) ?? activeUsers.length,
  }));
}

export function medalFor(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "🏅";
}

export function titleFor(rank: number) {
  if (rank === 1) return i18n.t("services:ranking.first");
  if (rank === 2) return i18n.t("services:ranking.second");
  if (rank === 3) return i18n.t("services:ranking.third");
  return i18n.t("services:ranking.other");
}

export function avatarFor(name: string, email: string) {
  const seed = encodeURIComponent(name || email);
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&backgroundColor=facc15,f59e0b,0f172a`;
}

export function isValidDicebearUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith(DICEBEAR_URL_PREFIX)) return false;

  try {
    const url = new URL(trimmedValue);
    return url.href.startsWith(DICEBEAR_URL_PREFIX);
  } catch {
    return false;
  }
}

export function canLoadDicebearUrl(value: string) {
  const trimmedValue = value.trim();
  if (!isValidDicebearUrl(trimmedValue)) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const timeoutId = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, 5000);

    image.onload = () => {
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(true);
    };

    image.onerror = () => {
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(false);
    };

    image.src = trimmedValue;
  });
}
