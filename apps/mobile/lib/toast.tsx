import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type ToastType = "error" | "success" | "info";
type ToastEntry = { id: number; message: string; type: ToastType };
type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const DURATION = 3000;
const ANIM_MS = 250;

// Printed system messages — left rule + mono prefix, not colored bubbles.
const TYPE_STYLES: Record<ToastType, { rule: string; prefix: string }> = {
  error: { rule: theme.colors.stamp, prefix: "FAIL" },
  success: { rule: theme.colors.success, prefix: "OK" },
  info: { rule: theme.colors.ballpoint, prefix: "INFO" },
};

function Toast({ entry, onDone }: { entry: ToastEntry; onDone: (id: number) => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useRef(
    (() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -20, duration: ANIM_MS, useNativeDriver: true }),
          ]).start(() => onDone(entry.id));
        }, DURATION);
      });
    })()
  );

  const print = TYPE_STYLES[entry.type];

  return (
    <Animated.View style={[styles.toast, { borderLeftColor: print.rule, opacity, transform: [{ translateY }] }]}>
      <Text style={[styles.toastPrefix, { color: print.rule }]}>{print.prefix}</Text>
      <Text style={styles.toastText}>{entry.message}</Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "error") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={styles.container} pointerEvents="none">
        {toasts.map((entry) => (
          <Toast key={entry.id} entry={entry} onDone={removeToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    width: "100%",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
  },
  toastPrefix: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  toastText: {
    flex: 1,
    fontFamily: theme.fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
  },
});
