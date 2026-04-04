const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isMockMode(): boolean {
  // Never allow mock mode in production
  if (process.env.NODE_ENV === "production") return false;

  const raw = process.env.MOCK_MODE;
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function mockPlatformListingId(platform: string, mode: "live" | "draft" = "live"): string {
  return `mock-${platform}-${mode}-${Date.now()}`;
}
