//! Live GitHub Release SHA-256 verification and Torii app update checker.
//!
//! When a user selects a `.kdimg` or `.bin` firmware bundle whose SHA-256 is
//! newer than the compiled-in `KNOWN_IMAGES` / `KNOWN_BUNDLES` table, Torii
//! queries GitHub's Releases API (`IxTechCrypto/mujina` and
//! `aadhi1014/nano-mujina`) to check if the hash matches an official release
//! asset (`assets[].digest == "sha256:<hex>"`). Results are cached in memory
//! for the session so repeated checks are instant and offline users gracefully
//! fall back to the compiled-in list.

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct RemoteAssetDigest {
    pub sha256: String,
    pub label: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_name: String,
}

static REMOTE_DIGESTS_CACHE: OnceLock<Mutex<Option<Vec<RemoteAssetDigest>>>> = OnceLock::new();

const MUJINA_RELEASE_URLS: &[(&str, &str)] = &[
    (
        "https://api.github.com/repos/IxTechCrypto/mujina/releases?per_page=10",
        "nano-mujina",
    ),
    (
        "https://api.github.com/repos/aadhi1014/nano-mujina/releases?per_page=10",
        "nano-mujina",
    ),
];

const TORII_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/IxTechCrypto/Torii/releases/latest";

/// Parse GitHub release JSON array into a list of `(sha256, label, asset_name)`.
pub fn parse_github_releases(json: &serde_json::Value, prefix: &str) -> Vec<RemoteAssetDigest> {
    let mut out = Vec::new();
    let Some(releases) = json.as_array() else {
        return out;
    };
    for rel in releases {
        if rel["draft"].as_bool().unwrap_or(false) {
            continue;
        }
        let tag = rel["tag_name"].as_str().unwrap_or("release").trim();
        let Some(assets) = rel["assets"].as_array() else {
            continue;
        };
        for asset in assets {
            let Some(digest_str) = asset["digest"].as_str() else {
                continue;
            };
            let Some(hex) = digest_str
                .strip_prefix("sha256:")
                .or_else(|| digest_str.strip_prefix("SHA256:"))
            else {
                continue;
            };
            let hex = hex.trim().to_ascii_lowercase();
            if hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
                out.push(RemoteAssetDigest {
                    sha256: hex,
                    label: format!("{prefix} {tag} (GitHub Release)"),
                });
            }
        }
    }
    out
}

async fn fetch_remote_digests() -> Vec<RemoteAssetDigest> {
    let cache_mutex = REMOTE_DIGESTS_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache_mutex.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }

    let Ok(client) = reqwest::Client::builder()
        .user_agent("torii-mujina-provisioner")
        .timeout(Duration::from_secs(3))
        .build()
    else {
        return Vec::new();
    };

    let mut all = Vec::new();
    for &(url, prefix) in MUJINA_RELEASE_URLS {
        if let Ok(resp) = client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    all.extend(parse_github_releases(&val, prefix));
                }
            }
        }
    }

    if !all.is_empty() {
        if let Ok(mut guard) = cache_mutex.lock() {
            *guard = Some(all.clone());
        }
    }
    all
}

/// Look up `sha256` against official GitHub Releases if it wasn't found in the
/// compiled-in table.
pub async fn lookup_github_release_sha256(sha256: &str) -> Option<RemoteAssetDigest> {
    let needle = sha256.trim().to_ascii_lowercase();
    let digests = fetch_remote_digests().await;
    digests.into_iter().find(|d| d.sha256 == needle)
}

/// Compare two semantic version strings (`"v0.1.0"` vs `"v0.1.1"`).
pub fn is_newer_version(current: &str, latest: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim()
            .trim_start_matches(['v', 'V'])
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let cur = parse(current);
    let lat = parse(latest);
    let len = cur.len().max(lat.len());
    for i in 0..len {
        let c = *cur.get(i).unwrap_or(&0);
        let l = *lat.get(i).unwrap_or(&0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn check_app_update() -> Result<AppUpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent("torii-mujina-provisioner")
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| format!("http client init failed: {e}"))?;

    let resp = client
        .get(TORII_LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("failed to query GitHub releases: {e}"))?;

    if !resp.status().is_success() {
        return Ok(AppUpdateInfo {
            current_version: current.clone(),
            latest_version: current,
            update_available: false,
            release_url: "https://github.com/IxTechCrypto/Torii/releases".to_string(),
            release_name: String::new(),
        });
    }

    let val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid release json: {e}"))?;

    let tag = val["tag_name"]
        .as_str()
        .unwrap_or(&current)
        .trim()
        .to_string();
    let html_url = val["html_url"]
        .as_str()
        .unwrap_or("https://github.com/IxTechCrypto/Torii/releases")
        .to_string();
    let name = val["name"].as_str().unwrap_or(&tag).to_string();
    let update_available = is_newer_version(&current, &tag);

    Ok(AppUpdateInfo {
        current_version: current,
        latest_version: tag,
        update_available,
        release_url: html_url,
        release_name: name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_release_digests_and_skips_drafts() {
        let sample = serde_json::json!([
            {
                "tag_name": "v5.0.1",
                "draft": false,
                "assets": [
                    {
                        "name": "nano-mujina-v5-release.kdimg",
                        "digest": "sha256:2a53c4402dcfb3ec49c4012a2aa501e8116d0968e8a24a461a353966d925089e"
                    },
                    {
                        "name": "notes.txt",
                        "digest": null
                    }
                ]
            },
            {
                "tag_name": "v5.0.2-draft",
                "draft": true,
                "assets": [
                    {
                        "name": "nano-mujina-v5-release.kdimg",
                        "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    }
                ]
            }
        ]);
        let parsed = parse_github_releases(&sample, "nano-mujina");
        assert_eq!(parsed.len(), 1);
        assert_eq!(
            parsed[0].sha256,
            "2a53c4402dcfb3ec49c4012a2aa501e8116d0968e8a24a461a353966d925089e"
        );
        assert_eq!(parsed[0].label, "nano-mujina v5.0.1 (GitHub Release)");
    }

    #[test]
    fn compares_semantic_versions() {
        assert!(is_newer_version("0.1.0", "v0.1.1"));
        assert!(is_newer_version("v0.1.0", "0.2.0"));
        assert!(!is_newer_version("0.1.1", "v0.1.1"));
        assert!(!is_newer_version("0.2.0", "v0.1.9"));
    }
}
