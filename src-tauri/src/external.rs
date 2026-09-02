//! Paths to external binaries/scripts Torii shells out to, plus the git-bash
//! resolver used to run the (bash) installer script on Windows.

use std::path::Path;

pub const DEFAULT_INSTALL_SCRIPT: &str = r"D:\github\mujina-loader\tools\network_install\install_mujina_aml.sh";
pub const DEFAULT_BASH_EXE: &str = r"C:\Program Files\Git\bin\bash.exe";
pub const DEFAULT_BITAXE_RAW_FIRMWARE_ELF: &str =
    r"D:\github\bitaxe-raw\target\xtensa-esp32s3-none-elf\release\bitaxe-raw";
pub const DEFAULT_BITAXE_RAW_GAMMA_ELF: &str =
    r"D:\github\bitaxe-raw\bin\bitaxe-raw-gamma";
pub const DEFAULT_BITAXE_RAW_NERDQAXE_PP_ELF: &str =
    r"D:\github\bitaxe-raw\bin\bitaxe-raw-nerdqaxe-pp";

/// Resolve `install_mujina_aml.sh` by checking env VAR or relative workspace paths.
pub fn resolve_install_script() -> Result<String, String> {
    if let Ok(path) = std::env::var("MUJINA_INSTALL_SCRIPT") {
        if Path::new(&path).exists() {
            return Ok(path);
        }
    }
    let candidates = [
        DEFAULT_INSTALL_SCRIPT,
        r"..\mujina-loader\tools\network_install\install_mujina_aml.sh",
    ];
    for cand in candidates {
        if Path::new(cand).exists() {
            return Ok(cand.to_string());
        }
    }
    Ok(DEFAULT_INSTALL_SCRIPT.to_string())
}

/// Resolve `bitaxe-raw` firmware ELF for a specific hardware model.
/// Supports "gamma" (default) and "nerdqaxe-pp".
pub fn resolve_bitaxe_raw_elf(model: Option<&str>) -> Result<String, String> {
    if let Ok(path) = std::env::var("BITAXE_RAW_FIRMWARE_ELF") {
        if Path::new(&path).exists() {
            return Ok(path);
        }
    }

    let default_model_path = match model.unwrap_or("gamma") {
        "nerdqaxe-pp" => DEFAULT_BITAXE_RAW_NERDQAXE_PP_ELF,
        _ => DEFAULT_BITAXE_RAW_GAMMA_ELF,
    };

    if Path::new(default_model_path).exists() {
        return Ok(default_model_path.to_string());
    }

    let candidates = [
        default_model_path,
        DEFAULT_BITAXE_RAW_FIRMWARE_ELF,
        r"..\bitaxe-raw\target\xtensa-esp32s3-none-elf\release\bitaxe-raw",
    ];
    for cand in candidates {
        if Path::new(cand).exists() {
            return Ok(cand.to_string());
        }
    }
    Ok(default_model_path.to_string())
}

/// Resolve a usable git-bash executable: the well-known Git-for-Windows
/// install path first, falling back to whatever `bash` is on PATH.
pub fn resolve_bash() -> Result<String, String> {
    if Path::new(DEFAULT_BASH_EXE).exists() {
        return Ok(DEFAULT_BASH_EXE.to_string());
    }

    if let Ok(output) = std::process::Command::new("where").arg("bash").output() {
        if output.status.success() {
            if let Some(first) = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return Ok(first.to_string());
            }
        }
    }

    Err("git-bash not found; install Git for Windows or set bash path".to_string())
}

/// Resolve `espflash` off PATH (installed via `cargo install espflash`).
pub fn resolve_espflash() -> Result<String, String> {
    if let Ok(output) = std::process::Command::new("where").arg("espflash").output() {
        if output.status.success() {
            if let Some(first) = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return Ok(first.to_string());
            }
        }
    }

    Err("espflash not found on PATH; install with `cargo install espflash --locked`".to_string())
}
