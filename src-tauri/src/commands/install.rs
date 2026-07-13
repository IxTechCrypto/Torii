//! `preview`/`install` commands. STUB ONLY — Worker B implements these
//! bodies. Signatures and the `InstallConfig` shape are the handoff
//! contract; do not change them without updating `App.tsx`/`api.ts`/
//! `types.ts` and `lib.rs`'s `generate_handler!` list to match.

#[tauri::command]
pub async fn preview(scan_file: String, host: String) -> Result<String, String> {
    let _ = (scan_file, host);
    Err("not implemented".into())
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
    let _ = (app, config);
    Err("not implemented".into())
}
