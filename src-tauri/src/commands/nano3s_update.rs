//! Avalon Nano 3S network update: uploads a nano-mujina `MJBUNDL1` firmware
//! bundle to a device already running nano-mujina, over its HTTP API on
//! port 80 (`POST /api/v0/firmware/bundle`). No USB, and Wi-Fi, pool, fan
//! and tuning settings on `/data` are kept.
//!
//! Bundle format and device-side checks are aadhi1014/nano-mujina's
//! `rtos_core/tools/pack_firmware_bundle.py` and `post_firmware_bundle` /
//! `validate_and_stage_firmware` in `mujina-miner/src/api/v0.rs`: magic
//! `MJBUNDL1`, then a little-endian u32 length + bytes for `mujina-minerd`
//! and again for the harness (0 = not included). The device stages every
//! section as `<path>.new`, renames them into place and reboots. It keeps no
//! copy of the old binary, so rollback is uploading a bundle of the previous
//! `mujina-minerd`, or a USB flash (`nano3s.rs`) if the new one won't start.
//!
//! The same checks the device runs are repeated here before anything is
//! sent, and the backend re-inspects the file itself before uploading.

use std::path::Path;
use std::time::Duration;

use sha2::{Digest, Sha256};

const BUNDLE_MAGIC: &[u8] = b"MJBUNDL1";
/// Port nano-mujina serves its API on (`NANO_MUJINA_API_PORT` in the frontend).
const NANO_MUJINA_PORT: u16 = 80;
/// Same bounds the device enforces (`FIRMWARE_MIN_UPLOAD_BYTES` /
/// `FIRMWARE_MAX_UPLOAD_BYTES` in nano-mujina's `api/v0.rs`).
const MIN_SECTION_BYTES: usize = 64 * 1024;
const MAX_SECTION_BYTES: usize = 64 * 1024 * 1024;

/// A bundle whose whole-file SHA-256 matches its published source.
struct KnownBundle {
    sha256: &'static str,
    label: &'static str,
}

const KNOWN_BUNDLES: &[KnownBundle] = &[
    KnownBundle {
        // SHA-256 GitHub lists for the release asset at
        // github.com/aadhi1014/nano-mujina/releases/tag/alpha-v4.
        // mujina-minerd only, no harness section.
        sha256: "17977de461c726eeb47ae537d371eeae3f9f61d465e169387ac18a48fa5b4fcb",
        label: "nano-mujina alpha-v4",
    },
    KnownBundle {
        // Same source, tag alpha-v3 (mujina-minerd + harness).
        sha256: "5be2f72234c81d16e6f42867258d31592dcacf9f6ebc2124350b9ec37f98405f",
        label: "nano-mujina alpha-v3",
    },
];

#[derive(serde::Serialize, Clone, Debug)]
pub struct BundleInfo {
    pub path: String,
    pub file_size: u64,
    pub sha256: String,
    /// Section lengths in bytes, 0 when the bundle leaves that binary alone.
    pub minerd_bytes: u64,
    pub harness_bytes: u64,
    pub known: Option<String>,
    /// Problems that block the upload outright.
    pub problems: Vec<String>,
    /// Problems the user may proceed past only after acknowledging them.
    pub warnings: Vec<String>,
}

fn read_section<'a>(body: &'a [u8], at: &mut usize, name: &str) -> Result<&'a [u8], String> {
    let len_bytes = body
        .get(*at..*at + 4)
        .ok_or_else(|| format!("bundle ends before the {name} length"))?;
    let len = u32::from_le_bytes(len_bytes.try_into().unwrap()) as usize;
    *at += 4;
    let section = body
        .get(*at..*at + len)
        .ok_or_else(|| format!("{name} section says {len} bytes but the file is shorter"))?;
    *at += len;
    Ok(section)
}

