//! `flash_bitaxe_raw`: flashes the bitaxe-raw pass-through firmware onto a
//! Bitaxe's ESP32-S3 over USB via `espflash`. Once flashed, the device
//! presents itself as `OSMU`/`Bitaxe` over USB and `mujina-minerd` (already
//! running on this host) picks it up on its own — Torii's job ends at a
//! successful flash.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::Emitter;

use crate::commands::usb::enumerate;
use crate::external::{resolve_bitaxe_raw_elf, resolve_espflash};

#[tauri::command]
pub async fn flash_bitaxe_raw(
    app: tauri::AppHandle,
    port: String,
    model: Option<String>,
) -> Result<i32, String> {
    // Independent server-side re-check — verify the port exists in fresh scan.
    let devices = enumerate().await?;
    let _device = devices
        .iter()
        .find(|d| d.port == port)
        .ok_or_else(|| format!("USB device on {port} not found in a fresh scan"))?;

    let model_str = model.as_deref().unwrap_or("gamma");
    let firmware_elf = resolve_bitaxe_raw_elf(Some(model_str))?;
    if !std::path::Path::new(&firmware_elf).exists() {
        return Err(format!(
            "bitaxe-raw firmware for model '{model_str}' not found at {firmware_elf}; run `cargo build --release` or verify D:\\github\\bitaxe-raw\\bin"
        ));
    }

    let espflash = resolve_espflash()?;
    let mut cmd = Command::new(&espflash);
    cmd.arg("flash")
        .arg("--port")
        .arg(&port)
        .arg("--chip")
        .arg("esp32s3")
        .arg("--non-interactive")
        .arg("--before")
        .arg("usb-reset")
        .arg("--after")
        .arg("hard-reset")
        .arg(&firmware_elf);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn espflash: {e}"))?;

    // Drain stderr on its own thread so a chatty stderr can't fill the OS
    // pipe buffer and deadlock against the stdout read loop below — same
    // fix as install()'s stderr-drain thread.
    let stderr = child.stderr.take().ok_or("failed to capture stderr")?;
    let stderr_app = app.clone();
    let stderr_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = stderr_app.emit("bitaxe-flash://log", format!("[stderr] {line}"));
        }
    });

    let stdout = child.stdout.take().ok_or("failed to capture stdout")?;
    let mut read_err: Option<String> = None;
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) => {
                let _ = app.emit("bitaxe-flash://log", line);
            }
            Err(e) => {
                read_err = Some(format!("error reading espflash output: {e}"));
                break;
            }
        }
    }

    // On a read error the process may still be running; don't leave it as
    // an orphaned, unmonitored flash of real hardware.
    if read_err.is_some() {
        let _ = child.kill();
    }
    let wait_result = child
        .wait()
        .map_err(|e| format!("failed to wait on espflash: {e}"));
    let _ = stderr_thread.join();

    // Always give the frontend a terminal event, no matter which path below
    // returns, so BitaxeFlashLog.tsx never waits forever on
    // bitaxe-flash://done.
    let exit_code = wait_result.as_ref().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
    let _ = app.emit("bitaxe-flash://done", exit_code);

    if let Some(e) = read_err {
        return Err(e);
    }
    wait_result?;
    Ok(exit_code)
}
