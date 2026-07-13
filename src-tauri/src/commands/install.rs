//! `preview`/`install` commands.
//! Signatures and the `InstallConfig` shape are the handoff contract; do not
//! change them without updating `App.tsx`/`api.ts`/`types.ts` and
//! `lib.rs`'s `generate_handler!` list to match.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::Emitter;

use crate::external::{resolve_bash, INSTALL_SCRIPT};

#[tauri::command]
pub async fn preview(scan_file: String, host: String) -> Result<String, String> {
    let bash = resolve_bash()?;
    let output = Command::new(&bash)
        .arg(INSTALL_SCRIPT)
        .arg("--from-scan")
        .arg(&scan_file)
        .arg("--host")
        .arg(&host)
        .arg("--print-plan")
        .output()
        .map_err(|e| format!("failed to run install script: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[derive(serde::Deserialize)]
pub struct InstallConfig {
    pub scan_file: String,
    pub host: String,
    pub user: Option<String>,
    pub password: Option<String>,
    pub rootfs: Option<String>,
    pub env: Option<String>,
    pub pool_url: Option<String>,
    pub worker: Option<String>,
}

#[tauri::command]
pub async fn install(app: tauri::AppHandle, config: InstallConfig) -> Result<i32, String> {
    // Independent server-side firmware re-check — never trust the client.
    // No bash process launches for a non-stock host, full stop.
    let scan_contents = std::fs::read_to_string(&config.scan_file)
        .map_err(|e| format!("could not read scan file {}: {e}", config.scan_file))?;
    let records: Vec<crate::commands::scan::HostRecord> = serde_json::from_str(&scan_contents)
        .map_err(|e| format!("could not parse scan file {}: {e}", config.scan_file))?;
    let record = records
        .iter()
        .find(|r| r.host == config.host)
        .ok_or_else(|| "host not found in scan file".to_string())?;
    if record.firmware != "stock-bitmain" {
        return Err(format!(
            "refusing install: firmware class '{}' is not stock-bitmain",
            record.firmware
        ));
    }

    let bash = resolve_bash()?;
    let mut cmd = Command::new(&bash);
    cmd.arg(INSTALL_SCRIPT)
        .arg("--from-scan")
        .arg(&config.scan_file)
        .arg("--host")
        .arg(&config.host)
        .arg("--user")
        .arg(config.user.as_deref().unwrap_or("miner"))
        .arg("--password")
        .arg(config.password.as_deref().unwrap_or("miner"));

    if let Some(rootfs) = &config.rootfs {
        cmd.arg("--rootfs").arg(rootfs);
    }
    if let Some(env) = &config.env {
        cmd.arg("--env").arg(env);
    }
    // TODO(PD): no install-script flag for pool/worker yet — pool_url/worker
    // are collected in the UI and carried on InstallConfig, but the script
    // seeds pool config via the rootfs/env blob, not a CLI flag. Not passed.

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn install script: {e}"))?;

    // Drain stderr on its own thread so a script that writes a lot to stderr
    // can't fill the OS pipe buffer and deadlock against the stdout read loop
    // below.
    let stderr = child.stderr.take().ok_or("failed to capture stderr")?;
    let stderr_app = app.clone();
    let stderr_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = stderr_app.emit("install://log", format!("[stderr] {line}"));
        }
    });

    let stdout = child.stdout.take().ok_or("failed to capture stdout")?;
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|e| format!("error reading install output: {e}"))?;
        let _ = app.emit("install://log", line);
    }
    let _ = stderr_thread.join();

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait on install script: {e}"))?;
    let exit_code = status.code().unwrap_or(-1);
    let _ = app.emit("install://done", exit_code);
    Ok(exit_code)
}
