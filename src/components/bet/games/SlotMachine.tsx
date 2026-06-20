import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { BetGameProps } from "../../../types";
import { resolveBetLimits } from "../../../services/betConfigService";
import { formatPoopcoins } from "../../../services/poopcoinService";
import {
  clampWinMultiplier,
  estimateMeanMultiplier,
  makeRtpScaler,
} from "../../../utils/betMath";
import { BetAmountControl, GameStat, useBetSound } from "../betUi";

export interface SlotSymbol {
  id: string;
  icon: string;
  mult: number;
  weight: number;
  wild?: boolean;
}

// Linhas: 3 horizontais + 2 diagonais (grid[row][col]).
const LINES: [number, number][][] = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
];

function makePicker(symbols: SlotSymbol[]) {
  const cumulative: { symbol: SlotSymbol; top: number }[] = [];
  let acc = 0;
  for (const symbol of symbols) {
    acc += symbol.weight;
    cumulative.push({ symbol, top: acc });
  }
  return () => {
    const r = Math.random() * acc;
    for (const entry of cumulative) if (r < entry.top) return entry.symbol;
    return symbols[symbols.length - 1];
  };
}

function lineWinner(cells: SlotSymbol[], wild: SlotSymbol) {
  const nonWild = cells.filter((cell) => !cell.wild);
  if (nonWild.length === 0) return wild;
  return nonWild.every((cell) => cell.id === nonWild[0].id) ? nonWild[0] : null;
}

function evaluateGrid(grid: SlotSymbol[][], wild: SlotSymbol) {
  let raw = 0;
  let jackpot = false;
  const winCells = new Set<string>();
  for (const line of LINES) {
    const cells = line.map(([r, c]) => grid[r][c]);
    const winner = lineWinner(cells, wild);
    if (winner) {
      raw += winner.mult;
      if (winner.wild) jackpot = true;
      line.forEach(([r, c]) => winCells.add(`${r}-${c}`));
    }
  }
  return { raw, jackpot, winCells };
}

export function SlotMachine({
  symbols,
  config,
  globalConfig,
  balance,
  muted,
  onSettle,
}: BetGameProps & { symbols: SlotSymbol[] }) {
  const wild = useMemo(() => symbols.find((s) => s.wild) ?? symbols[0], [symbols]);
  const pick = useMemo(() => makePicker(symbols), [symbols]);
  const { minBet, maxBet } = resolveBetLimits(globalConfig, config);
  const sound = useBetSound(muted);

  // Calibra o RTP intrinseco das linhas para bater com config.rtp.
  const rtpScale = useMemo(() => {
    const roll = () => {
      const grid = [0, 1, 2].map(() => [0, 1, 2].map(() => pick()));
      return evaluateGrid(grid, wild).raw;
    };
    return makeRtpScaler(estimateMeanMultiplier(roll), config.rtp);
  }, [pick, wild, config.rtp]);

  const [bet, setBet] = useState(() => Math.max(minBet, Math.min(maxBet, config.minBet)));
  const [grid, setGrid] = useState<SlotSymbol[][]>(() =>
    [0, 1, 2].map(() => [0, 1, 2].map(() => pick())),
  );
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState("Faça sua aposta e gire o tigre.");
  const [lastWin, setLastWin] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  useEffect(() => {
    setBet((current) => Math.max(minBet, Math.min(maxBet, current)));
  }, [minBet, maxBet]);

  const spin = async () => {
    if (spinning || bet > balance || bet < minBet) return;
    setSpinning(true);
    setWinCells(new Set());
    setLastWin(0);
    setMessage("Girando…");
    sound.click();

    const finalGrid = [0, 1, 2].map(() => [0, 1, 2].map(() => pick()));
    const { raw, jackpot, winCells: cells } = evaluateGrid(finalGrid, wild);
    const multiplier = raw > 0 ? clampWinMultiplier(raw * rtpScale, config.minPayoutMultiplier, config.maxPayoutMultiplier) : 0;

    // Animacao: embaralha as celulas e para coluna a coluna.
    const stops = [700, 1000, 1300];
    const spinTimer = window.setInterval(() => {
      setGrid([0, 1, 2].map(() => [0, 1, 2].map(() => pick())));
      sound.tick();
    }, 90);
    timers.current.push(spinTimer);

    window.setTimeout(async () => {
      window.clearInterval(spinTimer);
      setGrid(finalGrid);

      try {
        const result = await onSettle({ wager: bet, multiplier, meta: { jackpot, raw } });
        if (result.payout > 0) {
          setWinCells(cells);
          setLastWin(result.payout);
          setMessage(jackpot ? "🐯 JACKPOT! 🐯" : `Você ganhou ${formatPoopcoins(result.payout)} poopcoins!`);
          sound.win(jackpot || result.payout >= bet * 10);
          if (result.payout >= bet * 10) {
            confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
          }
          if (result.cappedByBankroll) {
            toast("Prêmio limitado pela banca.", { icon: "🏦" });
          }
        } else {
          setMessage("Sem sorte dessa vez. Gire de novo!");
          sound.lose();
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Erro ao apostar.");
        toast.error(error instanceof Error ? error.message : "Erro ao apostar.");
      } finally {
        setSpinning(false);
      }
    }, stops[2] + 100);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="w-full rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-[#3a0a0a] to-[#1c0505] p-4 shadow-panel">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((col) => (
            <div key={col} className="overflow-hidden rounded-xl bg-black/40 p-1">
              {[0, 1, 2].map((row) => {
                const symbol = grid[row][col];
                const isWin = winCells.has(`${row}-${col}`);
                return (
                  <div
                    key={row}
                    className={clsx(
                      "grid h-16 place-items-center rounded-lg text-4xl transition sm:h-20 sm:text-5xl",
                      isWin ? "bg-amber-300/30 ring-2 ring-amber-300" : "bg-black/20",
                      spinning && "blur-[1px]",
                    )}
                  >
                    {symbol.icon}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <GameStat label="Saldo" value={formatPoopcoins(balance)} />
        <GameStat label="Ganho" value={formatPoopcoins(lastWin)} highlight={lastWin > 0} />
      </div>

      <p className="min-h-5 text-center text-sm font-semibold text-amber-200">{message}</p>

      <BetAmountControl value={bet} onChange={setBet} min={minBet} max={maxBet} balance={balance} disabled={spinning} />

      <button
        type="button"
        onClick={() => void spin()}
        disabled={spinning || bet > balance || bet < minBet}
        className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-b from-[#ff5a47] to-[#9c2015] text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
      >
        {spinning ? "…" : "GIRAR"}
      </button>
    </div>
  );
}
