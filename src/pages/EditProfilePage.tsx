import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "@firebase/firestore";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AvatarCropper } from "../components/AvatarCropper";
import { AvatarImage } from "../components/AvatarImage";
import { Card } from "../components/Card";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import { competitionResetAuditLogsQuery } from "../services/poopService";
import { deleteAvatarFile, updateUserOperationalProfile, updateUserProfile, uploadAvatarFile } from "../services/userService";
import { checkForUpdates, getCurrentVersion, triggerPWAUpdate } from "../services/updateService";
import type { AdminAuditLog, AppSettings, AppUser, AppView, PoopLog, SalarySummary, WorkSchedule } from "../types";
import {
  AVATAR_ACCEPTED_TYPES,
  validateAvatarFile,
} from "../utils/avatarUpload";
import { buildSalarySummaryFromLogs } from "../utils/competitionHistory";
import { formatCurrencyFromCents, formatCurrencyInput, parseCurrencyInputToCents } from "../utils/currency";
import { NAME_MAX_LENGTH, NICKNAME_MAX_LENGTH, normalizeProfileIdentity, validateProfileIdentity } from "../utils/profileIdentity";
import { avatarFor, canLoadDicebearUrl, isValidDicebearUrl } from "../utils/ranking";
import { buildTimezoneOptions } from "../utils/timezones";
import { dailyWorkMinutes, resolveWorkSchedule } from "../utils/workSchedule";

type AvatarStatus = "idle" | "checking" | "valid" | "invalid";
type AvatarAction = "keep" | "manual" | "upload" | "default";
type UpdateCheckStatus = "idle" | "checking" | "available" | "applying" | "pending" | "unavailable" | "error";

const salaryStorageKey = (uid: string) => `privadin:monthlySalaryCents:${uid}`;

