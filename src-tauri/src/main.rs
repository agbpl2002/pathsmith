#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Timelike};
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
#[cfg(not(target_os = "macos"))]
use tauri::menu::HELP_SUBMENU_ID;
use tauri::{
    menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID},
    AppHandle, Emitter,
};

const APP_NAVIGATE_EVENT: &str = "app:navigate";
const MENU_OPEN_SETTINGS: &str = "open_settings";
const MENU_NAVIGATE_HOME: &str = "navigate_home";
const MENU_NAVIGATE_ORGANIZER: &str = "navigate_organizer";
const MENU_NAVIGATE_CLEANUP: &str = "navigate_cleanup";
const MAX_ORGANIZER_SAMPLE_MOVES: usize = 10;
const MAX_ORGANIZER_GROUP_SAMPLE_NAMES: usize = 3;
const DEFAULT_UNKNOWN_FOLDER_NAME: &str = "Unknown date";
const MEDIA_EXTENSIONS: &[&str] = &[
    "3gp", "avi", "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "m4v", "mkv", "mov", "mp4",
    "mpeg", "mpg", "mts", "m2ts", "png", "tif", "tiff", "webm", "webp",
];

type NativeMenu = Menu<tauri::Wry>;
type NativeSubmenu = Submenu<tauri::Wry>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus {
    tauri_connected: bool,
    platform: String,
    app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmptyFolderTreeNode {
    name: String,
    path: String,
    is_empty: bool,
    children: Vec<EmptyFolderTreeNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmptyFolderScan {
    root_path: String,
    empty_folder_count: usize,
    tree: Option<EmptyFolderTreeNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizerPreviewSummary {
    media_file_count: usize,
    planned_move_count: usize,
    already_organized_count: usize,
    folder_count: usize,
    unknown_date_count: usize,
    collision_count: usize,
    renamed_by_rule_count: usize,
    resolved_from_name_count: usize,
    resolved_from_metadata_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizerDestinationGroup {
    relative_path: String,
    file_count: usize,
    sample_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizerMovePreview {
    source_path: String,
    relative_source_path: String,
    source_name: String,
    destination_path: String,
    relative_destination_path: String,
    destination_name: String,
    collision_resolved: bool,
    renamed_by_rule: bool,
    resolved_date_source: OrganizerResolvedDateSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizerPreview {
    root_path: String,
    summary: OrganizerPreviewSummary,
    groups: Vec<OrganizerDestinationGroup>,
    sample_moves: Vec<OrganizerMovePreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizerApplyResult {
    root_path: String,
    planned_move_count: usize,
    moved_count: usize,
    failed_count: usize,
    folder_count: usize,
    unknown_date_count: usize,
    collision_count: usize,
    renamed_by_rule_count: usize,
    resolved_from_name_count: usize,
    resolved_from_metadata_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NavigationEventPayload {
    route: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrganizerDateStructure {
    Year,
    YearMonthDay,
    YearMonth,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrganizerDateSource {
    Metadata,
    Name,
    NameThenMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrganizerRenameMode {
    Keep,
    DateStamp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum OrganizerResolvedDateSource {
    Metadata,
    Name,
    Unknown,
}

#[derive(Debug, Clone)]
struct ResolvedOrganizerDate {
    value: Option<DateTime<Local>>,
    source: OrganizerResolvedDateSource,
}

#[derive(Debug, Clone)]
struct PlannedMove {
    source_path: PathBuf,
    destination_path: PathBuf,
    relative_source_path: String,
    relative_destination_path: String,
    source_name: String,
    destination_name: String,
    collision_resolved: bool,
    renamed_by_rule: bool,
    resolved_date_source: OrganizerResolvedDateSource,
}

#[derive(Debug, Default)]
struct OrganizerGroupAccumulator {
    file_count: usize,
    sample_names: Vec<String>,
}

#[derive(Debug, Clone)]
struct OrganizerPlan {
    preview: OrganizerPreview,
    planned_moves: Vec<PlannedMove>,
}

fn build_about_metadata(app: &AppHandle) -> AboutMetadata<'static> {
    let package = app.package_info();
    let bundle = &app.config().bundle;

    AboutMetadata {
        name: Some(package.name.clone()),
        version: Some(package.version.to_string()),
        copyright: bundle.copyright.clone(),
        authors: bundle.publisher.clone().map(|publisher| vec![publisher]),
        ..Default::default()
    }
}

fn build_workspace_menu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    Submenu::with_items(
        app,
        "Workspace",
        true,
        &[
            &MenuItemBuilder::with_id(MENU_NAVIGATE_HOME, "Home")
                .accelerator("CmdOrCtrl+1")
                .build(app)?,
            &MenuItemBuilder::with_id(MENU_NAVIGATE_ORGANIZER, "Library Organizer")
                .accelerator("CmdOrCtrl+2")
                .build(app)?,
            &MenuItemBuilder::with_id(MENU_NAVIGATE_CLEANUP, "Empty Folder Sweep")
                .accelerator("CmdOrCtrl+3")
                .build(app)?,
        ],
    )
}

#[cfg(target_os = "macos")]
fn build_app_submenu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    let app_name = app.package_info().name.clone();
    let about_metadata = build_about_metadata(app);

    Submenu::with_items(
        app,
        app_name,
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
            &MenuItemBuilder::with_id(MENU_OPEN_SETTINGS, "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

#[cfg(not(target_os = "macos"))]
fn build_file_menu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItemBuilder::with_id(MENU_OPEN_SETTINGS, "Settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

fn build_edit_menu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )
}

fn build_window_menu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}

#[cfg(not(target_os = "macos"))]
fn build_help_menu(app: &AppHandle) -> tauri::Result<NativeSubmenu> {
    Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[&PredefinedMenuItem::about(
            app,
            None,
            Some(build_about_metadata(app)),
        )?],
    )
}

fn build_native_menu(app: &AppHandle) -> tauri::Result<NativeMenu> {
    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    menu.append(&build_app_submenu(app)?)?;
    #[cfg(not(target_os = "macos"))]
    menu.append(&build_file_menu(app)?)?;

    menu.append(&build_workspace_menu(app)?)?;
    menu.append(&build_edit_menu(app)?)?;
    menu.append(&build_window_menu(app)?)?;

    #[cfg(not(target_os = "macos"))]
    menu.append(&build_help_menu(app)?)?;

    Ok(menu)
}

fn emit_navigation(app: &AppHandle, route: &str) {
    let _ = app.emit(
        APP_NAVIGATE_EVENT,
        NavigationEventPayload {
            route: route.to_string(),
        },
    );
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    if event.id() == MENU_OPEN_SETTINGS {
        emit_navigation(app, "settings");
        return;
    }

    if event.id() == MENU_NAVIGATE_HOME {
        emit_navigation(app, "home");
        return;
    }

    if event.id() == MENU_NAVIGATE_ORGANIZER {
        emit_navigation(app, "organizer");
        return;
    }

    if event.id() == MENU_NAVIGATE_CLEANUP {
        emit_navigation(app, "cleanup");
    }
}

fn node_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| path.display().to_string())
}

fn normalize_ignored_file_names(ignored_file_names: &[String]) -> HashSet<String> {
    ignored_file_names
        .iter()
        .map(|name| name.trim().to_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

fn is_ignored_file(path: &Path, ignored_file_names: &HashSet<String>) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| ignored_file_names.contains(&name.trim().to_lowercase()))
        .unwrap_or(false)
}

fn scan_empty_tree(
    path: &Path,
    ignored_file_names: &HashSet<String>,
) -> std::io::Result<Option<EmptyFolderTreeNode>> {
    let mut is_empty = true;
    let mut children = Vec::new();

    for entry_result in fs::read_dir(path)? {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => {
                is_empty = false;
                continue;
            }
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => {
                is_empty = false;
                continue;
            }
        };

        if file_type.is_symlink() {
            is_empty = false;
            continue;
        }

        let child_path = entry.path();

        if file_type.is_dir() {
            match scan_empty_tree(&child_path, ignored_file_names) {
                Ok(Some(node)) => {
                    children.push(node);
                    is_empty = false;
                }
                Ok(None) => {
                    is_empty = false;
                }
                Err(_) => {
                    is_empty = false;
                }
            }
        } else if is_ignored_file(&child_path, ignored_file_names) {
            continue;
        } else {
            is_empty = false;
        }
    }

    if is_empty || !children.is_empty() {
        return Ok(Some(EmptyFolderTreeNode {
            name: node_name(path),
            path: path.display().to_string(),
            is_empty,
            children,
        }));
    }

    Ok(None)
}

fn count_empty_folders(node: &EmptyFolderTreeNode) -> usize {
    usize::from(node.is_empty) + node.children.iter().map(count_empty_folders).sum::<usize>()
}

fn parse_organizer_structure(value: &str) -> OrganizerDateStructure {
    match value {
        "year" => OrganizerDateStructure::Year,
        "yearMonth" => OrganizerDateStructure::YearMonth,
        _ => OrganizerDateStructure::YearMonthDay,
    }
}

fn parse_organizer_date_source(value: &str) -> OrganizerDateSource {
    match value {
        "name" => OrganizerDateSource::Name,
        "nameThenMetadata" => OrganizerDateSource::NameThenMetadata,
        _ => OrganizerDateSource::Metadata,
    }
}

fn parse_organizer_rename_mode(value: &str) -> OrganizerRenameMode {
    match value {
        "dateStamp" => OrganizerRenameMode::DateStamp,
        _ => OrganizerRenameMode::Keep,
    }
}

fn normalize_unknown_folder_name(value: &str) -> String {
    let sanitized = value
        .trim()
        .chars()
        .map(|character| {
            if character == '/' || character == '\\' {
                '-'
            } else {
                character
            }
        })
        .collect::<String>();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return DEFAULT_UNKNOWN_FOLDER_NAME.to_string();
    }

    sanitized
}

fn is_media_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let normalized = extension.to_lowercase();
            MEDIA_EXTENSIONS
                .iter()
                .any(|candidate| candidate == &normalized.as_str())
        })
        .unwrap_or(false)
}

fn collect_media_files(path: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry_result in fs::read_dir(path)? {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        let child_path = entry.path();

        if file_type.is_dir() {
            collect_media_files(&child_path, files)?;
            continue;
        }

        if file_type.is_file() && is_media_file(&child_path) {
            files.push(child_path);
        }
    }

    Ok(())
}

fn resolve_metadata_date(path: &Path) -> Option<DateTime<Local>> {
    let metadata = fs::metadata(path).ok()?;
    let created = metadata.created().ok();
    let modified = metadata.modified().ok();
    let resolved_time = match (created, modified) {
        (Some(created), Some(modified)) => Some(if created <= modified {
            created
        } else {
            modified
        }),
        (Some(created), None) => Some(created),
        (None, Some(modified)) => Some(modified),
        (None, None) => None,
    }?;

    Some(DateTime::<Local>::from(resolved_time))
}

fn filename_date_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();

    REGEX.get_or_init(|| {
        Regex::new(
            r"(?P<year>19\d{2}|20\d{2})[-_. ]?(?P<month>0[1-9]|1[0-2])[-_. ]?(?P<day>0[1-9]|[12]\d|3[01])(?:[T _-]?(?P<hour>[01]\d|2[0-3])[-_:]?(?P<minute>[0-5]\d)(?:[-_:]?(?P<second>[0-5]\d))?)?",
        )
        .expect("filename date regex must compile")
    })
}

fn resolve_name_date(path: &Path) -> Option<DateTime<Local>> {
    let stem = path.file_stem()?.to_str()?;
    let captures = filename_date_regex().captures(stem)?;
    let year = captures.name("year")?.as_str().parse::<i32>().ok()?;
    let month = captures.name("month")?.as_str().parse::<u32>().ok()?;
    let day = captures.name("day")?.as_str().parse::<u32>().ok()?;
    let hour = captures
        .name("hour")
        .and_then(|value| value.as_str().parse::<u32>().ok())
        .unwrap_or(0);
    let minute = captures
        .name("minute")
        .and_then(|value| value.as_str().parse::<u32>().ok())
        .unwrap_or(0);
    let second = captures
        .name("second")
        .and_then(|value| value.as_str().parse::<u32>().ok())
        .unwrap_or(0);
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    let time = NaiveTime::from_hms_opt(hour, minute, second)?;
    let local_date_time = NaiveDateTime::new(date, time);

    Local
        .from_local_datetime(&local_date_time)
        .earliest()
        .or_else(|| Local.from_local_datetime(&local_date_time).latest())
}

fn resolve_organizer_date(path: &Path, date_source: OrganizerDateSource) -> ResolvedOrganizerDate {
    match date_source {
        OrganizerDateSource::Metadata => match resolve_metadata_date(path) {
            Some(value) => ResolvedOrganizerDate {
                value: Some(value),
                source: OrganizerResolvedDateSource::Metadata,
            },
            None => ResolvedOrganizerDate {
                value: None,
                source: OrganizerResolvedDateSource::Unknown,
            },
        },
        OrganizerDateSource::Name => match resolve_name_date(path) {
            Some(value) => ResolvedOrganizerDate {
                value: Some(value),
                source: OrganizerResolvedDateSource::Name,
            },
            None => ResolvedOrganizerDate {
                value: None,
                source: OrganizerResolvedDateSource::Unknown,
            },
        },
        OrganizerDateSource::NameThenMetadata => {
            if let Some(value) = resolve_name_date(path) {
                return ResolvedOrganizerDate {
                    value: Some(value),
                    source: OrganizerResolvedDateSource::Name,
                };
            }

            if let Some(value) = resolve_metadata_date(path) {
                return ResolvedOrganizerDate {
                    value: Some(value),
                    source: OrganizerResolvedDateSource::Metadata,
                };
            }

            ResolvedOrganizerDate {
                value: None,
                source: OrganizerResolvedDateSource::Unknown,
            }
        }
    }
}

fn build_relative_destination_dir(
    date: Option<DateTime<Local>>,
    structure: OrganizerDateStructure,
    unknown_folder_name: &str,
) -> (PathBuf, bool) {
    match date {
        Some(date) => {
            let year = date.format("%Y").to_string();
            let relative_path = match structure {
                OrganizerDateStructure::Year => PathBuf::from(year),
                OrganizerDateStructure::YearMonth => {
                    PathBuf::from(year).join(date.format("%m").to_string())
                }
                OrganizerDateStructure::YearMonthDay => PathBuf::from(year)
                    .join(date.format("%m").to_string())
                    .join(date.format("%d").to_string()),
            };

            (relative_path, false)
        }
        None => (PathBuf::from(unknown_folder_name), true),
    }
}

fn display_relative_path(path: &Path) -> String {
    let segments = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>();

    if segments.is_empty() {
        ".".to_string()
    } else {
        segments.join("/")
    }
}

fn file_stem_or_default(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "file".to_string())
}

