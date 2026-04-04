import { Platform } from "react-native";

const fontSans = Platform.select({
  ios: "PlusJakartaSans",
  android: "PlusJakartaSans",
  default: "PlusJakartaSans",
});

const fontSansMedium = Platform.select({
  ios: "PlusJakartaSans-Medium",
  android: "PlusJakartaSans-Medium",
  default: "PlusJakartaSans-Medium",
});

const fontSansBold = Platform.select({
  ios: "PlusJakartaSans-SemiBold",
  android: "PlusJakartaSans-SemiBold",
  default: "PlusJakartaSans-SemiBold",
});

const fontDisplay = Platform.select({
  ios: "PlusJakartaSans-ExtraBold",
  android: "PlusJakartaSans-ExtraBold",
  default: "PlusJakartaSans-ExtraBold",
});

export const theme = {
  colors: {
    bg: "#E0E5EC",
    surface: "#E0E5EC",
    surfaceStrong: "#D1D9E6",
    text: "#3D4852",
    textMuted: "#6B7280",
    border: "#C8CED8",
    accent: "#6C63FF",
    accentSoft: "#E8E6FF",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#0F766E",
    white: "#FFFFFF",
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
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
    sansMedium: fontSansMedium,
    sansBold: fontSansBold,
    display: fontDisplay,
  },
  shadow: {
    raised: {
      shadowColor: "#A3B1C6",
      shadowOpacity: 0.6,
      shadowRadius: 10,
      shadowOffset: { width: 5, height: 5 },
      elevation: 6,
    },
    raisedStrong: {
      shadowColor: "#A3B1C6",
      shadowOpacity: 0.7,
      shadowRadius: 16,
      shadowOffset: { width: 9, height: 9 },
      elevation: 8,
    },
    /** Use for "pressed" feel — apply a darker bg + subtle shadow */
    inset: {
      shadowColor: "#A3B1C6",
      shadowOpacity: 0.4,
      shadowRadius: 6,
      shadowOffset: { width: 2, height: 2 },
      elevation: 2,
    },
  },
} as const;
