import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { buildBlueprint, fallbackStatus } from "./data/workbench";
import {
  applyLibraryReorder,
  loadDesktopStatus,
  pickDirectory,
  previewLibraryReorder,
  scanEmptyFolders
} from "./lib/bridge";
import { availableLocales, getLocaleById, persistLocale, resolveInitialLocaleId } from "./lib/i18n";
import { sendNativeNotification } from "./lib/notifications";
import {
  normalizeIgnoredFileName,
  persistOrganizerDateSource,
  persistOrganizerRenameMode,
  normalizeOrganizerUnknownFolderName,
  persistCleanupIgnoredFileNames,
  persistOrganizerStructure,
  persistOrganizerUnknownFolderName,
  resolveCleanupIgnoredFileNames,
  resolveOrganizerDateSource,
  resolveOrganizerRenameMode,
  resolveOrganizerStructure,
  resolveOrganizerUnknownFolderName
} from "./lib/preferences";
import type {
  DesktopStatus,
  EmptyFolderScan,
  EmptyFolderTreeNode,
  ModuleDescriptor,
  ModuleId,
  OrganizerDateSource,
  OrganizerPreview,
  OrganizerRenameMode,
  OrganizerResolvedDateSource,
  OrganizerStructure,
  RouteId,
  TranslationDictionary
} from "./lib/types";

type SelectedRoots = Partial<Record<ModuleId, string>>;
type MessageKey = keyof TranslationDictionary["messages"];

type MessageState =
  | {
      key: "cancelled";
      moduleId: ModuleId;
    }
  | {
      key: "selectionReady";
      moduleId: ModuleId;
      path: string;
    }
  | {
      key: "languageSaved";
      localeName: string;
    }
  | {
      key: "organizerPreviewReady";
      count: number;
    }
  | {
      key: "organizerApplyReady";
      movedCount: number;
      folderCount: number;
    }
  | {
      key: "organizerApplyPartial";
      movedCount: number;
      failedCount: number;
    }
  | {
      key: "cleanupIgnoreSaved";
      count: number;
    }
  | {
      key: "cleanupScanReady";
      count: number;
    }
  | {
      key: Exclude<
        MessageKey,
        | "cancelled"
        | "selectionReady"
        | "languageSaved"
        | "organizerPreviewReady"
        | "organizerApplyReady"
        | "organizerApplyPartial"
        | "cleanupIgnoreSaved"
        | "cleanupScanReady"
      >;
    };

type IconName =
  | "check_circle"
  | "close"
  | "delete_sweep"
  | "error"
  | "folder"
  | "home"
  | "info"
  | "photo_library"
  | "settings"
  | "warning";
type SettingsTabId = "general" | ModuleId;
type ToastSeverity = "error" | "info" | "success" | "warning";
type CleanupScanState =
  | {
      phase: "idle" | "scanning" | "error";
      result: null;
    }
  | {
      phase: "ready";
      result: EmptyFolderScan;
    };
type OrganizerPreviewState =
  | {
      phase: "idle" | "previewing" | "error";
      result: null;
    }
  | {
      phase: "ready";
      result: OrganizerPreview;
    };

type SidebarItemProps = {
  active: boolean;
  label: string;
  route: RouteId;
  onSelect: (route: RouteId) => void;
};

type ShortcutCardProps = {
  label: string;
  route: RouteId;
  onSelect: (route: RouteId) => void;
};

type ToastItem = {
  id: number;
  message: string;
  severity: ToastSeverity;
};

type CleanupDepthStat = {
  depth: number;
  emptyCount: number;
};

type NativeNavigationPayload = {
  route: string;
};

type ToastCardProps = {
  onDismiss: (id: number) => void;
  toast: ToastItem;
};

type OrganizerPageProps = {
  dateSource: OrganizerDateSource;
  dictionary: TranslationDictionary;
  isApplying: boolean;
  module: ModuleDescriptor;
  onApply: () => void;
  onPickDirectory: (moduleId: ModuleId) => void;
  onRunPreview: (rootPath: string) => void;
  previewState: OrganizerPreviewState;
  renameMode: OrganizerRenameMode;
  selectedRoot?: string;
  structure: OrganizerStructure;
  unknownFolderName: string;
};

type CleanupPageProps = {
  dictionary: TranslationDictionary;
  ignoredFileNames: string[];
  module: ModuleDescriptor;
  onPickDirectory: (moduleId: ModuleId) => void;
  onRunScan: (rootPath: string) => void;
  scanState: CleanupScanState;
  selectedRoot?: string;
};

type SettingsPageProps = {
  activeLocaleName: string;
  canAddCleanupIgnoredFile: boolean;
  canSaveOrganizerUnknownFolder: boolean;
  cleanupIgnoredFileInput: string;
  cleanupIgnoredFileNames: string[];
  dictionary: TranslationDictionary;
  modules: ModuleDescriptor[];
  onAddCleanupIgnoredFile: () => void;
  onChangeCleanupIgnoredFileInput: (value: string) => void;
  onChangeOrganizerUnknownFolderInput: (value: string) => void;
  onCommitOrganizerUnknownFolderName: () => void;
  onPickDirectory: (moduleId: ModuleId) => void;
  onRemoveCleanupIgnoredFile: (name: string) => void;
  onSelectLocale: (localeId: string) => void;
  onSelectOrganizerDateSource: (dateSource: OrganizerDateSource) => void;
  onSelectOrganizerRenameMode: (renameMode: OrganizerRenameMode) => void;
  onSelectOrganizerStructure: (structure: OrganizerStructure) => void;
  organizerDateSource: OrganizerDateSource;
  organizerRenameMode: OrganizerRenameMode;
  organizerStructure: OrganizerStructure;
  organizerUnknownFolderInput: string;
  organizerUnknownFolderName: string;
  pendingLocaleId: string;
  selectedRoots: SelectedRoots;
};

function formatTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => tokens[key] ?? "");
}

function getMessageText(message: MessageState, dictionary: TranslationDictionary): string {
  const template = dictionary.messages[message.key];

  if (message.key === "cancelled") {
    return formatTemplate(template, {
      actionLabel: dictionary.modules[message.moduleId].nextActionLabel
    });
  }

  if (message.key === "selectionReady") {
    return formatTemplate(template, {
      actionLabel: dictionary.modules[message.moduleId].nextActionLabel,
      path: message.path
    });
  }

  if (message.key === "languageSaved") {
    return formatTemplate(template, {
      localeName: message.localeName
    });
  }

  if (message.key === "organizerPreviewReady") {
    return formatTemplate(template, {
      count: String(message.count)
    });
  }

  if (message.key === "organizerApplyReady") {
    return formatTemplate(template, {
      movedCount: String(message.movedCount),
      folderCount: String(message.folderCount)
    });
  }

  if (message.key === "organizerApplyPartial") {
    return formatTemplate(template, {
      movedCount: String(message.movedCount),
      failedCount: String(message.failedCount)
    });
  }

  if (message.key === "cleanupIgnoreSaved" || message.key === "cleanupScanReady") {
    return formatTemplate(template, {
      count: String(message.count)
    });
  }

  return template;
}

function buildNativeNotification(
  dictionary: TranslationDictionary,
  message: MessageState
): { body: string; title: string } | null {
  const body = getMessageText(message, dictionary);

  if (
    message.key === "organizerApplyReady" ||
    message.key === "organizerApplyPartial" ||
    message.key === "organizerApplyFailed" ||
    message.key === "organizerPreviewFailed"
  ) {
    return {
      title: dictionary.modules.organizer.title,
      body
    };
  }

  if (
    message.key === "cleanupScanReady" ||
    message.key === "cleanupScanEmpty" ||
    message.key === "cleanupScanFailed"
  ) {
    return {
      title: dictionary.modules.cleanup.title,
      body
    };
  }

  return null;
}

