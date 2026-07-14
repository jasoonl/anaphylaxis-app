import { BottomTabBarButtonProps } from "expo-router/build/react-navigation/bottom-tabs/types";
import { PlatformPressable } from "expo-router/react-navigation";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...(props as ComponentProps<typeof PlatformPressable>)}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
