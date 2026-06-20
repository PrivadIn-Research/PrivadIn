import {
  Timestamp,
  collection,
  doc,
  increment,
  runTransaction,
} from "@firebase/firestore";
import { db } from "./firebase";
import {
  betConfigDocRef,
  betStatsDocRef,
  houseWalletDocRef,
  parseBetConfig,
  resolveBetLimits,
} from "./betConfigService";
import type { AppUser, BetGameId, BetRound, BetSettlement } from "../types";

/**
 * MOTOR DE APOSTA — unico modulo autorizado a movimentar poopcoins da Bet.
 *
 * REGRAS INEGOCIAVEIS:
 *  - NUNCA chama appendPoopcoinTransaction() nem escreve em
 *    poopcoin_transactions / poopcoin_chain. Apostas sao 100% privadas.
 *  - Cada rodada e uma transferencia SOMA-ZERO entre o jogador e a banca
 *    (carteira-sistema), preservando o suprimento total de poopcoins.
 *  - O historico vai para user_private/{uid}/bet_rounds (so o dono le).
 *  - Metricas agregadas e ANONIMAS vao para privadin_bet/stats.
 */

interface SettleInput {
  user: Pick<AppUser, "uid">;
  gameId: BetGameId;
  wager: number;
  /** 0 = perdeu; >0 = ganhou (prêmio bruto = wager * multiplier). */
  multiplier: number;
  meta?: Record<string, unknown>;
}

export async function settleBetRound({
  user,
  gameId,
  wager,
  multiplier,
  meta,
}: SettleInput): Promise<BetSettlement> {
  const wagerInt = Math.trunc(Number(wager));
  if (!Number.isInteger(wagerInt) || wagerInt <= 0) {
    throw new Error("Aposta invalida.");
  }

  const userRef = doc(db, "users", user.uid);
  const roundRef = doc(collection(db, "user_private", user.uid, "bet_rounds"));

  return runTransaction(db, async (transaction) => {
    const [userSnapshot, houseSnapshot, configSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(houseWalletDocRef),
      transaction.get(betConfigDocRef),
    ]);

    const userData = userSnapshot.data() as AppUser | undefined;
    if (!userData) throw new Error("Usuario nao encontrado.");

    const houseData = houseSnapshot.data() as AppUser | undefined;
    if (!houseData) throw new Error("A banca da PrivadIn Bet nao esta disponivel.");

    const config = parseBetConfig(configSnapshot.data());
    if (!config.enabled) throw new Error("PrivadIn Bet indisponivel.");

    const game = config.games[gameId];
    if (!game || !game.enabled) throw new Error("Este jogo esta indisponivel.");

    const { minBet, maxBet } = resolveBetLimits(config, game);
    if (wagerInt < minBet || wagerInt > maxBet) {
      throw new Error("Aposta fora dos limites permitidos.");
    }

    const balance = Number(userData.poopcoinBalance ?? 0);
    if (balance < wagerInt) throw new Error("Saldo insuficiente para apostar.");

    const bankroll = Number(houseData.poopcoinBalance ?? 0);
    const safeMultiplier = Math.max(0, Number(multiplier) || 0);
    let payout = Math.floor(wagerInt * safeMultiplier);

    // Tetos de exposicao: nunca pagar mais que o limite por rodada, a fracao
    // maxima da banca, nem mais do que a banca possui.
    const exposureCap = Math.floor(bankroll * config.maxExposureFractionOfBankroll);
    const cap = Math.max(0, Math.min(config.maxPayoutPerRound, exposureCap, bankroll));
    let cappedByBankroll = false;
    if (payout > cap) {
      payout = cap;
      cappedByBankroll = true;
    }

    const net = payout - wagerInt; // soma-zero: usuario +net, banca -net
    const balanceAfter = balance + net;
    const effectiveMultiplier = payout > 0 ? payout / wagerInt : 0;

    transaction.update(userRef, { poopcoinBalance: increment(net) });
    transaction.update(houseWalletDocRef, { poopcoinBalance: increment(-net) });

    const round: Omit<BetRound, "id"> = {
      gameId,
      createdAt: Timestamp.now(),
      wager: wagerInt,
      multiplier: effectiveMultiplier,
      payout,
      net,
      balanceAfter,
      ...(meta ? { meta } : {}),
    };
    transaction.set(roundRef, round);

    transaction.set(
      betStatsDocRef,
      {
        totalWagered: increment(wagerInt),
        totalPaidOut: increment(payout),
        houseProfit: increment(wagerInt - payout),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    return { payout, net, balanceAfter, cappedByBankroll };
  });
}
