// I forward build-time metadata generation to Tauri's helper so the desktop bundle stays consistent.
fn main() {
    tauri_build::build()
}
