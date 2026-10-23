//! Avalon Nano 3S (Canaan K230) USB flash flow: burns a full `.kdimg`
//! system image onto the device's SPI NAND with Kendryte's `k230-flash`,
//! run through a wrapper that first erases each partition's spare erase
//! region the way Canaan's own burning tool does. The same path installs nano-mujina or restores Canaan's
//! stock image, so rollback is just a flash of the stock image.
//!
//! The K230 boot ROM's USB burn mode (VID `29f1`, PID `0230`, entered by
//! holding the recessed button while powering on) can't be overwritten from
//! software, which is what makes this flow safe to retry: a bad flash is
//! fixed by flashing again.
//!
//! Before anything is written, the image is checked the same way
//! `k230-flash` itself parses it (see `k230_flash/kdimage.py` and its
//! `kdimage.md` format notes): header magic and CRC32, partition-table
//! CRC32, every partition's SHA-256, and that it targets the K230 and fits
//! the Nano 3S's 256 MiB NAND. The backend re-runs those checks and the
//! device scan itself before flashing; it never trusts the frontend's copy.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use sha2::{Digest, Sha256};
use tauri::Emitter;

use crate::external::{default_nano3s_image, hide_console, resolve_k230_python};

/// USB identity of the K230 boot ROM in burn mode (k230-flash README).
const K230_BURN_VID: u16 = 0x29f1;
const K230_BURN_PID: u16 = 0x0230;

const KDIMG_HEADER_MAGIC: u32 = 0x27CB_8F93;
const KDIMG_PART_MAGIC: u32 = 0x91DF_6DA4;
const KDIMG_HEADER_SIZE: usize = 512;
const KDIMG_PART_SIZE: usize = 256;
/// Same sanity bound k230-flash uses, so a corrupt count can't make us
/// allocate gigabytes before the CRC check rejects it.
const KDIMG_MAX_PARTS: u32 = 512;

/// Nano 3S SPI NAND size: 2048 erase blocks of 128 KiB, from Canaan's
/// `tools/gen_image_cfg/genimage-spinand.cfg` (`flash spinand-256M`).
const NANO3S_FLASH_BYTES: u64 = 2048 * 128 * 1024;
/// `chip_info` / `board_info` Canaan's stock build stamps into the header
/// (same genimage config).
const EXPECTED_CHIP_INFO: &str = "K230";
const STOCK_BOARD_INFO: &str = "K230_nano3";

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Nano3sImageRole {
    /// Install nano-mujina.
    Mujina,
    /// Restore Canaan's stock firmware.
    Stock,
}

/// An image whose whole-file SHA-256 has been checked by hand against its
/// published source. Add entries here as images are verified; anything not
/// listed needs the user's explicit acknowledgement before it is flashed.
struct KnownImage {
    sha256: &'static str,
    label: &'static str,
    role: Nano3sImageRole,
}

const KNOWN_IMAGES: &[KnownImage] = &[
    KnownImage {
        // Canaan's stock image, packed with their own `scripts/sdkbuild` from the
        // prebuilt resources in Canaan-Creative/Avalon_Nano3s at 04c84d3 (the
        // compiler download was unavailable, so `cg_miner` is Canaan's prebuilt
        // binary rather than a fresh compile). Header v1, chip K230, board
        // K230_nano3, 10 partitions, each SHA-256 checked by k230-flash's own
        // parser. Repacking gives a different hash: the UBI images embed
        // timestamps.
        sha256: "a5c1e591853b49552b70cdd77030faee8a8c520fcfd7e0537b138ef58b349027",
        label: "Canaan Nano 3S stock (Avalon_Nano3s 04c84d3)",
        role: Nano3sImageRole::Stock,
    },
    KnownImage {
        // nano-mujina alpha-v3 full-flash image, matching the SHA-256 GitHub
        // lists for the release asset at
        // github.com/aadhi1014/nano-mujina/releases/tag/alpha-v3. Unlike
        // Canaan's image it also writes the `data` partition (0xC800000), so
        // saved Wi-Fi and pool settings are reset.
        sha256: "2065e8ce563c627a5b0f20c21eb9d57b870373dae2a006e6e6f177f09507466e",
        label: "nano-mujina alpha-v3",
        role: Nano3sImageRole::Mujina,
    },
];

