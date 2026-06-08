import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AvatarCropper } from "../components/AvatarCropper";
import { AvatarImage } from "../components/AvatarImage";
import { Card } from "../components/Card";
import { useAuth } from "../contexts/AuthContext";
import { getSalarySummary, saveEncryptedMonthlySalary } from "../services/secureFunctionsService";
import { deleteAvatarFile, updateUserOperationalProfile, updateUserProfile, uploadAvatarFile } from "../services/userService";
import { checkForUpdates, getCurrentVersion, triggerPWAUpdate } from "../services/updateService";
import type { AppUser, SalarySummary, WorkSchedule } from "../types";
import {
  AVATAR_ACCEPTED_TYPES,
  validateAvatarFile,
} from "../utils/avatarUpload";
import { NAME_MAX_LENGTH, NICKNAME_MAX_LENGTH, normalizeProfileIdentity, validateProfileIdentity } from "../utils/profileIdentity";
import { avatarFor, canLoadDicebearUrl, isValidDicebearUrl } from "../utils/ranking";

type AvatarStatus = "idle" | "checking" | "valid" | "invalid";
type AvatarAction = "keep" | "manual" | "upload" | "default";
type UpdateCheckStatus = "idle" | "checking" | "available" | "unavailable" | "error";

export function EditProfilePage({ user }: { user: AppUser }) {
  const { t } = useTranslation("profile");
  const { refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(user.name);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [manualAvatarUrl, setManualAvatarUrl] = useState(
    isValidDicebearUrl(user.avatar ?? "") ? user.avatar : avatarFor(user.name, user.email),
  );
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>(
    isValidDicebearUrl(user.avatar ?? "") ? "valid" : "idle",
  );
  const [avatarAction, setAvatarAction] = useState<AvatarAction>("keep");
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [cropperImageUrl, setCropperImageUrl] = useState<string | null>(null);
  const [uploadedAvatarPreviewUrl, setUploadedAvatarPreviewUrl] = useState<string | null>(null);
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

  const nameError = validateProfileIdentity(name, { required: true, maxLength: NAME_MAX_LENGTH });
  const nicknameError = validateProfileIdentity(nickname, { maxLength: NICKNAME_MAX_LENGTH });
  const currentVersion = getCurrentVersion();
  const generatedDefaultAvatar = useMemo(() => {
    const normalizedName = normalizeProfileIdentity(name);
    return avatarFor(normalizedName || user.name, user.email);
  }, [name, user.email, user.name]);
  const hasValidManualAvatar = isValidDicebearUrl(manualAvatarUrl);
  const previewAvatar = avatarAction === "upload" && uploadedAvatarPreviewUrl
    ? uploadedAvatarPreviewUrl
    : avatarAction === "manual" && hasValidManualAvatar
      ? manualAvatarUrl.trim()
      : avatarAction === "default"
        ? generatedDefaultAvatar
        : user.avatar || generatedDefaultAvatar;
  const isSaveDisabled =
    busy ||
    Boolean(nameError) ||
    Boolean(nicknameError) ||
    (avatarAction === "manual" && !hasValidManualAvatar) ||
    (avatarAction === "upload" && !pendingAvatarFile);

  useEffect(() => {
    setName(user.name);
    setNickname(user.nickname ?? "");
    setManualAvatarUrl(isValidDicebearUrl(user.avatar ?? "") ? user.avatar : avatarFor(user.name, user.email));
    setAvatarStatus(isValidDicebearUrl(user.avatar ?? "") ? "valid" : "idle");
    setAvatarAction("keep");
    setPendingAvatarFile(null);
    if (cropperImageUrl) {
      URL.revokeObjectURL(cropperImageUrl);
      setCropperImageUrl(null);
    }
    if (uploadedAvatarPreviewUrl) {
      URL.revokeObjectURL(uploadedAvatarPreviewUrl);
      setUploadedAvatarPreviewUrl(null);
    }
    setWorkSchedule({
      horarioInicioExpediente: user.workSchedule?.horarioInicioExpediente ?? "09:00",
      horarioFimExpediente: user.workSchedule?.horarioFimExpediente ?? "18:00",
      horarioInicioAlmoco: user.workSchedule?.horarioInicioAlmoco ?? "12:00",
      horarioFimAlmoco: user.workSchedule?.horarioFimAlmoco ?? "13:00",
      timezone: user.workSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setTermsAccepted(user.termsAccepted === true);
    setBathroomDurationMinutes(user.bathroomDurationMinutes ?? 10);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [user.uid, user.name, user.nickname, user.avatar, user.email]);

  useEffect(() => {
    void refreshSalarySummary();
  }, [user.uid]);

  useEffect(() => {
    if (updateCheckStatus === "available") {
      const timeout = setTimeout(() => {
        triggerPWAUpdate();
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [updateCheckStatus]);

  useEffect(() => {
    return () => {
      if (cropperImageUrl) {
        URL.revokeObjectURL(cropperImageUrl);
      }
      if (uploadedAvatarPreviewUrl) {
        URL.revokeObjectURL(uploadedAvatarPreviewUrl);
      }
    };
  }, [cropperImageUrl, uploadedAvatarPreviewUrl]);

  function clearPendingUpload() {
    setPendingAvatarFile(null);
    if (uploadedAvatarPreviewUrl) {
      URL.revokeObjectURL(uploadedAvatarPreviewUrl);
      setUploadedAvatarPreviewUrl(null);
    }
  }

  function replaceCropperImageUrl(nextUrl: string | null) {
    if (cropperImageUrl && cropperImageUrl !== nextUrl) {
      URL.revokeObjectURL(cropperImageUrl);
    }
    setCropperImageUrl(nextUrl);
  }

  async function validateManualAvatar(showToast = false, candidateUrl?: string) {
    const candidate = (candidateUrl ?? manualAvatarUrl).trim();

    if (!isValidDicebearUrl(candidate)) {
      setAvatarStatus("invalid");
      if (showToast) {
        toast.error(t("avatarToastInvalid"));
      }
      return false;
    }

    setAvatarStatus("checking");
    const canLoad = await canLoadDicebearUrl(candidate);

    if ((candidateUrl ?? manualAvatarUrl).trim() !== candidate) {
      return false;
    }

    setAvatarStatus(canLoad ? "valid" : "invalid");

    if (!canLoad && showToast) {
      toast.error(t("avatarToastLoadError"));
    }

    return canLoad;
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError === "invalid_type") {
      toast.error(t("avatarFileTypeError"));
      event.target.value = "";
      return;
    }

    if (validationError === "too_large") {
      toast.error(t("avatarFileSizeError"));
      event.target.value = "";
      return;
    }

    clearPendingUpload();
    const nextUrl = URL.createObjectURL(file);
    replaceCropperImageUrl(nextUrl);
  }

  async function handleApplyAvatarCrop(file: File) {
    try {
      const previewUrl = URL.createObjectURL(file);
      if (uploadedAvatarPreviewUrl) {
        URL.revokeObjectURL(uploadedAvatarPreviewUrl);
      }
      setPendingAvatarFile(file);
      setUploadedAvatarPreviewUrl(previewUrl);
      setAvatarAction("upload");
      replaceCropperImageUrl(null);
      toast.success(t("avatarUploadReadyToast"));
    } catch (error) {
      console.error(error);
      toast.error(t("avatarCropError"));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleUseDefaultAvatar() {
    clearPendingUpload();
    replaceCropperImageUrl(null);
    setManualAvatarUrl(generatedDefaultAvatar);
    setAvatarStatus("valid");
    setAvatarAction("default");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent) {
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

    setBusy(true);

    let uploadedStoragePath: string | null = null;

    try {
      const updates: { name?: string; nickname?: string; avatar?: string; avatarStoragePath?: string | null } = {
        name: normalizeProfileIdentity(name),
        nickname: normalizeProfileIdentity(nickname),
      };

      if (avatarAction === "manual") {
        const isValid = await validateManualAvatar(true);
        if (!isValid) {
          setBusy(false);
          return;
        }
        updates.avatar = manualAvatarUrl.trim();
        updates.avatarStoragePath = null;
      }

      if (avatarAction === "default") {
        updates.avatar = generatedDefaultAvatar;
        updates.avatarStoragePath = null;
      }

      if (avatarAction === "upload") {
        if (!pendingAvatarFile) {
          toast.error(t("avatarCropMissing"));
          setBusy(false);
          return;
        }

        const uploadResult = await uploadAvatarFile(user.uid, pendingAvatarFile);
        uploadedStoragePath = uploadResult.path;
        updates.avatar = uploadResult.url;
        updates.avatarStoragePath = uploadResult.path;
      }

      await updateUserProfile(user.uid, updates);

      if (user.avatarStoragePath && user.avatarStoragePath !== updates.avatarStoragePath) {
        try {
          await deleteAvatarFile(user.avatarStoragePath);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }

      await refreshProfile();
      clearPendingUpload();
      replaceCropperImageUrl(null);
      setAvatarAction("keep");
      setAvatarStatus(updates.avatar && isValidDicebearUrl(updates.avatar) ? "valid" : "idle");
      toast.success(t("updateSuccess"));
    } catch (error) {
      if (uploadedStoragePath) {
        try {
          await deleteAvatarFile(uploadedStoragePath);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
      console.error(error);
      toast.error(error instanceof Error ? error.message : t("updateError"));
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

  async function handleOperationalSubmit(event: FormEvent) {
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

  async function handleSalarySubmit(event: FormEvent) {
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
    } catch (error) {
      console.error(error);
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

        <form onSubmit={handleSubmit} className="grid gap-5">
          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("name")}</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              onChange={(event) => setNickname(event.target.value)}
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

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-line/10 bg-panel-strong/40 p-4 sm:p-5">
                <div className="mb-4">
                  <p className="text-sm font-bold text-accent-strong">{t("avatarUploadLabel")}</p>
                  <p className="mt-1 text-sm text-fg-muted">{t("avatarUploadHint")}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl bg-accent px-4 py-3 text-sm font-black text-accent-fg transition hover:bg-accent-strong"
                  >
                    {user.avatarStoragePath || pendingAvatarFile ? t("avatarUploadReplaceAction") : t("avatarUploadAction")}
                  </button>
                  <button
                    type="button"
                    onClick={handleUseDefaultAvatar}
                    className="rounded-2xl border border-line/10 bg-panel px-4 py-3 text-sm font-black text-fg transition hover:bg-panel-strong"
                  >
                    {t("avatarResetAction")}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_ACCEPTED_TYPES.join(",")}
                  className="hidden"
                  onChange={(event) => void handleAvatarFileChange(event)}
                />

                <p className="mt-3 text-xs text-fg-muted">{t("avatarUploadTypes")}</p>

                {avatarAction === "upload" && pendingAvatarFile ? (
                  <p className="mt-2 text-xs font-semibold text-success">{t("avatarUploadReady")}</p>
                ) : avatarAction === "default" ? (
                  <p className="mt-2 text-xs font-semibold text-info">{t("avatarDefaultReady")}</p>
                ) : null}
              </div>

              {cropperImageUrl ? (
                <AvatarCropper
                  imageUrl={cropperImageUrl}
                  onCancel={() => {
                    replaceCropperImageUrl(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  onApply={handleApplyAvatarCrop}
                />
              ) : null}

              <label className="block rounded-3xl border border-line/10 bg-panel-strong/40 p-4 sm:p-5">
                <span className="mb-2 block text-sm font-bold text-fg-soft">{t("avatarLabel")}</span>
                <input
                  className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                  type="url"
                  value={manualAvatarUrl}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    clearPendingUpload();
                    replaceCropperImageUrl(null);
                    setManualAvatarUrl(nextValue);
                    setAvatarAction("manual");
                    setAvatarStatus(isValidDicebearUrl(nextValue) ? "idle" : "invalid");
                  }}
                  onBlur={() => {
                    if (avatarAction === "manual" && isValidDicebearUrl(manualAvatarUrl)) {
                      void validateManualAvatar();
                    }
                  }}
                  placeholder="https://api.dicebear.com/9.x/croodles/svg?seed=Liliana"
                />
                <p className="mt-2 text-xs text-fg-muted">
                  {t("avatarHint")}{" "}
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
                {avatarAction === "manual" && !hasValidManualAvatar ? (
                  <p className="mt-1 text-xs font-semibold text-danger">{t("avatarInvalid")}</p>
                ) : avatarAction === "manual" && avatarStatus === "checking" ? (
                  <p className="mt-1 text-xs font-semibold text-info">{t("avatarChecking")}</p>
                ) : avatarAction === "manual" && avatarStatus === "valid" ? (
                  <p className="mt-1 text-xs font-semibold text-success">{t("avatarValid")}</p>
                ) : avatarAction === "manual" && avatarStatus === "invalid" ? (
                  <p className="mt-1 text-xs font-semibold text-danger">{t("avatarLoadError")}</p>
                ) : null}
              </label>
            </div>

            <div className="rounded-3xl border border-line/10 bg-panel-strong/40 p-4 sm:p-5">
              <p className="font-black text-fg">{t("avatarCurrent")}</p>
              <p className="mt-1 text-sm text-fg-muted">{t("avatarCurrentHint")}</p>
              <div className="mt-4 flex flex-col items-center gap-3 text-center">
                {avatarAction === "upload" && uploadedAvatarPreviewUrl ? (
                  <img src={uploadedAvatarPreviewUrl} alt="avatar" className="h-24 w-24 rounded-full object-cover" />
                ) : (
                  <AvatarImage avatar={previewAvatar} email={user.email} name={name || user.name} className="h-24 w-24" />
                )}
                <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-accent-strong">
                  {avatarAction === "upload"
                    ? t("avatarSourceUpload")
                    : avatarAction === "manual"
                      ? t("avatarSourceManual")
                      : avatarAction === "default"
                        ? t("avatarSourceDefault")
                        : t("avatarSourceCurrent")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="w-full flex-1">
              <p className="font-black text-fg">{t("avatarSaveTitle")}</p>
              <p className="text-sm text-fg-muted">{t("avatarSaveHint")}</p>
            </div>
            <button
              disabled={isSaveDisabled}
              className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
            >
              {busy ? t("avatarSaving") : t("save")}
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
              <select
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                value={workSchedule.timezone}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, timezone: event.target.value }))}
                required
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo (São Paulo)</option>
                <option value="America/Fortaleza">America/Fortaleza (Fortaleza)</option>
                <option value="America/Belem">America/Belem (Belém)</option>
                <option value="America/Recife">America/Recife (Recife)</option>
                <option value="America/Manaus">America/Manaus (Manaus)</option>
                <option value="America/Cuiaba">America/Cuiaba (Cuiabá)</option>
                <option value="America/Campo_Grande">America/Campo_Grande (Campo Grande)</option>
                <option value="America/Porto_Velho">America/Porto_Velho (Porto Velho)</option>
                <option value="America/Boa_Vista">America/Boa_Vista (Boa Vista)</option>
                <option value="America/Rio_Branco">America/Rio_Branco (Rio Branco)</option>
              </select>
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
