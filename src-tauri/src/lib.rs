use std::{
    env, fs, process,
    path::{Path, PathBuf},
    sync::Mutex,
};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
};

const DEFAULT_WINDOW_WIDTH: u32 = 1320;
const DEFAULT_WINDOW_HEIGHT: u32 = 860;
const DEFAULT_WINDOW_X: i32 = 24;
const DEFAULT_WINDOW_Y: i32 = 24;

#[derive(Clone)]
struct LaunchState {
    markdown_path: Option<String>,
    window: WindowOptions,
}

#[derive(Clone, Copy)]
struct WindowOptions {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

impl Default for WindowOptions {
    fn default() -> Self {
        Self {
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
            x: DEFAULT_WINDOW_X,
            y: DEFAULT_WINDOW_Y,
        }
    }
}

#[derive(Default)]
struct WatchState {
    current: Mutex<Option<ActiveWatcher>>,
}

struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    path: PathBuf,
}

#[derive(Serialize)]
struct MarkdownDocument {
    path: String,
    contents: String,
}

#[derive(Clone, Serialize)]
struct FileChangedPayload {
    path: String,
}

#[tauri::command]
fn launch_markdown_path(state: State<'_, LaunchState>) -> Result<Option<String>, String> {
    Ok(state.markdown_path.clone())
}

#[tauri::command]
fn read_markdown(path: String) -> Result<MarkdownDocument, String> {
    let normalized = normalize_path(&path)?;
    let contents = fs::read_to_string(&normalized)
        .map_err(|error| format!("failed to read {}: {error}", normalized.display()))?;

    Ok(MarkdownDocument {
        path: normalized.to_string_lossy().to_string(),
        contents,
    })
}

#[tauri::command]
fn watch_markdown(
    app: AppHandle,
    state: State<'_, WatchState>,
    path: String,
) -> Result<String, String> {
    let normalized = normalize_path(&path)?;
    let watched_path = normalized.clone();
    let app_handle = app.clone();

    let watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
        if let Ok(event) = result {
            if should_emit(&event, &watched_path) {
                let _ = app_handle.emit(
                    "markdown://changed",
                    FileChangedPayload {
                        path: watched_path.to_string_lossy().to_string(),
                    },
                );
            }
        }
    })
    .map_err(|error| format!("failed to create file watcher: {error}"))?;

    let mut watcher = watcher;
    watcher
        .watch(Path::new(&normalized), RecursiveMode::NonRecursive)
        .map_err(|error| format!("failed to watch {}: {error}", normalized.display()))?;

    let mut current = state
        .current
        .lock()
        .map_err(|_| String::from("failed to lock watch state"))?;

    *current = Some(ActiveWatcher {
        _watcher: watcher,
        path: normalized.clone(),
    });

    Ok(normalized.to_string_lossy().to_string())
}

#[tauri::command]
fn current_watch_path(state: State<'_, WatchState>) -> Result<Option<String>, String> {
    let current = state
        .current
        .lock()
        .map_err(|_| String::from("failed to lock watch state"))?;

    Ok(current
        .as_ref()
        .map(|watcher| watcher.path.to_string_lossy().to_string()))
}

fn normalize_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);

    let resolved = resolve_input_path(&path).ok_or_else(|| {
        format!(
            "path does not exist: {}",
            path.to_string_lossy()
        )
    })?;

    resolved
        .canonicalize()
        .map_err(|error| format!("failed to normalize {}: {error}", resolved.display()))
}

fn resolve_input_path(path: &Path) -> Option<PathBuf> {
    if path.is_absolute() {
        return path.exists().then(|| path.to_path_buf());
    }

    if path.exists() {
        return Some(path.to_path_buf());
    }

    candidate_base_dirs()
        .into_iter()
        .map(|base_dir| base_dir.join(path))
        .find(|candidate| candidate.exists())
}

fn candidate_base_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        dirs.push(current_dir);
    }

    for key in ["PWD", "INIT_CWD"] {
        if let Ok(value) = env::var(key) {
            push_unique_dir(&mut dirs, PathBuf::from(value));
        }
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        let manifest_dir = PathBuf::from(manifest_dir);
        if let Some(project_dir) = manifest_dir.parent() {
            push_unique_dir(&mut dirs, project_dir.to_path_buf());
        }
    }

    dirs
}

fn push_unique_dir(dirs: &mut Vec<PathBuf>, path: PathBuf) {
    if !dirs.iter().any(|existing| existing == &path) {
        dirs.push(path);
    }
}

