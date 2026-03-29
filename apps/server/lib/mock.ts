const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isMockMode(): boolean {
  const raw = process.env.MOCK_MODE;
  if (!raw) return false;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

export function mockPlatformListingId(platform: string): string {
  return `mock-${platform}-${Date.now()}`;
}
