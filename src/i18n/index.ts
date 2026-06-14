import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { APP_LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE, getLanguageDirection, resolveInitialLanguage } from "./config";
import { resources } from "./resources";

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "common",
    ns: ["common", "shell", "login", "dashboard", "history", "stats", "profile", "cuiter", "admin", "auth", "services"],
    interpolation: {
      escapeValue: false,
    },
  });

i18n.addResources("pt-BR", "dashboard", {
  metric: {
    weeklyPoints: "Pontos da semana",
    weeklyPointsHint: "So voce ve sua pontuacao acumulada durante a semana",
  },
  resolveProfileAction: "Resolver no perfil",
});

i18n.addResources("pt-BR", "profile", {
  updatePreparing: "Atualizacao {{newVersion}} encontrada. Preparando a nova versao...",
});

i18n.addResources("pt-BR", "services", {
  poop: {
    missingTerms: "Aceite os termos e salve suas preferencias no perfil antes de registrar.",
    missingWorkSchedule: "Preencha seu horario de expediente no perfil antes de registrar.",
  },
});

i18n.addResources("en-US", "dashboard", {
  metric: {
    weeklyPoints: "Weekly points",
    weeklyPointsHint: "Only your running score stays visible during the week",
  },
  resolveProfileAction: "Open profile",
});

i18n.addResources("en-US", "profile", {
  updatePreparing: "Update {{newVersion}} found. Preparing the new version...",
});

i18n.addResources("en-US", "services", {
  poop: {
    missingTerms: "Accept the terms and save your profile preferences before logging a break.",
    missingWorkSchedule: "Fill in your work schedule in the profile before logging a break.",
  },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  document.documentElement.dir = getLanguageDirection(i18n.resolvedLanguage);
}

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = getLanguageDirection(language);
  }
});

export default i18n;