fn extension_string(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn collision_name(stem: &str, extension: Option<&str>, suffix: usize) -> String {
    match extension {
        Some(extension) => format!("{stem}-{suffix}.{extension}"),
        None => format!("{stem}-{suffix}"),
    }
}

fn build_renamed_file_name(
    source_path: &Path,
    date: Option<DateTime<Local>>,
    rename_mode: OrganizerRenameMode,
) -> (String, bool) {
    let original_name = node_name(source_path);

    if rename_mode == OrganizerRenameMode::Keep {
        return (original_name, false);
    }

    let Some(date) = date else {
        return (original_name, false);
    };

    let has_time_component = date.hour() != 0 || date.minute() != 0 || date.second() != 0;
    let stem = if has_time_component {
        date.format("%Y%m%d-%H%M%S").to_string()
    } else {
        date.format("%Y%m%d").to_string()
    };
    let destination_name = match extension_string(source_path) {
        Some(extension) => format!("{stem}.{extension}"),
        None => stem,
    };

    (destination_name.clone(), destination_name != original_name)
}

fn reserve_destination_path(
    source_path: &Path,
    base_destination: &Path,
    reserved_destinations: &mut HashSet<PathBuf>,
) -> (PathBuf, bool) {
    let parent = base_destination
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let stem = file_stem_or_default(base_destination);
    let extension = extension_string(base_destination);
    let mut candidate = base_destination.to_path_buf();
    let mut suffix = 2;
    let mut collision_resolved = false;

    loop {
        if candidate == source_path {
            reserved_destinations.insert(candidate.clone());
            return (candidate, collision_resolved);
        }

        if !candidate.exists() && !reserved_destinations.contains(&candidate) {
            reserved_destinations.insert(candidate.clone());
            return (candidate, collision_resolved);
        }

        collision_resolved = true;
        candidate = parent.join(collision_name(&stem, extension.as_deref(), suffix));
        suffix += 1;
    }
}

fn build_reorder_plan(
    root_path: &str,
    structure: OrganizerDateStructure,
    date_source: OrganizerDateSource,
    rename_mode: OrganizerRenameMode,
    unknown_folder_name: &str,
) -> Result<OrganizerPlan, String> {
    let root = PathBuf::from(root_path);

    if !root.exists() {
        return Err("Selected folder no longer exists.".into());
    }

    if !root.is_dir() {
        return Err("Selected path is not a folder.".into());
    }

    let mut media_files = Vec::new();
    collect_media_files(&root, &mut media_files)
        .map_err(|error| format!("Failed to read media library: {error}"))?;
    media_files.sort();

    let mut reserved_destinations = HashSet::new();
    let mut planned_moves = Vec::new();
    let mut already_organized_count = 0;
    let mut unknown_date_count = 0;
    let mut collision_count = 0;
    let mut renamed_by_rule_count = 0;
    let mut resolved_from_name_count = 0;
    let mut resolved_from_metadata_count = 0;

    for source_path in media_files.iter() {
        let source_name = node_name(source_path);
        let resolved_date = resolve_organizer_date(source_path, date_source);

        if resolved_date.source == OrganizerResolvedDateSource::Name {
            resolved_from_name_count += 1;
        }

        if resolved_date.source == OrganizerResolvedDateSource::Metadata {
            resolved_from_metadata_count += 1;
        }

        let (relative_destination_dir, uses_unknown_date) = build_relative_destination_dir(
            resolved_date.value.clone(),
            structure,
            unknown_folder_name,
        );
        let destination_dir = root.join(&relative_destination_dir);
        let (planned_destination_name, renamed_by_rule) =
            build_renamed_file_name(source_path, resolved_date.value.clone(), rename_mode);
        let base_destination = destination_dir.join(&planned_destination_name);
        let (destination_path, collision_resolved) =
            reserve_destination_path(source_path, &base_destination, &mut reserved_destinations);

        if destination_path == *source_path {
            already_organized_count += 1;
            continue;
        }

        let destination_name = node_name(&destination_path);

        if uses_unknown_date {
            unknown_date_count += 1;
        }

        if collision_resolved {
            collision_count += 1;
        }

        if renamed_by_rule {
            renamed_by_rule_count += 1;
        }

        let relative_source_path = source_path
            .strip_prefix(&root)
            .map(display_relative_path)
            .unwrap_or_else(|_| source_path.display().to_string());

        planned_moves.push(PlannedMove {
            source_path: source_path.clone(),
            destination_path: destination_path.clone(),
            relative_source_path,
            relative_destination_path: display_relative_path(&relative_destination_dir),
            source_name,
            destination_name,
            collision_resolved,
            renamed_by_rule,
            resolved_date_source: resolved_date.source,
        });
    }

    planned_moves.sort_by(|left, right| {
        left.relative_destination_path
            .cmp(&right.relative_destination_path)
            .then_with(|| left.destination_name.cmp(&right.destination_name))
            .then_with(|| left.relative_source_path.cmp(&right.relative_source_path))
    });

    let mut grouped_moves = BTreeMap::<String, OrganizerGroupAccumulator>::new();

    for planned_move in planned_moves.iter() {
        let group = grouped_moves
            .entry(planned_move.relative_destination_path.clone())
            .or_default();
        group.file_count += 1;

        if group.sample_names.len() < MAX_ORGANIZER_GROUP_SAMPLE_NAMES {
            group
                .sample_names
                .push(planned_move.destination_name.clone());
        }
    }

    let preview = OrganizerPreview {
        root_path: root_path.to_string(),
        summary: OrganizerPreviewSummary {
            media_file_count: media_files.len(),
            planned_move_count: planned_moves.len(),
            already_organized_count,
            folder_count: grouped_moves.len(),
            unknown_date_count,
            collision_count,
            renamed_by_rule_count,
            resolved_from_name_count,
            resolved_from_metadata_count,
        },
        groups: grouped_moves
            .into_iter()
            .map(|(relative_path, group)| OrganizerDestinationGroup {
                relative_path,
                file_count: group.file_count,
                sample_names: group.sample_names,
            })
            .collect(),
        sample_moves: planned_moves
            .iter()
            .take(MAX_ORGANIZER_SAMPLE_MOVES)
            .map(|planned_move| OrganizerMovePreview {
                source_path: planned_move.source_path.display().to_string(),
                relative_source_path: planned_move.relative_source_path.clone(),
                source_name: planned_move.source_name.clone(),
                destination_path: planned_move.destination_path.display().to_string(),
                relative_destination_path: planned_move.relative_destination_path.clone(),
                destination_name: planned_move.destination_name.clone(),
                collision_resolved: planned_move.collision_resolved,
                renamed_by_rule: planned_move.renamed_by_rule,
                resolved_date_source: planned_move.resolved_date_source,
            })
            .collect(),
    };

    Ok(OrganizerPlan {
        preview,
        planned_moves,
    })
}

#[tauri::command]
fn get_desktop_status(app: tauri::AppHandle) -> DesktopStatus {
    DesktopStatus {
        tauri_connected: true,
        platform: std::env::consts::OS.into(),
        app_version: app.package_info().version.to_string(),
    }
}

#[tauri::command(rename_all = "camelCase")]
fn find_empty_folders(
    root_path: String,
    ignored_file_names: Vec<String>,
) -> Result<EmptyFolderScan, String> {
    let root = PathBuf::from(&root_path);
    let ignored_file_names = normalize_ignored_file_names(&ignored_file_names);

    if !root.exists() {
        return Err("Selected folder no longer exists.".into());
    }

    if !root.is_dir() {
        return Err("Selected path is not a folder.".into());
    }

    let tree = scan_empty_tree(&root, &ignored_file_names)
        .map_err(|error| format!("Failed to scan folder: {error}"))?;
    let empty_folder_count = tree.as_ref().map_or(0, count_empty_folders);

    Ok(EmptyFolderScan {
        root_path,
        empty_folder_count,
        tree,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn preview_library_reorder(
    root_path: String,
    structure: String,
    date_source: String,
    rename_mode: String,
    unknown_folder_name: String,
) -> Result<OrganizerPreview, String> {
    let structure = parse_organizer_structure(&structure);
    let date_source = parse_organizer_date_source(&date_source);
    let rename_mode = parse_organizer_rename_mode(&rename_mode);
    let unknown_folder_name = normalize_unknown_folder_name(&unknown_folder_name);

    build_reorder_plan(
        &root_path,
        structure,
        date_source,
        rename_mode,
        &unknown_folder_name,
    )
    .map(|plan| plan.preview)
}

#[tauri::command(rename_all = "camelCase")]
fn apply_library_reorder(
    root_path: String,
    structure: String,
    date_source: String,
    rename_mode: String,
    unknown_folder_name: String,
) -> Result<OrganizerApplyResult, String> {
    let structure = parse_organizer_structure(&structure);
    let date_source = parse_organizer_date_source(&date_source);
    let rename_mode = parse_organizer_rename_mode(&rename_mode);
    let unknown_folder_name = normalize_unknown_folder_name(&unknown_folder_name);
    let plan = build_reorder_plan(
        &root_path,
        structure,
        date_source,
        rename_mode,
        &unknown_folder_name,
    )?;
    let mut moved_count = 0;
    let mut failed_count = 0;

    for planned_move in plan.planned_moves.iter() {
        let parent = planned_move
            .destination_path
            .parent()
            .ok_or_else(|| "Destination folder is missing.".to_string())?;

        if let Err(error) = fs::create_dir_all(parent) {
            failed_count += 1;
            eprintln!(
                "Failed to create destination folder for {}: {error}",
                planned_move.destination_path.display()
            );
            continue;
        }

        if let Err(error) = fs::rename(&planned_move.source_path, &planned_move.destination_path) {
            failed_count += 1;
            eprintln!(
                "Failed to move {} -> {}: {error}",
                planned_move.source_path.display(),
                planned_move.destination_path.display()
            );
            continue;
        }

        moved_count += 1;
    }

    Ok(OrganizerApplyResult {
        root_path,
        planned_move_count: plan.preview.summary.planned_move_count,
        moved_count,
        failed_count,
        folder_count: plan.preview.summary.folder_count,
        unknown_date_count: plan.preview.summary.unknown_date_count,
        collision_count: plan.preview.summary.collision_count,
        renamed_by_rule_count: plan.preview.summary.renamed_by_rule_count,
        resolved_from_name_count: plan.preview.summary.resolved_from_name_count,
        resolved_from_metadata_count: plan.preview.summary.resolved_from_metadata_count,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .menu(build_native_menu)
        .on_menu_event(handle_menu_event)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_desktop_status,
            find_empty_folders,
            preview_library_reorder,
            apply_library_reorder
        ])
        .run(tauri::generate_context!())
        .expect("failed to run PathSmith");
}
