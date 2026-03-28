import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required");
  // Expect a 64-char hex string (32 bytes)
  return Buffer.from(key, "hex");
}

export function encryptTokens(tokens: Record<string, unknown>): Record<string, unknown> {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(tokens);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    data: encrypted.toString("hex"),
    tag: authTag.toString("hex"),
  };
}

export function decryptTokens(encrypted: Record<string, unknown>): Record<string, unknown> {
  const key = getKey();
  const iv = Buffer.from(encrypted.iv as string, "hex");
  const data = Buffer.from(encrypted.data as string, "hex");
  const tag = Buffer.from(encrypted.tag as string, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