fn parse_launch_state() -> Result<LaunchState, String> {
    let program_name = env::args()
        .next()
        .and_then(|arg| {
            Path::new(&arg)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| String::from("markdv"));
    let mut args = env::args().skip(1);
    let mut raw_path: Option<String> = None;
    let mut width = None;
    let mut height = None;
    let mut x = None;
    let mut y = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-w" | "--width" => {
                width = Some(parse_u32_arg(&program_name, &arg, args.next())?);
            }
            "-h" | "--height" => {
                height = Some(parse_u32_arg(&program_name, &arg, args.next())?);
            }
            "-x" => {
                x = Some(parse_i32_arg(&program_name, &arg, args.next())?);
            }
            "-y" => {
                y = Some(parse_i32_arg(&program_name, &arg, args.next())?);
            }
            "--help" => {
                print!("{}", help_text(&program_name));
                process::exit(0);
            }
            _ if arg.starts_with("--width=") => {
                width = Some(parse_u32_value(&program_name, "--width", &arg[8..])?);
            }
            _ if arg.starts_with("--height=") => {
                height = Some(parse_u32_value(&program_name, "--height", &arg[9..])?);
            }
            _ if arg.starts_with("-x=") => {
                x = Some(parse_i32_value(&program_name, "-x", &arg[3..])?);
            }
            _ if arg.starts_with("-y=") => {
                y = Some(parse_i32_value(&program_name, "-y", &arg[3..])?);
            }
            _ if arg.starts_with('-') => {
                return Err(argument_error(
                    &program_name,
                    format!("unknown argument: {arg}"),
                ));
            }
            _ => {
                if raw_path.is_some() {
                    return Err(argument_error(
                        &program_name,
                        String::from("expected at most one markdown file path"),
                    ));
                }

                raw_path = Some(arg);
            }
        }
    }

    let markdown_path = raw_path
        .as_deref()
        .map(normalize_path)
        .transpose()?
        .map(|path| path.to_string_lossy().to_string());

    Ok(LaunchState {
        markdown_path,
        window: WindowOptions {
            width: width.unwrap_or(DEFAULT_WINDOW_WIDTH),
            height: height.unwrap_or(DEFAULT_WINDOW_HEIGHT),
            x: x.unwrap_or(DEFAULT_WINDOW_X),
            y: y.unwrap_or(DEFAULT_WINDOW_Y),
        },
    })
}

fn parse_u32_arg(
    program_name: &str,
    flag: &str,
    raw_value: Option<String>,
) -> Result<u32, String> {
    let value = raw_value.ok_or_else(|| {
        argument_error(program_name, format!("missing value for {flag}"))
    })?;

    parse_u32_value(program_name, flag, &value)
}

fn parse_i32_arg(
    program_name: &str,
    flag: &str,
    raw_value: Option<String>,
) -> Result<i32, String> {
    let value = raw_value.ok_or_else(|| {
        argument_error(program_name, format!("missing value for {flag}"))
    })?;

    parse_i32_value(program_name, flag, &value)
}

fn parse_u32_value(program_name: &str, flag: &str, value: &str) -> Result<u32, String> {
    value.parse::<u32>().map_err(|_| {
        argument_error(
            program_name,
            format!("invalid integer for {flag}: {value}"),
        )
    })
}

fn parse_i32_value(program_name: &str, flag: &str, value: &str) -> Result<i32, String> {
    value.parse::<i32>().map_err(|_| {
        argument_error(
            program_name,
            format!("invalid integer for {flag}: {value}"),
        )
    })
}

fn argument_error(program_name: &str, message: String) -> String {
    format!("{message}\n\n{}", help_text(program_name))
}

fn help_text(program_name: &str) -> String {
    format!(
        "usage: {program_name} [file] [-w WIDTH] [-h HEIGHT] [-x X] [-y Y] [--help]\n\noptional arguments:\n  -w WIDTH, --width WIDTH\n                        Window width\n  -h HEIGHT, --height HEIGHT\n                        Window height\n  -x X                  Window x position\n  -y Y                  Window y position\n  --help                Show this help message and exit\n"
    )
}

fn configure_main_window(app: &AppHandle, window_options: WindowOptions) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("failed to locate main window"))?;

    window
        .set_size(Size::Physical(PhysicalSize::new(
            window_options.width,
            window_options.height,
        )))
        .map_err(|error| format!("failed to set window size: {error}"))?;

    window
        .set_position(Position::Physical(PhysicalPosition::new(
            window_options.x,
            window_options.y,
        )))
        .map_err(|error| format!("failed to set window position: {error}"))?;

    window
        .show()
        .map_err(|error| format!("failed to show window: {error}"))?;

    Ok(())
}

fn should_emit(event: &Event, watched_path: &Path) -> bool {
    let relevant = matches!(
        event.kind,
        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
    );

    relevant && event.paths.iter().any(|path| path == watched_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_state = parse_launch_state().unwrap_or_else(|error| {
        eprintln!("{error}");
        process::exit(2);
    });

    tauri::Builder::default()
        .manage(WatchState::default())
        .manage(launch_state.clone())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            configure_main_window(app.handle(), launch_state.window)
                .map_err(Into::into)
        })
        .invoke_handler(tauri::generate_handler![
            launch_markdown_path,
            read_markdown,
            watch_markdown,
            current_watch_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
