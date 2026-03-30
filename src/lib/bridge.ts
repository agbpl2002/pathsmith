import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { fallbackStatus } from "../data/workbench";
import type {
  DesktopStatus,
  EmptyFolderScan,
  OrganizerApplyResult,
  OrganizerDateSource,
  OrganizerPreview,
  OrganizerRenameMode,
  OrganizerStructure
} from "./types";

async function safeInvoke<T>(command: string, fallback: T, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch {
    return fallback;
  }
}

export async function loadDesktopStatus(): Promise<DesktopStatus> {
  return safeInvoke("get_desktop_status", fallbackStatus);
}

export async function scanEmptyFolders(rootPath: string, ignoredFileNames: string[] = []): Promise<EmptyFolderScan | null> {
  return safeInvoke("find_empty_folders", null, {
    rootPath,
    ignoredFileNames
  });
}

export async function previewLibraryReorder(
  rootPath: string,
  structure: OrganizerStructure,
  dateSource: OrganizerDateSource,
  renameMode: OrganizerRenameMode,
  unknownFolderName: string
): Promise<OrganizerPreview | null> {
  return safeInvoke("preview_library_reorder", null, {
    rootPath,
    structure,
    dateSource,
    renameMode,
    unknownFolderName
  });
}

export async function applyLibraryReorder(
  rootPath: string,
  structure: OrganizerStructure,
  dateSource: OrganizerDateSource,
  renameMode: OrganizerRenameMode,
  unknownFolderName: string
): Promise<OrganizerApplyResult | null> {
  return safeInvoke("apply_library_reorder", null, {
    rootPath,
    structure,
    dateSource,
    renameMode,
    unknownFolderName
  });
}

export async function pickDirectory(): Promise<string | null> {
  try {
    const selection = await open({
      directory: true,
      multiple: false
    });

    return typeof selection === "string" ? selection : null;
  } catch {
    return null;
  }
}