function isRouteId(value: string): value is RouteId {
  return value === "home" || value === "organizer" || value === "cleanup" || value === "settings";
}

function countEmptyFoldersInNode(node: EmptyFolderTreeNode): number {
  return Number(node.isEmpty) + node.children.reduce((total, child) => total + countEmptyFoldersInNode(child), 0);
}

function countBranchNodes(node: EmptyFolderTreeNode): number {
  return Number(node.children.length > 0) + node.children.reduce((total, child) => total + countBranchNodes(child), 0);
}

function findDeepestCleanupLevel(node: EmptyFolderTreeNode, depth = 0): number {
  if (node.children.length === 0) {
    return depth;
  }

  return Math.max(...node.children.map((child) => findDeepestCleanupLevel(child, depth + 1)));
}

function buildCleanupDepthStats(node: EmptyFolderTreeNode): CleanupDepthStat[] {
  const levels = new Map<number, CleanupDepthStat>();

  const visit = (current: EmptyFolderTreeNode, depth: number) => {
    const existingLevel = levels.get(depth) ?? {
      depth,
      emptyCount: 0
    };

    if (current.isEmpty) {
      existingLevel.emptyCount += 1;
    }

    levels.set(depth, existingLevel);
    current.children.forEach((child) => visit(child, depth + 1));
  };

  visit(node, 0);

  return [...levels.values()].sort((left, right) => left.depth - right.depth);
}

function getToastSeverity(message: MessageState): ToastSeverity {
  if (
    message.key === "selectionReady" ||
    message.key === "languageSaved" ||
    message.key === "organizerPreviewReady" ||
    message.key === "organizerApplyReady" ||
    message.key === "cleanupIgnoreSaved" ||
    message.key === "cleanupScanReady"
  ) {
    return "success";
  }

  if (message.key === "cancelled" || message.key === "nativeDialogOnly" || message.key === "organizerApplyPartial") {
    return "warning";
  }

  if (
    message.key === "organizerPreviewFailed" ||
    message.key === "organizerApplyFailed" ||
    message.key === "cleanupScanFailed"
  ) {
    return "error";
  }

  return "info";
}

function getToastDuration(message: MessageState): number {
  const severity = getToastSeverity(message);

  if (message.key === "previewMode") {
    return 6000;
  }

  if (severity === "error") {
    return 7000;
  }

  if (severity === "warning") {
    return 5200;
  }

  if (severity === "success") {
    return 3600;
  }

  return 4200;
}

function getIconName(route: RouteId): IconName {
  if (route === "home") {
    return "home";
  }

  if (route === "organizer") {
    return "photo_library";
  }

  if (route === "cleanup") {
    return "delete_sweep";
  }

  return "settings";
}

function getOrganizerStructureLabel(
  dictionary: TranslationDictionary,
  structure: OrganizerStructure
): string {
  if (structure === "year") {
    return dictionary.app.settingsOrganizerStructureYearLabel;
  }

  return structure === "yearMonth"
    ? dictionary.app.settingsOrganizerStructureMonthLabel
    : dictionary.app.settingsOrganizerStructureDayLabel;
}

function getOrganizerDateSourceLabel(
  dictionary: TranslationDictionary,
  dateSource: OrganizerDateSource
): string {
  if (dateSource === "name") {
    return dictionary.app.settingsOrganizerDateSourceNameLabel;
  }

  if (dateSource === "nameThenMetadata") {
    return dictionary.app.settingsOrganizerDateSourceNameThenMetadataLabel;
  }

  return dictionary.app.settingsOrganizerDateSourceMetadataLabel;
}

function getOrganizerRenameModeLabel(
  dictionary: TranslationDictionary,
  renameMode: OrganizerRenameMode
): string {
  return renameMode === "dateStamp"
    ? dictionary.app.settingsOrganizerRenameDateLabel
    : dictionary.app.settingsOrganizerRenameKeepLabel;
}

function getOrganizerResolvedSourceBadge(
  dictionary: TranslationDictionary,
  resolvedDateSource: OrganizerResolvedDateSource
): string | null {
  if (resolvedDateSource === "name") {
    return dictionary.app.organizerFromNameBadge;
  }

  if (resolvedDateSource === "metadata") {
    return dictionary.app.organizerFromMetadataBadge;
  }

  return null;
}

function getPathLeaf(path?: string): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function MaterialIcon({
  className,
  filled = false,
  name
}: {
  className?: string;
  filled?: boolean;
  name: IconName;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined${filled ? " filled" : ""}${className ? ` ${className}` : ""}`}
    >
      {name}
    </span>
  );
}

function BrandGlyph() {
  return <MaterialIcon className="brand-glyph" filled name="folder" />;
}

function SettingsTabButton({
  active,
  iconName,
  label,
  note,
  onClick
}: {
  active: boolean;
  iconName: IconName;
  label: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className={`settings-tab-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span className="settings-tab-icon">
        <MaterialIcon className="glyph" filled={active} name={iconName} />
      </span>
      <span className="settings-tab-copy">
        <span className="settings-tab-label">{label}</span>
        <span className="settings-tab-note">{note}</span>
      </span>
    </button>
  );
}

function SettingsMetricCard({
  label,
  note,
  value
}: {
  label: string;
  note?: string;
  value: number | string;
}) {
  return (
    <article className="settings-metric-card">
      <p className="summary-label">{label}</p>
      <strong className="settings-metric-value">{value}</strong>
      {note ? <p className="settings-metric-note">{note}</p> : null}
    </article>
  );
}

function SettingsBlockHeader({
  text,
  title
}: {
  text?: string;
  title: string;
}) {
  return (
    <div className="settings-block-header">
      <h4 className="settings-block-title">{title}</h4>
      {text ? <p className="settings-block-text">{text}</p> : null}
    </div>
  );
}

function SidebarItem({ active, label, route, onSelect }: SidebarItemProps) {
  return (
    <button
      className={`sidebar-item ${active ? "active" : ""}`}
      type="button"
      onClick={() => onSelect(route)}
    >
      <span className="sidebar-item-icon">
        <MaterialIcon className="glyph" filled={active} name={getIconName(route)} />
      </span>
      <span className="sidebar-item-label">{label}</span>
    </button>
  );
}

function ShortcutCard({ label, route, onSelect }: ShortcutCardProps) {
  return (
    <button className="shortcut-card" type="button" onClick={() => onSelect(route)}>
      <span className="shortcut-card-icon">
        <MaterialIcon className="glyph" name={getIconName(route)} />
      </span>
      <span className="shortcut-card-label">{label}</span>
    </button>
  );
}

function getToastIconName(severity: ToastSeverity): IconName {
  if (severity === "success") {
    return "check_circle";
  }

  if (severity === "warning") {
    return "warning";
  }

  if (severity === "error") {
    return "error";
  }

  return "info";
}

function ToastCard({ onDismiss, toast }: ToastCardProps) {
  return (
    <article
      aria-atomic="true"
      className={`toast-card toast-${toast.severity}`}
      role={toast.severity === "error" ? "alert" : "status"}
    >
      <span className="toast-icon-shell">
        <MaterialIcon className="glyph" filled name={getToastIconName(toast.severity)} />
      </span>
      <p className="toast-message">{toast.message}</p>
      <button className="toast-dismiss" type="button" onClick={() => onDismiss(toast.id)}>
        <MaterialIcon className="glyph" name="close" />
      </button>
    </article>
  );
}

function ToastTray({
  onDismiss,
  toasts
}: {
  onDismiss: (id: number) => void;
  toasts: ToastItem[];
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <section aria-live="polite" aria-relevant="additions" className="toast-tray">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} onDismiss={onDismiss} toast={toast} />
      ))}
    </section>
  );
}

