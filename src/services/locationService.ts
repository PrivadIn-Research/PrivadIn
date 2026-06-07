import type { PoopLocation } from "../types";

export async function requestCurrentLocation(): Promise<PoopLocation> {
  if (!("geolocation" in navigator)) {
    throw new Error("Geolocalizacao nao esta disponivel neste dispositivo.");
  }

  if ("permissions" in navigator) {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    if (permission.state === "denied") {
      throw new Error("Permissao de localizacao negada. Libere a localizacao no navegador.");
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
        reject(new Error("Nao foi possivel capturar sua localizacao agora."));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  });
}
