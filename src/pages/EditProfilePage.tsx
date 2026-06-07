import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Card } from "../components/Card";
import { useAuth } from "../contexts/AuthContext";
import type { AppUser } from "../types";
import { avatarFor, canLoadDicebearUrl, isValidDicebearUrl } from "../utils/ranking";
import { NAME_MAX_LENGTH, NICKNAME_MAX_LENGTH, normalizeProfileIdentity, validateProfileIdentity } from "../utils/profileIdentity";
import { updateUserOperationalProfile, updateUserProfile } from "../services/userService";
import { checkForUpdates, getCurrentVersion, triggerPWAUpdate } from "../services/updateService";
import { getSalarySummary, saveEncryptedMonthlySalary } from "../services/secureFunctionsService";
import type { SalarySummary, WorkSchedule } from "../types";

type AvatarStatus = "idle" | "checking" | "valid" | "invalid";
type UpdateCheckStatus = "idle" | "checking" | "available" | "unavailable" | "error";

export function EditProfilePage({ user }: { user: AppUser }) {
  const { t } = useTranslation("profile");
  const { refreshProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [avatar, setAvatar] = useState(user.avatar ?? avatarFor(user.name, user.email));
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>(
    isValidDicebearUrl(user.avatar ?? "") ? "valid" : "idle",
  );
  const [busy, setBusy] = useState(false);
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [salaryBusy, setSalaryBusy] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<UpdateCheckStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>({
    horarioInicioExpediente: user.workSchedule?.horarioInicioExpediente ?? "09:00",
    horarioFimExpediente: user.workSchedule?.horarioFimExpediente ?? "18:00",
    horarioInicioAlmoco: user.workSchedule?.horarioInicioAlmoco ?? "12:00",
    horarioFimAlmoco: user.workSchedule?.horarioFimAlmoco ?? "13:00",
    timezone: user.workSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [termsAccepted, setTermsAccepted] = useState(user.termsAccepted === true);
  const [bathroomDurationMinutes, setBathroomDurationMinutes] = useState(user.bathroomDurationMinutes ?? 10);
  const [monthlySalary, setMonthlySalary] = useState("");
  const [salarySummary, setSalarySummary] = useState<SalarySummary | null>(null);

  const hasValidAvatar = isValidDicebearUrl(avatar);
  const nameError = validateProfileIdentity(name, { required: true, maxLength: NAME_MAX_LENGTH });
  const nicknameError = validateProfileIdentity(nickname, { maxLength: NICKNAME_MAX_LENGTH });
  const previewAvatar = avatarStatus === "valid" && hasValidAvatar
    ? avatar.trim()
    : user.avatar || avatarFor(user.name, user.email);
  const currentVersion = getCurrentVersion();

  useEffect(() => {
    setName(user.name);
    setNickname(user.nickname ?? "");
    setAvatar(user.avatar ?? avatarFor(user.name, user.email));
    setAvatarStatus(isValidDicebearUrl(user.avatar ?? "") ? "valid" : "idle");
    setWorkSchedule({
      horarioInicioExpediente: user.workSchedule?.horarioInicioExpediente ?? "09:00",
      horarioFimExpediente: user.workSchedule?.horarioFimExpediente ?? "18:00",
      horarioInicioAlmoco: user.workSchedule?.horarioInicioAlmoco ?? "12:00",
      horarioFimAlmoco: user.workSchedule?.horarioFimAlmoco ?? "13:00",
      timezone: user.workSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setTermsAccepted(user.termsAccepted === true);
    setBathroomDurationMinutes(user.bathroomDurationMinutes ?? 10);
  }, [user.uid, user.name, user.nickname, user.avatar, user.email]);

  useEffect(() => {
    void refreshSalarySummary();
  }, [user.uid]);

  // Auto-trigger PWA update after a short delay when update is available
  // Cleanup timeout if component unmounts before it fires
  useEffect(() => {
    if (updateCheckStatus === "available") {
      const timeout = setTimeout(() => {
        triggerPWAUpdate();
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [updateCheckStatus]);

  async function validateAvatar(showToast = false) {
    const candidate = avatar.trim();

    if (!isValidDicebearUrl(candidate)) {
      setAvatarStatus("invalid");
      if (showToast) {
        toast.error(t("avatarToastInvalid"));
      }
      return false;
    }

    setAvatarStatus("checking");
    const canLoad = await canLoadDicebearUrl(candidate);

    if (avatar.trim() !== candidate) {
      return false;
    }

    setAvatarStatus(canLoad ? "valid" : "invalid");

    if (!canLoad && showToast) {
      toast.error(t("avatarToastLoadError"));
    }

    return canLoad;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (nameError) {
      toast.error(
        nameError === "required"
          ? t("nameRequired")
          : nameError === "too_long"
            ? t("nameTooLong", { count: NAME_MAX_LENGTH })
            : t("identityInvalid"),
      );
      return;
    }

    if (nicknameError) {
      toast.error(
        nicknameError === "too_long"
          ? t("nicknameTooLong", { count: NICKNAME_MAX_LENGTH })
          : t("identityInvalid"),
      );
      return;
    }

    if (!(await validateAvatar(true))) {
      return;
    }

    setBusy(true);
    try {
      await updateUserProfile(user.uid, {
        name: normalizeProfileIdentity(name),
        nickname: normalizeProfileIdentity(nickname),
        avatar: avatar.trim(),
      });
      await refreshProfile();
      toast.success(t("updateSuccess"));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("updateError"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSalarySummary() {
    try {
      setSalarySummary(await getSalarySummary());
    } catch (error) {
      console.error(error);
    }
  }

  function formatCurrencyFromCents(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  }

  async function handleOperationalSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOperationalBusy(true);
    try {
      await updateUserOperationalProfile(user.uid, {
        workSchedule,
        termsAccepted,
        bathroomDurationMinutes,
      });
      await refreshProfile();
      toast.success("Preferencias operacionais salvas.");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel salvar as preferencias operacionais.");
    } finally {
      setOperationalBusy(false);
    }
  }

  async function handleSalarySubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = monthlySalary.replace(/\./g, "").replace(",", ".");
    const monthlySalaryCents = Math.round(Number(normalized) * 100);
    if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents < 0) {
      toast.error("Informe um salario mensal valido.");
      return;
    }

    setSalaryBusy(true);
    try {
      await saveEncryptedMonthlySalary(monthlySalaryCents);
      await refreshSalarySummary();
      setMonthlySalary("");
      toast.success("Salario salvo criptografado.");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel salvar o salario criptografado.");
    } finally {
      setSalaryBusy(false);
    }
  }

  async function handleCheckUpdates() {
    setUpdateCheckStatus("checking");
    setLatestVersion(null);

    try {
      const result = await checkForUpdates();

      if (result.error) {
        setUpdateCheckStatus("error");
        toast.error(t("updateCheckError"));
        return;
      }

      if (result.hasUpdate && result.latestVersion) {
        setLatestVersion(result.latestVersion);
        setUpdateCheckStatus("available");
        toast.success(t("updateAvailable", { newVersion: result.latestVersion }));
      } else {
        setUpdateCheckStatus("unavailable");
        toast.success(t("updateNotAvailable"));
      }
    } catch (e) {
      console.error(e);
      setUpdateCheckStatus("error");
      toast.error(t("updateCheckError"));
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">{t("eyebrow")}</p>
          <h2 className="text-2xl font-black text-fg">{t("title")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("description")}</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("name")}</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              required
            />
            {nameError ? (
              <p className="mt-2 text-xs font-semibold text-danger">
                {nameError === "required"
                  ? t("nameRequired")
                  : nameError === "too_long"
                    ? t("nameTooLong", { count: NAME_MAX_LENGTH })
                    : t("identityInvalid")}
              </p>
            ) : (
              <p className="mt-2 text-xs text-fg-muted">{t("charsCount", { count: name.length, max: NAME_MAX_LENGTH })}</p>
            )}
          </label>

          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("nickname")}</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none placeholder:text-fg-muted"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nicknamePlaceholder")}
              maxLength={NICKNAME_MAX_LENGTH}
            />
            <p className={nicknameError ? "mt-2 text-xs font-semibold text-danger" : "mt-2 text-xs text-fg-muted"}>
              {nicknameError === "too_long"
                ? t("nicknameTooLong", { count: NICKNAME_MAX_LENGTH })
                : nicknameError === "invalid_chars"
                  ? t("identityInvalid")
                  : t("charsCount", { count: nickname.length, max: NICKNAME_MAX_LENGTH })}
            </p>
          </label>

          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("avatarLabel")}</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              type="url"
              value={avatar}
              onChange={(e) => {
                const nextValue = e.target.value;
                setAvatar(nextValue);
                setAvatarStatus(
                  isValidDicebearUrl(nextValue)
                    ? nextValue.trim() === (user.avatar ?? "").trim()
                      ? "valid"
                      : "idle"
                    : "invalid",
                );
              }}
              onBlur={() => {
                if (isValidDicebearUrl(avatar)) {
                  void validateAvatar();
                }
              }}
              placeholder="https://api.dicebear.com/9.x/croodles/svg?seed=Liliana"
              required
            />
            <p className="mt-2 text-xs text-fg-muted">
              {t("avatarHint")}
              {" "}
              <a
                className="font-semibold text-accent-strong underline underline-offset-2"
                href="https://www.dicebear.com/playground/"
                target="_blank"
                rel="noreferrer"
              >
                https://www.dicebear.com/playground/
              </a>
              .
            </p>
            {!hasValidAvatar ? (
              <p className="mt-1 text-xs font-semibold text-danger">
                {t("avatarInvalid")}
              </p>
            ) : avatarStatus === "checking" ? (
              <p className="mt-1 text-xs font-semibold text-info">
                {t("avatarChecking")}
              </p>
            ) : avatarStatus === "valid" ? (
              <p className="mt-1 text-xs font-semibold text-success">
                {t("avatarValid")}
              </p>
            ) : avatarStatus === "invalid" ? (
              <p className="mt-1 text-xs font-semibold text-danger">
                {t("avatarLoadError")}
              </p>
            ) : null}
          </label>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <img src={previewAvatar} alt="avatar" className="h-16 w-16 rounded-full" />
            <div className="w-full flex-1">
              <p className="font-black text-fg">{t("avatarCurrent")}</p>
              <p className="text-sm text-fg-muted">{t("avatarCurrentHint")}</p>
            </div>
            <button
              disabled={busy || !hasValidAvatar || Boolean(nameError) || Boolean(nicknameError)}
              className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
            >
              {t("save")}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">Expediente e privacidade</p>
          <h2 className="text-2xl font-black text-fg">Regras para registrar</h2>
          <p className="mt-1 text-sm text-fg-muted">
            O backend bloqueia registros fora do expediente, durante o almoço, sem termos aceitos ou sem localização.
          </p>
        </div>

        <form onSubmit={handleOperationalSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Início do expediente</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioInicioExpediente}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioInicioExpediente: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Fim do expediente</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioFimExpediente}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioFimExpediente: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Início do almoço</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioInicioAlmoco}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioInicioAlmoco: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Fim do almoço</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioFimAlmoco}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioFimAlmoco: event.target.value }))}
                required
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Timezone</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                value={workSchedule.timezone}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="America/Sao_Paulo"
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">Minutos médios no banheiro</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="number"
                min={1}
                max={180}
                value={bathroomDurationMinutes}
                onChange={(event) => setBathroomDurationMinutes(Number(event.target.value))}
                required
              />
            </label>
          </div>

          <label className="rounded-2xl border border-line/10 bg-field p-4">
            <span className="flex items-start gap-3">
              <input
                className="mt-1 h-5 w-5"
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                required
              />
              <span>
                <span className="block font-black text-fg">Aceito os Termos de Uso e Responsabilidade de Dados</span>
                <span className="mt-1 block text-sm text-fg-muted">
                  Estou ciente de que o PrivadIn coleta latitude e longitude no momento de cada registro,
                  usa horário local/timezone para validar expediente e salva esses dados para auditoria da competição.
                </span>
              </span>
            </span>
          </label>

          <button
            disabled={operationalBusy || !termsAccepted}
            className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
          >
            {operationalBusy ? "Salvando..." : "Salvar regras e termos"}
          </button>
        </form>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">Salário seguro</p>
          <h2 className="text-2xl font-black text-fg">Ganhos no banheiro</h2>
          <p className="mt-1 text-sm text-fg-muted">
            O salário é criptografado no backend com AES-256-GCM antes de ser salvo no Firestore.
          </p>
        </div>

        <form onSubmit={handleSalarySubmit} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">Salário mensal</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              inputMode="decimal"
              value={monthlySalary}
              onChange={(event) => setMonthlySalary(event.target.value)}
              placeholder="5000,00"
            />
          </label>
          <button
            disabled={salaryBusy}
            className="self-end rounded-2xl bg-panel-strong px-5 py-3 font-black text-fg hover:bg-panel-subtle disabled:opacity-60"
          >
            {salaryBusy ? "Criptografando..." : "Salvar salário"}
          </button>
        </form>

        {salarySummary ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line/10 bg-field p-4">
              <p className="text-xs font-bold text-fg-muted">Salário salvo</p>
              <p className="mt-1 text-xl font-black text-fg">{formatCurrencyFromCents(salarySummary.monthlySalaryCents)}</p>
            </div>
            <div className="rounded-2xl border border-line/10 bg-field p-4">
              <p className="text-xs font-bold text-fg-muted">Tempo registrado</p>
              <p className="mt-1 text-xl font-black text-fg">{salarySummary.totalBathroomMinutes} min</p>
            </div>
            <div className="rounded-2xl border border-line/10 bg-field p-4">
              <p className="text-xs font-bold text-fg-muted">Ganho estimado</p>
              <p className="mt-1 text-xl font-black text-accent-strong">{formatCurrencyFromCents(salarySummary.estimatedEarnedCents)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-fg-muted">{t("versionLabel")}</p>
            <p className="text-lg font-black text-fg">
              {t("versionText", { version: currentVersion })}
            </p>
          </div>

          <button
            onClick={() => void handleCheckUpdates()}
            disabled={updateCheckStatus === "checking" || busy}
            className="w-full rounded-2xl bg-panel-strong px-5 py-3 font-black text-fg hover:bg-panel-subtle disabled:opacity-60 sm:w-auto"
          >
            {updateCheckStatus === "checking" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-fg border-t-transparent" />
                {t("checkUpdatesLoading")}
              </span>
            ) : (
              t("checkUpdatesButton")
            )}
          </button>

          {updateCheckStatus === "available" && latestVersion && (
            <div className="rounded-lg border border-success/35 bg-success-soft/45 p-3">
              <p className="text-sm font-semibold text-success">
                {t("updateAvailable", { newVersion: latestVersion })}
              </p>
            </div>
          )}

          {updateCheckStatus === "unavailable" && (
            <div className="rounded-lg border border-info/35 bg-info-soft/45 p-3">
              <p className="text-sm font-semibold text-info">
                {t("updateNotAvailable")}
              </p>
            </div>
          )}

          {updateCheckStatus === "error" && (
            <div className="rounded-lg border border-danger/35 bg-danger-soft/45 p-3">
              <p className="text-sm font-semibold text-danger">
                {t("updateCheckError")}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
