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
pub const DEFAULT_NANO3S_MUJINA_KDIMG: &str = r"D:\github\nano-mujina\nano-mujina-alpha-v3.kdimg";
pub const DEFAULT_NANO3S_STOCK_KDIMG: &str = r"D:\github\Avalon_Nano3s\output\stock.kdimg";

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

/// Resolve a Python that can import Kendryte's `k230_flash` package
/// (`pip install k230-flash`), which Torii drives through its own wrapper
/// script: `K230_PYTHON` if set; else the interpreter next to a `K230_FLASH`
/// executable (`Scripts\k230-flash.exe` sits beside `python.exe` in a venv
/// and one level below it in a conda env); else `python`/`python3` on PATH.
pub fn resolve_k230_python() -> Result<String, String> {
    let has_module = |python: &str| {
        std::process::Command::new(python)
            .args(["-c", "import k230_flash"])
            .output()
            .is_ok_and(|o| o.status.success())
    };

    let mut candidates: Vec<String> = Vec::new();
    if let Ok(python) = std::env::var("K230_PYTHON") {
        candidates.push(python);
    }
    if let Ok(cli) = std::env::var("K230_FLASH") {
        let exe = if cfg!(windows) { "python.exe" } else { "python" };
        let scripts_dir = Path::new(&cli).parent();
        for dir in [scripts_dir, scripts_dir.and_then(Path::parent)].into_iter().flatten() {
            candidates.push(dir.join(exe).to_string_lossy().into_owned());
        }
    }
    candidates.extend(["python".to_string(), "python3".to_string()]);

    candidates
        .into_iter()
        .find(|python| has_module(python))
        .ok_or_else(|| {
            "no Python with k230-flash found; install it with `pip install k230-flash`, or set \
             K230_PYTHON to the python that has it"
                .to_string()
        })
}

/// Suggested `.kdimg` for a Nano 3S flash: `NANO3S_MUJINA_KDIMG` /
/// `NANO3S_STOCK_KDIMG` if set, else the default local path, whichever
/// exists.
pub fn default_nano3s_image(role: crate::commands::nano3s::Nano3sImageRole) -> Option<String> {
    use crate::commands::nano3s::Nano3sImageRole;
    let (var, default) = match role {
        Nano3sImageRole::Mujina => ("NANO3S_MUJINA_KDIMG", DEFAULT_NANO3S_MUJINA_KDIMG),
        Nano3sImageRole::Stock => ("NANO3S_STOCK_KDIMG", DEFAULT_NANO3S_STOCK_KDIMG),
    };
    std::env::var(var)
        .ok()
        .into_iter()
        .chain(std::iter::once(default.to_string()))
        .find(|p| Path::new(p).exists())
}
