import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "@firebase/auth";
import { FirebaseError } from "@firebase/app";
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from "@firebase/firestore";
import i18n from "../i18n";
import { auth, db, isFirebaseConfigured } from "../services/firebase";
import type { AppSettings, AppUser, RegistrationRequest } from "../types";
import { avatarFor } from "../utils/ranking";
import {
  createRegistrationAttempt,
  getOrCreateRegistrationRequest,
  getRegistrationRequest,
  markRegistrationRequestUsed,
  normalizeEmail,
} from "../services/registrationService";
import { isUserNameTaken } from "../services/userService";
import { AuthLoginError, firebaseAuthErrorCode } from "../utils/authErrors";
import { acceptTermsOfUse } from "../services/userService";
import { appSettingsDocRef, parseAppSettings } from "../services/settingsService";
import { getCurrentTermsVersion, hasAcceptedCurrentTerms } from "../utils/terms";

type AuthResult =
  | { status: "signed_in" }
  | { status: "terms_required" }
  | { status: "access_code_required"; request: RegistrationRequest };

interface AuthContextValue {
  firebaseUser: User | null;
  user: AppUser | null;
  pendingTermsUser: AppUser | null;
  currentAppSettings: AppSettings | null;
  loading: boolean;
  login: (email: string, password: string, approvalCode?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  acceptPendingTerms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildName(firebaseUser: User) {
  return firebaseUser.displayName || firebaseUser.email?.split("@")[0] || i18n.t("common:defaultUserName");
}

async function buildUniqueName(firebaseUser: User) {
  const baseName = buildName(firebaseUser).trim();
  if (!(await isUserNameTaken(baseName))) {
    return baseName;
  }

  let index = 1;
  while (true) {
    const candidate = `${baseName} (${index})`;
    if (!(await isUserNameTaken(candidate))) {
      return candidate;
    }
    index += 1;
  }
}

function isMissingAccountError(error: unknown) {
  return (
    error instanceof FirebaseError &&
    ["auth/user-not-found", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(
      error.code,
    )
  );
}

function assertActiveUserProfile(profile: AppUser) {
  if (profile.isActive === false) {
    throw new AuthLoginError("Este usuario foi desativado por um admin.", "deactivated_user");
  }

  return profile;
}

async function ensureUserProfile(firebaseUser: User) {
  const userDoc = doc(db, "users", firebaseUser.uid);
  const snapshot = await getDoc(userDoc);

  if (!snapshot.exists()) {
    const name = await buildUniqueName(firebaseUser);
    await setDoc(userDoc, {
      uid: firebaseUser.uid,
      name,
      email: firebaseUser.email,
      avatar: avatarFor(name, firebaseUser.email ?? firebaseUser.uid),
      role: "player",
      totalPoints: 0,
      weeklyPoints: 0,
      currentDailyStreak: 0,
      currentWeeklyStreak: 0,
      bestStreak: 0,
      workSchedule: {
        horarioInicioExpediente: "09:00",
        horarioFimExpediente: "18:00",
        horarioInicioAlmoco: "12:00",
        horarioFimAlmoco: "13:00",
        timezone: "America/Sao_Paulo",
      },
      termsAccepted: false,
      cooldownUntil: null,
      bathroomDurationMinutes: 10,
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }

  const fresh = await getDoc(userDoc);
  const data = fresh.data() as AppUser;
  if (!data) {
    throw new Error("Não foi possível carregar o perfil do usuário no Firestore.");
  }

  return assertActiveUserProfile({
    ...data,
    createdAt: data.createdAt ?? Timestamp.now(),
  });
}

async function loadAppSettings() {
  const settingsSnapshot = await getDoc(appSettingsDocRef);
  return parseAppSettings(settingsSnapshot.data() as Partial<AppSettings> | undefined);
}

async function registerWithApprovalCode(email: string, password: string, approvalCode: string) {
  const normalizedEmail = normalizeEmail(email);
  const request = await getRegistrationRequest(normalizedEmail);

  if (!request) {
    await createRegistrationAttempt({
      email: normalizedEmail,
      status: "failed",
      approvalCodeProvided: approvalCode,
      message: "Nenhuma solicitação encontrada para este email.",
    });
    throw new AuthLoginError(
      "Nenhuma solicitação de acesso encontrada para este email.",
      "no_request",
    );
  }

  if (request.status === "used") {
    await createRegistrationAttempt({
      email: normalizedEmail,
      status: "failed",
      approvalCodeProvided: approvalCode,
      requestId: request.id,
      message: "Solicitação já utilizada; conta já existe.",
    });
    throw new AuthLoginError(
      "A solicitação deste email já foi usada para criar conta.",
      "request_already_used",
    );
  }

  if (request.approvalCode.toUpperCase() !== approvalCode.trim().toUpperCase()) {
    await createRegistrationAttempt({
      email: normalizedEmail,
      status: "invalid_code",
      approvalCodeProvided: approvalCode,
      requestId: request.id,
      message: "Código informado não confere com a solicitação.",
    });
    throw new AuthLoginError("Código de acesso incorreto.", "invalid_code");
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    const profile = await ensureUserProfile(credential.user);
    await markRegistrationRequestUsed(normalizedEmail, credential.user.uid);
    await createRegistrationAttempt({
      email: normalizedEmail,
      status: "account_created",
      approvalCodeProvided: approvalCode,
      requestId: request.id,
      message: "Conta criada com código aprovado.",
    });
    return { credential, profile };
  } catch (error) {
    const mappedCode = firebaseAuthErrorCode(error);
    await createRegistrationAttempt({
      email: normalizedEmail,
      status: "failed",
      approvalCodeProvided: approvalCode,
      requestId: request.id,
      message: error instanceof Error ? error.message : "Falha ao criar conta.",
    });
    if (mappedCode) {
      throw new AuthLoginError(
        mappedCode === "email_already_registered"
          ? "Este email já possui conta."
          : mappedCode === "weak_password"
            ? "Senha muito fraca para criar a conta."
            : "Email inválido para cadastro.",
        mappedCode,
      );
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [pendingTermsUser, setPendingTermsUser] = useState<AppUser | null>(null);
  const [currentAppSettings, setCurrentAppSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);
      if (!nextUser) {
        setUser(null);
        setPendingTermsUser(null);
        setLoading(false);
        return;
      }

      try {
        const [profile, appSettings] = await Promise.all([ensureUserProfile(nextUser), loadAppSettings()]);
        setCurrentAppSettings(appSettings);
        if (hasAcceptedCurrentTerms(profile, appSettings)) {
          setPendingTermsUser(null);
          setUser(profile);
        } else {
          setUser(null);
          setPendingTermsUser(profile);
        }
      } catch (error) {
        console.error(error);
        setUser(null);
        setPendingTermsUser(null);
        await signOut(auth);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      user,
      pendingTermsUser,
      currentAppSettings,
      loading,
      login: async (email, password, approvalCode) => {
        if (!isFirebaseConfigured) {
          throw new AuthLoginError("Firebase ainda não foi configurado no .env.", "firebase_not_configured");
        }

        const normalizedEmail = normalizeEmail(email);
        setLoading(true);
        try {
          if (approvalCode?.trim()) {
            const { credential, profile } = await registerWithApprovalCode(
              normalizedEmail,
              password,
              approvalCode,
            );
            const appSettings = await loadAppSettings();
            setCurrentAppSettings(appSettings);
            setFirebaseUser(credential.user);
            if (hasAcceptedCurrentTerms(profile, appSettings)) {
              setPendingTermsUser(null);
              setUser(profile);
              return { status: "signed_in" };
            }
            setUser(null);
            setPendingTermsUser(profile);
            return { status: "terms_required" };
          }

          const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
          const profile = await ensureUserProfile(credential.user);
          const appSettings = await loadAppSettings();
          setCurrentAppSettings(appSettings);
          setFirebaseUser(credential.user);
          if (hasAcceptedCurrentTerms(profile, appSettings)) {
            setPendingTermsUser(null);
            setUser(profile);
            return { status: "signed_in" };
          }
          setUser(null);
          setPendingTermsUser(profile);
          return { status: "terms_required" };
        } catch (error) {
          if (!approvalCode?.trim() && isMissingAccountError(error)) {
            const request = await getOrCreateRegistrationRequest(normalizedEmail);
            if (request.status === "used") {
              throw new AuthLoginError(
                "Este email já foi cadastrado. Entre com email e senha.",
                "request_already_used",
              );
            }
            await createRegistrationAttempt({
              email: normalizedEmail,
              status: "code_requested",
              requestId: request.id,
              message: "Usuário tentou entrar sem conta e solicitou código.",
            });
            return { status: "access_code_required", request };
          }

          const mappedCode = firebaseAuthErrorCode(error);
          if (mappedCode === "wrong_password") {
            throw new AuthLoginError("Senha incorreta.", "wrong_password");
          }

          await signOut(auth).catch(() => undefined);
          throw error;
        } finally {
          setLoading(false);
        }
      },
      logout: async () => {
        setPendingTermsUser(null);
        setCurrentAppSettings(null);
        await signOut(auth);
      },
      refreshProfile: async () => {
        if (!firebaseUser) return;
        const [profile, appSettings] = await Promise.all([ensureUserProfile(firebaseUser), loadAppSettings()]);
        setCurrentAppSettings(appSettings);
        if (hasAcceptedCurrentTerms(profile, appSettings)) {
          setPendingTermsUser(null);
          setUser(profile);
          return;
        }
        setUser(null);
        setPendingTermsUser(profile);
      },
      acceptPendingTerms: async () => {
        if (!firebaseUser) return;
        const appSettings = currentAppSettings ?? await loadAppSettings();
        const updatedProfile = await acceptTermsOfUse(firebaseUser.uid, getCurrentTermsVersion(appSettings));
        setCurrentAppSettings(appSettings);
        setPendingTermsUser(null);
        setUser(assertActiveUserProfile({
          ...updatedProfile,
          createdAt: updatedProfile.createdAt ?? Timestamp.now(),
        }));
      },
    }),
    [currentAppSettings, firebaseUser, loading, pendingTermsUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
