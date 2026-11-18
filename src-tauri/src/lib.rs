use tauri::ipc::Response;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

/// Reads a PDF as raw bytes. `Response` keeps the payload binary instead of
/// serializing a byte array, which matters for large documents.
#[tauri::command]
fn read_pdf(path: String) -> Result<Response, String> {
    let bytes = std::fs::read(&path).map_err(|err| format!("{path}: {err}"))?;
    Ok(Response::new(bytes))
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open = MenuItemBuilder::with_id("open", "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let print = MenuItemBuilder::with_id("print", "Print…")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let find = MenuItemBuilder::with_id("find", "Find…")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let toggle_toc = MenuItemBuilder::with_id("toggle-toc", "Toggle Contents")
        .accelerator("CmdOrCtrl+Shift+B")
        .build(app)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let actual_size = MenuItemBuilder::with_id("actual-size", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&print)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&find)
        .item(&toggle_toc)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&actual_size)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    let menu = MenuBuilder::new(app);

    // On macOS the first submenu of the main menu becomes the application
    // menu, so it has to come first: AppKit shows it under the app name and
    // its own title is ignored. Everything else follows after it.
    #[cfg(target_os = "macos")]
    let menu = {
        let app_menu = SubmenuBuilder::new(app, "Simple PDF Viewer")
            .item(&PredefinedMenuItem::about(app, Some("Simple PDF Viewer"), None)?)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        menu.item(&app_menu)
    };

    menu.items(&[&file, &edit, &view, &window]).build()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_pdf])
        .menu(build_menu)
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
