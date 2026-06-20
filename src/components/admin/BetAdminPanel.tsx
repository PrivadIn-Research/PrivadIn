import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { AppUser, BetGameConfig } from "../../types";
import { useBetConfig, useBetStats, useHouseWallet } from "../../hooks/useFirestoreData";
import {
  ensureHouseWallet,
  setBankroll,
  setGameEnabled,
  topUpBankroll,
  updateBetConfig,
  updateGameConfig,
} from "../../services/betConfigService";
import { formatPoopcoins } from "../../services/poopcoinService";

const fieldClass =
  "w-full rounded-xl border border-line/10 bg-field px-3 py-2 text-fg outline-none";
const labelClass = "text-[11px] font-bold uppercase tracking-wide text-fg-muted";
const buttonClass =
  "rounded-xl border border-line/10 bg-panel px-4 py-2 font-black text-fg transition hover:bg-panel-strong disabled:opacity-60";

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      aria-pressed={checked}
      className={clsx(
        "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50",
        checked ? "bg-success" : "bg-panel-strong",
      )}
    >
      <span
        className={clsx(
          "absolute top-1 h-5 w-5 rounded-full bg-white transition",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
  );
}

function GameRow({ admin, game }: { admin: AppUser; game: BetGameConfig }) {
  const [draft, setDraft] = useState(game);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(game), [game]);

  const setField = (key: keyof BetGameConfig, value: number) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setExtra = (key: string, value: number) =>
    setDraft((current) => ({ ...current, extra: { ...(current.extra ?? {}), [key]: value } }));

  const save = async () => {
    setBusy(true);
    try {
      await updateGameConfig(admin, game.id, {
        rtp: draft.rtp,
        minPayoutMultiplier: draft.minPayoutMultiplier,
        maxPayoutMultiplier: draft.maxPayoutMultiplier,
        minBet: draft.minBet,
        maxBet: draft.maxBet,
        extra: draft.extra,
      });
      toast.success("Jogo atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar jogo.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      await setGameEnabled(admin, game.id, !game.enabled);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line/10 bg-panel-strong/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-base font-black text-fg">
          {game.icon} {game.label}
        </span>
        <Toggle checked={game.enabled} onChange={() => void toggle()} disabled={busy} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className={labelClass}>RTP ({(draft.rtp * 100).toFixed(0)}%)</span>
          <input
            type="number"
            step="0.01"
            value={draft.rtp}
            onChange={(e) => setField("rtp", Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Pagamento mín. (x)</span>
          <input
            type="number"
            step="0.1"
            value={draft.minPayoutMultiplier}
            onChange={(e) => setField("minPayoutMultiplier", Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Pagamento máx. (x)</span>
          <input
            type="number"
            step="0.1"
            value={draft.maxPayoutMultiplier}
            onChange={(e) => setField("maxPayoutMultiplier", Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Aposta mínima</span>
          <input
            type="number"
            value={draft.minBet}
            onChange={(e) => setField("minBet", Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Aposta máxima</span>
          <input
            type="number"
            value={draft.maxBet}
            onChange={(e) => setField("maxBet", Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        {Object.entries(draft.extra ?? {}).map(([key, value]) => (
          <label key={key} className="grid gap-1">
            <span className={labelClass}>{key}</span>
            <input
              type="number"
              value={value}
              onChange={(e) => setExtra(key, Number(e.target.value))}
              className={fieldClass}
            />
          </label>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={() => void save()} className={clsx(buttonClass, "mt-3")}>
        Salvar {game.label}
      </button>
    </div>
  );
}

export function BetAdminPanel({ admin }: { admin: AppUser }) {
  const { config } = useBetConfig(true);
  const { balance, exists } = useHouseWallet(true);
  const stats = useBetStats(true);
  const [busy, setBusy] = useState(false);

  const [limits, setLimits] = useState({
    globalMinBet: config.globalMinBet,
    globalMaxBet: config.globalMaxBet,
    maxPayoutPerRound: config.maxPayoutPerRound,
    maxExposureFractionOfBankroll: config.maxExposureFractionOfBankroll,
  });
  const [bankrollAbs, setBankrollAbs] = useState("");
  const [bankrollDelta, setBankrollDelta] = useState("");

  useEffect(() => {
    setLimits({
      globalMinBet: config.globalMinBet,
      globalMaxBet: config.globalMaxBet,
      maxPayoutPerRound: config.maxPayoutPerRound,
      maxExposureFractionOfBankroll: config.maxExposureFractionOfBankroll,
    });
  }, [config.globalMinBet, config.globalMaxBet, config.maxPayoutPerRound, config.maxExposureFractionOfBankroll]);

  const run = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const games = Object.values(config.games).sort((a, b) => a.order - b.order);

  return (
    <details className="group overflow-hidden rounded-3xl border border-line/10 bg-panel-strong/40">
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-panel-subtle sm:px-6 sm:py-5">
        <div>
          <p className="text-sm font-bold text-accent-strong">Cassino interno</p>
          <h2 className="text-xl font-black text-fg sm:text-2xl">PrivadIn Bet</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Apostas em poopcoins, privadas e soma-zero contra a banca. Nunca tocam o ledger público.
          </p>
        </div>
        <ChevronDown className="h-5 w-5 text-fg transition duration-200 group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-line/10 px-5 py-4 sm:px-6 sm:py-5">
        {/* 1. Liga/desliga geral */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
          <div>
            <p className="font-black text-fg">PrivadIn Bet {config.enabled ? "ativa" : "desativada"}</p>
            <p className="text-sm text-fg-muted">Desligada, some do menu e a página fica indisponível.</p>
          </div>
          <Toggle
            checked={config.enabled}
            disabled={busy}
            onChange={() => void run(() => updateBetConfig(admin, { enabled: !config.enabled }), "Bet atualizada.")}
          />
        </div>

        {/* 2. Banca */}
        <div className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
          <p className="mb-2 font-black text-fg">Banca (carteira-sistema)</p>
          {exists ? (
            <p className="mb-3 text-2xl font-black text-accent-strong">
              {formatPoopcoins(balance ?? 0)} <span className="text-sm text-fg-muted">poopcoins</span>
            </p>
          ) : (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-danger">A carteira da banca ainda não existe.</p>
              <button
                type="button"
                disabled={busy}
                className={buttonClass}
                onClick={() => void run(() => ensureHouseWallet(admin, 50000), "Carteira da banca criada.")}
              >
                Criar carteira da banca
              </button>
            </div>
          )}
          {exists ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Definir banca (absoluto)"
                  value={bankrollAbs}
                  onChange={(e) => setBankrollAbs(e.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  disabled={busy || bankrollAbs === ""}
                  className={buttonClass}
                  onClick={() =>
                    void run(async () => {
                      await setBankroll(admin, Number(bankrollAbs));
                      setBankrollAbs("");
                    }, "Banca definida.")
                  }
                >
                  Definir
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Adicionar/retirar (delta)"
                  value={bankrollDelta}
                  onChange={(e) => setBankrollDelta(e.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  disabled={busy || bankrollDelta === ""}
                  className={buttonClass}
                  onClick={() =>
                    void run(async () => {
                      await topUpBankroll(admin, Number(bankrollDelta));
                      setBankrollDelta("");
                    }, "Banca ajustada.")
                  }
                >
                  Aplicar
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 3. Limites globais */}
        <div className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
          <p className="mb-3 font-black text-fg">Limites globais</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="grid gap-1">
              <span className={labelClass}>Aposta mín. global</span>
              <input
                type="number"
                value={limits.globalMinBet}
                onChange={(e) => setLimits((c) => ({ ...c, globalMinBet: Number(e.target.value) }))}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Aposta máx. global</span>
              <input
                type="number"
                value={limits.globalMaxBet}
                onChange={(e) => setLimits((c) => ({ ...c, globalMaxBet: Number(e.target.value) }))}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Prêmio máx./rodada</span>
              <input
                type="number"
                value={limits.maxPayoutPerRound}
                onChange={(e) => setLimits((c) => ({ ...c, maxPayoutPerRound: Number(e.target.value) }))}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1">
              <span className={labelClass}>Exposição máx. (0–1)</span>
              <input
                type="number"
                step="0.05"
                value={limits.maxExposureFractionOfBankroll}
                onChange={(e) =>
                  setLimits((c) => ({ ...c, maxExposureFractionOfBankroll: Number(e.target.value) }))
                }
                className={fieldClass}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className={clsx(buttonClass, "mt-3")}
            onClick={() => void run(() => updateBetConfig(admin, limits), "Limites salvos.")}
          >
            Salvar limites
          </button>
        </div>

        {/* 4. Por jogo */}
        <div className="grid gap-3">
          <p className="font-black text-fg">Jogos</p>
          {games.map((game) => (
            <GameRow key={game.id} admin={admin} game={game} />
          ))}
        </div>

        {/* 5. Métricas agregadas e anônimas */}
        <div className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
          <p className="mb-3 font-black text-fg">Métricas agregadas (anônimas)</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className={labelClass}>Total apostado</p>
              <p className="text-lg font-black text-fg">{formatPoopcoins(stats.totalWagered)}</p>
            </div>
            <div>
              <p className={labelClass}>Total pago</p>
              <p className="text-lg font-black text-fg">{formatPoopcoins(stats.totalPaidOut)}</p>
            </div>
            <div>
              <p className={labelClass}>Lucro da casa</p>
              <p className={clsx("text-lg font-black", stats.houseProfit >= 0 ? "text-success" : "text-danger")}>
                {formatPoopcoins(stats.houseProfit)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