function HomePage({
  dictionary,
  onSelectRoute
}: {
  dictionary: TranslationDictionary;
  onSelectRoute: (route: RouteId) => void;
}) {
  return (
    <div className="page page-home">
      <section className="panel panel-home">
        <div className="page-heading">
          <h2 className="panel-title">{dictionary.app.shortcutsTitle}</h2>
        </div>

        <div className="shortcut-grid">
          <ShortcutCard
            label={dictionary.modules.organizer.title}
            route="organizer"
            onSelect={onSelectRoute}
          />
          <ShortcutCard
            label={dictionary.modules.cleanup.title}
            route="cleanup"
            onSelect={onSelectRoute}
          />
          <ShortcutCard
            label={dictionary.app.settingsActionLabel}
            route="settings"
            onSelect={onSelectRoute}
          />
        </div>
      </section>
    </div>
  );
}

function TreeBadge({
  label,
  variant
}: {
  label: string;
  variant: "branch" | "empty";
}) {
  return <span className={`tree-badge tree-badge-${variant}`}>{label}</span>;
}

function IgnoreFilePills({
  files,
  onRemove,
  removeLabelTemplate
}: {
  files: string[];
  onRemove?: (fileName: string) => void;
  removeLabelTemplate?: string;
}) {
  return (
    <div className="token-list">
      {files.map((fileName) => (
        <span className={`token-chip${onRemove ? " token-chip-actionable" : ""}`} key={fileName}>
          <span className="token-chip-label">{fileName}</span>
          {onRemove ? (
            <button
              aria-label={formatTemplate(removeLabelTemplate ?? "Remove {name}", {
                name: fileName
              })}
              className="token-chip-dismiss"
              type="button"
              onClick={() => onRemove(fileName)}
            >
              <MaterialIcon className="glyph" name="close" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function OrganizerPage({
  dateSource,
  dictionary,
  isApplying,
  module,
  onApply,
  onPickDirectory,
  onRunPreview,
  previewState,
  renameMode,
  selectedRoot,
  structure,
  unknownFolderName
}: OrganizerPageProps) {
  const preview = previewState.phase === "ready" ? previewState.result : null;
  const summary = preview?.summary ?? null;
  const mediaCount = summary?.mediaFileCount ?? 0;
  const plannedMoveCount = summary?.plannedMoveCount ?? 0;
  const folderCount = summary?.folderCount ?? 0;
  const collisionCount = summary?.collisionCount ?? 0;
  const renamedByRuleCount = summary?.renamedByRuleCount ?? 0;
  const unknownDateCount = summary?.unknownDateCount ?? 0;
  const groups = preview?.groups.slice(0, 6) ?? [];
  const hiddenGroupCount = preview ? Math.max(preview.groups.length - groups.length, 0) : 0;
  const sampleMoves = preview?.sampleMoves ?? [];
  const hasPlannedMoves = plannedMoveCount > 0;

  return (
    <div className="page page-organizer">
      <section className="panel panel-organizer">
        <div className="page-heading">
          <h2 className="panel-title">{module.title}</h2>
          <p className="panel-copy">{module.intro}</p>
        </div>

        <div className="organizer-layout">
          <section className="organizer-sidebar">
            <div className="action-stack">
              <button className="accent-button" type="button" onClick={() => onPickDirectory(module.id)}>
                <span className="accent-button-icon">
                  <MaterialIcon className="glyph" filled name={getIconName(module.id)} />
                </span>
                <span className="accent-button-copy">{module.nextActionLabel}</span>
              </button>

              {selectedRoot ? (
                <button className="secondary-button" type="button" onClick={() => onRunPreview(selectedRoot)}>
                  {dictionary.app.organizerPreviewActionLabel}
                </button>
              ) : null}

              {selectedRoot && hasPlannedMoves ? (
                <button
                  className="accent-button"
                  disabled={isApplying || previewState.phase === "previewing"}
                  type="button"
                  onClick={onApply}
                >
                  <span className="accent-button-icon">
                    <MaterialIcon className="glyph" filled name="folder" />
                  </span>
                  <span className="accent-button-copy">
                    {isApplying ? dictionary.app.organizerApplyingLabel : dictionary.app.organizerApplyActionLabel}
                  </span>
                </button>
              ) : null}
            </div>

            <div className="root-preview">
              <p className="selection-label">{dictionary.app.selectedRootLabel}</p>
              <p className="selection-value">{selectedRoot ?? dictionary.app.noDirectorySelected}</p>
            </div>

            <div className="organizer-summary-grid">
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.organizerMediaCountLabel}</p>
                <strong className="summary-value">{mediaCount}</strong>
              </div>
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.organizerPlannedMovesLabel}</p>
                <strong className="summary-value">{plannedMoveCount}</strong>
              </div>
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.organizerFoldersLabel}</p>
                <strong className="summary-value">{folderCount}</strong>
              </div>
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.organizerRenamedCountLabel}</p>
                <strong className="summary-value">{renamedByRuleCount}</strong>
              </div>
            </div>

            <div className="rule-strip">
              <span className="rule-pill">{getOrganizerStructureLabel(dictionary, structure)}</span>
              <span className="rule-pill">{getOrganizerDateSourceLabel(dictionary, dateSource)}</span>
              <span className="rule-pill">{getOrganizerRenameModeLabel(dictionary, renameMode)}</span>
              <span className="rule-pill">{unknownFolderName}</span>
              <span className="rule-pill">{unknownDateCount} {dictionary.app.organizerUnknownDateLabel}</span>
              <span className="rule-pill">{collisionCount} {dictionary.app.organizerCollisionsLabel}</span>
            </div>
          </section>

          <section className="organizer-results">
            {!selectedRoot ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.organizerChooseRootTitle}</h3>
                <p className="settings-section-text">{dictionary.app.organizerChooseRootBody}</p>
              </div>
            ) : null}

            {selectedRoot && previewState.phase === "previewing" ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.organizerPreviewingLabel}</h3>
                <p className="settings-section-text">{dictionary.app.organizerPreviewDescription}</p>
              </div>
            ) : null}

            {selectedRoot && isApplying ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.organizerApplyingLabel}</h3>
                <p className="settings-section-text">{module.outcome}</p>
              </div>
            ) : null}

            {selectedRoot && previewState.phase === "error" ? (
              <div className="cleanup-empty-state cleanup-empty-state-error">
                <h3 className="settings-section-title">{dictionary.app.organizerPreviewErrorTitle}</h3>
                <p className="settings-section-text">{dictionary.app.organizerPreviewErrorBody}</p>
              </div>
            ) : null}

            {selectedRoot &&
            preview &&
            previewState.phase === "ready" &&
            !isApplying &&
            mediaCount === 0 ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.organizerNoMediaTitle}</h3>
                <p className="settings-section-text">{dictionary.app.organizerNoMediaBody}</p>
              </div>
            ) : null}

            {selectedRoot &&
            preview &&
            previewState.phase === "ready" &&
            !isApplying &&
            mediaCount > 0 &&
            plannedMoveCount === 0 ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.organizerNoChangesTitle}</h3>
                <p className="settings-section-text">{dictionary.app.organizerNoChangesBody}</p>
              </div>
            ) : null}

            {selectedRoot && preview && previewState.phase === "ready" && hasPlannedMoves && !isApplying ? (
              <div className="organizer-visual-grid">
                <div className="organizer-card-shell">
                  <div className="cleanup-results-header">
                    <div className="settings-section-copy">
                      <h3 className="settings-section-title">{dictionary.app.organizerDestinationsTitle}</h3>
                      <p className="settings-section-text">{dictionary.app.organizerDestinationsDescription}</p>
                    </div>
                    <TreeBadge
                      label={`${folderCount} ${dictionary.app.organizerFoldersLabel}`}
                      variant="branch"
                    />
                  </div>

                  <div className="organizer-destination-list">
                    {groups.map((group) => (
                      <article className="organizer-destination-row" key={group.relativePath}>
                        <div className="organizer-destination-copy">
                          <p className="organizer-destination-path">{group.relativePath}</p>
                          <p className="organizer-destination-samples">{group.sampleNames.join(" · ")}</p>
                        </div>
                        <TreeBadge label={`${group.fileCount}`} variant="branch" />
                      </article>
                    ))}

                    {hiddenGroupCount > 0 ? (
                      <p className="settings-inline-note">
                        +{hiddenGroupCount} {dictionary.app.organizerMoreBadge}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="organizer-card-shell">
                  <div className="cleanup-results-header">
                    <div className="settings-section-copy">
                      <h3 className="settings-section-title">{dictionary.app.organizerMovesTitle}</h3>
                      <p className="settings-section-text">{dictionary.app.organizerMovesDescription}</p>
                    </div>
                    <TreeBadge
                      label={`${plannedMoveCount} ${dictionary.app.organizerPlannedMovesLabel}`}
                      variant="empty"
                    />
                  </div>

                  <div className="organizer-move-list">
                    {sampleMoves.map((move) => (
                      <article
                        className="organizer-move-row"
                        key={`${move.sourcePath}->${move.destinationPath}`}
                      >
                        <div className="organizer-move-column">
                          <p className="selection-label">{dictionary.app.organizerSourceLabel}</p>
                          <p className="organizer-move-path">{move.relativeSourcePath}</p>
                        </div>
                        <div className="organizer-move-arrow" aria-hidden="true">
                          →
                        </div>
                        <div className="organizer-move-column organizer-move-column-destination">
                          <p className="selection-label">{dictionary.app.organizerDestinationLabel}</p>
                          <div className="organizer-move-target">
                            <p className="organizer-move-path">
                              {move.relativeDestinationPath}/{move.destinationName}
                            </p>
                            {getOrganizerResolvedSourceBadge(dictionary, move.resolvedDateSource) ? (
                              <TreeBadge
                                label={getOrganizerResolvedSourceBadge(dictionary, move.resolvedDateSource) ?? ""}
                                variant="branch"
                              />
                            ) : null}
                            {move.renamedByRule ? (
                              <TreeBadge label={dictionary.app.organizerRenamedBadge} variant="empty" />
                            ) : null}
                            {move.collisionResolved ? (
                              <TreeBadge label={dictionary.app.organizerCollisionBadge} variant="empty" />
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function EmptyFolderTree({
  depth = 0,
  dictionary,
  node
}: {
  depth?: number;
  dictionary: TranslationDictionary;
  node: EmptyFolderTreeNode;
}) {
  const hasChildren = node.children.length > 0;
  const emptyCount = countEmptyFoldersInNode(node);

  if (!hasChildren) {
    return (
      <li className="tree-item tree-item-leaf">
        <div className="tree-row">
          <div className="tree-row-copy">
            <span className="tree-bullet" aria-hidden="true" />
            <span className="tree-label">{node.name}</span>
          </div>
          <TreeBadge label={dictionary.app.cleanupEmptyBadge} variant="empty" />
        </div>
      </li>
    );
  }

  return (
    <li className="tree-item tree-item-branch">
      <details className="tree-details" open={depth === 0}>
        <summary className="tree-row">
          <div className="tree-row-copy">
            <span className="tree-label">{node.name}</span>
          </div>
          <div className="tree-row-metrics">
            <TreeBadge label={`${emptyCount} ${dictionary.app.cleanupEmptyBadge}`} variant="empty" />
            <TreeBadge label={`${node.children.length} ${dictionary.app.cleanupPathsLabel}`} variant="branch" />
          </div>
        </summary>

        <ul className="tree-list">
          {node.children.map((child) => (
            <EmptyFolderTree
              depth={depth + 1}
              dictionary={dictionary}
              key={child.path}
              node={child}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

function CleanupDepthGraph({
  dictionary,
  ignoredFileNames,
  node
}: {
  dictionary: TranslationDictionary;
  ignoredFileNames: string[];
  node: EmptyFolderTreeNode;
}) {
  const depthStats = buildCleanupDepthStats(node);
  const maxEmptyCount = Math.max(...depthStats.map((level) => level.emptyCount), 1);
  const branchCount = countBranchNodes(node);
  const deepestLevel = findDeepestCleanupLevel(node);

  return (
    <section className="cleanup-graph-shell">
      <div className="cleanup-results-header cleanup-graph-header">
        <div className="settings-section-copy">
          <h3 className="settings-section-title">{dictionary.app.cleanupGraphTitle}</h3>
          <p className="settings-section-text">{dictionary.app.cleanupGraphDescription}</p>
        </div>
      </div>

      <div className="cleanup-graph-summary">
        <div className="summary-card summary-card-compact">
          <p className="summary-label">{dictionary.app.cleanupBranchesLabel}</p>
          <strong className="summary-value">{branchCount}</strong>
        </div>
        <div className="summary-card summary-card-compact">
          <p className="summary-label">{dictionary.app.cleanupDeepestLevelLabel}</p>
          <strong className="summary-value">{deepestLevel}</strong>
        </div>
        <div className="summary-card summary-card-compact">
          <p className="summary-label">{dictionary.app.cleanupIgnoredFilesLabel}</p>
          <strong className="summary-value">{ignoredFileNames.length}</strong>
        </div>
      </div>

      <div className="cleanup-graph-list">
        {depthStats.map((level) => (
          <div className="cleanup-graph-row" key={level.depth}>
            <span className="cleanup-graph-depth">
              {dictionary.app.cleanupLevelLabel} {level.depth}
            </span>
            <div className="cleanup-graph-track" aria-hidden="true">
              <span
                className="cleanup-graph-fill"
                style={{
                  width:
                    level.emptyCount === 0
                      ? "6px"
                      : `${Math.max((level.emptyCount / maxEmptyCount) * 100, 10)}%`
                }}
              />
            </div>
            <span className="cleanup-graph-value">{level.emptyCount}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CleanupPage({
  dictionary,
  ignoredFileNames,
  module,
  onPickDirectory,
  onRunScan,
  scanState,
  selectedRoot
}: CleanupPageProps) {
  const cleanupTree = scanState.phase === "ready" ? scanState.result.tree : null;
  const cleanupRootPath = scanState.phase === "ready" ? scanState.result.rootPath : selectedRoot ?? "";
  const showTree = cleanupTree !== null;
  const emptyCount = scanState.phase === "ready" ? scanState.result.emptyFolderCount : 0;

  return (
    <div className="page page-cleanup">
      <section className="panel panel-cleanup">
        <div className="page-heading">
          <h2 className="panel-title">{module.title}</h2>
          <p className="panel-copy">{module.intro}</p>
        </div>

        <div className="cleanup-layout">
          <section className="cleanup-sidebar">
            <button className="accent-button" type="button" onClick={() => onPickDirectory(module.id)}>
              <span className="accent-button-icon">
                <MaterialIcon className="glyph" filled name={getIconName(module.id)} />
              </span>
              <span className="accent-button-copy">{module.nextActionLabel}</span>
            </button>

            {selectedRoot ? (
              <button className="secondary-button" type="button" onClick={() => onRunScan(selectedRoot)}>
                {dictionary.app.cleanupRescanActionLabel}
              </button>
            ) : null}

            <div className="root-preview">
              <p className="selection-label">{dictionary.app.selectedRootLabel}</p>
              <p className="selection-value">{selectedRoot ?? dictionary.app.noDirectorySelected}</p>
            </div>

            <div className="cleanup-summary-grid">
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.cleanupEmptyCountLabel}</p>
                <strong className="summary-value">{emptyCount}</strong>
              </div>
              <div className="summary-card">
                <p className="summary-label">{dictionary.app.cleanupIgnoredFilesLabel}</p>
                <strong className="summary-value cleanup-summary-value">{ignoredFileNames.length}</strong>
              </div>
            </div>

            <div className="cleanup-ignore-preview">
              <p className="selection-label">{dictionary.app.cleanupIgnoredFilesLabel}</p>
              {ignoredFileNames.length > 0 ? (
                <IgnoreFilePills files={ignoredFileNames} />
              ) : (
                <p className="settings-inline-note">{dictionary.app.settingsCleanupIgnoreEmpty}</p>
              )}
            </div>
          </section>

          <section className="cleanup-results">
            {!selectedRoot ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.cleanupChooseRootTitle}</h3>
                <p className="settings-section-text">{dictionary.app.cleanupChooseRootBody}</p>
              </div>
            ) : null}

            {selectedRoot && scanState.phase === "scanning" ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.cleanupScanningLabel}</h3>
                <p className="settings-section-text">{module.outcome}</p>
              </div>
            ) : null}

            {selectedRoot && scanState.phase === "error" ? (
              <div className="cleanup-empty-state cleanup-empty-state-error">
                <h3 className="settings-section-title">{dictionary.app.cleanupScanErrorTitle}</h3>
                <p className="settings-section-text">{dictionary.app.cleanupScanErrorBody}</p>
              </div>
            ) : null}

            {selectedRoot && scanState.phase === "ready" && !scanState.result.tree ? (
              <div className="cleanup-empty-state">
                <h3 className="settings-section-title">{dictionary.app.cleanupNoFoldersFoundTitle}</h3>
                <p className="settings-section-text">{dictionary.app.cleanupNoFoldersFoundBody}</p>
              </div>
            ) : null}

            {showTree ? (
              <div className="cleanup-visual-grid">
                <CleanupDepthGraph
                  dictionary={dictionary}
                  ignoredFileNames={ignoredFileNames}
                  node={cleanupTree}
                />

                <div className="cleanup-tree-shell">
                  <div className="cleanup-results-header">
                    <div className="settings-section-copy">
                      <h3 className="settings-section-title">{dictionary.app.cleanupTreeTitle}</h3>
                      <p className="settings-section-text">{dictionary.app.cleanupTreePathLabel}</p>
                    </div>
                    <TreeBadge label={`${emptyCount} ${dictionary.app.cleanupEmptyCountLabel}`} variant="empty" />
                  </div>

                  <div className="cleanup-tree-root">
                    <p className="selection-label">{dictionary.app.selectedRootLabel}</p>
                    <p className="selection-value">{cleanupRootPath}</p>
                  </div>

                  <ul className="tree-list tree-list-root">
                    <EmptyFolderTree dictionary={dictionary} node={cleanupTree} />
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function SettingsPage({
  activeLocaleName,
  canAddCleanupIgnoredFile,
  canSaveOrganizerUnknownFolder,
  cleanupIgnoredFileInput,
  cleanupIgnoredFileNames,
  dictionary,
  modules,
  onAddCleanupIgnoredFile,
  onChangeCleanupIgnoredFileInput,
  onChangeOrganizerUnknownFolderInput,
  onCommitOrganizerUnknownFolderName,
  onPickDirectory,
  onRemoveCleanupIgnoredFile,
  onSelectLocale,
  onSelectOrganizerDateSource,
  onSelectOrganizerRenameMode,
  onSelectOrganizerStructure,
  organizerDateSource,
  organizerRenameMode,
  organizerStructure,
  organizerUnknownFolderInput,
  organizerUnknownFolderName,
  pendingLocaleId,
  selectedRoots
}: SettingsPageProps) {
  const pendingLocaleName = getLocaleById(pendingLocaleId).name;
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const activeModule = activeTab === "general" ? null : modules.find((module) => module.id === activeTab);
  const isCleanupTab = activeModule?.id === "cleanup";
  const isOrganizerTab = activeModule?.id === "organizer";
  const organizerRootPath = selectedRoots.organizer;
  const cleanupRootPath = selectedRoots.cleanup;
  const organizerRootName = getPathLeaf(organizerRootPath);
  const cleanupRootName = getPathLeaf(cleanupRootPath);
  const activeHeaderEyebrow = activeTab === "general" ? dictionary.app.settingsLabel : activeModule?.badge ?? "";
  const activeHeaderTitle = activeTab === "general" ? dictionary.app.settingsTitle : activeModule?.title ?? "";
  const activeHeaderText =
    activeTab === "general" ? dictionary.app.settingsLanguageRestartNote : activeModule?.intro ?? "";
  const headerMetaItems =
    activeTab === "general"
      ? [activeLocaleName, pendingLocaleName]
      : [activeModule?.navLabel, getPathLeaf(selectedRoots[activeTab])].filter(
          (item): item is string => Boolean(item)
        );

  return (
    <div className="page page-settings">
      <section className="panel panel-settings">
        <div className="page-heading">
          <h2 className="panel-title">{dictionary.app.settingsTitle}</h2>
        </div>

        <div className="settings-layout">
          <nav className="settings-tabs" aria-label={dictionary.app.settingsTitle}>
            <p className="settings-sidebar-label">{dictionary.app.settingsTitle}</p>

            <SettingsTabButton
              active={activeTab === "general"}
              iconName="settings"
              label={dictionary.app.settingsLanguageTitle}
              note={activeLocaleName}
              onClick={() => setActiveTab("general")}
            />

            {modules.map((module) => (
              <SettingsTabButton
                active={activeTab === module.id}
                iconName={getIconName(module.id)}
                key={module.id}
                label={module.title}
                note={getPathLeaf(selectedRoots[module.id]) ?? module.badge}
                onClick={() => setActiveTab(module.id)}
              />
            ))}
          </nav>

          <section className="settings-detail" aria-live="polite">
            <div className="settings-detail-header">
              <div className="settings-detail-hero">
                <span className="settings-section-icon">
                  <MaterialIcon
                    className="glyph"
                    filled
                    name={activeModule ? getIconName(activeModule.id) : "settings"}
                  />
                </span>
                <div className="settings-section-copy">
                  <p className="settings-section-eyebrow">{activeHeaderEyebrow}</p>
                  <h3 className="settings-section-title">{activeHeaderTitle}</h3>
                  <p className="settings-section-text">{activeHeaderText}</p>
                </div>
              </div>

              {headerMetaItems.length > 0 ? (
                <div className="settings-header-meta">
                  {headerMetaItems.map((item) => (
                    <span className="settings-header-chip" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {activeTab === "general" ? (
              <>
                <div className="settings-overview-grid">
                  <SettingsMetricCard
                    label={dictionary.app.settingsLoadedLanguageLabel}
                    value={activeLocaleName}
                  />
                  <SettingsMetricCard
                    label={dictionary.app.settingsSavedLanguageLabel}
                    value={pendingLocaleName}
                  />
                </div>

                <div className="settings-block">
                  <SettingsBlockHeader title={dictionary.app.settingsLanguageTitle} />
                  <label className="field-shell" htmlFor="settings-language-select">
                    <span className="field-label">{dictionary.app.settingsLanguageTitle}</span>
                    <select
                      className="language-select"
                      id="settings-language-select"
                      value={pendingLocaleId}
                      onChange={(event) => onSelectLocale(event.target.value)}
                    >
                      {availableLocales.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : activeModule ? (
              <>
                <div className="settings-overview-grid">
                  <SettingsMetricCard
                    label={dictionary.app.selectedRootLabel}
                    note={
                      activeModule.id === "organizer"
                        ? organizerRootName
                          ? organizerRootPath
                          : undefined
                        : cleanupRootName
                          ? cleanupRootPath
                          : undefined
                    }
                    value={
                      activeModule.id === "organizer"
                        ? organizerRootName ?? dictionary.app.noDirectorySelected
                        : cleanupRootName ?? dictionary.app.noDirectorySelected
                    }
                  />

                  {isOrganizerTab ? (
                    <>
                      <SettingsMetricCard
                        label={dictionary.app.settingsOrganizerStructureLabel}
                        value={getOrganizerStructureLabel(dictionary, organizerStructure)}
                      />
                      <SettingsMetricCard
                        label={dictionary.app.settingsOrganizerDateSourceLabel}
                        value={getOrganizerDateSourceLabel(dictionary, organizerDateSource)}
                      />
                      <SettingsMetricCard
                        label={dictionary.app.settingsOrganizerRenameLabel}
                        value={getOrganizerRenameModeLabel(dictionary, organizerRenameMode)}
                      />
                      <SettingsMetricCard
                        label={dictionary.app.settingsOrganizerUnknownFolderLabel}
                        value={organizerUnknownFolderName}
                      />
                    </>
                  ) : null}

                  {isCleanupTab ? (
                    <SettingsMetricCard
                      label={dictionary.app.settingsCleanupIgnoreTitle}
                      value={cleanupIgnoredFileNames.length}
                    />
                  ) : null}
                </div>

                <div className="settings-block">
                  <SettingsBlockHeader
                    text={activeModule.nextActionLabel}
                    title={dictionary.app.selectedRootLabel}
                  />
                  <button
                    className="accent-button settings-action-button"
                    type="button"
                    onClick={() => onPickDirectory(activeModule.id)}
                  >
                    <span className="accent-button-icon">
                      <MaterialIcon className="glyph" filled name={getIconName(activeModule.id)} />
                    </span>
                    <span className="accent-button-copy">{activeModule.nextActionLabel}</span>
                  </button>

                  <div className="root-preview">
                    <p className="selection-label">{dictionary.app.selectedRootLabel}</p>
                    <p className="selection-value">
                      {selectedRoots[activeModule.id] ?? dictionary.app.noDirectorySelected}
                    </p>
                  </div>
                </div>

                {isOrganizerTab ? (
                  <>
                    <section className="settings-block settings-subsection">
                      <SettingsBlockHeader
                        text={dictionary.app.settingsOrganizerDescription}
                        title={dictionary.app.settingsOrganizerTitle}
                      />

                      <div className="settings-form-grid">
                        <label className="field-shell" htmlFor="organizer-structure-select">
                          <span className="field-label">{dictionary.app.settingsOrganizerStructureLabel}</span>
                          <select
                            className="language-select"
                            id="organizer-structure-select"
                            value={organizerStructure}
                            onChange={(event) =>
                              onSelectOrganizerStructure(event.target.value as OrganizerStructure)
                            }
                          >
                            <option value="year">{dictionary.app.settingsOrganizerStructureYearLabel}</option>
                            <option value="yearMonth">{dictionary.app.settingsOrganizerStructureMonthLabel}</option>
                            <option value="yearMonthDay">
                              {dictionary.app.settingsOrganizerStructureDayLabel}
                            </option>
                          </select>
                        </label>

                        <label className="field-shell" htmlFor="organizer-date-source-select">
                          <span className="field-label">{dictionary.app.settingsOrganizerDateSourceLabel}</span>
                          <select
                            className="language-select"
                            id="organizer-date-source-select"
                            value={organizerDateSource}
                            onChange={(event) =>
                              onSelectOrganizerDateSource(event.target.value as OrganizerDateSource)
                            }
                          >
                            <option value="metadata">
                              {dictionary.app.settingsOrganizerDateSourceMetadataLabel}
                            </option>
                            <option value="name">{dictionary.app.settingsOrganizerDateSourceNameLabel}</option>
                            <option value="nameThenMetadata">
                              {dictionary.app.settingsOrganizerDateSourceNameThenMetadataLabel}
                            </option>
                          </select>
                        </label>

                        <label className="field-shell" htmlFor="organizer-rename-mode-select">
                          <span className="field-label">{dictionary.app.settingsOrganizerRenameLabel}</span>
                          <select
                            className="language-select"
                            id="organizer-rename-mode-select"
                            value={organizerRenameMode}
                            onChange={(event) =>
                              onSelectOrganizerRenameMode(event.target.value as OrganizerRenameMode)
                            }
                          >
                            <option value="keep">{dictionary.app.settingsOrganizerRenameKeepLabel}</option>
                            <option value="dateStamp">{dictionary.app.settingsOrganizerRenameDateLabel}</option>
                          </select>
                        </label>

                        <label className="field-shell field-shell-span" htmlFor="organizer-unknown-folder-input">
                          <span className="field-label">{dictionary.app.settingsOrganizerUnknownFolderLabel}</span>
                          <div className="settings-inline-field">
                            <input
                              className="text-input"
                              id="organizer-unknown-folder-input"
                              placeholder={dictionary.app.settingsOrganizerUnknownFolderPlaceholder}
                              type="text"
                              value={organizerUnknownFolderInput}
                              onChange={(event) => onChangeOrganizerUnknownFolderInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" || !canSaveOrganizerUnknownFolder) {
                                  return;
                                }

                                event.preventDefault();
                                onCommitOrganizerUnknownFolderName();
                              }}
                            />
                            <button
                              className="secondary-button secondary-button-compact"
                              disabled={!canSaveOrganizerUnknownFolder}
                              type="button"
                              onClick={onCommitOrganizerUnknownFolderName}
                            >
                              {dictionary.app.settingsOrganizerSaveLabel}
                            </button>
                          </div>
                        </label>
                      </div>

                      <p className="settings-inline-note">{dictionary.app.settingsOrganizerRenameHint}</p>
                      <p className="settings-inline-note">{dictionary.app.settingsOrganizerUnknownFolderHint}</p>
                    </section>
                  </>
                ) : null}

                {isCleanupTab ? (
                  <section className="settings-block settings-subsection">
                    <SettingsBlockHeader
                      text={dictionary.app.settingsCleanupIgnoreDescription}
                      title={dictionary.app.settingsCleanupIgnoreTitle}
                    />

                    <label className="field-shell" htmlFor="cleanup-ignore-input">
                      <span className="field-label">{dictionary.app.settingsCleanupIgnoreInputLabel}</span>
                      <div className="settings-inline-field">
                        <input
                          className="text-input"
                          id="cleanup-ignore-input"
                          placeholder={dictionary.app.settingsCleanupIgnorePlaceholder}
                          type="text"
                          value={cleanupIgnoredFileInput}
                          onChange={(event) => onChangeCleanupIgnoredFileInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || !canAddCleanupIgnoredFile) {
                              return;
                            }

                            event.preventDefault();
                            onAddCleanupIgnoredFile();
                          }}
                        />
                        <button
                          className="secondary-button secondary-button-compact"
                          disabled={!canAddCleanupIgnoredFile}
                          type="button"
                          onClick={onAddCleanupIgnoredFile}
                        >
                          {dictionary.app.settingsCleanupIgnoreAddLabel}
                        </button>
                      </div>
                    </label>

                    <p className="settings-inline-note">{dictionary.app.settingsCleanupIgnoreHint}</p>

                    {cleanupIgnoredFileNames.length > 0 ? (
                      <IgnoreFilePills
                        files={cleanupIgnoredFileNames}
                        onRemove={onRemoveCleanupIgnoredFile}
                        removeLabelTemplate={dictionary.app.settingsCleanupIgnoreRemoveLabel}
                      />
                    ) : (
                      <p className="settings-inline-note">{dictionary.app.settingsCleanupIgnoreEmpty}</p>
                    )}
                  </section>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function App() {
  const initialLocaleId = resolveInitialLocaleId();
  const [activeRoute, setActiveRoute] = useState<RouteId>("home");
  const [activeLocaleId] = useState<string>(initialLocaleId);
  const [pendingLocaleId, setPendingLocaleId] = useState<string>(initialLocaleId);
  const [organizerStructure, setOrganizerStructure] = useState<OrganizerStructure>(() =>
    resolveOrganizerStructure()
  );
  const [organizerDateSource, setOrganizerDateSource] = useState<OrganizerDateSource>(() =>
    resolveOrganizerDateSource()
  );
  const [organizerRenameMode, setOrganizerRenameMode] = useState<OrganizerRenameMode>(() =>
    resolveOrganizerRenameMode()
  );
  const [organizerUnknownFolderName, setOrganizerUnknownFolderName] = useState(() =>
    resolveOrganizerUnknownFolderName()
  );
  const [organizerUnknownFolderInput, setOrganizerUnknownFolderInput] = useState(() =>
    resolveOrganizerUnknownFolderName()
  );
  const [cleanupIgnoredFileNames, setCleanupIgnoredFileNames] = useState<string[]>(() =>
    resolveCleanupIgnoredFileNames()
  );
  const [cleanupIgnoredFileInput, setCleanupIgnoredFileInput] = useState("");
  const [status, setStatus] = useState<DesktopStatus>(fallbackStatus);
  const [selectedRoots, setSelectedRoots] = useState<SelectedRoots>({});
  const [organizerPreviewState, setOrganizerPreviewState] = useState<OrganizerPreviewState>({
    phase: "idle",
    result: null
  });
  const [organizerApplying, setOrganizerApplying] = useState(false);
  const [cleanupScanState, setCleanupScanState] = useState<CleanupScanState>({
    phase: "idle",
    result: null
  });
  const organizerPreviewRequestRef = useRef(0);
  const organizerApplyRequestRef = useRef(0);
  const cleanupScanRequestRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef(new Map<number, number>());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const locale = getLocaleById(activeLocaleId);
  const dictionary = locale.dictionary;
  const blueprint = buildBlueprint(dictionary);

  const modulesById = blueprint.modules.reduce<Record<ModuleId, ModuleDescriptor>>(
    (accumulator, module) => {
      accumulator[module.id] = module;
      return accumulator;
    },
    {} as Record<ModuleId, ModuleDescriptor>
  );
  const activeRouteLabel =
    activeRoute === "home"
      ? dictionary.app.homeLabel
      : activeRoute === "settings"
        ? dictionary.app.settingsLabel
        : modulesById[activeRoute].title;
  const normalizedCleanupIgnoredFileInput = normalizeIgnoredFileName(cleanupIgnoredFileInput);
  const canAddCleanupIgnoredFile =
    normalizedCleanupIgnoredFileInput !== null &&
    !cleanupIgnoredFileNames.some(
      (fileName) => fileName.toLowerCase() === normalizedCleanupIgnoredFileInput.toLowerCase()
    );
  const normalizedOrganizerUnknownFolderInput = normalizeOrganizerUnknownFolderName(organizerUnknownFolderInput);
  const canSaveOrganizerUnknownFolder =
    normalizedOrganizerUnknownFolderInput !== organizerUnknownFolderName;

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: null | (() => void) = null;

    const bindNativeMenu = async () => {
      try {
        unlisten = await listen<NativeNavigationPayload>("app:navigate", (event) => {
          if (!active || !isRouteId(event.payload.route)) {
            return;
          }

          setActiveRoute(event.payload.route);
        });
      } catch {
        // Preview mode does not expose the native menu event bridge.
      }
    };

    void bindNativeMenu();

    return () => {
      active = false;

      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const dismissToast = (id: number) => {
    const timeoutId = toastTimeoutsRef.current.get(id);

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const notify = (message: MessageState) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    const messageText = getMessageText(message, dictionary);
    const severity = getToastSeverity(message);

    const toast: ToastItem = {
      id,
      message: messageText,
      severity
    };

    setToasts((current) => [...current.slice(-3), toast]);

    const timeoutId = window.setTimeout(() => {
      dismissToast(id);
    }, getToastDuration(message));

    toastTimeoutsRef.current.set(id, timeoutId);

    if (!status.tauriConnected) {
      return;
    }

    const nativeNotification = buildNativeNotification(dictionary, message);

    if (!nativeNotification) {
      return;
    }

    void sendNativeNotification(nativeNotification);
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const desktopStatus = await loadDesktopStatus();

      if (!active) {
        return;
      }

      setStatus(desktopStatus);

      if (!desktopStatus.tauriConnected) {
        notify({ key: "previewMode" });
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const handleLocaleSelection = (localeId: string) => {
    setPendingLocaleId(localeId);
    persistLocale(localeId);
    notify({
      key: "languageSaved",
      localeName: getLocaleById(localeId).name
    });
  };

  const handleRouteSelection = (route: RouteId) => {
    setActiveRoute(route);
  };

  const handleOrganizerPreview = async (rootPath: string, options?: { silent?: boolean }) => {
    const requestId = organizerPreviewRequestRef.current + 1;
    organizerPreviewRequestRef.current = requestId;
    setOrganizerPreviewState({
      phase: "previewing",
      result: null
    });

    const result = await previewLibraryReorder(
      rootPath,
      organizerStructure,
      organizerDateSource,
      organizerRenameMode,
      organizerUnknownFolderName
    );

    if (organizerPreviewRequestRef.current !== requestId) {
      return;
    }

    if (!result) {
      setOrganizerPreviewState({
        phase: "error",
        result: null
      });

      if (!options?.silent) {
        notify({ key: "organizerPreviewFailed" });
      }

      return;
    }

    setOrganizerPreviewState({
      phase: "ready",
      result
    });

    if (options?.silent) {
      return;
    }

    if (result.summary.plannedMoveCount > 0) {
      notify({
        key: "organizerPreviewReady",
        count: result.summary.plannedMoveCount
      });
      return;
    }

    notify({ key: "organizerPreviewEmpty" });
  };

  const handleOrganizerApply = async () => {
    if (!selectedRoots.organizer || organizerApplying) {
      return;
    }

    const requestId = organizerApplyRequestRef.current + 1;
    organizerApplyRequestRef.current = requestId;
    setOrganizerApplying(true);

    const result = await applyLibraryReorder(
      selectedRoots.organizer,
      organizerStructure,
      organizerDateSource,
      organizerRenameMode,
      organizerUnknownFolderName
    );

    if (organizerApplyRequestRef.current !== requestId) {
      return;
    }

    setOrganizerApplying(false);

    if (!result) {
      notify({ key: "organizerApplyFailed" });
      return;
    }

    if (result.failedCount > 0) {
      notify({
        key: "organizerApplyPartial",
        movedCount: result.movedCount,
        failedCount: result.failedCount
      });
    } else {
      notify({
        key: "organizerApplyReady",
        movedCount: result.movedCount,
        folderCount: result.folderCount
      });
    }

    await handleOrganizerPreview(selectedRoots.organizer, {
      silent: true
    });
  };

  const handleCleanupScan = async (rootPath: string, ignoredFileNames = cleanupIgnoredFileNames) => {
    const requestId = cleanupScanRequestRef.current + 1;
    cleanupScanRequestRef.current = requestId;
    setCleanupScanState({
      phase: "scanning",
      result: null
    });

    const result = await scanEmptyFolders(rootPath, ignoredFileNames);

    if (cleanupScanRequestRef.current !== requestId) {
      return;
    }

    if (!result) {
      setCleanupScanState({
        phase: "error",
        result: null
      });
      notify({ key: "cleanupScanFailed" });
      return;
    }

    setCleanupScanState({
      phase: "ready",
      result
    });

    if (result.emptyFolderCount > 0) {
      notify({
        key: "cleanupScanReady",
        count: result.emptyFolderCount
      });
      return;
    }

    notify({ key: "cleanupScanEmpty" });
  };

  useEffect(() => {
    if (!selectedRoots.organizer) {
      return;
    }

    void handleOrganizerPreview(selectedRoots.organizer, {
      silent: true
    });
  }, [organizerStructure, organizerDateSource, organizerRenameMode, organizerUnknownFolderName]);

  const applyCleanupIgnoredFileNames = (fileNames: string[]) => {
    setCleanupIgnoredFileNames(fileNames);
    persistCleanupIgnoredFileNames(fileNames);
    notify({
      key: "cleanupIgnoreSaved",
      count: fileNames.length
    });

    if (selectedRoots.cleanup) {
      void handleCleanupScan(selectedRoots.cleanup, fileNames);
    }
  };

  const handleAddCleanupIgnoredFile = () => {
    if (!normalizedCleanupIgnoredFileInput || !canAddCleanupIgnoredFile) {
      return;
    }

    applyCleanupIgnoredFileNames([...cleanupIgnoredFileNames, normalizedCleanupIgnoredFileInput]);
    setCleanupIgnoredFileInput("");
  };

  const handleRemoveCleanupIgnoredFile = (fileName: string) => {
    applyCleanupIgnoredFileNames(cleanupIgnoredFileNames.filter((entry) => entry !== fileName));
  };

  const handleOrganizerStructureSelection = (structure: OrganizerStructure) => {
    setOrganizerStructure(structure);
    persistOrganizerStructure(structure);
  };

  const handleOrganizerDateSourceSelection = (dateSource: OrganizerDateSource) => {
    setOrganizerDateSource(dateSource);
    persistOrganizerDateSource(dateSource);
  };

  const handleOrganizerRenameModeSelection = (renameMode: OrganizerRenameMode) => {
    setOrganizerRenameMode(renameMode);
    persistOrganizerRenameMode(renameMode);
  };

  const handleCommitOrganizerUnknownFolderName = () => {
    if (!canSaveOrganizerUnknownFolder) {
      return;
    }

    setOrganizerUnknownFolderName(normalizedOrganizerUnknownFolderInput);
    setOrganizerUnknownFolderInput(normalizedOrganizerUnknownFolderInput);
    persistOrganizerUnknownFolderName(normalizedOrganizerUnknownFolderInput);
  };

  const handlePickDirectory = async (moduleId: ModuleId) => {
    const selected = await pickDirectory();

    if (!selected) {
      notify(
        status.tauriConnected
          ? { key: "cancelled", moduleId }
          : { key: "nativeDialogOnly" }
      );
      return;
    }

    setSelectedRoots((current) => ({
      ...current,
      [moduleId]: selected
    }));
    notify({
      key: "selectionReady",
      moduleId,
      path: selected
    });

    if (moduleId === "cleanup") {
      void handleCleanupScan(selected, cleanupIgnoredFileNames);
      return;
    }

    if (moduleId === "organizer") {
      void handleOrganizerPreview(selected);
    }
  };

  const renderPage = () => {
    if (activeRoute === "home") {
      return <HomePage dictionary={dictionary} onSelectRoute={handleRouteSelection} />;
    }

    if (activeRoute === "settings") {
      return (
        <SettingsPage
          activeLocaleName={locale.name}
          canAddCleanupIgnoredFile={canAddCleanupIgnoredFile}
          canSaveOrganizerUnknownFolder={canSaveOrganizerUnknownFolder}
          cleanupIgnoredFileInput={cleanupIgnoredFileInput}
          cleanupIgnoredFileNames={cleanupIgnoredFileNames}
          dictionary={dictionary}
          modules={blueprint.modules}
          onAddCleanupIgnoredFile={handleAddCleanupIgnoredFile}
          onChangeCleanupIgnoredFileInput={setCleanupIgnoredFileInput}
          onChangeOrganizerUnknownFolderInput={setOrganizerUnknownFolderInput}
          onCommitOrganizerUnknownFolderName={handleCommitOrganizerUnknownFolderName}
          onPickDirectory={handlePickDirectory}
          onRemoveCleanupIgnoredFile={handleRemoveCleanupIgnoredFile}
          onSelectLocale={handleLocaleSelection}
          onSelectOrganizerDateSource={handleOrganizerDateSourceSelection}
          onSelectOrganizerRenameMode={handleOrganizerRenameModeSelection}
          onSelectOrganizerStructure={handleOrganizerStructureSelection}
          organizerDateSource={organizerDateSource}
          organizerRenameMode={organizerRenameMode}
          organizerStructure={organizerStructure}
          organizerUnknownFolderInput={organizerUnknownFolderInput}
          organizerUnknownFolderName={organizerUnknownFolderName}
          pendingLocaleId={pendingLocaleId}
          selectedRoots={selectedRoots}
        />
      );
    }

    if (activeRoute === "cleanup") {
      return (
        <CleanupPage
          dictionary={dictionary}
          ignoredFileNames={cleanupIgnoredFileNames}
          module={modulesById.cleanup}
          onPickDirectory={handlePickDirectory}
          onRunScan={handleCleanupScan}
          scanState={cleanupScanState}
          selectedRoot={selectedRoots.cleanup}
        />
      );
    }

    return (
      <OrganizerPage
        dateSource={organizerDateSource}
        dictionary={dictionary}
        isApplying={organizerApplying}
        module={modulesById.organizer}
        onApply={handleOrganizerApply}
        onPickDirectory={handlePickDirectory}
        onRunPreview={(rootPath) => void handleOrganizerPreview(rootPath)}
        previewState={organizerPreviewState}
        renameMode={organizerRenameMode}
        selectedRoot={selectedRoots.organizer}
        structure={organizerStructure}
        unknownFolderName={organizerUnknownFolderName}
      />
    );
  };

  return (
    <main className="app-shell">
      <div className="app-frame">
        <aside className="sidebar">
          <section className="brand-panel">
            <div className="brand-row">
              <BrandGlyph />
              <h1 className="brand-title">{blueprint.name}</h1>
            </div>
          </section>

          <nav className="sidebar-nav" aria-label={dictionary.app.navigationLabel}>
            <SidebarItem
              active={activeRoute === "home"}
              label={dictionary.app.homeLabel}
              route="home"
              onSelect={handleRouteSelection}
            />
            {blueprint.modules.map((module) => (
              <SidebarItem
                active={activeRoute === module.id}
                key={module.id}
                label={module.navLabel}
                route={module.id}
                onSelect={handleRouteSelection}
              />
            ))}
          </nav>

          <div className="sidebar-footer">
            <SidebarItem
              active={activeRoute === "settings"}
              label={dictionary.app.settingsLabel}
              route="settings"
              onSelect={handleRouteSelection}
            />
          </div>
        </aside>

        <section className="content-shell">
          <header className="content-header">
            <p className="content-header-app">{blueprint.name}</p>
            <p className="content-header-route">{activeRouteLabel}</p>
          </header>
          <section className="view-shell">{renderPage()}</section>
        </section>
      </div>
      <ToastTray onDismiss={dismissToast} toasts={toasts} />
    </main>
  );
}

export default App;
