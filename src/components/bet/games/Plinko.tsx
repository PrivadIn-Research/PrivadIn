import { useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { BetGameProps } from "../../../types";
import { resolveBetLimits } from "../../../services/betConfigService";
import { formatPoopcoins } from "../../../services/poopcoinService";
import {
  binomialProbabilities,
  clampWinMultiplier,
  normalizeTableToRtp,
  samplePlinkoBin,
} from "../../../utils/betMath";
import { BetAmountControl, GameStat, useBetSound } from "../betUi";

export const meta = { id: "plinko", defaultLabel: "Plinko", defaultIcon: "🔵" };

export default function Plinko({ config, globalConfig, balance, muted, onSettle }: BetGameProps) {
  const { minBet, maxBet } = resolveBetLimits(globalConfig, config);
  const sound = useBetSound(muted);
  const rows = Math.max(6, Math.min(16, Math.trunc(config.extra?.rows ?? 12)));
  const risk = Math.max(0, config.extra?.risk ?? 1);

  // Tabela de payout (binomial) normalizada para o RTP configurado.
  const table = useMemo(() => {
    const center = rows / 2;
    const base = Array.from({ length: rows + 1 }, (_, i) =>
      Math.pow(1 + 0.45 * risk, Math.abs(i - center)),
    );
    const probs = binomialProbabilities(rows);
    return normalizeTableToRtp(base, probs, config.rtp).map((mult) =>
      clampWinMultiplier(mult, config.minPayoutMultiplier, config.maxPayoutMultiplier),
    );
  }, [rows, risk, config.rtp, config.minPayoutMultiplier, config.maxPayoutMultiplier]);

  const [bet, setBet] = useState(() => Math.max(minBet, Math.min(maxBet, config.minBet)));
  const [dropping, setDropping] = useState(false);
  const [ball, setBall] = useState<{ top: number; left: number } | null>(null);
  const [landedBin, setLandedBin] = useState<number | null>(null);
  const [message, setMessage] = useState("Solte a bolinha e veja onde ela cai.");
  const [lastWin, setLastWin] = useState(0);
  const settledRef = useRef(false);

  const drop = async () => {
    if (dropping || bet > balance || bet < minBet) return;
    setDropping(true);
    settledRef.current = false;
    setLandedBin(null);
    setLastWin(0);
    setMessage("Caindo…");
    sound.click();

    const bin = samplePlinkoBin(rows);
    const multiplier = table[bin] ?? 0;
    const leftPercent = (bin / rows) * 100;
    setBall({ top: 0, left: 50 });
    // Animacao em passos: a bolinha desce e migra para a coluna final.
    let step = 0;
    const totalSteps = rows;
    const interval = window.setInterval(() => {
      step += 1;
      sound.tick();
      const top = (step / totalSteps) * 92;
      const left = 50 + ((leftPercent - 50) * step) / totalSteps + (Math.random() - 0.5) * 4;
      setBall({ top, left });
      if (step >= totalSteps) {
        window.clearInterval(interval);
        setBall({ top: 92, left: leftPercent });
        void finish(bin, multiplier);
      }
    }, 90);
  };

  const finish = async (bin: number, multiplier: number) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setLandedBin(bin);
    try {
      const result = await onSettle({ wager: bet, multiplier, meta: { bin, rows, multiplier } });
      setLastWin(result.payout);
      if (result.net > 0) {
        setMessage(`Caiu em ${multiplier.toFixed(2)}x — +${formatPoopcoins(result.payout)}!`);
        sound.win(result.payout >= bet * 10);
        if (result.payout >= bet * 10) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
      } else {
        setMessage(`Caiu em ${multiplier.toFixed(2)}x. Recebeu ${formatPoopcoins(result.payout)}.`);
        sound.lose();
      }
      if (result.cappedByBankroll) toast("Prêmio limitado pela banca.", { icon: "🏦" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao apostar.");
    } finally {
      setDropping(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="relative h-64 w-full overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-[#0b1020] to-[#1a1030]">
        {/* pinos */}
        <div className="absolute inset-x-4 top-4 bottom-12 flex flex-col justify-between">
          {Array.from({ length: Math.min(rows, 8) }, (_, r) => (
            <div key={r} className="flex justify-center gap-3">
              {Array.from({ length: r + 2 }, (_, c) => (
                <span key={c} className="h-1.5 w-1.5 rounded-full bg-white/30" />
              ))}
            </div>
          ))}
        </div>
        {ball ? (
          <div
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)] transition-all duration-75"
            style={{ top: `${ball.top}%`, left: `${ball.left}%` }}
          />
        ) : null}
        {/* slots */}
        <div className="absolute inset-x-0 bottom-0 flex">
          {table.map((mult, index) => (
            <div
              key={index}
              className={clsx(
                "flex-1 border-t border-white/10 py-1 text-center text-[9px] font-bold",
                landedBin === index ? "bg-amber-300/30 text-amber-100" : "text-fg-muted",
              )}
            >
              {mult.toFixed(1)}
            </div>
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <GameStat label="Saldo" value={formatPoopcoins(balance)} />
        <GameStat label="Ganho" value={formatPoopcoins(lastWin)} highlight={lastWin > 0} />
      </div>

      <p className="min-h-5 text-center text-sm font-semibold text-amber-200">{message}</p>

      <BetAmountControl value={bet} onChange={setBet} min={minBet} max={maxBet} balance={balance} disabled={dropping} />

      <button
        type="button"
        onClick={() => void drop()}
        disabled={dropping || bet > balance || bet < minBet}
        className="h-16 w-56 rounded-2xl bg-gradient-to-b from-[#ff5a47] to-[#9c2015] text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
      >
        {dropping ? "…" : "SOLTAR BOLINHA"}
      </button>
    </div>
  );
}
