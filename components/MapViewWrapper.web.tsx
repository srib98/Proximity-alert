import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const MapViewWrapper = forwardRef<any, any>((props, ref) => {
  return (
    <View style={[StyleSheet.absoluteFill, webStyles.container]}>
      <View style={webStyles.content}>
        <Ionicons name="map" size={56} color={Colors.accent} />
        <Text style={webStyles.title}>Map View</Text>
        <Text style={webStyles.subtitle}>
          Open this app on your phone via Expo Go to see the interactive map
          with GPS tracking and proximity alerts.
        </Text>
      </View>
    </View>
  );
});

export function MapMarker(_props: any) {
  return null;
}

export function MapCircle(_props: any) {
  return null;
}

const webStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
