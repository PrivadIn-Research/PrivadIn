import { useRef, useState } from "react";
import confetti from "canvas-confetti";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import type { BetGameProps } from "../../../types";
import { resolveBetLimits } from "../../../services/betConfigService";
import { formatPoopcoins } from "../../../services/poopcoinService";
import { BetAmountControl, GameStat, useBetSound } from "../betUi";

export const meta = { id: "blackjack", defaultLabel: "Blackjack", defaultIcon: "🃏" };

interface Card {
  rank: string;
  value: number;
  suit: string;
}

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS: { rank: string; value: number }[] = [
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 10 },
  { rank: "Q", value: 10 },
  { rank: "K", value: 10 },
  { rank: "A", value: 11 },
];

function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const { rank, value } of RANKS) shoe.push({ rank, value, suit });
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function handValue(cards: Card[]) {
  let total = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards) === 21;

type Phase = "idle" | "player" | "done";

export default function Blackjack({ config, globalConfig, balance, muted, onSettle }: BetGameProps) {
  const { minBet, maxBet } = resolveBetLimits(globalConfig, config);
  const sound = useBetSound(muted);
  const decks = Math.max(1, Math.min(8, Math.trunc(config.extra?.decks ?? 6)));
  const blackjackPays = Math.max(1, config.extra?.blackjackPays ?? 1.5);

  const [bet, setBet] = useState(() => Math.max(minBet, Math.min(maxBet, config.minBet)));
  const [phase, setPhase] = useState<Phase>("idle");
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [hideHole, setHideHole] = useState(true);
  const [message, setMessage] = useState("Faça sua aposta e distribua as cartas.");
  const [lastWin, setLastWin] = useState(0);
  const shoeRef = useRef<Card[]>([]);
  const settledRef = useRef(false);

  const draw = () => {
    if (shoeRef.current.length < 15) shoeRef.current = buildShoe(decks);
    return shoeRef.current.pop() as Card;
  };

  const settle = async (multiplier: number, label: string, meta: Record<string, unknown>) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setPhase("done");
    setHideHole(false);
    try {
      const result = await onSettle({ wager: bet, multiplier, meta });
      setLastWin(result.payout);
      if (result.net > 0) {
        setMessage(`${label} +${formatPoopcoins(result.payout)} poopcoins!`);
        sound.win(multiplier >= 2.5);
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      } else if (result.net === 0) {
        setMessage(`${label} Aposta devolvida.`);
      } else {
        setMessage(label);
        sound.lose();
      }
      if (result.cappedByBankroll) toast("Prêmio limitado pela banca.", { icon: "🏦" });
    } catch (error) {
      settledRef.current = false;
      setPhase("player");
      toast.error(error instanceof Error ? error.message : "Erro ao apostar.");
    }
  };

  const resolveDealer = async (playerCards: Card[]) => {
    const dealerCards = [...dealer];
    while (handValue(dealerCards) < 17) dealerCards.push(draw());
    setDealer(dealerCards);
    setHideHole(false);

    const playerTotal = handValue(playerCards);
    const dealerTotal = handValue(dealerCards);
    const meta = { playerTotal, dealerTotal };

    if (dealerTotal > 21 || playerTotal > dealerTotal) {
      await settle(2, "Você venceu!", meta);
    } else if (playerTotal === dealerTotal) {
      await settle(1, "Empate.", meta);
    } else {
      await settle(0, "A banca venceu.", meta);
    }
  };

  const deal = () => {
    if (phase === "player" || bet > balance || bet < minBet) return;
    if (shoeRef.current.length < 15) shoeRef.current = buildShoe(decks);
    settledRef.current = false;
    setLastWin(0);
    setHideHole(true);
    sound.click();

    const playerCards = [draw(), draw()];
    const dealerCards = [draw(), draw()];
    setPlayer(playerCards);
    setDealer(dealerCards);

    const playerBJ = isBlackjack(playerCards);
    const dealerBJ = isBlackjack(dealerCards);
    if (playerBJ || dealerBJ) {
      if (playerBJ && dealerBJ) {
        void settle(1, "Ambos blackjack — empate.", { playerTotal: 21, dealerTotal: 21 });
      } else if (playerBJ) {
        void settle(1 + blackjackPays, "BLACKJACK! 🃏", { playerTotal: 21, blackjack: true });
      } else {
        void settle(0, "Banca tem blackjack.", { dealerTotal: 21 });
      }
      return;
    }
    setPhase("player");
    setMessage("Pedir carta ou parar?");
  };

  const hit = () => {
    if (phase !== "player") return;
    const next = [...player, draw()];
    setPlayer(next);
    sound.tick();
    if (handValue(next) > 21) {
      void settle(0, "Estourou! Você perdeu.", { playerTotal: handValue(next), busted: true });
    }
  };

  const stand = () => {
    if (phase !== "player") return;
    void resolveDealer(player);
  };

  const renderCard = (card: Card, index: number, hidden = false) => (
    <div
      key={index}
      className={clsx(
        "grid h-20 w-14 place-items-center rounded-lg border text-xl font-black shadow",
        hidden
          ? "border-line/20 bg-accent/30 text-transparent"
          : card.suit === "♥" || card.suit === "♦"
            ? "border-line/10 bg-white text-red-600"
            : "border-line/10 bg-white text-slate-900",
      )}
    >
      {hidden ? "🂠" : `${card.rank}${card.suit}`}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
      <div className="w-full rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-[#0c2417] to-[#06160e] p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/80">
          Banca {hideHole ? "" : `(${handValue(dealer)})`}
        </p>
        <div className="flex min-h-20 gap-2">
          {dealer.map((card, index) => renderCard(card, index, hideHole && index === 1))}
        </div>
        <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/80">
          Você {player.length ? `(${handValue(player)})` : ""}
        </p>
        <div className="flex min-h-20 gap-2">{player.map((card, index) => renderCard(card, index))}</div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <GameStat label="Saldo" value={formatPoopcoins(balance)} />
        <GameStat label="Ganho" value={formatPoopcoins(lastWin)} highlight={lastWin > 0} />
      </div>

      <p className="min-h-5 text-center text-sm font-semibold text-amber-200">{message}</p>

      <BetAmountControl value={bet} onChange={setBet} min={minBet} max={maxBet} balance={balance} disabled={phase === "player"} />

      {phase === "player" ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={hit}
            className="h-14 w-32 rounded-2xl bg-accent text-base font-black text-accent-fg shadow-accent transition active:translate-y-1"
          >
            PEDIR
          </button>
          <button
            type="button"
            onClick={stand}
            className="h-14 w-32 rounded-2xl bg-success text-base font-black text-white shadow-accent transition active:translate-y-1"
          >
            PARAR
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={deal}
          disabled={bet > balance || bet < minBet}
          className="h-16 w-56 rounded-2xl bg-gradient-to-b from-[#ff5a47] to-[#9c2015] text-lg font-black text-white shadow-accent transition active:translate-y-1 disabled:opacity-50"
        >
          DISTRIBUIR
        </button>
      )}
    </div>
  );
}
