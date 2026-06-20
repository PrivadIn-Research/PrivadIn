import { useCallback, useMemo, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { clsx } from "clsx";
import { formatPoopcoins } from "../../services/poopcoinService";

/** Sintetiza tons curtos (Web Audio) respeitando o mute global do app. */
export function useBetSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const tone = useCallback(
    (freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12, when = 0) => {
      if (muted) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = ctxRef.current ?? (ctxRef.current = new AudioContextClass());
        const t = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
      } catch {
        /* audio indisponivel */
      }
    },
    [muted],
  );

  return useMemo(
    () => ({
      tone,
      click: () => tone(140, 0.08, "sawtooth", 0.1),
      tick: () => tone(220 + Math.random() * 60, 0.05, "square", 0.07),
      win: (big = false) => {
        const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
        notes.forEach((f, i) => tone(f, big ? 0.32 : 0.2, "triangle", 0.15, i * 0.09));
      },
      lose: () => tone(160, 0.3, "sawtooth", 0.12),
    }),
    [tone],
  );
}

export function BetAmountControl({
  value,
  onChange,
  min,
  max,
  balance,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  balance: number;
  disabled?: boolean;
}) {
  const cap = Math.min(max, balance);
  const set = (next: number) => onChange(Math.max(min, Math.min(cap, Math.round(next))));
  const step = Math.max(1, Math.round(min));

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-muted">
        Aposta (poopcoins)
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
          className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-fg shadow-accent transition active:translate-y-0.5 disabled:opacity-40"
          aria-label="Diminuir aposta"
        >
          <Minus size={18} />
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={cap}
          disabled={disabled}
          onChange={(event) => set(Number(event.target.value))}
          className="w-24 rounded-xl border border-line/10 bg-field px-3 py-2 text-center text-lg font-black text-fg outline-none"
        />
        <button
          type="button"
          disabled={disabled || value >= cap}
          onClick={() => set(value + step)}
          className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-fg shadow-accent transition active:translate-y-0.5 disabled:opacity-40"
          aria-label="Aumentar aposta"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex gap-1.5">
        {[min, Math.round(cap / 2), cap].map((amount, index) => (
          <button
            key={`${amount}-${index}`}
            type="button"
            disabled={disabled || amount < min}
            onClick={() => set(amount)}
            className="rounded-lg border border-line/15 px-2 py-1 text-[11px] font-bold text-fg-soft transition hover:bg-panel-strong disabled:opacity-40"
          >
            {index === 2 ? "MÁX" : formatPoopcoins(amount)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-line/10 bg-panel-strong/50 px-3 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-muted">{label}</p>
      <p className={clsx("text-xl font-black", highlight ? "text-success" : "text-fg")}>{value}</p>
    </div>
  );
}
