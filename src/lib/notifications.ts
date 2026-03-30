import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from "@tauri-apps/plugin-notification";

type NativeNotificationPayload = {
  body: string;
  title: string;
};

let cachedPermission: "unknown" | "granted" | "denied" = "unknown";

async function ensureNotificationPermission(): Promise<boolean> {
  if (cachedPermission === "granted") {
    return true;
  }

  if (cachedPermission === "denied") {
    return false;
  }

  try {
    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }

    cachedPermission = permissionGranted ? "granted" : "denied";
    return permissionGranted;
  } catch {
    return false;
  }
}

export async function sendNativeNotification(payload: NativeNotificationPayload): Promise<boolean> {
  const permissionGranted = await ensureNotificationPermission();

  if (!permissionGranted) {
    return false;
  }

  try {
    await sendNotification(payload);
    return true;
  } catch {
    return false;
  }
}
