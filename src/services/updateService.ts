declare const __APP_VERSION__: string;

type UpdateSWHandler = (reloadPage?: boolean) => Promise<void>;

let updateSWHandler: UpdateSWHandler | null = null;

export function setPWAUpdateHandler(handler: UpdateSWHandler) {
  updateSWHandler = handler;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  error: string | null;
}

export type TriggerPWAUpdateResult = "reloading" | "pending";

/**
 * Checks for PWA updates by comparing current version with latest available
 * Fetches from /version.json which is served from the public/ folder
 * @returns Update check result with version info
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const currentVersion = __APP_VERSION__;
    const response = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: null,
        error: `Failed to fetch version: ${response.statusText}`,
      };
    }

    const versionData = await response.json();

    if (
      !versionData ||
      typeof versionData.version !== "string" ||
      !versionData.version.trim()
    ) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: null,
        error: "Invalid version.json format: missing or invalid version field",
      };
    }

    const latestVersion = versionData.version.trim();

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestVersion || null,
      error: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return {
      hasUpdate: false,
      currentVersion: __APP_VERSION__,
      latestVersion: null,
      error: errorMessage,
    };
  }
}

/**
 * Compares two semantic versions
 * @param v1 - First version to compare
 * @param v2 - Second version to compare
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

const UPDATE_WAIT_TIMEOUT_MS = 8000;

function waitForControllerChange() {
  return new Promise<void>((resolve) => {
    let reloaded = false;
    const handleControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      resolve();
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      resolve();
    }, UPDATE_WAIT_TIMEOUT_MS);
  });
}

function waitForWorkerReady(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    return Promise.resolve(registration.waiting);
  }

  return new Promise<ServiceWorker | null>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(registration.waiting ?? null), UPDATE_WAIT_TIMEOUT_MS);

    const observeWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" || worker.state === "activated") {
          window.clearTimeout(timeoutId);
          resolve(registration.waiting ?? worker);
        }
      });
    };

    observeWorker(registration.installing);
    registration.addEventListener("updatefound", () => {
      observeWorker(registration.installing);
    });
  });
}

export async function triggerPWAUpdate(): Promise<TriggerPWAUpdateResult> {
  if (updateSWHandler) {
    await updateSWHandler(true);
    return "reloading";
  }

  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return "reloading";
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    window.location.reload();
    return "reloading";
  }

  for (const registration of registrations) {
    const readyWorkerBeforeUpdate = registration.waiting ?? registration.installing;
    if (!readyWorkerBeforeUpdate) {
      await registration.update();
    }

    const worker = await waitForWorkerReady(registration);
    if (!worker) {
      continue;
    }

    worker.postMessage({ type: "SKIP_WAITING" });
    await waitForControllerChange();
    return "reloading";
  }

  return "pending";
}

/**
 * Gets the current app version
 * @returns The version string from package.json
 */
export function getCurrentVersion(): string {
  return __APP_VERSION__;
}
