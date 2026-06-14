import type { PoopLocation } from "../types";
import { RegisterPoopError } from "../utils/registerPoopError";

export async function requestCurrentLocation(): Promise<PoopLocation> {
  if (!("geolocation" in navigator)) {
    throw new RegisterPoopError("location_unavailable", "Geolocalizacao nao esta disponivel neste dispositivo.");
  }

  if ("permissions" in navigator) {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state === "denied") {
      throw new RegisterPoopError("location_denied", "Permissao de localizacao negada. Libere a localizacao no navegador.");
    }
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        reject(new RegisterPoopError("location_unavailable", "Nao foi possivel capturar sua localizacao agora."));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  });
}
