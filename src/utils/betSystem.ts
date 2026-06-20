import type { AppUser } from "../types";

/**
 * UID fixo da carteira-sistema da banca da PrivadIn Bet.
 * NAO usar duplo underscore no inicio E fim ("__x__"): o Firestore reserva
 * IDs que casam com /__.*__/ e rejeita a criacao do documento.
 */
export const HOUSE_UID = "privadin_bet_house";

/**
 * Carteiras-sistema (ex.: a banca) devem ficar escondidas em TODO lugar do app:
 * ranking, listas de usuarios, destinatarios de transferencia, busca de perfil,
 * lista do Admin e estatisticas.
 */
export function isSystemUser(user: Pick<AppUser, "uid" | "isSystem"> | null | undefined) {
  if (!user) return false;
  return user.uid === HOUSE_UID || user.isSystem === true;
}

/** Filtra carteiras-sistema de uma lista de usuarios. */
export function withoutSystemUsers<T extends Pick<AppUser, "uid" | "isSystem">>(users: T[]) {
  return users.filter((user) => !isSystemUser(user));
}
