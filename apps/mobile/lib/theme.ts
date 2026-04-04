import { Platform } from "react-native";

const fontSans = Platform.select({
  ios: "Inter",
  android: "Inter",
  default: "Inter",
});

const fontSansBold = Platform.select({
  ios: "Inter-SemiBold",
  android: "Inter-SemiBold",
  default: "Inter-SemiBold",
});

const fontDisplay = Platform.select({
  ios: "SpaceGrotesk-Bold",
  android: "SpaceGrotesk-Bold",
  default: "SpaceGrotesk-Bold",
});

export const theme = {
  colors: {
    bg: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceStrong: "#F0F0F0",
    text: "#111111",
    textMuted: "#717171",
    border: "#E0E0E0",
    accent: "#5B3DF5",
    accentSoft: "#EDE8FF",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#0F766E",
    white: "#FFFFFF",
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
  },
  fonts: {
    sans: fontSans,
    sansBold: fontSansBold,
    display: fontDisplay,
  },
  shadow: {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  },
} as const;