/// The device's per-binary checks: size bounds, ELF magic, and for
/// mujina-minerd the `nano3s_ipc_` symbols (missing means it was built
/// without the nano3s feature and would run with no board driver).
fn check_section(name: &str, bytes: &[u8], problems: &mut Vec<String>) {
    if bytes.is_empty() {
        return;
    }
    if bytes.len() < MIN_SECTION_BYTES {
        problems.push(format!("{name} is only {} bytes, looks truncated", bytes.len()));
    }
    if bytes.len() > MAX_SECTION_BYTES {
        problems.push(format!("{name} is {} bytes, over the device's limit", bytes.len()));
    }
    if !bytes.starts_with(b"\x7fELF") {
        problems.push(format!("{name} is not an ELF binary"));
    }
    if name == "mujina-minerd" && !bytes.windows(11).any(|w| w == b"nano3s_ipc_") {
        problems.push(
            "mujina-minerd has no nano3s_ipc_* symbols: built without the nano3s feature".into(),
        );
    }
}

pub fn inspect_bundle_bytes(path: &str, body: &[u8]) -> Result<BundleInfo, String> {
    if !body.starts_with(BUNDLE_MAGIC) {
        return Err(
            "not a nano-mujina firmware bundle (no MJBUNDL1 header). A .kdimg goes through \
             the USB flash instead."
                .into(),
        );
    }
    let mut at = BUNDLE_MAGIC.len();
    let minerd = read_section(body, &mut at, "mujina-minerd")?;
    let harness = read_section(body, &mut at, "harness")?;

    let mut problems = Vec::new();
    let mut warnings = Vec::new();
    if minerd.is_empty() && harness.is_empty() {
        problems.push("bundle contains neither mujina-minerd nor the harness".into());
    }
    if at != body.len() {
        problems.push(format!("{} unexpected bytes after the last section", body.len() - at));
    }
    check_section("mujina-minerd", minerd, &mut problems);
    check_section("harness", harness, &mut problems);

    let sha256: String = Sha256::digest(body)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let known = KNOWN_BUNDLES
        .iter()
        .find(|k| k.sha256 == sha256)
        .map(|k| k.label.to_string());
    if known.is_none() {
        warnings.push(
            "this bundle's SHA-256 isn't in Torii's list of verified bundles; compare it with \
             the hash published by its source before uploading"
                .into(),
        );
    }

    Ok(BundleInfo {
        path: path.to_string(),
        file_size: body.len() as u64,
        sha256,
        minerd_bytes: minerd.len() as u64,
        harness_bytes: harness.len() as u64,
        known,
        problems,
        warnings,
    })
}

fn inspect_bundle_file(path: &str) -> Result<(BundleInfo, Vec<u8>), String> {
    let body = std::fs::read(Path::new(path)).map_err(|e| format!("can't read {path}: {e}"))?;
    let info = inspect_bundle_bytes(path, &body)?;
    Ok((info, body))
}

#[tauri::command]
pub async fn inspect_nano3s_bundle(path: String) -> Result<BundleInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_bundle_file(&path).map(|(info, _)| info))
        .await
        .map_err(|e| format!("bundle check task failed: {e}"))?
}

/// Confirms `ip` is running nano-mujina on a Nano 3S before anything is
/// uploaded: stock Canaan firmware has no API on port 80, and other Mujina
/// boards report a different model.
async fn check_device(client: &reqwest::Client, ip: &str) -> Result<(), String> {
    let url = format!("http://{ip}:{NANO_MUJINA_PORT}/api/v0/miner");
    let state: serde_json::Value = client
        .get(&url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("{ip} isn't answering as nano-mujina ({url}): {e}"))?
        .json()
        .await
        .map_err(|e| format!("{url} didn't return Mujina's JSON: {e}"))?;
    let is_nano3s = state["boards"]
        .as_array()
        .is_some_and(|b| b.iter().any(|b| b["model"].as_str().is_some_and(|m| m.contains("Nano3s"))));
    if !is_nano3s {
        return Err(format!("{ip} runs Mujina but reports no Avalon Nano3s board"));
    }
    Ok(())
}

