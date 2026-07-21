mod commands;
mod external;

use commands::bitaxe_flash::flash_bitaxe_raw;
use commands::install::{install, preview};
use commands::scan::scan;
use commands::telemetry::poll_miner;
use commands::usb::{list_usb_devices, peek_usb_serial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan,
            preview,
            install,
            poll_miner,
            list_usb_devices,
            peek_usb_serial,
            flash_bitaxe_raw
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
