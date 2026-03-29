import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

type FadeSlideOptions = {
  delay?: number;
  y?: number;
  duration?: number;
  enabled?: boolean;
};

type PressScaleOptions = {
  pressedScale?: number;
  speed?: number;
  bounciness?: number;
};

export function useFadeSlideIn({
  delay = 0,
  y = 10,
  duration = 260,
  enabled = true,
}: FadeSlideOptions = {}) {
  const opacity = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(enabled ? y : 0)).current;

  useEffect(() => {
    if (!enabled) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, duration, enabled, opacity, translateY, y]);

  return {
    opacity,
    transform: [{ translateY }],
  } as const;
}

export function usePressScale({
  pressedScale = 0.97,
  speed = 24,
  bounciness = 4,
}: PressScaleOptions = {}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        speed,
        bounciness,
        useNativeDriver: true,
      }).start();
    },
    [bounciness, scale, speed]
  );

  const onPressIn = useCallback(() => {
    animateTo(pressedScale);
  }, [animateTo, pressedScale]);

  const onPressOut = useCallback(() => {
    animateTo(1);
  }, [animateTo]);

  return {
    onPressIn,
    onPressOut,
    animatedStyle: {
      transform: [{ scale }],
    },
  } as const;
}
