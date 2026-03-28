import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#000" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#000", borderTopColor: "#222" },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#555",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "VibeLyster",
          tabBarLabel: "Listings",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