/// Uploads the bundle at `path` to the nano-mujina device at `ip`. The device
/// reboots on success; the returned string is its own `detail` message.
#[tauri::command]
pub async fn update_nano3s_bundle(
    ip: String,
    path: String,
    accept_warnings: bool,
) -> Result<String, String> {
    let (info, body) = tauri::async_runtime::spawn_blocking(move || inspect_bundle_file(&path))
        .await
        .map_err(|e| format!("bundle check task failed: {e}"))??;
    if !info.problems.is_empty() {
        return Err(format!("can't upload this bundle: {}", info.problems.join("; ")));
    }
    if !info.warnings.is_empty() && !accept_warnings {
        return Err(format!("not acknowledged: {}", info.warnings.join("; ")));
    }

    let client = reqwest::Client::new();
    check_device(&client, &ip).await?;

    let url = format!("http://{ip}:{NANO_MUJINA_PORT}/api/v0/firmware/bundle");
    let resp = client
        .post(&url)
        .header("Content-Type", "application/octet-stream")
        .body(body)
        // ~19 MB over the device's Wi-Fi, plus staging to NAND.
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("upload to {url} failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("device rejected the bundle (HTTP {status}): {text}"));
    }
    let detail = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v["detail"].as_str().map(str::to_string))
        .unwrap_or(text);
    Ok(detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn elf(len: usize, nano3s: bool) -> Vec<u8> {
        let mut b = vec![0u8; len];
        b[..4].copy_from_slice(b"\x7fELF");
        if nano3s {
            b[100..111].copy_from_slice(b"nano3s_ipc_");
        }
        b
    }

    fn bundle(minerd: &[u8], harness: &[u8]) -> Vec<u8> {
        let mut b = BUNDLE_MAGIC.to_vec();
        for s in [minerd, harness] {
            b.extend_from_slice(&(s.len() as u32).to_le_bytes());
            b.extend_from_slice(s);
        }
        b
    }

    #[test]
    fn accepts_minerd_only_bundle() {
        let info = inspect_bundle_bytes("b", &bundle(&elf(MIN_SECTION_BYTES, true), &[])).unwrap();
        assert!(info.problems.is_empty(), "{:?}", info.problems);
        assert_eq!(info.minerd_bytes, MIN_SECTION_BYTES as u64);
        assert_eq!(info.harness_bytes, 0);
        // Not a published bundle, so it needs acknowledgement.
        assert_eq!(info.warnings.len(), 1);
    }

    #[test]
    fn rejects_kdimg_and_truncation() {
        assert!(inspect_bundle_bytes("b", &[0x93, 0x8f, 0xcb, 0x27, 0, 0])
            .unwrap_err()
            .contains("MJBUNDL1"));
        let mut b = bundle(&elf(MIN_SECTION_BYTES, true), &[]);
        b.truncate(b.len() - 10);
        assert!(inspect_bundle_bytes("b", &b).is_err());
    }

    #[test]
    fn flags_minerd_without_nano3s_feature() {
        let info = inspect_bundle_bytes("b", &bundle(&elf(MIN_SECTION_BYTES, false), &[])).unwrap();
        assert!(info.problems.iter().any(|p| p.contains("nano3s feature")));
    }

    #[test]
    fn flags_empty_bundle_and_trailing_bytes() {
        let info = inspect_bundle_bytes("b", &bundle(&[], &[])).unwrap();
        assert!(info.problems.iter().any(|p| p.contains("neither")));
        let mut b = bundle(&elf(MIN_SECTION_BYTES, true), &[]);
        b.push(0);
        let info = inspect_bundle_bytes("b", &b).unwrap();
        assert!(info.problems.iter().any(|p| p.contains("unexpected bytes")));
    }

    /// Check a real bundle: `TORII_TEST_BUNDLE=/path/to.bin cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn inspects_real_bundle_from_env() {
        let path = std::env::var("TORII_TEST_BUNDLE").expect("set TORII_TEST_BUNDLE");
        let (info, _) = inspect_bundle_file(&path).unwrap();
        println!("{info:#?}");
        assert!(info.problems.is_empty(), "{:?}", info.problems);
    }
}
