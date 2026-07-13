//! `poll_miner` command. STUB ONLY — Worker B implements this body (will add
//! `reqwest` to Cargo.toml to poll the Mujina HTTP API on port 7785).
//! Signature is the handoff contract; do not change it.

#[tauri::command]
pub async fn poll_miner(ip: String) -> Result<serde_json::Value, String> {
    let _ = ip;
    Err("not implemented".into())
}
