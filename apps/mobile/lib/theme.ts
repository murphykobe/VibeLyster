import { Platform } from "react-native";

const fontSans = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: "Avenir Next",
});

const fontSansBold = Platform.select({
  ios: "Avenir Next Demi Bold",
  android: "sans-serif-medium",
  default: "Avenir Next Demi Bold",
});

const fontDisplay = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

export const theme = {
  colors: {
    bg: "#F6F1E8",
    surface: "#FFFDF8",
    surfaceStrong: "#F2EADF",
    text: "#1F2430",
    textMuted: "#6B7280",
    border: "#E5DCCF",
    accent: "#F05D23",
    accentSoft: "#FFE6DA",
    success: "#2E7D32",
    warning: "#D97706",
    danger: "#C62828",
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
      shadowColor: "#4A3628",
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
  },
} as const;

