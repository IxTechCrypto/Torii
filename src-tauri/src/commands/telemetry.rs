//! `poll_miner` command: fetches the raw Mujina state tree from
//! `http://{ip}:{port}/api/v0/miner`, port 7785 unless given (nano-mujina on
//! a Nano 3S serves its API on port 80). Signature is the handoff contract;
//! `port` is optional so existing callers keep working. Parsing into
//! `MinerStats` happens in the frontend (`src/telemetry.ts`) — this command
//! is a thin fetch+validate.

use std::time::Duration;

#[tauri::command]
pub async fn poll_miner(ip: String, port: Option<u16>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let port = port.unwrap_or(7785);
    let url = format!("http://{ip}:{port}/api/v0/miner");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request to {url} failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("{url} returned HTTP {}", resp.status()));
    }

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse response from {url} as JSON: {e}"))?;

    let is_mujina = value.get("boards").is_some_and(|v| v.is_array())
        && value.get("sources").is_some_and(|v| v.is_array())
        && value.get("hashrate").is_some_and(|v| v.is_number());
    if !is_mujina {
        return Err(format!(
            "{url} did not return a Mujina state tree (missing boards[]/sources[]/hashrate)"
        ));
    }

    Ok(value)
}
