//! `preview`/`install` commands.
//! Signatures and the `InstallConfig` shape are the handoff contract; do not
//! change them without updating `App.tsx`/`api.ts`/`types.ts` and
//! `lib.rs`'s `generate_handler!` list to match.

#[tauri::command]
pub async fn preview(_scan_file: String, _host: String) -> Result<String, String> {
    Err("Antminer S19 installation is currently paused pending official 256 Foundation image release.".to_string())
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
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
pub async fn install(_app: tauri::AppHandle, _config: InstallConfig) -> Result<i32, String> {
    Err("Antminer S19 installation is currently paused pending official 256 Foundation image release.".to_string())
}
