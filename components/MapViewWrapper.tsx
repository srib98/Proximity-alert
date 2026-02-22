import React, { forwardRef } from "react";
import { Platform, View } from "react-native";
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from "react-native-maps";

export const MapViewWrapper = forwardRef<any, any>((props, ref) => {
  return (
    <MapView
      ref={ref}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      {...props}
    />
  );
});

export function MapMarker(props: any) {
  return <Marker {...props} />;
}

export function MapCircle(props: any) {
  return <Circle {...props} />;
}
