export type ModuleId = "organizer" | "cleanup";

export type RouteId = "home" | ModuleId | "settings";

export type OrganizerStructure = "year" | "yearMonth" | "yearMonthDay";
export type OrganizerDateSource = "metadata" | "name" | "nameThenMetadata";
export type OrganizerRenameMode = "keep" | "dateStamp";
export type OrganizerResolvedDateSource = "metadata" | "name" | "unknown";

export type ModuleDescriptor = {
  id: ModuleId;
  navLabel: string;
  badge: string;
  title: string;
  intro: string;
  outcome: string;
  nextActionLabel: string;
};

export type AppBlueprint = {
  name: string;
  modules: ModuleDescriptor[];
};

export type DesktopStatus = {
  tauriConnected: boolean;
  platform: string;
  appVersion: string;
};

export type EmptyFolderTreeNode = {
  name: string;
  path: string;
  isEmpty: boolean;
  children: EmptyFolderTreeNode[];
};

export type EmptyFolderScan = {
  rootPath: string;
  emptyFolderCount: number;
  tree: EmptyFolderTreeNode | null;
};

export type OrganizerPreviewSummary = {
  mediaFileCount: number;
  plannedMoveCount: number;
  alreadyOrganizedCount: number;
  folderCount: number;
  unknownDateCount: number;
  collisionCount: number;
  renamedByRuleCount: number;
  resolvedFromNameCount: number;
  resolvedFromMetadataCount: number;
};

export type OrganizerDestinationGroup = {
  relativePath: string;
  fileCount: number;
  sampleNames: string[];
};

export type OrganizerMovePreview = {
  sourcePath: string;
  relativeSourcePath: string;
  sourceName: string;
  destinationPath: string;
  relativeDestinationPath: string;
  destinationName: string;
  collisionResolved: boolean;
  renamedByRule: boolean;
  resolvedDateSource: OrganizerResolvedDateSource;
};

export type OrganizerPreview = {
  rootPath: string;
  summary: OrganizerPreviewSummary;
  groups: OrganizerDestinationGroup[];
  sampleMoves: OrganizerMovePreview[];
};

export type OrganizerApplyResult = {
  rootPath: string;
  plannedMoveCount: number;
  movedCount: number;
  failedCount: number;
  folderCount: number;
  unknownDateCount: number;
  collisionCount: number;
  renamedByRuleCount: number;
  resolvedFromNameCount: number;
  resolvedFromMetadataCount: number;
};

export type LocalizedModule = {
  navLabel: string;
  badge: string;
  title: string;
  intro: string;
  outcome: string;
  nextActionLabel: string;
};

export type TranslationDictionary = {
  app: {
    name: string;
    navigationLabel: string;
    homeLabel: string;
    settingsLabel: string;
    settingsActionLabel: string;
    selectedRootLabel: string;
    noDirectorySelected: string;
    shortcutsTitle: string;
    highlightsLabel: string;
    settingsTitle: string;
    settingsLanguageTitle: string;
    settingsLanguageRestartNote: string;
    settingsLoadedLanguageLabel: string;
    settingsSavedLanguageLabel: string;
    settingsOrganizerTitle: string;
    settingsOrganizerDescription: string;
    settingsOrganizerStructureLabel: string;
    settingsOrganizerStructureYearLabel: string;
    settingsOrganizerStructureMonthLabel: string;
    settingsOrganizerStructureDayLabel: string;
    settingsOrganizerDateSourceLabel: string;
    settingsOrganizerDateSourceMetadataLabel: string;
    settingsOrganizerDateSourceNameLabel: string;
    settingsOrganizerDateSourceNameThenMetadataLabel: string;
    settingsOrganizerRenameLabel: string;
    settingsOrganizerRenameKeepLabel: string;
    settingsOrganizerRenameDateLabel: string;
    settingsOrganizerRenameHint: string;
    settingsOrganizerUnknownFolderLabel: string;
    settingsOrganizerUnknownFolderPlaceholder: string;
    settingsOrganizerUnknownFolderHint: string;
    settingsOrganizerSaveLabel: string;
    settingsCleanupIgnoreTitle: string;
    settingsCleanupIgnoreDescription: string;
    settingsCleanupIgnoreInputLabel: string;
    settingsCleanupIgnorePlaceholder: string;
    settingsCleanupIgnoreAddLabel: string;
    settingsCleanupIgnoreHint: string;
    settingsCleanupIgnoreEmpty: string;
    settingsCleanupIgnoreRemoveLabel: string;
    organizerPreviewActionLabel: string;
    organizerApplyActionLabel: string;
    organizerPreviewingLabel: string;
    organizerApplyingLabel: string;
    organizerPreviewTitle: string;
    organizerPreviewDescription: string;
    organizerDestinationsTitle: string;
    organizerDestinationsDescription: string;
    organizerMovesTitle: string;
    organizerMovesDescription: string;
    organizerMediaCountLabel: string;
    organizerPlannedMovesLabel: string;
    organizerOrganizedCountLabel: string;
    organizerFoldersLabel: string;
    organizerUnknownDateLabel: string;
    organizerCollisionsLabel: string;
    organizerRenamedCountLabel: string;
    organizerResolvedFromNameLabel: string;
    organizerResolvedFromMetadataLabel: string;
    organizerChooseRootTitle: string;
    organizerChooseRootBody: string;
    organizerNoMediaTitle: string;
    organizerNoMediaBody: string;
    organizerNoChangesTitle: string;
    organizerNoChangesBody: string;
    organizerPreviewErrorTitle: string;
    organizerPreviewErrorBody: string;
    organizerStructureCardLabel: string;
    organizerDateSourceCardLabel: string;
    organizerRenameCardLabel: string;
    organizerUnknownFolderCardLabel: string;
    organizerSourceLabel: string;
    organizerDestinationLabel: string;
    organizerCollisionBadge: string;
    organizerRenamedBadge: string;
    organizerFromNameBadge: string;
    organizerFromMetadataBadge: string;
    organizerMoreBadge: string;
    cleanupRescanActionLabel: string;
    cleanupScanningLabel: string;
    cleanupTreeTitle: string;
    cleanupGraphTitle: string;
    cleanupGraphDescription: string;
    cleanupEmptyCountLabel: string;
    cleanupBranchesLabel: string;
    cleanupDeepestLevelLabel: string;
    cleanupIgnoredFilesLabel: string;
    cleanupLevelLabel: string;
    cleanupPathsLabel: string;
    cleanupNoFoldersFoundTitle: string;
    cleanupNoFoldersFoundBody: string;
    cleanupChooseRootTitle: string;
    cleanupChooseRootBody: string;
    cleanupTreePathLabel: string;
    cleanupEmptyBadge: string;
    cleanupScanErrorTitle: string;
    cleanupScanErrorBody: string;
  };
  messages: {
    previewMode: string;
    cancelled: string;
    nativeDialogOnly: string;
    selectionReady: string;
    languageSaved: string;
    organizerPreviewReady: string;
    organizerPreviewEmpty: string;
    organizerPreviewFailed: string;
    organizerApplyReady: string;
    organizerApplyPartial: string;
    organizerApplyFailed: string;
    cleanupIgnoreSaved: string;
    cleanupScanReady: string;
    cleanupScanEmpty: string;
    cleanupScanFailed: string;
  };
  modules: Record<ModuleId, LocalizedModule>;
};

export type LocaleDefinition = {
  id: string;
  name: string;
  dictionary: TranslationDictionary;
};
