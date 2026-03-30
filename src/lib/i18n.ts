import type { LocaleDefinition, TranslationDictionary } from "./types";

const STORAGE_KEY = "pathsmith-language";

// I load every JSON translation file eagerly so the language list is generated from the file system at build time.
const localeFiles = import.meta.glob("../locales/*.json", {
  eager: true,
  import: "default"
}) as Record<string, TranslationDictionary>;

// I derive the language label directly from the file name because that keeps adding locales friction-free.
function getLocaleName(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? "English.json";
  return fileName.replace(/\.json$/i, "");
}

// I normalize the file name into a stable storage key for the language selector.
function getLocaleId(localeName: string): string {
  return localeName.trim().toLowerCase().replace(/\s+/g, "-");
}

// I sort English and Italian first so the default bundle feels intentional, then I fall back to alphabetic order.
function sortLocales(left: LocaleDefinition, right: LocaleDefinition): number {
  const preferredOrder = ["english", "italian"];
  const leftIndex = preferredOrder.indexOf(left.id);
  const rightIndex = preferredOrder.indexOf(right.id);

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  }

  return left.name.localeCompare(right.name, "en");
}

// I expose a stable locale catalog that the app can render directly in the selector.
export const availableLocales: LocaleDefinition[] = Object.entries(localeFiles)
  .map(([filePath, dictionary]) => {
    const name = getLocaleName(filePath);

    return {
      id: getLocaleId(name),
      name,
      dictionary
    };
  })
  .sort(sortLocales);

// I resolve a locale by id and always fall back to the first bundled translation.
export function getLocaleById(localeId: string): LocaleDefinition {
  return availableLocales.find((locale) => locale.id === localeId) ?? availableLocales[0];
}

// I try to honor the user's previous choice before falling back to the browser language.
export function resolveInitialLocaleId(): string {
  const storedLocaleId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  if (storedLocaleId && availableLocales.some((locale) => locale.id === storedLocaleId)) {
    return storedLocaleId;
  }

  const browserLanguage = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";

  if (browserLanguage.startsWith("it")) {
    return getLocaleById("italian").id;
  }

  if (browserLanguage.startsWith("en")) {
    return getLocaleById("english").id;
  }

  return availableLocales[0]?.id ?? "english";
}

// I persist the selected language so the app reopens in the same locale next time.
export function persistLocale(localeId: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, localeId);
}
