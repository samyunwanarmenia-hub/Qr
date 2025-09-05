"use client";

type GeolocationData = {
  latitude: number;
  longitude: number;
};

type ClientInfo = {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  screenWidth?: number;
  screenHeight?: number;
  browserLanguage?: string;
};

type NetworkInfo = {
  effectiveType?: "2g" | "3g" | "4g" | "slow-2g" | undefined;
  rtt?: number;
  downlink?: number;
};

type BatteryInfo = {
  level?: number;
  charging?: boolean;
};

export type PermissionStatus = {
  geolocation: string;
  camera: string;
  microphone: string;
};

export async function getGeolocation(): Promise<{ data?: GeolocationData; status: string }> {
  return new Promise((resolve) => {
    if ("geolocation" in navigator) {
      console.log("getGeolocation: Attempting to get current position...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("getGeolocation: Successfully got position.", position.coords);
          resolve({
            data: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            status: "Granted",
          });
        },
        (error) => {
          let status = "Denied";
          if (error.code === error.PERMISSION_DENIED) {
            status = "Denied";
            console.warn("getGeolocation: Permission denied.", error);
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            status = "Unavailable";
            console.warn("getGeolocation: Position unavailable.", error);
          } else if (error.code === error.TIMEOUT) {
            status = "Timeout";
            console.warn("getGeolocation: Geolocation request timed out.", error);
          } else {
            console.error("getGeolocation: Unknown error getting position.", error);
          }
          resolve({ status });
        },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 } // Увеличено время ожидания до 20 секунд
      );
    } else {
      console.warn("getGeolocation: Geolocation is not supported by this browser.");
      resolve({ status: "Not Supported" });
    }
  });
}

export function getClientInfo(): ClientInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    browserLanguage: navigator.language,
  };
}

export function getNetworkInfo(): NetworkInfo {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (connection) {
    return {
      effectiveType: connection.effectiveType,
      rtt: connection.rtt,
      downlink: connection.downlink,
    };
  }
  return {};
}

export function getDeviceMemory(): number | undefined {
  return (navigator as any).deviceMemory;
}

export async function getBatteryInfo(): Promise<{ data?: BatteryInfo; status: string }> {
  if ("getBattery" in navigator) {
    try {
      const battery = await (navigator as any).getBattery();
      return {
        data: {
          level: battery.level,
          charging: battery.charging,
        },
        status: "Available",
      };
    } catch (error) {
      console.error("Error getting battery info:", error);
      return { status: "Error" };
    }
  }
  return { status: "Not Supported" };
}

export async function getPermissionStatus(): Promise<PermissionStatus> {
  const permissions: PermissionStatus = {
    geolocation: "Unknown",
    camera: "Unknown",
    microphone: "Unknown",
  };

  if ("permissions" in navigator) {
    try {
      const geoStatus = await navigator.permissions.query({ name: "geolocation" });
      permissions.geolocation = geoStatus.state;

      const cameraStatus = await navigator.permissions.query({ name: "camera" });
      permissions.camera = cameraStatus.state;

      const microphoneStatus = await navigator.permissions.query({ name: "microphone" });
      permissions.microphone = microphoneStatus.state;
      
    } catch (error) {
      console.error("Error querying permissions:", error);
    }
  } else {
    permissions.geolocation = "Not Supported";
    permissions.camera = "Not Supported";
    permissions.microphone = "Not Supported";
  }

  return permissions;
}