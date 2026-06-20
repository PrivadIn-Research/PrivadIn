import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Coins, Dices, History as HistoryIcon } from "lucide-react";
import { clsx } from "clsx";
import { Card } from "../components/Card";
import { BET_GAME_COMPONENTS } from "../components/bet/gameRegistry";
import { useBetConfig, useBetHistory } from "../hooks/useFirestoreData";
import { settleBetRound } from "../services/betService";
import { resolveBetLimits } from "../services/betConfigService";
import { formatPoopcoins } from "../services/poopcoinService";
import type { AppUser, BetRoundInput } from "../types";

function ResponsibleGamingNote() {
  const { t } = useTranslation("bet");
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p>
        {t("responsible", {
          defaultValue:
            "Jogue com responsabilidade. A PrivadIn Bet usa poopcoins fictícios, sem valor real — é só diversão.",
        })}
      </p>
    </div>
  );
}

export function BetPage({ user, muted }: { user: AppUser; muted: boolean }) {
  const { t } = useTranslation("bet");
  const { config } = useBetConfig(true);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { rounds } = useBetHistory(user.uid, showHistory);

  const balance = Number(user.poopcoinBalance ?? 0);

  const lobbyGames = useMemo(
    () =>
      Object.values(config.games)
        .filter((game) => game.enabled && BET_GAME_COMPONENTS[game.id])
        .sort((a, b) => a.order - b.order),
    [config.games],
  );

  const handleSettle = useCallback(
    (gameId: string) => async (round: BetRoundInput) =>
      settleBetRound({
        user: { uid: user.uid },
        gameId,
        wager: round.wager,
        multiplier: round.multiplier,
        meta: round.meta,
      }),
    [user.uid],
  );

  if (!config.enabled) {
    return (
      <div className="grid gap-4">
        <Card className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-panel-strong text-3xl">🎰</div>
          <h2 className="text-xl font-black text-fg">{t("title", { defaultValue: "PrivadIn Bet" })}</h2>
          <p className="mt-2 text-fg-muted">
            {t("unavailable", { defaultValue: "PrivadIn Bet indisponível no momento." })}
          </p>
        </Card>
      </div>
    );
  }

  const activeGame = activeGameId ? config.games[activeGameId] : null;
  const ActiveComponent = activeGameId ? BET_GAME_COMPONENTS[activeGameId] : null;

  return (
    <div className="grid gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-2xl text-accent-fg shadow-accent">
            <Dices size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black text-fg">{t("title", { defaultValue: "PrivadIn Bet" })}</h1>
            <p className="flex items-center gap-1 text-sm font-bold text-accent-strong">
              <Coins size={14} /> {formatPoopcoins(balance)} poopcoins
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((current) => !current)}
          className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-panel px-3 py-2 text-sm font-bold text-fg-soft transition hover:bg-panel-strong"
        >
          <HistoryIcon size={16} /> {t("myBets", { defaultValue: "Minhas apostas" })}
        </button>
      </Card>

      <ResponsibleGamingNote />

      {showHistory ? (
        <Card>
          <h2 className="mb-3 text-base font-black text-fg">
            {t("historyTitle", { defaultValue: "Histórico privado de apostas" })}
          </h2>
          {rounds.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              {t("historyEmpty", { defaultValue: "Você ainda não fez apostas." })}
            </p>
          ) : (
            <ul className="grid gap-2">
              {rounds.map((round) => (
                <li
                  key={round.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-panel-strong/40 px-3 py-2 text-sm"
                >
                  <span className="font-bold text-fg">
                    {config.games[round.gameId]?.icon ?? "🎲"} {config.games[round.gameId]?.label ?? round.gameId}
                  </span>
                  <span className="text-fg-muted">
                    {formatPoopcoins(round.wager)} → {round.multiplier > 0 ? `${round.multiplier.toFixed(2)}x` : "—"}
                  </span>
                  <span className={clsx("font-black", round.net >= 0 ? "text-success" : "text-danger")}>
                    {round.net >= 0 ? "+" : ""}
                    {formatPoopcoins(round.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {activeGame && ActiveComponent ? (
        <Card>
          <button
            type="button"
            onClick={() => setActiveGameId(null)}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-line/10 bg-panel px-3 py-2 text-sm font-bold text-fg-soft transition hover:bg-panel-strong"
          >
            <ArrowLeft size={16} /> {t("backToLobby", { defaultValue: "Voltar ao lobby" })}
          </button>
          <h2 className="mb-4 text-center text-xl font-black text-fg">
            {activeGame.icon} {activeGame.label}
          </h2>
          <ActiveComponent
            user={user}
            balance={balance}
            config={activeGame}
            globalConfig={config}
            muted={muted}
            onSettle={handleSettle(activeGame.id)}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lobbyGames.map((game) => {
            const { minBet, maxBet } = resolveBetLimits(config, game);
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => setActiveGameId(game.id)}
                className="flex flex-col items-start gap-2 rounded-2xl border border-line/10 bg-panel/90 p-4 text-left shadow-panel transition hover:-translate-y-0.5 hover:border-accent/40"
              >
                <span className="text-4xl">{game.icon}</span>
                <span className="text-base font-black text-fg">{game.label}</span>
                <span className="text-xs text-fg-muted">
                  {formatPoopcoins(minBet)}–{formatPoopcoins(maxBet)} · RTP {(game.rtp * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
          {lobbyGames.length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-3 text-center text-fg-muted">
              {t("noGames", { defaultValue: "Nenhum jogo disponível no momento." })}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
