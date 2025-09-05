"use client";

type GeolocationData = {
  latitude: number;
  longitude: number;
};

type ClientInfo = {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
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
      navigator.geolocation.getCurrentPosition(
        (position) => {
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
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            status = "Unavailable";
          } else if (error.code === error.TIMEOUT) {
            status = "Timeout";
          }
          resolve({ status });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 } // Изменено на false
      );
    } else {
      resolve({ status: "Not Supported" });
    }
  });
}

export function getClientInfo(): ClientInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
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
    permissions.geolocation = "Prompt/Unknown (API not supported)";
    permissions.camera = "Prompt/Unknown (API not supported)";
    permissions.microphone = "Prompt/Unknown (API not supported)";
  }

  return permissions;
}