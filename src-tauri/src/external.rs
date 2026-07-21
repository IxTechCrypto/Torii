//! Paths to external binaries/scripts Torii shells out to, plus the git-bash
//! resolver used to run the (bash) installer script on Windows.

pub const SCAN_BIN: &str = r"D:\github\mujina\.claude\worktrees\interesting-lehmann-2fc234\target\release\mujina-scan.exe";
pub const INSTALL_SCRIPT: &str = r"D:\github\mujina-loader\tools\network_install\install_mujina_aml.sh";
pub const BASH_EXE: &str = r"C:\Program Files\Git\bin\bash.exe";
pub const BITAXE_RAW_FIRMWARE_ELF: &str =
    r"D:\github\bitaxe-raw\target\xtensa-esp32s3-none-elf\release\bitaxe-raw";

/// Resolve a usable git-bash executable: the well-known Git-for-Windows
/// install path first, falling back to whatever `bash` is on PATH.
pub fn resolve_bash() -> Result<String, String> {
    if std::path::Path::new(BASH_EXE).exists() {
        return Ok(BASH_EXE.to_string());
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