#[derive(serde::Serialize, Clone, Debug)]
pub struct K230BurnDevice {
    pub bus_id: String,
    pub address: u8,
    pub product: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct KdimgPart {
    pub name: String,
    pub offset: u64,
    pub size: u64,
    pub content_size: u64,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct KnownImageInfo {
    pub label: String,
    pub role: Nano3sImageRole,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct KdimgInfo {
    pub path: String,
    pub file_size: u64,
    pub sha256: String,
    pub header_version: u32,
    pub image_info: String,
    pub chip_info: String,
    pub board_info: String,
    pub parts: Vec<KdimgPart>,
    pub known: Option<KnownImageInfo>,
    /// Problems that block flashing outright.
    pub problems: Vec<String>,
    /// Problems the user may proceed past only after acknowledging them.
    pub warnings: Vec<String>,
}

struct RawPart {
    part: KdimgPart,
    content_offset: u64,
    sha256: [u8; 32],
}

fn le_u32(buf: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(buf[at..at + 4].try_into().unwrap())
}

fn c_string(buf: &[u8]) -> String {
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).trim().to_string()
}

/// Parse one 256-byte partition descriptor. Header version 2 widened
/// `part_flag` to a u64 (with 4 bytes of padding before it), which shifts
/// every later field; see `PART_FORMAT_V1`/`PART_FORMAT_V2` in kdimage.py.
fn parse_part(raw: &[u8], header_version: u32) -> Result<RawPart, String> {
    if le_u32(raw, 0) != KDIMG_PART_MAGIC {
        return Err(format!("bad partition magic 0x{:08X}", le_u32(raw, 0)));
    }
    let (content_at, sha_at, name_at) = if header_version >= 2 {
        (32, 40, 72)
    } else {
        (24, 32, 64)
    };
    Ok(RawPart {
        part: KdimgPart {
            name: c_string(&raw[name_at..name_at + 32]),
            offset: le_u32(raw, 4) as u64,
            size: le_u32(raw, 8) as u64,
            content_size: le_u32(raw, content_at + 4) as u64,
        },
        content_offset: le_u32(raw, content_at) as u64,
        sha256: raw[sha_at..sha_at + 32].try_into().unwrap(),
    })
}

fn sha256_hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Hash `len` bytes of `file` starting at `offset`.
fn sha256_range(file: &mut File, offset: u64, len: u64) -> Result<[u8; 32], String> {
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek failed: {e}"))?;
    let mut hasher = Sha256::new();
    let mut remaining = len;
    let mut buf = vec![0u8; 1024 * 1024];
    while remaining > 0 {
        let want = remaining.min(buf.len() as u64) as usize;
        file.read_exact(&mut buf[..want])
            .map_err(|e| format!("image is truncated: {e}"))?;
        hasher.update(&buf[..want]);
        remaining -= want as u64;
    }
    Ok(hasher.finalize().into())
}

/// Trim whitespace and the double quotes Windows' "Copy as path" adds.
fn clean_image_path(path: &str) -> String {
    let path = path.trim();
    path.strip_prefix('"')
        .and_then(|p| p.strip_suffix('"'))
        .unwrap_or(path)
        .trim()
        .to_string()
}

/// Validate a `.kdimg` for the Nano 3S. Structural damage (bad magic or
/// CRC, truncation) is an `Err`; anything else lands in `problems` or
/// `warnings` so the UI can show the full picture.
pub fn inspect_kdimg_file(path: &Path, role: Nano3sImageRole) -> Result<KdimgInfo, String> {
    let cleaned = clean_image_path(&path.to_string_lossy());
    let path = Path::new(&cleaned);
    let mut file = File::open(path).map_err(|e| format!("cannot open {}: {e}", path.display()))?;
    let file_size = file
        .metadata()
        .map_err(|e| format!("cannot stat {}: {e}", path.display()))?
        .len();

    let mut header = [0u8; KDIMG_HEADER_SIZE];
    file.read_exact(&mut header)
        .map_err(|_| "not a .kdimg: file is shorter than the 512-byte header".to_string())?;
    if le_u32(&header, 0) != KDIMG_HEADER_MAGIC {
        return Err(format!(
            "not a .kdimg: header magic is 0x{:08X}, expected 0x{KDIMG_HEADER_MAGIC:08X} \
             (a .kdimg.gz must be decompressed first)",
            le_u32(&header, 0)
        ));
    }
    let header_crc = le_u32(&header, 4);
    let mut zeroed = header;
    zeroed[4..8].fill(0);
    if crc32fast::hash(&zeroed) != header_crc {
        return Err("corrupt .kdimg: header CRC32 mismatch".to_string());
    }
    let header_version = le_u32(&header, 12);
    let part_count = le_u32(&header, 16);
    let part_table_crc = le_u32(&header, 20);
    let image_info = c_string(&header[24..56]);
    let chip_info = c_string(&header[56..88]);
    let board_info = c_string(&header[88..152]);

    if part_count == 0 || part_count > KDIMG_MAX_PARTS {
        return Err(format!(
            "corrupt .kdimg: implausible partition count {part_count}"
        ));
    }
    let mut table = vec![0u8; part_count as usize * KDIMG_PART_SIZE];
    file.read_exact(&mut table)
        .map_err(|_| "corrupt .kdimg: partition table is truncated".to_string())?;
    if crc32fast::hash(&table) != part_table_crc {
        return Err("corrupt .kdimg: partition table CRC32 mismatch".to_string());
    }
    let raw_parts = table
        .chunks_exact(KDIMG_PART_SIZE)
        .enumerate()
        .map(|(i, raw)| parse_part(raw, header_version).map_err(|e| format!("partition {i}: {e}")))
        .collect::<Result<Vec<_>, _>>()?;

    let mut problems = Vec::new();
    let mut warnings = Vec::new();

    if !chip_info.eq_ignore_ascii_case(EXPECTED_CHIP_INFO) {
        problems.push(format!(
            "image targets chip \"{chip_info}\", not the Nano 3S's {EXPECTED_CHIP_INFO}"
        ));
    }
    if board_info != STOCK_BOARD_INFO {
        warnings.push(format!(
            "image is stamped for board \"{board_info}\", not \"{STOCK_BOARD_INFO}\" as Canaan's \
             stock Nano 3S build is"
        ));
    }

    for raw in &raw_parts {
        let end = raw.part.offset + raw.part.size;
        if end > NANO3S_FLASH_BYTES {
            problems.push(format!(
                "partition \"{}\" ends at {end:#x}, past the Nano 3S's {} MiB flash",
                raw.part.name,
                NANO3S_FLASH_BYTES / (1024 * 1024)
            ));
        }
        if raw.content_offset + raw.part.content_size > file_size {
            problems.push(format!(
                "partition \"{}\" content runs past the end of the file",
                raw.part.name
            ));
            continue;
        }
        let digest = sha256_range(&mut file, raw.content_offset, raw.part.content_size)?;
        if digest != raw.sha256 {
            problems.push(format!(
                "partition \"{}\" fails its SHA-256 check (image is corrupt or was modified)",
                raw.part.name
            ));
        }
    }

    let sha256 = sha256_hex(&sha256_range(&mut file, 0, file_size)?);
    let known = KNOWN_IMAGES
        .iter()
        .find(|k| k.sha256.eq_ignore_ascii_case(&sha256))
        .map(|k| KnownImageInfo {
            label: k.label.to_string(),
            role: k.role,
        });
    match &known {
        Some(k) if k.role != role => problems.push(format!(
            "this is the verified image \"{}\", which doesn't match the selected action",
            k.label
        )),
        Some(_) => {}
        None => warnings.push(
            "this image's SHA-256 isn't in Torii's list of verified images; compare it with the \
             hash published by its source before flashing"
                .to_string(),
        ),
    }

    Ok(KdimgInfo {
        path: path.display().to_string(),
        file_size,
        sha256,
        header_version,
        image_info,
        chip_info,
        board_info,
        parts: raw_parts.into_iter().map(|r| r.part).collect(),
        known,
        problems,
        warnings,
    })
}

async fn burn_mode_devices() -> Result<Vec<K230BurnDevice>, String> {
    let devices = nusb::list_devices()
        .await
        .map_err(|e| format!("failed to enumerate USB devices: {e}"))?;
    Ok(devices
        .filter(|d| d.vendor_id() == K230_BURN_VID && d.product_id() == K230_BURN_PID)
        .map(|d| K230BurnDevice {
            bus_id: d.bus_id().to_string(),
            address: d.device_address(),
            product: d.product_string().map(str::to_string),
        })
        .collect())
}

#[tauri::command]
pub async fn list_k230_burn_devices() -> Result<Vec<K230BurnDevice>, String> {
    burn_mode_devices().await
}

#[tauri::command]
pub async fn inspect_nano3s_image(
    path: String,
    role: Nano3sImageRole,
) -> Result<KdimgInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_kdimg_file(Path::new(&path), role))
        .await
        .map_err(|e| format!("image check task failed: {e}"))?
}

