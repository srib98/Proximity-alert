import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

export interface AlertZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled: boolean;
  createdAt: number;
}

interface AlertContextValue {
  zones: AlertZone[];
  addZone: (zone: Omit<AlertZone, "id" | "createdAt">) => Promise<void>;
  removeZone: (id: string) => Promise<void>;
  toggleZone: (id: string) => Promise<void>;
  updateZone: (id: string, updates: Partial<AlertZone>) => Promise<void>;
  isLoading: boolean;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const STORAGE_KEY = "@prox_alert_zones";

export function AlertProvider({ children }: { children: ReactNode }) {
  const [zones, setZones] = useState<AlertZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setZones(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load zones:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveZones = async (newZones: AlertZone[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newZones));
    } catch (e) {
      console.error("Failed to save zones:", e);
    }
  };

  const addZone = useCallback(async (zone: Omit<AlertZone, "id" | "createdAt">) => {
    const newZone: AlertZone = {
      ...zone,
      id: Crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const updated = [...zones, newZone];
    setZones(updated);
    await saveZones(updated);
  }, [zones]);

  const removeZone = useCallback(async (id: string) => {
    const updated = zones.filter((z) => z.id !== id);
    setZones(updated);
    await saveZones(updated);
  }, [zones]);

  const toggleZone = useCallback(async (id: string) => {
    const updated = zones.map((z) =>
      z.id === id ? { ...z, enabled: !z.enabled } : z
    );
    setZones(updated);
    await saveZones(updated);
  }, [zones]);

  const updateZone = useCallback(async (id: string, updates: Partial<AlertZone>) => {
    const updated = zones.map((z) =>
      z.id === id ? { ...z, ...updates } : z
    );
    setZones(updated);
    await saveZones(updated);
  }, [zones]);

  const value = useMemo(
    () => ({ zones, addZone, removeZone, toggleZone, updateZone, isLoading }),
    [zones, addZone, removeZone, toggleZone, updateZone, isLoading]
  );

  return (
    <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlerts must be used within AlertProvider");
  }
  return context;
}
