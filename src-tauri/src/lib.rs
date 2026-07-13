mod commands;
mod external;

use commands::install::{install, preview};
use commands::scan::scan;
use commands::telemetry::poll_miner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan, preview, install, poll_miner])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