/// The image path Torii suggests for `role` (env override or the default
/// local path), if that file exists.
#[tauri::command]
pub fn nano3s_default_image(role: Nano3sImageRole) -> Option<String> {
    default_nano3s_image(role)
}

static FLASH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct FlashGuard;

impl FlashGuard {
    fn acquire() -> Result<Self, String> {
        FLASH_IN_PROGRESS
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| FlashGuard)
            .map_err(|_| "a Nano 3S flash is already running".to_string())
    }
}

impl Drop for FlashGuard {
    fn drop(&mut self) {
        FLASH_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

/// Parse k230-flash's `Progress: 42.17% (current/total)` line.
fn parse_progress(line: &str) -> Option<f64> {
    let rest = line.trim().strip_prefix("Progress:")?;
    rest.trim().split('%').next()?.trim().parse().ok()
}

/// Read `reader` to the end, calling `on_line` for each line. k230-flash
/// redraws its progress bar with `\r`, so carriage returns end a line too.
fn for_each_line(reader: impl Read, mut on_line: impl FnMut(String)) -> std::io::Result<()> {
    let mut reader = BufReader::new(reader);
    let mut pending = Vec::new();
    loop {
        let buf = reader.fill_buf()?;
        if buf.is_empty() {
            break;
        }
        let len = buf.len();
        for &b in buf {
            if b == b'\r' || b == b'\n' {
                if !pending.is_empty() {
                    on_line(String::from_utf8_lossy(&pending).into_owned());
                    pending.clear();
                }
            } else {
                pending.push(b);
            }
        }
        reader.consume(len);
    }
    if !pending.is_empty() {
        on_line(String::from_utf8_lossy(&pending).into_owned());
    }
    Ok(())
}

/// k230-flash plus the erase-before-write step Canaan's own burning tool
/// performs and k230-flash omits.
const FLASH_WRAPPER: &str = include_str!("../../resources/k230_flash_erase.py");

/// Write the wrapper script to the app cache dir and return its path.
fn write_flash_wrapper(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("could not resolve app cache dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    let path = dir.join("k230_flash_erase.py");
    std::fs::write(&path, FLASH_WRAPPER)
        .map_err(|e| format!("could not write {}: {e}", path.display()))?;
    Ok(path)
}

#[tauri::command]
pub async fn flash_nano3s(
    app: tauri::AppHandle,
    image_path: String,
    role: Nano3sImageRole,
    accept_warnings: bool,
) -> Result<i32, String> {
    let _guard = FlashGuard::acquire()?;

    // Re-check everything server-side; the frontend's inspection is advisory.
    let path = image_path.clone();
    let info =
        tauri::async_runtime::spawn_blocking(move || inspect_kdimg_file(Path::new(&path), role))
            .await
            .map_err(|e| format!("image check task failed: {e}"))??;
    if !info.problems.is_empty() {
        return Err(format!("refusing to flash: {}", info.problems.join("; ")));
    }
    if !info.warnings.is_empty() && !accept_warnings {
        return Err(format!(
            "refusing to flash without acknowledgement: {}",
            info.warnings.join("; ")
        ));
    }

    // k230-flash takes the first burn-mode device it finds, so insist on
    // exactly one rather than risk writing to the wrong unit.
    match burn_mode_devices().await?.len() {
        1 => {}
        0 => return Err("no Nano 3S in USB burn mode found".to_string()),
        n => {
            return Err(format!(
                "{n} K230 devices are in burn mode; connect only the one to flash"
            ))
        }
    }

    // Run k230-flash through Torii's wrapper, which adds the erase step
    // k230-flash skips (see resources/k230_flash_erase.py).
    let python = resolve_k230_python()?;
    let wrapper = write_flash_wrapper(&app)?;
    let mut cmd = Command::new(&python);
    hide_console(&mut cmd)
        .arg(&wrapper)
        .args(["--media-type", "SPI_NAND", "--log-level", "INFO"])
        .arg(&info.path)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn {python}: {e}"))?;

    // k230-flash logs through loguru on stderr. Drain it on its own thread so
    // a full pipe can't stall the progress reader below.
    let stderr = child.stderr.take().ok_or("failed to capture stderr")?;
    let stderr_app = app.clone();
    let stderr_thread = std::thread::spawn(move || {
        let _ = for_each_line(stderr, |line| {
            let _ = stderr_app.emit("nano3s-flash://log", line);
        });
    });

    let stdout = child.stdout.take().ok_or("failed to capture stdout")?;
    let mut last_percent: Option<i64> = None;
    let read_result = for_each_line(stdout, |line| match parse_progress(&line) {
        Some(percent) => {
            // The bar redraws far more often than the UI needs; send whole
            // percent steps only.
            if last_percent != Some(percent.floor() as i64) {
                last_percent = Some(percent.floor() as i64);
                let _ = app.emit("nano3s-flash://progress", percent);
            }
        }
        None => {
            let _ = app.emit("nano3s-flash://log", line);
        }
    });

    // On a read error the process may still be running; don't leave an
    // unmonitored write to real hardware behind.
    if read_result.is_err() {
        let _ = child.kill();
    }
    let wait_result = child
        .wait()
        .map_err(|e| format!("failed to wait on k230-flash: {e}"));
    let _ = stderr_thread.join();

    // Always send a terminal event so the log view never waits forever.
    let exit_code = wait_result
        .as_ref()
        .map(|s| s.code().unwrap_or(-1))
        .unwrap_or(-1);
    let _ = app.emit("nano3s-flash://done", exit_code);

    read_result.map_err(|e| format!("error reading k230-flash output: {e}"))?;
    wait_result?;
    Ok(exit_code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct TestPart {
        name: &'static str,
        offset: u32,
        content: Vec<u8>,
    }

    /// Build a .kdimg the way Kendryte's genimage lays one out.
    fn build_kdimg(version: u32, chip: &str, board: &str, parts: &[TestPart]) -> Vec<u8> {
        let table_len = parts.len() * KDIMG_PART_SIZE;
        let mut content_offset = (KDIMG_HEADER_SIZE + table_len) as u32;
        let mut table = Vec::new();
        let mut payload = Vec::new();
        for p in parts {
            let mut raw = vec![0u8; KDIMG_PART_SIZE];
            raw[0..4].copy_from_slice(&KDIMG_PART_MAGIC.to_le_bytes());
            raw[4..8].copy_from_slice(&p.offset.to_le_bytes());
            raw[8..12].copy_from_slice(&(p.content.len() as u32).to_le_bytes());
            let (content_at, sha_at, name_at) = if version >= 2 {
                (32, 40, 72)
            } else {
                (24, 32, 64)
            };
            raw[content_at..content_at + 4].copy_from_slice(&content_offset.to_le_bytes());
            raw[content_at + 4..content_at + 8]
                .copy_from_slice(&(p.content.len() as u32).to_le_bytes());
            let digest: [u8; 32] = Sha256::digest(&p.content).into();
            raw[sha_at..sha_at + 32].copy_from_slice(&digest);
            raw[name_at..name_at + p.name.len()].copy_from_slice(p.name.as_bytes());
            table.extend_from_slice(&raw);
            payload.extend_from_slice(&p.content);
            content_offset += p.content.len() as u32;
        }
        let mut header = vec![0u8; KDIMG_HEADER_SIZE];
        header[0..4].copy_from_slice(&KDIMG_HEADER_MAGIC.to_le_bytes());
        header[12..16].copy_from_slice(&version.to_le_bytes());
        header[16..20].copy_from_slice(&(parts.len() as u32).to_le_bytes());
        header[20..24].copy_from_slice(&crc32fast::hash(&table).to_le_bytes());
        header[24..30].copy_from_slice(b"v1.1.0");
        header[56..56 + chip.len()].copy_from_slice(chip.as_bytes());
        header[88..88 + board.len()].copy_from_slice(board.as_bytes());
        let crc = crc32fast::hash(&header);
        header[4..8].copy_from_slice(&crc.to_le_bytes());
        [header, table, payload].concat()
    }

    fn stock_parts() -> Vec<TestPart> {
        vec![
            TestPart {
                name: "uboot_spl_a",
                offset: 0,
                content: vec![0xA5; 4096],
            },
            TestPart {
                name: "rtt",
                offset: 6 << 20,
                content: vec![0x5A; 8192],
            },
        ]
    }

    fn write_temp(bytes: &[u8]) -> tempfile_path::TempPath {
        tempfile_path::TempPath::with_contents(bytes)
    }

    /// Minimal self-deleting temp file, to avoid a dev-dependency.
    mod tempfile_path {
        use std::path::{Path, PathBuf};
        use std::sync::atomic::{AtomicU32, Ordering};

        static NEXT: AtomicU32 = AtomicU32::new(0);

        pub struct TempPath(PathBuf);

        impl TempPath {
            pub fn with_contents(bytes: &[u8]) -> Self {
                let n = NEXT.fetch_add(1, Ordering::SeqCst);
                let path = std::env::temp_dir()
                    .join(format!("torii-kdimg-test-{}-{n}.kdimg", std::process::id()));
                let mut f = std::fs::File::create(&path).unwrap();
                super::Write::write_all(&mut f, bytes).unwrap();
                TempPath(path)
            }

            pub fn path(&self) -> &Path {
                &self.0
            }
        }

        impl Drop for TempPath {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.0);
            }
        }
    }

    #[test]
    fn accepts_stock_layout_in_both_header_versions() {
        for version in [1, 2] {
            let file = write_temp(&build_kdimg(version, "K230", "K230_nano3", &stock_parts()));
            let info = inspect_kdimg_file(file.path(), Nano3sImageRole::Stock).unwrap();
            assert!(info.problems.is_empty(), "v{version}: {:?}", info.problems);
            assert_eq!(info.chip_info, "K230");
            assert_eq!(info.board_info, "K230_nano3");
            assert_eq!(info.parts.len(), 2);
            assert_eq!(info.parts[1].name, "rtt");
            assert_eq!(info.parts[1].offset, 6 << 20);
            // Not in KNOWN_IMAGES, so it needs acknowledgement.
            assert_eq!(info.warnings.len(), 1);
        }
    }

    #[test]
    fn rejects_non_kdimg_and_gzip() {
        let file = write_temp(&[0x1f, 0x8b, 0x08, 0x00].repeat(200));
        let err = inspect_kdimg_file(file.path(), Nano3sImageRole::Stock).unwrap_err();
        assert!(err.contains("decompressed first"), "{err}");
    }

    #[test]
    fn rejects_header_corruption() {
        let mut bytes = build_kdimg(2, "K230", "K230_nano3", &stock_parts());
        bytes[30] ^= 0xff;
        let file = write_temp(&bytes);
        let err = inspect_kdimg_file(file.path(), Nano3sImageRole::Stock).unwrap_err();
        assert!(err.contains("header CRC32"), "{err}");
    }

    #[test]
    fn flags_tampered_partition_content() {
        let mut bytes = build_kdimg(2, "K230", "K230_nano3", &stock_parts());
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        let file = write_temp(&bytes);
        let info = inspect_kdimg_file(file.path(), Nano3sImageRole::Stock).unwrap();
        assert!(info
            .problems
            .iter()
            .any(|p| p.contains("\"rtt\" fails its SHA-256")));
    }

    #[test]
    fn flags_wrong_chip_and_oversized_layout() {
        let parts = vec![TestPart {
            name: "big",
            offset: 255 << 20,
            content: vec![1; 2 << 20],
        }];
        let file = write_temp(&build_kdimg(2, "K510", "other_board", &parts));
        let info = inspect_kdimg_file(file.path(), Nano3sImageRole::Mujina).unwrap();
        assert!(info
            .problems
            .iter()
            .any(|p| p.contains("not the Nano 3S's K230")));
        assert!(info
            .problems
            .iter()
            .any(|p| p.contains("past the Nano 3S's 256 MiB")));
        assert!(info.warnings.iter().any(|w| w.contains("other_board")));
    }

    /// Check a real image: `TORII_TEST_KDIMG=/path/to.kdimg cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn inspects_real_image_from_env() {
        let path = std::env::var("TORII_TEST_KDIMG").expect("set TORII_TEST_KDIMG");
        let info = inspect_kdimg_file(Path::new(&path), Nano3sImageRole::Stock).unwrap();
        println!("{info:#?}");
        assert!(info.problems.is_empty(), "{:?}", info.problems);
    }

    #[test]
    fn strips_copy_as_path_quotes() {
        assert_eq!(
            clean_image_path(r#" "D:\downloads\a.kdimg" "#),
            r"D:\downloads\a.kdimg"
        );
        assert_eq!(
            clean_image_path(r"D:\downloads\a.kdimg"),
            r"D:\downloads\a.kdimg"
        );
    }

    #[test]
    fn parses_progress_lines() {
        assert_eq!(parse_progress("Progress: 42.17% (100/237)"), Some(42.17));
        assert_eq!(parse_progress("  Progress: 100.00% (5/5)"), Some(100.0));
        assert_eq!(parse_progress("2026-10-23 | INFO | writing rtt"), None);
    }

    #[test]
    fn splits_carriage_return_progress_into_lines() {
        let mut lines = Vec::new();
        for_each_line(
            &b"start\nProgress: 1.00% (1/100)\rProgress: 2.00% (2/100)\r\ndone"[..],
            |l| lines.push(l),
        )
        .unwrap();
        assert_eq!(
            lines,
            [
                "start",
                "Progress: 1.00% (1/100)",
                "Progress: 2.00% (2/100)",
                "done"
            ]
        );
    }
}
