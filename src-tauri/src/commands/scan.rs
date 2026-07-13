//! `scan` command: shells out to `mujina-scan.exe` and returns its inventory.
//!
//! These structs mirror `mujina-scan/src/inventory.rs` and
//! `mujina-scan/src/fingerprint.rs` in the mujina workspace field-for-field
//! (JSON shape, not Rust types) so `serde_json::from_str` round-trips the
//! CLI's stdout directly.

use std::process::Command;

use tauri::Manager;

use crate::external::SCAN_BIN;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ApiRaw {
    pub version: Option<serde_json::Value>,
    pub stats: Option<serde_json::Value>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct InstallHint {
    pub ready: bool,
    pub command: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct HostRecord {
    pub host: String,
    pub reachable_ports: Vec<u16>,
    pub firmware: String,
    pub firmware_version: Option<String>,
    pub model: Option<String>,
    pub model_family: Option<String>,
    pub control_board: String,
    pub chip: Option<String>,
    pub api_raw: ApiRaw,
    pub install_hint: InstallHint,
}

#[derive(serde::Serialize, Clone)]
pub struct ScanResult {
    pub records: Vec<HostRecord>,
    pub scan_file: String,
}

/// Scan the LAN (or a specific CIDR) for miners via `mujina-scan.exe --auto`
/// / `--cidr`, writing the JSON inventory to the app cache dir so later
/// `preview`/`install` calls can pass it back as `--from-scan`.
#[tauri::command]
pub async fn scan(
    app: tauri::AppHandle,
    cidr: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ScanResult, String> {
    if !std::path::Path::new(SCAN_BIN).exists() {
        return Err(format!(
            "mujina-scan.exe not found at {SCAN_BIN}; run cargo build --release in the mujina workspace"
        ));
    }

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("could not resolve app cache dir: {e}"))?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("could not create app cache dir {}: {e}", cache_dir.display()))?;
    let scan_file = cache_dir.join("last-scan.json");
    let scan_file_str = scan_file.to_string_lossy().to_string();

    // A /24 sweep under system load (Vite/cargo running alongside it) can
    // push a slow-to-respond host past a tight timeout; 800ms occasionally
    // dropped a real device. 1500ms costs at most ~0.7s more wall-clock on
    // a full sweep and gives real hardware more margin.
    let timeout_ms = timeout_ms.unwrap_or(1500);

    let mut cmd = Command::new(SCAN_BIN);
    match cidr {
        // A bare IP (no "/") isn't a valid --cidr argument to mujina-scan,
        // which requires CIDR notation — route it through --host instead so
        // typing a single miner's address just works.
        Some(target) if target.contains('/') => {
            cmd.arg("--cidr").arg(target);
        }
        Some(host) => {
            cmd.arg("--host").arg(host);
        }
        None => {
            cmd.arg("--auto");
        }
    }
    cmd.arg("--port")
        .arg("4028")
        .arg("--timeout-ms")
        .arg(timeout_ms.to_string())
        .arg("--out")
        .arg(&scan_file);

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run mujina-scan.exe: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "mujina-scan.exe exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let records: Vec<HostRecord> = serde_json::from_str(&stdout)
        .map_err(|e| format!("failed to parse mujina-scan.exe output as JSON: {e}"))?;

    Ok(ScanResult {
        records,
        scan_file: scan_file_str,
    })
}
