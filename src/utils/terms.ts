import type { AppSettings, AppUser } from "../types";

export const INITIAL_TERMS_OF_USE_VERSION = 1;
export const MAX_TERMS_OF_USE_LENGTH = 5000;

export const DEFAULT_TERMS_OF_USE_TEXT = [
  "Ao usar o PrivadIn, voce concorda com a coleta e o armazenamento dos dados necessarios para operar a competicao.",
  "Isso inclui registros de horario, timezone, localizacao no momento do registro e eventos de auditoria administrativa.",
  "Os termos podem mudar a qualquer momento. Quando houver alteracao relevante, sera necessario aceitar a nova versao para continuar usando o app.",
].join("\n\n");

export function normalizeTermsOfUseText(value: string) {
  return value.trim().slice(0, MAX_TERMS_OF_USE_LENGTH);
}

export function getCurrentTermsVersion(settings: Pick<AppSettings, "termsOfUseVersion">) {
  return Math.max(INITIAL_TERMS_OF_USE_VERSION, Number(settings.termsOfUseVersion ?? INITIAL_TERMS_OF_USE_VERSION));
}

export function getCurrentTermsText(settings: Pick<AppSettings, "termsOfUseText">) {
  const normalized = normalizeTermsOfUseText(String(settings.termsOfUseText ?? ""));
  return normalized || DEFAULT_TERMS_OF_USE_TEXT;
}

export function hasAcceptedCurrentTerms(
  user: Pick<AppUser, "termsAccepted" | "acceptedTermsVersion"> | null | undefined,
  settings: Pick<AppSettings, "termsOfUseVersion">,
) {
  if (!user) return false;

  const currentVersion = getCurrentTermsVersion(settings);
  const acceptedVersion = Number(user.acceptedTermsVersion ?? 0);

  if (acceptedVersion >= currentVersion) {
    return true;
  }

  return currentVersion === INITIAL_TERMS_OF_USE_VERSION && user.termsAccepted === true;
}
