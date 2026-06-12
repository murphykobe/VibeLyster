/**
 * PAPER TRAIL — care-tag modernism. See DESIGN.md (repo root).
 * The app is paperwork: label-stock ground, thermal-printer ink,
 * price-gun orange for actions, rubber stamps for status.
 * Paper has corners: radius is 0 everywhere.
 */

const fonts = {
  /** UI workhorse — Archivo, the blank-label grotesk */
  sans: "Archivo",
  sansMedium: "Archivo-Medium",
  sansBold: "Archivo-SemiBold",
  /** Display / stamps / wordmark */
  display: "Archivo-Black",
  /** The data ink — every number, code, timestamp in the app */
  mono: "SpaceMono",
  monoBold: "SpaceMono-Bold",
  /** Editorial voice — one moment per screen, never more */
  serif: "Fraunces-Italic",
} as const;

export const theme = {
  colors: {
    /** "Label Stock" — unbleached care-tag cream, never white */
    bg: "#F2EEE3",
    surface: "#FAF7EE",
    surfaceStrong: "#E9E3D2",
    /** "Ribbon Black" — warm thermal-printer ink */
    text: "#1C1A17",
    textMuted: "#6E675C",
    /** Hairline rules, like printed lines on a wash tag */
    border: "rgba(28, 26, 23, 0.30)",
    borderSoft: "rgba(28, 26, 23, 0.14)",
    ink: "#1C1A17",
    /** "Price Gun Orange" — primary actions ONLY, never decorative */
    accent: "#FF4D00",
    accentSoft: "#FFE7DB",
    /** "Sold Red" — stamps, destructive */
    stamp: "#C8331F",
    /** "Ballpoint Blue" — user edits to AI output, links */
    ballpoint: "#2438B8",
    success: "#2F6B4F",
    warning: "#B8860B",
    danger: "#C8331F",
    info: "#2438B8",
    white: "#FFFFFF",
  },
  /** Paper has corners. */
  radius: {
    sm: 0,
    md: 0,
    lg: 0,
    xl: 0,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  fonts,
  /**
   * Flat paper, not floating cards: former neumorphic shadows are now
   * hairline ink borders. Spread sites get a ruled paper box for free.
   */
  shadow: {
    raised: {
      borderWidth: 1,
      borderColor: "rgba(28, 26, 23, 0.30)",
    },
    raisedStrong: {
      borderWidth: 1.5,
      borderColor: "#1C1A17",
    },
    inset: {
      borderWidth: 1,
      borderColor: "rgba(28, 26, 23, 0.14)",
    },
  },
} as const;

/** Marketplace print codes — never logos, never brand colors. */
export const PLATFORM_CODES: Record<string, string> = {
  grailed: "GRL",
  ebay: "EBY",
  depop: "DPP",
};
