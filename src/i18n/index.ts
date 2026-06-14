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
  applyUpdateButton: "Atualizar para {{version}}",
  applyUpdateLoading: "Aplicando atualizacao...",
  operationalSectionEyebrow: "Expediente",
  operationalSectionTitle: "Regras para registrar",
  operationalSectionDescription: "Ajuste seus horarios e sua duracao media para validar os registros corretamente.",
  workdayStart: "Inicio do expediente",
  workdayEnd: "Fim do expediente",
  lunchStart: "Inicio do almoco",
  lunchEnd: "Fim do almoco",
  timezoneLabel: "Timezone",
  bathroomDurationLabel: "Minutos medios no banheiro",
  operationalSave: "Salvar regras operacionais",
  operationalSaving: "Salvando...",
  operationalSaved: "Preferencias operacionais salvas.",
  operationalSaveError: "Nao foi possivel salvar as preferencias operacionais.",
  salarySectionEyebrow: "Salario local",
  salarySectionTitle: "Ganhos no banheiro",
  salarySectionDescription: "O salario fica salvo somente no localStorage deste navegador.",
  salaryInputLabel: "Salario mensal",
  salaryPlaceholder: "R$ 0,00",
  salarySave: "Salvar salario",
  salarySaved: "Salario salvo neste dispositivo.",
  salarySaveError: "Nao foi possivel salvar o salario neste dispositivo.",
  salaryInvalid: "Informe um salario mensal valido.",
  salarySavedLabel: "Salario salvo",
  currentCompetitionEarned: "Ganho nesta competicao",
  totalEarned: "Ganhos gerais",
  totalBathroomTime: "Tempo registrado",
  historyTitle: "Historico por competicao",
  historyDescription: "Ganhos e tempo acumulados em cada edicao.",
  historyEmpty: "Nenhum ganho calculado ainda.",
  competitionLabel: "Competicao {{edition}}",
  competitionStats: "{{count}} registros · {{minutes}} min",
});

i18n.addResources("pt-BR", "services", {
  poop: {
    missingTerms: "Aceite os termos atualizados para continuar registrando.",
    missingWorkSchedule: "Preencha seu horario de expediente no perfil antes de registrar.",
  },
});

i18n.addResources("pt-BR", "login", {
  termsTitle: "Termos de uso",
  termsDescription: "Antes de entrar com {{email}}, leia e aceite os termos da versao {{version}}. Eles podem mudar a qualquer momento.",
  termsVersionLabel: "Versao {{version}}",
  termsCheckboxLabel: "Li e aceito os termos de uso desta versao, ciente de que eles podem mudar a qualquer momento.",
  termsAcceptAction: "Aceitar e entrar",
  termsDeclineAction: "Sair",
  termsRequiredToast: "Seu acesso precisa do aceite dos termos da versao {{version}}.",
  termsCheckboxRequired: "Marque o aceite para continuar.",
  termsAcceptedToast: "Termos aceitos. Entrada liberada.",
  termsAcceptError: "Nao foi possivel registrar o aceite dos termos.",
});

i18n.addResources("pt-BR", "admin", {
  actions: {
    saveTerms: "Publicar termos",
  },
  toast: {
    termsSaved: "Termos publicados. Nova versao: {{version}}.",
  },
  termsTitle: "Termos de uso",
  termsDescription: "Ao publicar, a versao sobe e quem entrar de novo precisara aceitar o texto atual. Versao atual: {{version}}.",
  termsPlaceholder: "Escreva os termos de uso exibidos no login...",
  termsCounter: "{{count}}/{{max}} caracteres",
  auditMessages: {
    updateTermsOfUse: "{{admin}} publicou uma nova versao dos termos de uso.",
  },
  actionLabels: {
    update_terms_of_use: "Termos publicados",
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
  applyUpdateButton: "Update to {{version}}",
  applyUpdateLoading: "Applying update...",
  operationalSectionEyebrow: "Schedule",
  operationalSectionTitle: "Logging rules",
  operationalSectionDescription: "Adjust your work hours and average duration so logging can be validated correctly.",
  workdayStart: "Workday start",
  workdayEnd: "Workday end",
  lunchStart: "Lunch start",
  lunchEnd: "Lunch end",
  timezoneLabel: "Timezone",
  bathroomDurationLabel: "Average bathroom minutes",
  operationalSave: "Save logging rules",
  operationalSaving: "Saving...",
  operationalSaved: "Operational preferences saved.",
  operationalSaveError: "Could not save operational preferences.",
  salarySectionEyebrow: "Local salary",
  salarySectionTitle: "Bathroom earnings",
  salarySectionDescription: "Salary stays only in this browser localStorage.",
  salaryInputLabel: "Monthly salary",
  salaryPlaceholder: "R$ 0.00",
  salarySave: "Save salary",
  salarySaved: "Salary saved on this device.",
  salarySaveError: "Could not save salary on this device.",
  salaryInvalid: "Enter a valid monthly salary.",
  salarySavedLabel: "Saved salary",
  currentCompetitionEarned: "Current competition earnings",
  totalEarned: "Total earnings",
  totalBathroomTime: "Logged time",
  historyTitle: "Competition history",
  historyDescription: "Accumulated earnings and time for each edition.",
  historyEmpty: "No earnings calculated yet.",
  competitionLabel: "Competition {{edition}}",
  competitionStats: "{{count}} logs · {{minutes}} min",
});

i18n.addResources("en-US", "services", {
  poop: {
    missingTerms: "Accept the updated terms before logging a break.",
    missingWorkSchedule: "Fill in your work schedule in the profile before logging a break.",
  },
});

i18n.addResources("en-US", "login", {
  termsTitle: "Terms of use",
  termsDescription: "Before signing in with {{email}}, read and accept version {{version}} of the terms. They may change at any time.",
  termsVersionLabel: "Version {{version}}",
  termsCheckboxLabel: "I have read and accept this version of the terms of use, knowing they may change at any time.",
  termsAcceptAction: "Accept and continue",
  termsDeclineAction: "Sign out",
  termsRequiredToast: "You need to accept version {{version}} of the terms before entering.",
  termsCheckboxRequired: "Check the acceptance box to continue.",
  termsAcceptedToast: "Terms accepted. Access granted.",
  termsAcceptError: "Could not save the terms acceptance.",
});

i18n.addResources("en-US", "admin", {
  actions: {
    saveTerms: "Publish terms",
  },
  toast: {
    termsSaved: "Terms published. New version: {{version}}.",
  },
  termsTitle: "Terms of use",
  termsDescription: "Publishing increments the version and users will need to accept the current text again on the next sign-in. Current version: {{version}}.",
  termsPlaceholder: "Write the terms of use shown on the login page...",
  termsCounter: "{{count}}/{{max}} characters",
  auditMessages: {
    updateTermsOfUse: "{{admin}} published a new terms of use version.",
  },
  actionLabels: {
    update_terms_of_use: "Terms published",
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
