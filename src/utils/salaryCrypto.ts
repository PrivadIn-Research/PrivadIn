export interface EncryptedSalaryPayload {
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

function decodeKeyMaterial(raw: string) {
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function importSalaryKey() {
  const raw = String(import.meta.env.VITE_SALARY_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error("Chave de criptografia salarial não configurada no .env.");
  }

  const keyBytes = decodeKeyMaterial(raw);
  if (keyBytes.length !== 32) {
    throw new Error("VITE_SALARY_ENCRYPTION_KEY deve ter 32 bytes em hex ou base64.");
  }

  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSalaryCents(value: number): Promise<EncryptedSalaryPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importSalaryKey();
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(String(value))),
  );
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);

  return {
    algorithm: "aes-256-gcm",
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function decryptSalaryCents(salary?: EncryptedSalaryPayload | null) {
  if (!salary?.ciphertext || !salary.iv || !salary.tag) return 0;

  const key = await importSalaryKey();
  const iv = Uint8Array.from(atob(salary.iv), (char) => char.charCodeAt(0));
  const tag = Uint8Array.from(atob(salary.tag), (char) => char.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(salary.ciphertext), (char) => char.charCodeAt(0));
  const payload = new Uint8Array(ciphertext.length + tag.length);
  payload.set(ciphertext);
  payload.set(tag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
  return Number(new TextDecoder().decode(decrypted));
}
