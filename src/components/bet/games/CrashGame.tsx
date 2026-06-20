import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { BetGameProps } from "../../../types";
import { resolveBetLimits } from "../../../services/betConfigService";
import { formatPoopcoins } from "../../../services/poopcoinService";
import { clampWinMultiplier, generateCrashPoint } from "../../../utils/betMath";
import { BetAmountControl, GameStat, useBetSound } from "../betUi";

type Phase = "idle" | "flying" | "crashed" | "cashed";

export function CrashGame({
  emoji,
  growth,
  config,
  globalConfig,
  balance,
  muted,
  onSettle,
}: BetGameProps & { emoji: string; growth: number }) {
  const { minBet, maxBet } = resolveBetLimits(globalConfig, config);
  const sound = useBetSound(muted);
  const [bet, setBet] = useState(() => Math.max(minBet, Math.min(maxBet, config.minBet)));
  const [phase, setPhase] = useState<Phase>("idle");
  const [multiplier, setMultiplier] = useState(1);
  const [message, setMessage] = useState("Aposte e decole. Retire antes de explodir!");
  const [lastWin, setLastWin] = useState(0);

  const rafRef = useRef<number>(0);
  const crashPointRef = useRef(1);
  const phaseRef = useRef<Phase>("idle");
  const settledRef = useRef(false);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  useEffect(() => setBet((c) => Math.max(minBet, Math.min(maxBet, c))), [minBet, maxBet]);

  const finishRound = async (cashedMultiplier: number | null) => {
    if (settledRef.current) return;
    settledRef.current = true;
    cancelAnimationFrame(rafRef.current);

    const won = cashedMultiplier != null;
    const settledMultiplier = won
      ? clampWinMultiplier(cashedMultiplier, config.minPayoutMultiplier, config.maxPayoutMultiplier)
      : 0;
    try {
      const result = await onSettle({
        wager: bet,
        multiplier: settledMultiplier,
        meta: { crashPoint: Number(crashPointRef.current.toFixed(2)), cashedOut: won },
      });
      if (result.payout > 0) {
        setPhase("cashed");
        phaseRef.current = "cashed";
        setLastWin(result.payout);
        setMessage(`Retirado em ${(result.payout / bet).toFixed(2)}x — +${formatPoopcoins(result.payout)}!`);
        sound.win(result.payout >= bet * 10);
        if (result.payout >= bet * 10) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
        if (result.cappedByBankroll) toast("Prêmio limitado pela banca.", { icon: "🏦" });
      } else {
        setPhase("crashed");
        phaseRef.current = "crashed";
        setMessage(`💥 Explodiu em ${crashPointRef.current.toFixed(2)}x. Boa sorte na próxima!`);
        sound.lose();
      }
    } catch (error) {
      setPhase("idle");
      phaseRef.current = "idle";
      settledRef.current = false;
      toast.error(error instanceof Error ? error.message : "Erro ao apostar.");
    }
  };

  const launch = () => {
    if (phase === "flying" || bet > balance || bet < minBet) return;
    settledRef.current = false;
    crashPointRef.current = generateCrashPoint(config.rtp, config.maxPayoutMultiplier);
    setMultiplier(1);
    setLastWin(0);
    setPhase("flying");
    phaseRef.current = "flying";
    setMessage("Subindo… retire antes da explosão!");
    sound.click();

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const current = Math.exp(growth * elapsed);
      if (current >= crashPointRef.current) {
        setMultiplier(crashPointRef.current);
        void finishRound(null);
        return;
      }
      setMultiplier(current);
      if (Math.random() < 0.1) sound.tick();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const cashOut = () => {
    if (phaseRef.current !== "flying") return;
    void finishRound(multiplier);
  };

  const flying = phase === "flying";
  const crashed = phase === "crashed";
  // Posicao do foguete sobe com o multiplicador (limitada visualmente).
  const lift = Math.min(85, Math.log(multiplier) * 26);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="relative h-64 w-full overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-[#0b1020] to-[#1a1030]">
        <div
          className="absolute left-1/2 -translate-x-1/2 text-5xl transition-all duration-100"
          style={{ bottom: `${flying || crashed ? lift : 6}%` }}
        >
          {crashed ? "💥" : emoji}
        </div>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p
            className={clsx(
              "text-6xl font-black tabular-nums",
              crashed ? "text-danger" : phase === "cashed" ? "text-success" : "text-amber-200",
            )}
          >
            {multiplier.toFixed(2)}x
          </p>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <GameStat label="Saldo" value={formatPoopcoins(balance)} />
        <GameStat label="Ganho" value={formatPoopcoins(lastWin)} highlight={lastWin > 0} />
      </div>

      <p className="min-h-5 text-center text-sm font-semibold text-amber-200">{message}</p>

      <BetAmountControl value={bet} onChange={setBet} min={minBet} max={maxBet} balance={balance} disabled={flying} />

      {flying ? (
        <button
          type="button"
          onClick={cashOut}
          className="h-16 w-56 rounded-2xl bg-success text-lg font-black text-white shadow-accent transition active:translate-y-1"
        >
          RETIRAR {multiplier.toFixed(2)}x
        </button>
      ) : (
        <button
          type="button"
          onClick={launch}
          disabled={bet > balance || bet < minBet}
          className="h-16 w-56 rounded-2xl bg-gradient-to-b from-[#ff5a47] to-[#9c2015] text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
        >
          APOSTAR E DECOLAR
        </button>
      )}
    </div>
  );
}
