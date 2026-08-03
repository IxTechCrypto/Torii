//! `scan` command: shells out to `mujina-scan.exe` and returns its inventory.
//!
//! These structs mirror `mujina-scan/src/inventory.rs` and
//! `mujina-scan/src/fingerprint.rs` in the mujina workspace field-for-field
//! (JSON shape, not Rust types) so `serde_json::from_str` round-trips the
//! CLI's stdout directly.

use std::net::IpAddr;
use std::time::Duration;
use futures::StreamExt;
use asic_rs::MinerFactory;
use tauri::Manager;

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

async fn check_port_open(ip: IpAddr, port: u16, timeout_duration: Duration) -> bool {
    let addr = std::net::SocketAddr::new(ip, port);
    tokio::time::timeout(timeout_duration, tokio::net::TcpStream::connect(addr))
        .await
        .map(|r| r.is_ok())
        .unwrap_or(false)
}

pub fn detect_local_ipv4_slash24() -> Result<String, String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| format!("failed to bind UDP socket: {e}"))?;
    socket.connect("8.8.8.8:80")
        .map_err(|e| format!("failed to connect UDP socket to 8.8.8.8: {e}"))?;
    let local_addr = socket.local_addr()
        .map_err(|e| format!("failed to get local address: {e}"))?;
    let IpAddr::V4(ip) = local_addr.ip() else {
        return Err(format!("local address {local_addr} is not IPv4"));
    };
    let [a, b, c, _] = ip.octets();
    Ok(format!("{a}.{b}.{c}.0/24"))
}

fn model_family_from_model(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let after_prefix = trimmed.strip_prefix("Antminer ").unwrap_or(trimmed).trim();
    after_prefix
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("_")
}

fn chip_for_family(model_family: &str) -> Option<&'static str> {
    match model_family {
        "s19j_pro" => Some("BM1362"),
        "s19_pro" | "s19" | "s19_xp" | "s19j" => Some("BM1362"),
        "s19j_pro_plus" => Some("BM1362"),
        "s21" | "s21_pro" | "s21_xp" => Some("BM1370"),
        _ => None,
    }
}

fn control_board_for_family(model_family: &str) -> &'static str {
    match model_family {
        "s19j_pro" | "s19j_pro_plus" | "s21" | "s21_pro" | "s21_xp" => "a113d",
        _ => "unknown",
    }
}

fn build_install_hint(host: &str, model_family: Option<&str>) -> InstallHint {
    match model_family {
        Some(family) if !family.is_empty() => InstallHint {
            ready: true,
            command: Some(format!(
                "./tools/network_install/install_mujina_aml.sh --host {host} --user root \
                 --model {family} --rootfs <PROFILE_ROOTFS> --env <PROFILE_ENV>"
            )),
        },
        _ => InstallHint {
            ready: false,
            command: None,
        },
    }
}

/// Scan the LAN (or a specific CIDR) for miners via native asic-rs scanning,
/// writing the JSON inventory to the app cache dir.
#[tauri::command]
pub async fn scan(
    app: tauri::AppHandle,
    cidr: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ScanResult, String> {
    // 1. Resolve subnet
    let subnet = match cidr {
        Some(target) => {
            if target.contains('/') {
                target
            } else {
                format!("{target}/32")
            }
        }
        None => detect_local_ipv4_slash24()?,
    };

    // 2. Initialize MinerFactory
    let factory = MinerFactory::from_subnet(&subnet)
        .map_err(|e| format!("failed to parse subnet {subnet}: {e}"))?;

    let timeout_ms = timeout_ms.unwrap_or(1500);
    let factory = factory
        .with_connectivity_timeout(Duration::from_millis(timeout_ms))
        .with_identification_timeout(Duration::from_secs(5));

    // 3. Scan the subnet using scan_stream_with_ip
    let mut stream = factory.scan_stream_with_ip();
    let mut records = Vec::new();

    while let Some((ip, miner_opt)) = stream.next().await {
        if let Some(miner) = miner_opt {
            let device_info = miner.get_device_info();
            
            // Map firmware string to frontend expected kebab-case enum values
            let fw_lower = device_info.firmware.to_lowercase();
            let firmware = if fw_lower.contains("stock") || fw_lower.contains("antminer") {
                "stock-bitmain".to_string()
            } else if fw_lower.contains("lux") {
                "lux-os".to_string()
            } else if fw_lower.contains("braiins") || fw_lower.contains("bos") {
                "braiins".to_string()
            } else {
                "unknown-cgminer".to_string()
            };

            let firmware_version = miner.get_firmware_version().await;
            
            let model = Some(device_info.model.clone());
            let model_family = Some(model_family_from_model(&device_info.model));
            
            let chip = chip_for_family(model_family.as_deref().unwrap_or("")).map(str::to_string);
            let control_board = control_board_for_family(model_family.as_deref().unwrap_or("")).to_string();

            // Proactively check standard ports for UI context
            let mut reachable_ports = Vec::new();
            if check_port_open(ip, 80, Duration::from_millis(200)).await {
                reachable_ports.push(80);
            }
            if check_port_open(ip, 4028, Duration::from_millis(200)).await {
                reachable_ports.push(4028);
            }
            if reachable_ports.is_empty() {
                reachable_ports.push(80);
            }

            let install_hint = build_install_hint(&ip.to_string(), model_family.as_deref());

            records.push(HostRecord {
                host: ip.to_string(),
                reachable_ports,
                firmware,
                firmware_version,
                model,
                model_family,
                control_board,
                chip,
                api_raw: ApiRaw {
                    version: None,
                    stats: None,
                },
                install_hint,
            });
        }
    }

    // 4. Save results to last-scan.json
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("could not resolve app cache dir: {e}"))?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("could not create app cache dir {}: {e}", cache_dir.display()))?;
    let scan_file = cache_dir.join("last-scan.json");
    let scan_file_str = scan_file.to_string_lossy().to_string();

    let json_bytes = serde_json::to_vec(&records)
        .map_err(|e| format!("failed to serialize records: {e}"))?;
    std::fs::write(&scan_file, json_bytes)
        .map_err(|e| format!("failed to write last-scan.json: {e}"))?;

    Ok(ScanResult {
        records,
        scan_file: scan_file_str,
    })
}
