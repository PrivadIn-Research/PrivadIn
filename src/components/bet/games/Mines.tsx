import { useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { BetGameProps } from "../../../types";
import { resolveBetLimits } from "../../../services/betConfigService";
import { formatPoopcoins } from "../../../services/poopcoinService";
import { clampWinMultiplier, minesFairMultiplier } from "../../../utils/betMath";
import { BetAmountControl, GameStat, useBetSound } from "../betUi";

type Phase = "idle" | "playing" | "busted" | "cashed";

export const meta = { id: "mines", defaultLabel: "Mines", defaultIcon: "💣" };

export default function Mines({ config, globalConfig, balance, muted, onSettle }: BetGameProps) {
  const { minBet, maxBet } = resolveBetLimits(globalConfig, config);
  const sound = useBetSound(muted);
  const tiles = Math.max(4, Math.trunc(config.extra?.tiles ?? 25));
  const cols = Math.round(Math.sqrt(tiles));
  const mineCount = Math.max(1, Math.min(tiles - 1, Math.trunc(config.extra?.mines ?? 3)));

  const [bet, setBet] = useState(() => Math.max(minBet, Math.min(maxBet, config.minBet)));
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState(`Revele as casas seguras. Evite as ${mineCount} bombas!`);
  const [lastWin, setLastWin] = useState(0);
  const settledRef = useRef(false);

  const currentMultiplier = useMemo(() => {
    if (revealed.size === 0) return 0;
    return clampWinMultiplier(
      minesFairMultiplier(tiles, mineCount, revealed.size) * config.rtp,
      config.minPayoutMultiplier,
      config.maxPayoutMultiplier,
    );
  }, [revealed.size, tiles, mineCount, config.rtp, config.minPayoutMultiplier, config.maxPayoutMultiplier]);

  const start = () => {
    if (phase === "playing" || bet > balance || bet < minBet) return;
    const next = new Set<number>();
    while (next.size < mineCount) next.add(Math.floor(Math.random() * tiles));
    setMines(next);
    setRevealed(new Set());
    setLastWin(0);
    settledRef.current = false;
    setPhase("playing");
    setMessage("Boa sorte! Retire quando quiser.");
    sound.click();
  };

  const settle = async (multiplier: number, busted: boolean, revealedCount: number) => {
    if (settledRef.current) return;
    settledRef.current = true;
    try {
      const result = await onSettle({
        wager: bet,
        multiplier,
        meta: { mines: mineCount, tiles, revealed: revealedCount, busted },
      });
      if (result.payout > 0) {
        setPhase("cashed");
        setLastWin(result.payout);
        setMessage(`Retirado em ${(result.payout / bet).toFixed(2)}x — +${formatPoopcoins(result.payout)}!`);
        sound.win(result.payout >= bet * 10);
        if (result.payout >= bet * 10) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
        if (result.cappedByBankroll) toast("Prêmio limitado pela banca.", { icon: "🏦" });
      } else {
        setPhase("busted");
        setMessage("💥 Bomba! Você perdeu a aposta.");
        sound.lose();
      }
    } catch (error) {
      settledRef.current = false;
      setPhase("playing");
      toast.error(error instanceof Error ? error.message : "Erro ao apostar.");
    }
  };

  const reveal = (index: number) => {
    if (phase !== "playing" || revealed.has(index)) return;
    if (mines.has(index)) {
      setRevealed((prev) => new Set(prev).add(index));
      void settle(0, true, revealed.size);
      return;
    }
    const next = new Set(revealed).add(index);
    setRevealed(next);
    sound.tick();
    if (next.size >= tiles - mineCount) {
      // Limpou todas as casas seguras: retira automaticamente.
      void settle(
        clampWinMultiplier(
          minesFairMultiplier(tiles, mineCount, next.size) * config.rtp,
          config.minPayoutMultiplier,
          config.maxPayoutMultiplier,
        ),
        false,
        next.size,
      );
    }
  };

  const cashOut = () => {
    if (phase !== "playing" || revealed.size === 0) return;
    void settle(currentMultiplier, false, revealed.size);
  };

  const reveal_all = phase === "busted" || phase === "cashed";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div
        className="grid w-full gap-2 rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-[#10121f] to-[#1b1030] p-4"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tiles }, (_, index) => {
          const isRevealed = revealed.has(index);
          const isMine = mines.has(index);
          const show = isRevealed || reveal_all;
          return (
            <button
              key={index}
              type="button"
              onClick={() => reveal(index)}
              disabled={phase !== "playing" || isRevealed}
              className={clsx(
                "grid aspect-square place-items-center rounded-lg text-2xl font-black transition",
                !show && "bg-panel-strong hover:bg-accent-soft/40",
                show && isMine && "bg-danger/30 ring-2 ring-danger",
                show && !isMine && isRevealed && "bg-success/25 ring-2 ring-success",
                show && !isMine && !isRevealed && "bg-panel-strong/40 opacity-60",
              )}
            >
              {show ? (isMine ? "💣" : "💎") : ""}
            </button>
          );
        })}
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <GameStat label="Saldo" value={formatPoopcoins(balance)} />
        <GameStat
          label="Multi."
          value={`${(phase === "playing" ? currentMultiplier : 0).toFixed(2)}x`}
          highlight={phase === "playing" && currentMultiplier > 0}
        />
        <GameStat label="Ganho" value={formatPoopcoins(lastWin)} highlight={lastWin > 0} />
      </div>

      <p className="min-h-5 text-center text-sm font-semibold text-amber-200">{message}</p>

      <BetAmountControl value={bet} onChange={setBet} min={minBet} max={maxBet} balance={balance} disabled={phase === "playing"} />

      {phase === "playing" ? (
        <button
          type="button"
          onClick={cashOut}
          disabled={revealed.size === 0}
          className="h-16 w-56 rounded-2xl bg-success text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
        >
          RETIRAR {currentMultiplier.toFixed(2)}x
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={bet > balance || bet < minBet}
          className="h-16 w-56 rounded-2xl bg-gradient-to-b from-[#ff5a47] to-[#9c2015] text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
        >
          APOSTAR
        </button>
      )}
    </div>
  );
}
