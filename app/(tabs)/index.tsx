import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  Linking,
} from "react-native";
import { MapViewWrapper, MapMarker, MapCircle } from "@/components/MapViewWrapper";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useAlerts, AlertZone } from "@/contexts/AlertContext";
import { getDistanceMeters, formatDistance } from "@/lib/location";

const ALARM_ASSET = require("../../assets/alarm.wav");

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { zones, addZone } = useAlerts();
  const mapRef = useRef<any>(null);

  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [selectedCoord, setSelectedCoord] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneRadius, setZoneRadius] = useState("500");
  const [triggeredZones, setTriggeredZones] = useState<Set<string>>(new Set());
  const [showAlarmOverlay, setShowAlarmOverlay] = useState(false);
  const [triggeredZoneName, setTriggeredZoneName] = useState("");
  const [triggeredDistance, setTriggeredDistance] = useState("");

  const soundRef = useRef<Audio.Sound | null>(null);
  const alarmActiveRef = useRef(false);
  const vibrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.8);
  const alarmFlash = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) })
      ),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800 }),
        withTiming(0.8, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const alarmFlashStyle = useAnimatedStyle(() => ({
    opacity: alarmFlash.value,
  }));

  useEffect(() => {
    if (showAlarmOverlay) {
      alarmFlash.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 300 }),
          withTiming(0.1, { duration: 300 })
        ),
        -1,
        true
      );
    } else {
      alarmFlash.value = withTiming(0, { duration: 200 });
    }
  }, [showAlarmOverlay]);

  useEffect(() => {
    return () => {
      stopAlarm();
      if (locationSubRef.current) {
        locationSubRef.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (permission?.granted) {
      startLocationTracking();
    }
  }, [permission?.granted]);

  const startLocationTracking = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
        },
        (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    } catch (e) {
      console.error("Location error:", e);
    }
  };

  useEffect(() => {
    if (!userLocation) return;

    const enabledZones = zones.filter((z) => z.enabled);
    const newTriggered = new Set<string>();
    let closestTriggered: { zone: AlertZone; distance: number } | null = null;

    for (const zone of enabledZones) {
      const dist = getDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        zone.latitude,
        zone.longitude
      );
      if (dist <= zone.radiusMeters) {
        newTriggered.add(zone.id);
        if (!closestTriggered || dist < closestTriggered.distance) {
          closestTriggered = { zone, distance: dist };
        }
      }
    }

    const wasTriggered = triggeredZones.size > 0;
    const isTriggered = newTriggered.size > 0;

    if (isTriggered && !wasTriggered) {
      if (closestTriggered) {
        setTriggeredZoneName(closestTriggered.zone.name);
        setTriggeredDistance(formatDistance(closestTriggered.distance));
      }
      setShowAlarmOverlay(true);
      playAlarm();
    } else if (!isTriggered && wasTriggered) {
      setShowAlarmOverlay(false);
      stopAlarm();
    } else if (isTriggered && closestTriggered) {
      setTriggeredZoneName(closestTriggered.zone.name);
      setTriggeredDistance(formatDistance(closestTriggered.distance));
    }

    setTriggeredZones(newTriggered);
  }, [userLocation, zones]);

  const playAlarm = async () => {
    if (alarmActiveRef.current) return;
    alarmActiveRef.current = true;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: 1,
        interruptionModeAndroid: 1,
      });

      const { sound } = await Audio.Sound.createAsync(ALARM_ASSET, {
        isLooping: true,
        volume: 1.0,
        shouldPlay: true,
      });
      soundRef.current = sound;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      vibrationTimerRef.current = setInterval(() => {
        if (alarmActiveRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }, 1500);
    } catch (e) {
      console.error("Alarm error:", e);
    }
  };

  const stopAlarm = async () => {
    alarmActiveRef.current = false;
    if (vibrationTimerRef.current) {
      clearInterval(vibrationTimerRef.current);
      vibrationTimerRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }
  };

  const dismissAlarm = () => {
    setShowAlarmOverlay(false);
    stopAlarm();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleMapLongPress = (e: any) => {
    const coord = e.nativeEvent.coordinate;
    setSelectedCoord(coord);
    setZoneName("");
    setZoneRadius("500");
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleAddZone = async () => {
    if (!selectedCoord || !zoneName.trim()) return;
    const radius = parseInt(zoneRadius) || 500;
    await addZone({
      name: zoneName.trim(),
      latitude: selectedCoord.latitude,
      longitude: selectedCoord.longitude,
      radiusMeters: Math.max(50, Math.min(50000, radius)),
      enabled: true,
    });
    setShowAddModal(false);
    setSelectedCoord(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="location-outline" size={64} color={Colors.accent} />
          <Text style={styles.permissionTitle}>Location Access Needed</Text>
          <Text style={styles.permissionText}>
            ProxAlert needs your location to monitor proximity to your saved
            alert zones.
          </Text>
          {permission.status === "denied" && !permission.canAskAgain ? (
            Platform.OS !== "web" ? (
              <Pressable
                style={({ pressed }) => [
                  styles.permissionButton,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => {
                  try {
                    Linking.openSettings();
                  } catch {}
                }}
              >
                <Ionicons name="settings-outline" size={20} color="#fff" />
                <Text style={styles.permissionButtonText}>Open Settings</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.permissionButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={requestPermission}
            >
              <Ionicons name="locate-outline" size={20} color="#fff" />
              <Text style={styles.permissionButtonText}>Enable Location</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapViewWrapper
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        showsMyLocationButton={false}
        onLongPress={handleMapLongPress}
        initialRegion={
          userLocation
            ? {
                ...userLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : {
                latitude: 37.78825,
                longitude: -122.4324,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
              }
        }
        customMapStyle={darkMapStyle}
      >
        {zones.map((zone) => (
          <React.Fragment key={zone.id}>
            <MapMarker
              coordinate={{
                latitude: zone.latitude,
                longitude: zone.longitude,
              }}
              title={zone.name}
              description={`${formatDistance(zone.radiusMeters)} radius`}
            >
              <View style={styles.markerContainer}>
                <View
                  style={[
                    styles.markerDot,
                    {
                      backgroundColor: zone.enabled
                        ? triggeredZones.has(zone.id)
                          ? Colors.danger
                          : Colors.accent
                        : Colors.textTertiary,
                    },
                  ]}
                >
                  <Ionicons name="location" size={16} color="#fff" />
                </View>
              </View>
            </MapMarker>
            <MapCircle
              center={{
                latitude: zone.latitude,
                longitude: zone.longitude,
              }}
              radius={zone.radiusMeters}
              strokeColor={
                zone.enabled
                  ? triggeredZones.has(zone.id)
                    ? "rgba(255, 59, 48, 0.8)"
                    : "rgba(0, 122, 255, 0.6)"
                  : "rgba(255, 255, 255, 0.2)"
              }
              fillColor={
                zone.enabled
                  ? triggeredZones.has(zone.id)
                    ? "rgba(255, 59, 48, 0.15)"
                    : "rgba(0, 122, 255, 0.1)"
                  : "rgba(255, 255, 255, 0.05)"
              }
              strokeWidth={2}
            />
          </React.Fragment>
        ))}
        {selectedCoord && (
          <MapMarker coordinate={selectedCoord}>
            <View style={styles.markerContainer}>
              <Animated.View style={[styles.markerPulse, pulseStyle]} />
              <View style={[styles.markerDot, { backgroundColor: Colors.safe }]}>
                <Ionicons name="add" size={16} color="#fff" />
              </View>
            </View>
          </MapMarker>
        )}
      </MapViewWrapper>

      <View
        style={[
          styles.topBar,
          { paddingTop: Platform.OS === "web" ? 67 + 12 : insets.top + 12 },
        ]}
      >
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  triggeredZones.size > 0 ? Colors.danger : Colors.safe,
              },
            ]}
          />
          <Text style={styles.statusText}>
            {triggeredZones.size > 0
              ? `${triggeredZones.size} Zone${triggeredZones.size > 1 ? "s" : ""} Active`
              : "Monitoring"}
          </Text>
        </View>
      </View>

      <View style={[styles.mapControls, { bottom: Platform.OS === "web" ? 84 + 16 : 100 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.mapButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={centerOnUser}
        >
          <Ionicons name="locate" size={22} color={Colors.accent} />
        </Pressable>
      </View>

      <View
        style={[
          styles.hintBar,
          { bottom: Platform.OS === "web" ? 84 + 16 : 100 },
        ]}
      >
        <MaterialCommunityIcons
          name="gesture-tap-hold"
          size={18}
          color={Colors.textSecondary}
        />
        <Text style={styles.hintText}>Long press map to add alert zone</Text>
      </View>

      {userLocation && zones.filter((z) => z.enabled).length > 0 && (
        <View style={[styles.distanceBar, { bottom: Platform.OS === "web" ? 84 + 56 : 140 }]}>
          {zones
            .filter((z) => z.enabled)
            .slice(0, 3)
            .map((zone) => {
              const dist = getDistanceMeters(
                userLocation.latitude,
                userLocation.longitude,
                zone.latitude,
                zone.longitude
              );
              const isInside = dist <= zone.radiusMeters;
              return (
                <View
                  key={zone.id}
                  style={[
                    styles.distanceChip,
                    isInside && styles.distanceChipDanger,
                  ]}
                >
                  <Ionicons
                    name={isInside ? "warning" : "navigate"}
                    size={14}
                    color={isInside ? Colors.danger : Colors.accent}
                  />
                  <Text
                    style={[
                      styles.distanceChipText,
                      isInside && { color: Colors.danger },
                    ]}
                    numberOfLines={1}
                  >
                    {zone.name}: {formatDistance(dist)}
                  </Text>
                </View>
              );
            })}
        </View>
      )}

      {showAlarmOverlay && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.alarmOverlay, alarmFlashStyle]}
          pointerEvents="box-none"
        />
      )}

      {showAlarmOverlay && (
        <View style={[styles.alarmBanner, { top: Platform.OS === "web" ? 67 + 60 : insets.top + 60 }]}>
          <View style={styles.alarmBannerContent}>
            <View style={styles.alarmIconWrap}>
              <Ionicons name="warning" size={28} color={Colors.danger} />
            </View>
            <View style={styles.alarmTextWrap}>
              <Text style={styles.alarmTitle}>PROXIMITY ALERT</Text>
              <Text style={styles.alarmSubtitle}>
                {triggeredZoneName} - {triggeredDistance} away
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.dismissButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={dismissAlarm}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAddModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}
            onPress={() => {}}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Alert Zone</Text>

            {selectedCoord && (
              <Text style={styles.modalCoords}>
                {selectedCoord.latitude.toFixed(5)},{" "}
                {selectedCoord.longitude.toFixed(5)}
              </Text>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Zone Name</Text>
              <TextInput
                style={styles.input}
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="e.g. Office, School, Home"
                placeholderTextColor={Colors.textTertiary}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Alert Radius (meters)</Text>
              <TextInput
                style={styles.input}
                value={zoneRadius}
                onChangeText={setZoneRadius}
                placeholder="500"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
              />
              <Text style={styles.inputHint}>
                Alert triggers when you enter within {zoneRadius || "500"}m
              </Text>
            </View>

            <View style={styles.radiusPresets}>
              {[100, 250, 500, 1000, 5000].map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.presetChip,
                    zoneRadius === String(r) && styles.presetChipActive,
                  ]}
                  onPress={() => {
                    setZoneRadius(String(r));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      zoneRadius === String(r) && styles.presetChipTextActive,
                    ]}
                  >
                    {formatDistance(r)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                { opacity: pressed ? 0.8 : 1 },
                !zoneName.trim() && styles.addButtonDisabled,
              ]}
              onPress={handleAddZone}
              disabled={!zoneName.trim()}
            >
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.addButtonText}>Add Alert Zone</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  {
    featureType: "administrative.country",
    elementType: "geometry.stroke",
    stylers: [{ color: "#4b6878" }],
  },
  {
    featureType: "land",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#283d6a" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6f9ba5" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#304a7d" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#255763" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#98a5be" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }],
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  permissionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    textAlign: "center",
  },
  permissionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    backgroundColor: "rgba(11, 22, 34, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  mapControls: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(11, 22, 34, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hintBar: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(11, 22, 34, 0.85)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 10,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  distanceBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    zIndex: 10,
  },
  distanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(11, 22, 34, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: "48%",
  },
  distanceChipDanger: {
    borderColor: "rgba(255, 59, 48, 0.4)",
    backgroundColor: "rgba(255, 59, 48, 0.12)",
  },
  distanceChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
    flexShrink: 1,
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  markerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  markerPulse: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.safe,
  },
  alarmOverlay: {
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    zIndex: 50,
  },
  alarmBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
  },
  alarmBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 10, 10, 0.95)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.danger,
    gap: 12,
  },
  alarmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 59, 48, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  alarmTextWrap: {
    flex: 1,
    gap: 2,
  },
  alarmTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.danger,
    letterSpacing: 1.5,
  },
  alarmSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  dismissButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textTertiary,
    alignSelf: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  modalCoords: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: -8,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  radiusPresets: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accent,
  },
  presetChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  presetChipTextActive: {
    color: Colors.accent,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
