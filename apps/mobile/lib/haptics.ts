import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * PAPER TRAIL haptic signature: the price gun. One decisive ka-chunk per
 * meaningful action — no haptic chatter. No-ops on web.
 */

/** The stamp landing: publish success, sold, approve. */
export function kaChunk() {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Lighter click for secondary mechanical actions (delist, save). */
export function click() {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Something failed to print. */
export function misfeed() {
  if (Platform.OS === "web") return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
