//! USB device discovery for the Bitaxe-RAW flash flow.
//!
//! Classifies connected USB-serial devices by VID/PID:
//! - `0xc0de`/`0xcafe` (manufacturer "OSMU", product "Bitaxe") is the custom
//!   USB descriptor bitaxe-raw's firmware presents once it's running (see
//!   `bitaxe-raw/src/main.rs`) — a match here is a confirmed identification.
//! - `0x303A`/`0x1001` ("USB JTAG/serial debug unit") is the ESP32-S3's
//!   generic default USB-Serial-JTAG identity. Stock/unflashed AxeOS
//!   presents this because it never customizes the descriptor — but so
//!   would any other unflashed ESP32-S3 device, so a match here is only a
//!   flash *candidate*, not a confirmed Bitaxe. The frontend must get
//!   explicit user confirmation before flashing one.
//!
//! Anything else is omitted — it isn't Bitaxe-related.

use std::io::Read;
use std::time::{Duration, Instant};

use serialport::SerialPortType;

const BITAXE_RAW_VID: u16 = 0xc0de;
const BITAXE_RAW_PID: u16 = 0xcafe;
const ESP32S3_GENERIC_VID: u16 = 0x303a;
const ESP32S3_GENERIC_PID: u16 = 0x1001;

#[derive(serde::Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BitaxeUsbStatus {
    RawInstalled,
    FlashCandidate,
}

#[derive(serde::Serialize, Clone)]
pub struct UsbDeviceRecord {
    pub port: String,
    pub vid: u16,
    pub pid: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub status: BitaxeUsbStatus,
}

fn classify(vid: u16, pid: u16) -> Option<BitaxeUsbStatus> {
    match (vid, pid) {
        (BITAXE_RAW_VID, BITAXE_RAW_PID) => Some(BitaxeUsbStatus::RawInstalled),
        (ESP32S3_GENERIC_VID, ESP32S3_GENERIC_PID) => Some(BitaxeUsbStatus::FlashCandidate),
        _ => None,
    }
}

/// Registered vendor name for the VIDs we handle, so the manufacturer
/// column shows something factual even on Windows, where nusb can't read
/// the descriptor's `iManufacturer` (see `enumerate`). This is the USB-IF
/// vendor-ID assignment, not a per-device descriptor string:
///   - `0x303A` is Espressif's registered VID — the ESP32-S3's built-in USB
///     identity, i.e. what a stock/unflashed Bitaxe presents.
///   - `0xc0de` is the VID bitaxe-raw's own firmware declares (`OSMU`).
fn vid_vendor_name(vid: u16) -> Option<&'static str> {
    match vid {
        ESP32S3_GENERIC_VID => Some("Espressif Systems"),
        BITAXE_RAW_VID => Some("OSMU"),
        _ => None,
    }
}

/// Core enumeration logic, shared with `bitaxe_flash`'s server-side re-check
/// (never trust the client's classification of which port to flash).
///
/// `serialport`'s Windows backend reports `manufacturer`/`product` from the
/// *driver's* registry properties (`SPDRP_MFG`/`SPDRP_FRIENDLYNAME`), not
/// the device's own USB descriptor — for these devices that's Windows'
/// inbox USB-serial class driver ("Microsoft") and a synthetic friendly
/// name ("USB Serial Device (COMx)"), neither of which says anything about
/// the actual hardware. `nusb` reads the device-reported product string
/// (`BusReportedDeviceDesc`, e.g. "USB JTAG/serial debug unit") straight
/// off the descriptor, so we cross-reference by VID/PID and, on a match,
/// take nusb's values instead of serialport's driver-derived ones.
///
/// Two Windows-specific gotchas this is built around, both confirmed in
/// nusb 0.2.5's `windows_winusb/enumeration.rs`:
///   - nusb hardcodes `manufacturer_string: None` on Windows on purpose —
///     the OS manufacturer value comes from the `.inf`, not the descriptor,
///     so it's unreliable and nusb won't surface it. That means we can't
///     get a descriptor-derived manufacturer here, so we drop serialport's
///     misleading "Microsoft" and fall back to the VID's registered vendor
///     name (`vid_vendor_name`) instead. (On Linux/macOS nusb *does* read
///     the real `iManufacturer`, so this same code shows it there.)
///   - the match is by VID/PID only, with serial number used solely to
///     disambiguate when several devices share a VID/PID. serialport and
///     nusb can format or omit the serial differently, so requiring it to
///     match would spuriously drop the enrichment and let "Microsoft"
///     through — exactly the bug this avoids.
///
/// Best-effort: if `nusb` enumeration fails or finds no match, fall back to
/// whatever `serialport` reported rather than dropping the device.
pub async fn enumerate() -> Result<Vec<UsbDeviceRecord>, String> {
    let ports =
        serialport::available_ports().map_err(|e| format!("failed to enumerate serial ports: {e}"))?;

    let nusb_devices: Vec<nusb::DeviceInfo> = nusb::list_devices()
        .await
        .map(Iterator::collect)
        .unwrap_or_default();

    let mut records = Vec::new();
    for port in ports {
        let SerialPortType::UsbPort(mut info) = port.port_type else {
            continue;
        };
        let Some(status) = classify(info.vid, info.pid) else {
            continue;
        };

        let vidpid_matches: Vec<&nusb::DeviceInfo> = nusb_devices
            .iter()
            .filter(|d| d.vendor_id() == info.vid && d.product_id() == info.pid)
            .collect();
        let matched: Option<&nusb::DeviceInfo> = match vidpid_matches.as_slice() {
            [] => None,
            [only] => Some(*only),
            many => info
                .serial_number
                .as_deref()
                .and_then(|sn| many.iter().copied().find(|d| d.serial_number() == Some(sn))),
        };

        // serialport's manufacturer is the Windows driver provider
        // ("Microsoft"), never the real hardware, so we never keep it.
        // Prefer nusb's descriptor `iManufacturer` (present on Linux/macOS),
        // else the VID's registered vendor name (factual on every platform).
        info.manufacturer = matched
            .and_then(|d| d.manufacturer_string())
            .map(str::to_string)
            .or_else(|| vid_vendor_name(info.vid).map(str::to_string));

        // Prefer nusb's real device-reported product string; fall back to
        // serialport's synthetic friendly name only if nusb has none.
        if let Some(real) = matched {
            info.product = real
                .product_string()
                .map(str::to_string)
                .or_else(|| info.product.take());
        }

        records.push(UsbDeviceRecord {
            port: port.port_name,
            vid: info.vid,
            pid: info.pid,
            manufacturer: info.manufacturer,
            product: info.product,
            serial_number: info.serial_number,
            status,
        });
    }
    Ok(records)
}

