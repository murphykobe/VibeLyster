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

const TYPE_STYLES: Record<ToastType, { bg: string; color: string }> = {
  error: { bg: "#DC2626", color: "#FFFFFF" },
  success: { bg: "#16A34A", color: "#FFFFFF" },
  info: { bg: "#111111", color: "#FFFFFF" },
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

  const colors = TYPE_STYLES[entry.type];

  return (
    <Animated.View style={[styles.toast, { backgroundColor: colors.bg, opacity, transform: [{ translateY }] }]}>
      <Text style={[styles.toastText, { color: colors.color }]}>{entry.message}</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  toastText: {
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
    lineHeight: 18,
  },
});
