import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Coins, Copy, SendHorizontal } from "lucide-react";
import { AvatarImage } from "../components/AvatarImage";
import { Card } from "../components/Card";
import { formatDateTime } from "../utils/date";
import type { AppSettings, AppUser, PoopcoinSupplySummary, PoopcoinTransaction } from "../types";
import {
  formatPoopcoins,
  normalizePoopcoinAmount,
  transferPoopcoins,
} from "../services/poopcoinService";

function shortHash(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;
}

function transactionTypeLabel(type: PoopcoinTransaction["type"]) {
  const labels: Record<PoopcoinTransaction["type"], string> = {
    mint_log: "Registro validado",
    legacy_mint: "Migracao",
    transfer: "Transferencia",
    cuiter_spend: "Cuiter",
    admin_adjustment: "Ajuste admin",
    reversal: "Reversao",
  };
  return labels[type] ?? type;
}

function transactionSummary(transaction: PoopcoinTransaction, usersById: Map<string, AppUser>) {
  const from = transaction.fromUserId ? usersById.get(transaction.fromUserId) : null;
  const to = transaction.toUserId ? usersById.get(transaction.toUserId) : null;
  const fromName = from?.nickname?.trim() || from?.name || transaction.fromUserId;
  const toName = to?.nickname?.trim() || to?.name || transaction.toUserId;

  if (transaction.type === "transfer") {
    return `${fromName} enviou para ${toName}`;
  }

  if (transaction.type === "cuiter_spend") {
    return `${fromName} queimou ${formatPoopcoins(transaction.amount)} PC no Cuiter`;
  }

  if (transaction.type === "reversal") {
    return `Reversao de ${shortHash(transaction.reversesTransactionHash ?? "")}`;
  }

  if (transaction.type === "admin_adjustment") {
    const target = transaction.entries[0]?.userId;
    const targetName = target ? usersById.get(target)?.name ?? target : "usuario";
    return `${targetName}: ${transaction.reason ?? "ajuste manual"}`;
  }

  return toName ? `${toName} recebeu ${formatPoopcoins(transaction.amount)} PC` : "Movimentacao registrada";
}

function SupplyStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-fg-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-fg">{formatPoopcoins(value)}</p>
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function PoopcoinsPage({
  user,
  users,
  transactions,
  appSettings,
  supply,
}: {
  user: AppUser;
  users: AppUser[];
  transactions: PoopcoinTransaction[];
  appSettings: AppSettings;
  supply: PoopcoinSupplySummary;
}) {
  const [recipientUid, setRecipientUid] = useState("");
  const [amount, setAmount] = useState("1");
  const [sending, setSending] = useState(false);
  const usersById = useMemo(() => new Map(users.map((candidate) => [candidate.uid, candidate])), [users]);
  const balance = Number(user.poopcoinBalance ?? 0);
  const recipient = usersById.get(recipientUid.trim());
  const canTransfer = !sending;

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(user.uid);
      toast.success("ID copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o ID.");
    }
  }

  async function handleTransfer() {
    const trimmedRecipientUid = recipientUid.trim();
    if (!trimmedRecipientUid) {
      toast.error("ID do destinatário é obrigatório.");
      return;
    }
    if (trimmedRecipientUid === user.uid) {
      toast.error("Você não pode transferir Poopcoins para si mesmo.");
      return;
    }
    const targetRecipient = usersById.get(trimmedRecipientUid);
    if (!targetRecipient || targetRecipient.isActive === false) {
      toast.error("Nenhum participante ativo encontrado com este ID.");
      return;
    }
    let transferAmount = Number(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast.error("A quantidade deve ser um número maior que zero.");
      return;
    }
    if (!Number.isInteger(transferAmount)) {
      toast.error("A quantidade deve ser um número inteiro.");
      return;
    }
    transferAmount = normalizePoopcoinAmount(transferAmount);
    if (balance < transferAmount) {
      toast.error(`Saldo insuficiente. Você tem ${balance} Poopcoins.`);
      return;
    }

    setSending(true);
    try {
      await transferPoopcoins(user, trimmedRecipientUid, transferAmount);
      setRecipientUid("");
      setAmount("1");
      toast.success("Poopcoins transferidos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível transferir.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-accent text-accent-fg shadow-accent">
              <Coins size={30} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-accent-strong">Carteira Poopcoin</p>
              <h2 className="text-4xl font-black text-fg">{formatPoopcoins(balance)}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Cada registro validado gera {formatPoopcoins(appSettings.poopcoinsPerLog)} PC enquanto houver suprimento.
              </p>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-line/10 bg-field p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-fg-muted">Seu ID</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="block min-w-0 flex-1 truncate rounded-xl bg-panel px-3 py-2 text-sm text-fg-soft">
                {user.uid}
              </code>
              <button
                type="button"
                onClick={() => void copyUserId()}
                className="rounded-xl bg-accent p-2.5 text-accent-fg transition hover:bg-accent-strong"
                title="Copiar ID"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">Oferta limitada</p>
          <h2 className="text-2xl font-black text-fg">Suprimento PoopCoin</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Posts no Cuiter custam {formatPoopcoins(appSettings.cuiterPostCost)} PC e queimam as moedas gastas.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SupplyStat label="Total" value={supply.totalSupply} hint="Oferta fixa" />
          <SupplyStat label="Emitidas" value={supply.mintedSupply} hint="Reservadas nas carteiras" />
          <SupplyStat label="Queimadas" value={supply.burnedSupply} hint="Removidas de circulacao" />
          <SupplyStat
            label="Disponiveis"
            value={supply.availableSupply}
            hint={supply.supplyMigratedAt ? "Para novos registros" : "Recalculo pendente no Admin"}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">Transferencia</p>
          <h2 className="text-2xl font-black text-fg">Enviar Poopcoins</h2>
          <p className="mt-1 text-sm text-fg-muted">Use o ID copiado do perfil de outro participante ativo.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-end">
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-bold text-fg-soft">ID do destinatario</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              value={recipientUid}
              onChange={(event) => setRecipientUid(event.target.value)}
              placeholder="Cole o UID do usuario"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-fg-soft">Quantidade</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <button
            type="button"
            disabled={!canTransfer}
            onClick={() => void handleTransfer()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SendHorizontal size={18} />
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>

        {recipientUid.trim() && recipient ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <AvatarImage avatar={recipient.avatar} email={recipient.email} name={recipient.name} className="h-6 w-6" />
            <span>{recipient.nickname?.trim() || recipient.name}</span>
          </div>
        ) : recipientUid.trim() ? (
          <p className="mt-2 text-xs font-semibold text-warning">Nenhum participante ativo encontrado com este ID.</p>
        ) : null}
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">Blockchain publica</p>
          <h2 className="text-2xl font-black text-fg">Ledger de transacoes</h2>
          <p className="mt-1 text-sm text-fg-muted">Todas as movimentacoes ficam encadeadas por hash.</p>
        </div>

        <div className="space-y-3">
          {transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line/15 p-8 text-center text-fg-muted">
              Nenhuma transacao registrada ainda.
            </div>
          ) : (
            transactions.map((transaction) => (
              <article key={transaction.hash} className="rounded-2xl border border-line/10 bg-panel-strong/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-accent-soft/35 px-2 py-1 text-xs font-black text-accent-strong">
                        #{transaction.sequence}
                      </span>
                      <span className="rounded-full bg-panel px-2 py-1 text-xs font-black text-fg-soft">
                        {transactionTypeLabel(transaction.type)}
                      </span>
                      {transaction.status === "reversed" ? (
                        <span className="rounded-full bg-danger-soft/45 px-2 py-1 text-xs font-black text-danger">
                          Revertida
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-black text-fg">{transactionSummary(transaction, usersById)}</p>
                    <p className="mt-1 font-mono text-xs text-fg-muted" title={transaction.hash}>
                      {shortHash(transaction.hash)}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-lg font-black text-accent-strong">
                      {formatPoopcoins(transaction.amount)} PC
                    </p>
                    <p className="text-xs text-fg-muted">{formatDateTime(transaction.createdAt)}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