#[tauri::command]
pub async fn list_usb_devices() -> Result<Vec<UsbDeviceRecord>, String> {
    enumerate().await
}

/// Read-only: open a candidate port at the standard ESP-IDF console baud
/// rate and capture whatever the firmware currently running on it is
/// already logging (boot messages, WiFi status, hostname, etc.), for up to
/// `PEEK_DURATION`. This is a much stronger identity signal than VID/PID —
/// it's evidence of what's actually running on the chip, not just a USB
/// descriptor — but it's best-effort: a quiet firmware, or a device that
/// finished its boot log before we attached, can legitimately return
/// nothing. Doesn't touch DTR/RTS or write anything to the device.
const PEEK_DURATION: Duration = Duration::from_secs(3);
const PEEK_MAX_BYTES: usize = 8192;

fn peek_serial_console_blocking(port: &str) -> Result<String, String> {
    let mut serial = serialport::new(port, 115_200)
        .timeout(Duration::from_millis(200))
        .open()
        .map_err(|e| format!("failed to open {port}: {e}"))?;

    let deadline = Instant::now() + PEEK_DURATION;
    let mut buf = [0u8; 512];
    let mut collected = Vec::new();
    while Instant::now() < deadline && collected.len() < PEEK_MAX_BYTES {
        match serial.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => collected.extend_from_slice(&buf[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
            Err(e) => return Err(format!("error reading from {port}: {e}")),
        }
    }
    Ok(strip_ansi(&String::from_utf8_lossy(&collected)))
}

/// Strip ANSI/VT escape sequences from captured console text. ESP-IDF's log
/// macros wrap every line in SGR colour codes (`ESC [ 0;32m ... ESC [ 0m`),
/// which render as literal `[0;32m` garbage in a plain `<pre>`. Drops:
///   - CSI sequences: `ESC [` params/intermediates, up to a final `@`..`~`;
///   - escapes with intermediates: `ESC` (0x20-0x2f)* final (e.g. `ESC ( B`);
///   - any other two-char escape: `ESC` + one byte.
/// Everything else (including plain newlines) is passed through untouched.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if ('@'..='~').contains(&nc) {
                        break;
                    }
                }
            }
            Some(&nc) if ('\u{20}'..='\u{2f}').contains(&nc) => {
                while let Some(&n2) = chars.peek() {
                    chars.next();
                    if !('\u{20}'..='\u{2f}').contains(&n2) {
                        break; // n2 was the final byte
                    }
                }
            }
            Some(_) => {
                chars.next();
            }
            None => {}
        }
    }
    out
}

#[tauri::command]
pub async fn peek_usb_serial(port: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || peek_serial_console_blocking(&port))
        .await
        .map_err(|e| format!("peek task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::strip_ansi;

    #[test]
    fn strips_esp_idf_color_codes() {
        // A representative ESP-IDF log line: green "I" level tag wrapper.
        let raw = "\u{1b}[0;32mI (179985472) power_management: Temp: 55.0\u{1b}[0m";
        assert_eq!(
            strip_ansi(raw),
            "I (179985472) power_management: Temp: 55.0"
        );
    }

    #[test]
    fn strips_charset_and_lone_escapes_without_leaving_stray_final_bytes() {
        // ESC ( B (select-ASCII charset) must be removed whole, not leave "B".
        assert_eq!(strip_ansi("a\u{1b}(Bb"), "ab");
        // Bare cursor-down CSI and a two-char ESC c (reset) both go entirely.
        assert_eq!(strip_ansi("x\u{1b}[By\u{1b}cz"), "xyz");
    }

    #[test]
    fn passes_plain_text_and_newlines_through() {
        let s = "line one\nline two\r\nline three";
        assert_eq!(strip_ansi(s), s);
    }
}
