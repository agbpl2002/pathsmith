import type {
  AppBlueprint,
  DesktopStatus,
  ModuleDescriptor,
  ModuleId,
  TranslationDictionary
} from "../lib/types";

// I preserve a stable tool order so every locale renders the same information architecture.
const moduleOrder: ModuleId[] = ["organizer", "cleanup"];

// I build the UI blueprint from a translation dictionary so every visible string can be localized.
export function buildBlueprint(dictionary: TranslationDictionary): AppBlueprint {
  const modules: ModuleDescriptor[] = moduleOrder.map((moduleId) => ({
    id: moduleId,
    ...dictionary.modules[moduleId]
  }));

  return {
    name: dictionary.app.name,
    modules
  };
}

// I keep a frontend fallback status for browser previews where the Rust bridge is unavailable.
export const fallbackStatus: DesktopStatus = {
  tauriConnected: false,
  platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
  appVersion: "0.1.0"
};
