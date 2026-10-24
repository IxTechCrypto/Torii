mod commands;
mod external;

use commands::bitaxe_flash::flash_bitaxe_raw;
use commands::install::{install, preview};
use commands::nano3s::{
    flash_nano3s, inspect_nano3s_image, list_k230_burn_devices, nano3s_default_image,
};
use commands::nano3s_update::{inspect_nano3s_bundle, update_nano3s_bundle};
use commands::scan::scan;
use commands::telemetry::poll_miner;
use commands::usb::{list_usb_devices, peek_usb_serial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan,
            preview,
            install,
            poll_miner,
            list_usb_devices,
            peek_usb_serial,
            flash_bitaxe_raw,
            list_k230_burn_devices,
            inspect_nano3s_image,
            nano3s_default_image,
            flash_nano3s,
            inspect_nano3s_bundle,
            update_nano3s_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
