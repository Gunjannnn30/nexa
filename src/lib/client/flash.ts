export type AppFlash = {
  tone: "success" | "warning" | "error";
  message: string;
};

const FLASH_KEY = "nexa:flash";

export function setAppFlash(flash: AppFlash) {
  try {
    window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(flash));
  } catch {
    // Session storage can be unavailable in hardened browsers. The redirect
    // still works; only the one-time notice is lost.
  }
}

export function takeAppFlash(): AppFlash | null {
  try {
    const raw = window.sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FLASH_KEY);
    const parsed = JSON.parse(raw) as Partial<AppFlash>;
    if (typeof parsed.message !== "string" || !parsed.message) return null;
    if (parsed.tone !== "success" && parsed.tone !== "warning" && parsed.tone !== "error") {
      return null;
    }
    return { tone: parsed.tone, message: parsed.message };
  } catch {
    return null;
  }
}
