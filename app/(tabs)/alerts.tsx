import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useAlerts, AlertZone } from "@/contexts/AlertContext";
import { getDistanceMeters, formatDistance } from "@/lib/location";
import { TN_TOLLGATES } from "@/data/tn-tollgates";

function AlertZoneCard({
  zone,
  userLocation,
  onToggle,
  onDelete,
}: {
  zone: AlertZone;
  userLocation: { latitude: number; longitude: number } | null;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const distance = userLocation
    ? getDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        zone.latitude,
        zone.longitude
      )
    : null;
  const isInside = distance !== null && distance <= zone.radiusMeters;

  const pulseValue = useSharedValue(1);

  useEffect(() => {
    if (isInside && zone.enabled) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      pulseValue.value = withTiming(1, { duration: 200 });
    }
  }, [isInside, zone.enabled]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: pulseValue.value,
  }));

  return (
    <View
      style={[
        styles.card,
        isInside && zone.enabled && styles.cardTriggered,
        !zone.enabled && styles.cardDisabled,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardHeader}>
          <Animated.View
            style={[
              styles.indicator,
              {
                backgroundColor: !zone.enabled
                  ? Colors.textTertiary
                  : isInside
                  ? Colors.danger
                  : Colors.safe,
              },
              indicatorStyle,
            ]}
          />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {zone.name}
            </Text>
            <Text style={styles.cardCoords}>
              {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)}
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => {
              onToggle();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name={zone.enabled ? "radio-button-on" : "radio-button-off"}
              size={26}
              color={zone.enabled ? Colors.accent : Colors.textTertiary}
            />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (Platform.OS === "web") {
                onDelete();
              } else {
                Alert.alert("Delete Zone", `Remove "${zone.name}"?`, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: onDelete,
                  },
                ]);
              }
            }}
          >
            <Ionicons name="trash-outline" size={22} color={Colors.danger} />
          </Pressable>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.statItem}>
          <MaterialCommunityIcons
            name="radar"
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.statText}>{formatDistance(zone.radiusMeters)}</Text>
        </View>
        {distance !== null && (
          <View style={styles.statItem}>
            <Ionicons
              name="navigate-outline"
              size={16}
              color={isInside ? Colors.danger : Colors.accent}
            />
            <Text
              style={[
                styles.statText,
                isInside && { color: Colors.danger, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {isInside ? "INSIDE ZONE" : formatDistance(distance)}
            </Text>
          </View>
        )}
        <View style={styles.statItem}>
          <Ionicons
            name={zone.enabled ? "shield-checkmark" : "shield-outline"}
            size={16}
            color={zone.enabled ? Colors.safe : Colors.textTertiary}
          />
          <Text style={styles.statText}>
            {zone.enabled ? "Active" : "Paused"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { zones, toggleZone, removeZone, addBulkZones } = useAlerts();
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [loadingTollgates, setLoadingTollgates] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    })();
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000 },
          (loc) => {
            setUserLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        );
      }
    })();
    return () => {
      if (sub) sub.remove();
    };
  }, []);

  const activeCount = zones.filter((z) => z.enabled).length;

  const tollgateCount = zones.filter((z) =>
    TN_TOLLGATES.some((t) => t.name.toLowerCase() === z.name.toLowerCase())
  ).length;
  const allTollgatesLoaded = tollgateCount >= TN_TOLLGATES.length;

  const loadTollgates = async () => {
    setLoadingTollgates(true);
    try {
      const tollZones = TN_TOLLGATES.map((t) => ({
        name: t.name,
        latitude: t.latitude,
        longitude: t.longitude,
        radiusMeters: 2000,
        enabled: true,
      }));
      const added = await addBulkZones(tollZones);
      if (Platform.OS === "web") {
        // no alert needed
      } else {
        if (added > 0) {
          Alert.alert("Tollgates Loaded", `Added ${added} Tamil Nadu tollgate locations as alert zones (2 km radius).`);
        } else {
          Alert.alert("Already Loaded", "All Tamil Nadu tollgate locations are already in your alert zones.");
        }
      }
    } catch (e) {
      console.error("Failed to load tollgates:", e);
    } finally {
      setLoadingTollgates(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Alert Zones</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {activeCount}/{zones.length}
          </Text>
        </View>
      </View>

      <Pressable
        style={[
          styles.tollgateButton,
          allTollgatesLoaded && styles.tollgateButtonLoaded,
          loadingTollgates && { opacity: 0.6 },
        ]}
        onPress={loadTollgates}
        disabled={loadingTollgates || allTollgatesLoaded}
      >
        <MaterialCommunityIcons
          name="boom-gate"
          size={20}
          color={allTollgatesLoaded ? Colors.safe : "#FFC107"}
        />
        <Text style={styles.tollgateButtonText}>
          {loadingTollgates
            ? "Loading..."
            : allTollgatesLoaded
            ? `All ${TN_TOLLGATES.length} TN Tollgates Loaded`
            : `Load TN Tollgates (${TN_TOLLGATES.length} locations)`}
        </Text>
        {!allTollgatesLoaded && !loadingTollgates && (
          <Ionicons name="add-circle" size={20} color="#FFC107" />
        )}
        {allTollgatesLoaded && (
          <Ionicons name="checkmark-circle" size={20} color={Colors.safe} />
        )}
      </Pressable>

      <FlatList
        data={zones}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!zones.length}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 84 + 20 : 100 },
          zones.length === 0 && styles.emptyList,
        ]}
        renderItem={({ item }) => (
          <AlertZoneCard
            zone={item}
            userLocation={userLocation}
            onToggle={() => toggleZone(item.id)}
            onDelete={() => removeZone(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="radar"
              size={56}
              color={Colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>No Alert Zones</Text>
            <Text style={styles.emptyText}>
              Go to the Map tab and long press anywhere to create your first
              alert zone.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  emptyList: {
    flex: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  cardTriggered: {
    borderColor: "rgba(255, 59, 48, 0.5)",
    backgroundColor: "rgba(255, 59, 48, 0.08)",
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  cardCoords: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tollgateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.3)",
  },
  tollgateButtonLoaded: {
    backgroundColor: "rgba(52, 199, 89, 0.08)",
    borderColor: "rgba(52, 199, 89, 0.25)",
  },
  tollgateButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
