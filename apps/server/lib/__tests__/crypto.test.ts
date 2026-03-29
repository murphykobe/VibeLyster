import { describe, it, expect } from "vitest";
import { encryptTokens, decryptTokens } from "../crypto";

describe("encryptTokens / decryptTokens", () => {
  const TOKENS = { access_token: "tok-abc", csrf_token: "csrf-xyz", nested: { key: "val" } };

  it("round-trips arbitrary token objects", () => {
    const encrypted = encryptTokens(TOKENS);
    const decrypted = decryptTokens(encrypted);
    expect(decrypted).toEqual(TOKENS);
  });

  it("produces different ciphertexts on each call (random IV)", () => {
    const a = encryptTokens(TOKENS);
    const b = encryptTokens(TOKENS);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("encrypted envelope has iv, data, and tag fields", () => {
    const enc = encryptTokens(TOKENS);
    expect(enc).toHaveProperty("iv");
    expect(enc).toHaveProperty("data");
    expect(enc).toHaveProperty("tag");
    // iv is 12 bytes → 24 hex chars
    expect(enc.iv as string).toHaveLength(24);
    // tag is 16 bytes → 32 hex chars
    expect(enc.tag as string).toHaveLength(32);
  });

  it("throws on tampered ciphertext", () => {
    const enc = encryptTokens(TOKENS);
    // Flip the first byte of data
    const tampered = { ...enc, data: "ff" + (enc.data as string).slice(2) };
    expect(() => decryptTokens(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const enc = encryptTokens(TOKENS);
    const tampered = { ...enc, tag: "00".repeat(16) };
    expect(() => decryptTokens(tampered)).toThrow();
  });
});