function getLocalMonthlySalaryCents(uid: string) {
  const rawValue = window.localStorage.getItem(salaryStorageKey(uid));
  const value = rawValue === null ? 0 : Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function saveLocalMonthlySalaryCents(uid: string, monthlySalaryCents: number) {
  window.localStorage.setItem(salaryStorageKey(uid), String(Math.round(monthlySalaryCents)));
}

export function EditProfilePage({ user, appSettings, setView }: { user: AppUser; appSettings: AppSettings; setView?: (view: AppView) => void }) {
  const { t } = useTranslation("profile");
  const { refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputId = `avatar-file-${user.uid}`;
  const [name, setName] = useState(user.name);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
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
  const [bathroomDurationMinutes, setBathroomDurationMinutes] = useState(user.bathroomDurationMinutes ?? 10);
  const [monthlySalary, setMonthlySalary] = useState("");
  const [salarySummary, setSalarySummary] = useState<SalarySummary | null>(null);
  const timezoneOptions = useMemo(() => buildTimezoneOptions(), []);

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
    setBio(user.bio ?? "");
    setManualAvatarUrl(isValidDicebearUrl(user.avatar ?? "") ? user.avatar : avatarFor(user.name, user.email));
    setAvatarStatus(isValidDicebearUrl(user.avatar ?? "") ? "valid" : "idle");
    setAvatarAction("keep");
    setPendingAvatarFile(null);
    setCropperImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setUploadedAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setWorkSchedule({
      horarioInicioExpediente: user.workSchedule?.horarioInicioExpediente ?? "09:00",
      horarioFimExpediente: user.workSchedule?.horarioFimExpediente ?? "18:00",
      horarioInicioAlmoco: user.workSchedule?.horarioInicioAlmoco ?? "12:00",
      horarioFimAlmoco: user.workSchedule?.horarioFimAlmoco ?? "13:00",
      timezone: user.workSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBathroomDurationMinutes(user.bathroomDurationMinutes ?? 10);
    setMonthlySalary(formatCurrencyFromCents(getLocalMonthlySalaryCents(user.uid)));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [user.avatar, user.email, user.name, user.nickname, user.uid, user.workSchedule, user.bathroomDurationMinutes, user.bio]);

  useEffect(() => {
    void refreshSalarySummary();
  }, [appSettings.edition, user.uid, user.bathroomDurationMinutes, user.workSchedule]);

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
      const updates: { name?: string; nickname?: string; avatar?: string; avatarStoragePath?: string | null; bio?: string } = {
        name: normalizeProfileIdentity(name),
        nickname: normalizeProfileIdentity(nickname),
        bio: bio.trim(),
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

      if (avatarAction !== "keep" && user.avatarStoragePath && user.avatarStoragePath !== updates.avatarStoragePath) {
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
      setAvatarStatus(isValidDicebearUrl(updates.avatar ?? user.avatar ?? "") ? "valid" : "idle");
      toast.success(t("updateSuccess"));
      if (setView) setView("profile");
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
      const durationFallback = Math.max(1, Math.min(180, Number(user.bathroomDurationMinutes ?? 10)));
      const [logsSnapshot, resetAuditSnapshot] = await Promise.all([
        getDocs(query(collection(db, "poop_logs"), where("userId", "==", user.uid))),
        getDocs(competitionResetAuditLogsQuery()),
      ]);
      const logs = logsSnapshot.docs.map((logDoc) => ({ id: logDoc.id, ...logDoc.data() }) as PoopLog);
      const resetAuditLogs = resetAuditSnapshot.docs.map((auditDoc) => ({ id: auditDoc.id, ...auditDoc.data() }) as AdminAuditLog);
      const monthlySalaryCents = getLocalMonthlySalaryCents(user.uid);
      const monthlyWorkMinutes = dailyWorkMinutes(resolveWorkSchedule(user.workSchedule)) * 22;

      setSalarySummary(
        buildSalarySummaryFromLogs(
          logs,
          monthlySalaryCents,
          monthlyWorkMinutes,
          durationFallback,
          appSettings,
          resetAuditLogs,
        ),
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function handleOperationalSubmit(event: FormEvent) {
    event.preventDefault();
    setOperationalBusy(true);
    try {
      await updateUserOperationalProfile(user.uid, {
        workSchedule,
        bathroomDurationMinutes,
      });
      await refreshProfile();
      toast.success(t("operationalSaved"));
    } catch (error) {
      console.error(error);
      toast.error(t("operationalSaveError"));
    } finally {
      setOperationalBusy(false);
    }
  }

  async function handleSalarySubmit(event: FormEvent) {
    event.preventDefault();
    const monthlySalaryCents = parseCurrencyInputToCents(monthlySalary);
    if (!Number.isFinite(monthlySalaryCents) || monthlySalaryCents < 0) {
      toast.error(t("salaryInvalid"));
      return;
    }

    setSalaryBusy(true);
    try {
      saveLocalMonthlySalaryCents(user.uid, monthlySalaryCents);
      await refreshSalarySummary();
      setMonthlySalary(formatCurrencyFromCents(monthlySalaryCents));
      toast.success(t("salarySaved"));
    } catch (error) {
      console.error(error);
      toast.error(t("salarySaveError"));
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

  async function handleApplyUpdate() {
    if (!latestVersion) return;

    setUpdateCheckStatus("applying");

    try {
      await triggerPWAUpdate();
      setUpdateCheckStatus("pending");
      toast.success(t("updatePreparing", { newVersion: latestVersion }));
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

          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("bio")}</span>
            <textarea
              className="w-full min-h-24 rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none placeholder:text-fg-muted resize-none focus:border-accent/35 focus:ring"
              value={bio}
              onChange={(event) => setBio(event.target.value.slice(0, 160))}
              placeholder={t("bioPlaceholder")}
              maxLength={160}
            />
            <p className="mt-2 text-xs text-fg-muted">
              {t("charsCount", { count: bio.length, max: 160 })}
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
                  <label
                    htmlFor={avatarFileInputId}
                    className="cursor-pointer rounded-2xl bg-accent px-4 py-3 text-sm font-black text-accent-fg transition hover:bg-accent-strong"
                  >
                    {user.avatarStoragePath || pendingAvatarFile ? t("avatarUploadReplaceAction") : t("avatarUploadAction")}
                  </label>
                  <button
                    type="button"
                    onClick={handleUseDefaultAvatar}
                    className="rounded-2xl border border-line/10 bg-panel px-4 py-3 text-sm font-black text-fg transition hover:bg-panel-strong"
                  >
                    {t("avatarResetAction")}
                  </button>
                </div>

                <input
                  id={avatarFileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_ACCEPTED_TYPES.join(",")}
                  className="sr-only"
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
            <div className="flex w-full gap-3 sm:w-auto">
              {setView ? (
                <button
                  type="button"
                  onClick={() => setView("profile")}
                  className="w-full rounded-2xl border border-line/10 bg-panel px-5 py-3 font-black text-fg hover:bg-panel-strong sm:w-auto"
                >
                  {t("common:actions.cancel")}
                </button>
              ) : null}
              <button
                disabled={isSaveDisabled}
                className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
              >
                {busy ? t("avatarSaving") : t("save")}
              </button>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">{t("operationalSectionEyebrow")}</p>
          <h2 className="text-2xl font-black text-fg">{t("operationalSectionTitle")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("operationalSectionDescription")}</p>
        </div>

        <form onSubmit={handleOperationalSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("workdayStart")}</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioInicioExpediente}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioInicioExpediente: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("workdayEnd")}</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioFimExpediente}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioFimExpediente: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("lunchStart")}</span>
              <input
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                type="time"
                value={workSchedule.horarioInicioAlmoco}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, horarioInicioAlmoco: event.target.value }))}
                required
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("lunchEnd")}</span>
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
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("timezoneLabel")}</span>
              <select
                className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
                value={workSchedule.timezone}
                onChange={(event) => setWorkSchedule((current) => ({ ...current, timezone: event.target.value }))}
                required
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-fg-soft">{t("bathroomDurationLabel")}</span>
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

          <button
            disabled={operationalBusy}
            className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
          >
            {operationalBusy ? t("operationalSaving") : t("operationalSave")}
          </button>
        </form>
      </Card>

      <Card>
        <div className="mb-4">
          <p className="text-sm font-bold text-accent-strong">{t("salarySectionEyebrow")}</p>
          <h2 className="text-2xl font-black text-fg">{t("salarySectionTitle")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("salarySectionDescription")}</p>
        </div>

        <form onSubmit={handleSalarySubmit} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label>
            <span className="mb-2 block text-sm font-bold text-fg-soft">{t("salaryInputLabel")}</span>
            <input
              className="w-full rounded-2xl border border-line/10 bg-field px-4 py-3 text-fg outline-none"
              inputMode="numeric"
              value={monthlySalary}
              onChange={(event) => setMonthlySalary(formatCurrencyInput(event.target.value))}
              placeholder={t("salaryPlaceholder")}
            />
          </label>
          <button
            disabled={salaryBusy}
            className="self-end rounded-2xl bg-panel-strong px-5 py-3 font-black text-fg hover:bg-panel-subtle disabled:opacity-60"
          >
            {salaryBusy ? t("operationalSaving") : t("salarySave")}
          </button>
        </form>

        {salarySummary ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-line/10 bg-field p-4">
                <p className="text-xs font-bold text-fg-muted">{t("salarySavedLabel")}</p>
                <p className="mt-1 text-xl font-black text-fg">{formatCurrencyFromCents(salarySummary.monthlySalaryCents)}</p>
              </div>
              <div className="rounded-2xl border border-line/10 bg-field p-4">
                <p className="text-xs font-bold text-fg-muted">{t("currentCompetitionEarned")}</p>
                <p className="mt-1 text-xl font-black text-accent-strong">{formatCurrencyFromCents(salarySummary.currentCompetitionEarnedCents)}</p>
              </div>
              <div className="rounded-2xl border border-line/10 bg-field p-4">
                <p className="text-xs font-bold text-fg-muted">{t("totalEarned")}</p>
                <p className="mt-1 text-xl font-black text-accent-strong">{formatCurrencyFromCents(salarySummary.totalEarnedCents)}</p>
              </div>
              <div className="rounded-2xl border border-line/10 bg-field p-4">
                <p className="text-xs font-bold text-fg-muted">{t("totalBathroomTime")}</p>
                <p className="mt-1 text-xl font-black text-fg">{salarySummary.totalBathroomMinutes} min</p>
              </div>
            </div>

            <div className="rounded-2xl border border-line/10 bg-field p-4">
              <div className="mb-3">
                <p className="text-xs font-bold text-fg-muted">{t("historyTitle")}</p>
                <p className="text-sm text-fg-muted">{t("historyDescription")}</p>
              </div>

              {salarySummary.competitionHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line/15 p-6 text-center text-fg-muted">
                  {t("historyEmpty")}
                </div>
              ) : (
                <div className="space-y-3">
                  {salarySummary.competitionHistory.map((entry) => (
                    <div key={entry.edition} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/10 bg-panel px-4 py-3">
                      <div>
                        <p className="font-black text-fg">{t("competitionLabel", { edition: entry.edition })}</p>
                        <p className="text-xs text-fg-muted">{entry.logsCount} registros · {entry.totalBathroomMinutes} min</p>
                      </div>
                      <p className="text-lg font-black text-accent-strong">{formatCurrencyFromCents(entry.earnedCents)}</p>
                    </div>
                  ))}
                </div>
              )}
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => void handleCheckUpdates()}
              disabled={updateCheckStatus === "checking" || updateCheckStatus === "applying" || busy}
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

            {latestVersion && (updateCheckStatus === "available" || updateCheckStatus === "applying") ? (
              <button
                onClick={() => void handleApplyUpdate()}
                disabled={updateCheckStatus === "applying" || busy}
                className="w-full rounded-2xl bg-accent px-5 py-3 font-black text-accent-fg hover:bg-accent-strong disabled:opacity-60 sm:w-auto"
              >
                {updateCheckStatus === "applying" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-fg border-t-transparent" />
                    {t("applyUpdateLoading")}
                  </span>
                ) : (
                  t("applyUpdateButton", { version: latestVersion })
                )}
              </button>
            ) : null}
          </div>

          {updateCheckStatus === "available" && latestVersion && (
            <div className="rounded-lg border border-success/35 bg-success-soft/45 p-3">
              <p className="text-sm font-semibold text-success">
                {t("updateAvailable", { newVersion: latestVersion })}
              </p>
            </div>
          )}

          {updateCheckStatus === "pending" && latestVersion && (
            <div className="rounded-lg border border-accent/35 bg-accent-soft/30 p-3">
              <p className="text-sm font-semibold text-accent-strong">
                {t("updatePreparing", { newVersion: latestVersion })}
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
