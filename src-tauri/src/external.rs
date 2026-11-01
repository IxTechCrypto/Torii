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

/// Keep Windows from opening a console window for a helper process (Torii
/// is a GUI app, so each spawned console program would otherwise flash one).
pub fn hide_console(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// First match for `name` on PATH (`where` on Windows, `which` elsewhere).
fn find_on_path(name: &str) -> Option<String> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let output = hide_console(std::process::Command::new(finder).arg(name))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Interpreters that may belong to a `k230-flash` launcher: the one named
/// in its `#!` line (a Unix script's first line, or the shebang pip's
/// Windows `.exe` launchers carry near their end), then `python` beside it
/// (venv `Scripts\`/`bin/`) and one level up (conda env root).
fn interpreters_for_cli(cli: &Path) -> Vec<String> {
    let mut found = Vec::new();
    if let Ok(bytes) = std::fs::read(cli) {
        let text = String::from_utf8_lossy(&bytes);
        for line in text.split("#!").skip(1) {
            let interpreter = line.lines().next().unwrap_or("").trim().trim_matches('"');
            // Split on both separators: a Windows launcher's path must be
            // recognised whatever OS this runs on.
            let file_name = interpreter.rsplit(['/', '\\']).next().unwrap_or("");
            let is_python = file_name.to_ascii_lowercase().starts_with("python");
            if is_python {
                found.push(interpreter.to_string());
            }
        }
    }
    let exe = if cfg!(windows) { "python.exe" } else { "python" };
    let dir = cli.parent();
    for dir in [dir, dir.and_then(Path::parent)].into_iter().flatten() {
        found.push(dir.join(exe).to_string_lossy().into_owned());
    }
    found
}

/// Resolve a Python that can import Kendryte's `k230_flash` package
/// (`pip install k230-flash`), which Torii drives through its own wrapper
/// script. Tried in order: `K230_PYTHON`; the interpreter behind
/// `K230_FLASH`; the interpreter behind `k230-flash` on PATH (covers venv,
/// conda and pipx installs); then `python`/`python3` on PATH.
pub fn resolve_k230_python() -> Result<String, String> {
    let has_module = |python: &str| {
        hide_console(std::process::Command::new(python).args(["-c", "import k230_flash"]))
            .output()
            .is_ok_and(|o| o.status.success())
    };

    let mut candidates: Vec<String> = Vec::new();

    // 1. Check for bundled/embedded Python (Windows and dev roots)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join("python-embed").join("python.exe").to_string_lossy().into_owned());
            candidates.push(dir.join("python-embed").join("python.exe").to_string_lossy().into_owned());
            candidates.push(dir.join("_up_").join("resources").join("python-embed").join("python.exe").to_string_lossy().into_owned());
        }
    }
    candidates.push("src-tauri/resources/python-embed/python.exe".to_string());
    candidates.push("resources/python-embed/python.exe".to_string());
    candidates.push("../src-tauri/resources/python-embed/python.exe".to_string());

    // 2. Explicit environment overrides
    if let Ok(python) = std::env::var("K230_PYTHON") {
        candidates.push(python);
    }
    let clis = std::env::var("K230_FLASH").ok().into_iter().chain(find_on_path("k230-flash"));
    for cli in clis {
        candidates.extend(interpreters_for_cli(Path::new(&cli)));
    }
    candidates.extend(["python".to_string(), "python3".to_string()]);

    candidates
        .into_iter()
        .filter(|p| Path::new(p).exists() || !p.contains(std::path::MAIN_SEPARATOR))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_interpreter_from_launcher_shebang() {
        let dir = std::env::temp_dir().join(format!("torii-cli-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A Unix console script, and bytes shaped like pip's Windows .exe
        // launcher (binary stub, then the shebang, then a zip).
        let script = dir.join("k230-flash");
        std::fs::write(&script, "#!/opt/venv/bin/python3\nimport sys\n").unwrap();
        let launcher = dir.join("k230-flash.exe");
        let mut exe = vec![0x4d, 0x5a, 0x90, 0x00, 0xff];
        exe.extend_from_slice(b"#!\"C:\\Users\\me\\pipx\\venvs\\k230-flash\\Scripts\\python.exe\"\r\nPK\x03\x04");
        std::fs::write(&launcher, exe).unwrap();

        assert_eq!(interpreters_for_cli(&script)[0], "/opt/venv/bin/python3");
        assert_eq!(
            interpreters_for_cli(&launcher)[0],
            r"C:\Users\me\pipx\venvs\k230-flash\Scripts\python.exe"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
