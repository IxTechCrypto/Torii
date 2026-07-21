//! `flash_bitaxe_raw`: flashes the bitaxe-raw pass-through firmware onto a
//! Bitaxe's ESP32-S3 over USB via `espflash`. Once flashed, the device
//! presents itself as `OSMU`/`Bitaxe` over USB and `mujina-minerd` (already
//! running on this host) picks it up on its own — Torii's job ends at a
//! successful flash.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::Emitter;

use crate::commands::usb::{enumerate, BitaxeUsbStatus};
use crate::external::{resolve_espflash, BITAXE_RAW_FIRMWARE_ELF};

#[tauri::command]
pub async fn flash_bitaxe_raw(app: tauri::AppHandle, port: String) -> Result<i32, String> {
    // Independent server-side re-check — never trust the client's
    // classification of the port. A fresh enumeration must show this exact
    // port as a flash candidate right before we touch it.
    let devices = enumerate().await?;
    let device = devices
        .iter()
        .find(|d| d.port == port)
        .ok_or_else(|| format!("USB device on {port} not found in a fresh scan"))?;
    if device.status != BitaxeUsbStatus::FlashCandidate {
        return Err(format!(
            "refusing flash: device on {port} is not a flash candidate"
        ));
    }

    if !std::path::Path::new(BITAXE_RAW_FIRMWARE_ELF).exists() {
        return Err(format!(
            "bitaxe-raw firmware not found at {BITAXE_RAW_FIRMWARE_ELF}; run `cargo build --release` in the bitaxe-raw workspace"
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
        // Stock Bitaxe firmware talks over the ESP32-S3's native
        // USB-Serial-JTAG peripheral (that's what the VID_303A/PID_1001
        // "USB JTAG/serial debug unit" identity is), not a UART bridge chip
        // with DTR/RTS-wired auto-reset. `default-reset` assumes the latter
        // and won't reliably drop the chip into the ROM bootloader here;
        // `usb-reset` is espflash's dedicated sequence for this peripheral.
        .arg("--before")
        .arg("usb-reset")
        .arg("--after")
        .arg("hard-reset")
        .arg(BITAXE_RAW_FIRMWARE_ELF);
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
