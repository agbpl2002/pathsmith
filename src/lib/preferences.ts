import type { OrganizerDateSource, OrganizerRenameMode, OrganizerStructure } from "./types";

const CLEANUP_IGNORED_FILES_KEY = "pathsmith-cleanup-ignored-files";
const ORGANIZER_STRUCTURE_KEY = "pathsmith-organizer-structure";
const ORGANIZER_DATE_SOURCE_KEY = "pathsmith-organizer-date-source";
const ORGANIZER_RENAME_MODE_KEY = "pathsmith-organizer-rename-mode";
const ORGANIZER_UNKNOWN_FOLDER_KEY = "pathsmith-organizer-unknown-folder";

export const defaultCleanupIgnoredFileNames = [".DS_Store", "Thumbs.db", "desktop.ini"];
export const defaultOrganizerStructure: OrganizerStructure = "yearMonthDay";
export const defaultOrganizerDateSource: OrganizerDateSource = "metadata";
export const defaultOrganizerRenameMode: OrganizerRenameMode = "keep";
export const defaultOrganizerUnknownFolderName = "Unknown date";

export function normalizeIgnoredFileName(name: string): string | null {
  const normalized = name.trim();

  if (!normalized) {
    return null;
  }

  return normalized;
}

export function dedupeIgnoredFileNames(names: string[]): string[] {
  const uniqueNames = new Map<string, string>();

  names.forEach((name) => {
    const normalized = normalizeIgnoredFileName(name);

    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();

    if (!uniqueNames.has(key)) {
      uniqueNames.set(key, normalized);
    }
  });

  return [...uniqueNames.values()];
}

export function resolveCleanupIgnoredFileNames(): string[] {
  if (typeof localStorage === "undefined") {
    return defaultCleanupIgnoredFileNames;
  }

  const storedValue = localStorage.getItem(CLEANUP_IGNORED_FILES_KEY);

  if (!storedValue) {
    return defaultCleanupIgnoredFileNames;
  }

  try {
    const parsed = JSON.parse(storedValue);

    if (!Array.isArray(parsed)) {
      return defaultCleanupIgnoredFileNames;
    }

    return dedupeIgnoredFileNames(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return defaultCleanupIgnoredFileNames;
  }
}

export function persistCleanupIgnoredFileNames(names: string[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(CLEANUP_IGNORED_FILES_KEY, JSON.stringify(dedupeIgnoredFileNames(names)));
}

export function isOrganizerStructure(value: string): value is OrganizerStructure {
  return value === "year" || value === "yearMonth" || value === "yearMonthDay";
}

export function resolveOrganizerStructure(): OrganizerStructure {
  if (typeof localStorage === "undefined") {
    return defaultOrganizerStructure;
  }

  const storedValue = localStorage.getItem(ORGANIZER_STRUCTURE_KEY);

  return storedValue && isOrganizerStructure(storedValue) ? storedValue : defaultOrganizerStructure;
}

export function persistOrganizerStructure(structure: OrganizerStructure): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(ORGANIZER_STRUCTURE_KEY, structure);
}

export function isOrganizerDateSource(value: string): value is OrganizerDateSource {
  return value === "metadata" || value === "name" || value === "nameThenMetadata";
}

export function resolveOrganizerDateSource(): OrganizerDateSource {
  if (typeof localStorage === "undefined") {
    return defaultOrganizerDateSource;
  }

  const storedValue = localStorage.getItem(ORGANIZER_DATE_SOURCE_KEY);

  return storedValue && isOrganizerDateSource(storedValue) ? storedValue : defaultOrganizerDateSource;
}

export function persistOrganizerDateSource(dateSource: OrganizerDateSource): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(ORGANIZER_DATE_SOURCE_KEY, dateSource);
}

export function isOrganizerRenameMode(value: string): value is OrganizerRenameMode {
  return value === "keep" || value === "dateStamp";
}

export function resolveOrganizerRenameMode(): OrganizerRenameMode {
  if (typeof localStorage === "undefined") {
    return defaultOrganizerRenameMode;
  }

  const storedValue = localStorage.getItem(ORGANIZER_RENAME_MODE_KEY);

  return storedValue && isOrganizerRenameMode(storedValue) ? storedValue : defaultOrganizerRenameMode;
}

export function persistOrganizerRenameMode(renameMode: OrganizerRenameMode): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(ORGANIZER_RENAME_MODE_KEY, renameMode);
}

export function normalizeOrganizerUnknownFolderName(name: string): string {
  const sanitized = name
    .trim()
    .replace(/[\\/]/g, "-");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return defaultOrganizerUnknownFolderName;
  }

  return sanitized;
}

export function resolveOrganizerUnknownFolderName(): string {
  if (typeof localStorage === "undefined") {
    return defaultOrganizerUnknownFolderName;
  }

  const storedValue = localStorage.getItem(ORGANIZER_UNKNOWN_FOLDER_KEY);

  return storedValue ? normalizeOrganizerUnknownFolderName(storedValue) : defaultOrganizerUnknownFolderName;
}

export function persistOrganizerUnknownFolderName(name: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(ORGANIZER_UNKNOWN_FOLDER_KEY, normalizeOrganizerUnknownFolderName(name));
}
