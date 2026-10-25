import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { inspectNano3sBundle, updateNano3sBundle } from "../api";
import type { BundleInfo } from "../types";

// Windows' "Copy as path" wraps the path in double quotes.
function cleanPath(path: string): string {
  return path.trim().replace(/^"(.*)"$/, "$1").trim();
}

function formatBundleSummary(info: BundleInfo): string {
  const mib = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return [
    `File      ${info.path} (${mib(info.file_size)})`,
    `SHA-256   ${info.sha256}`,
    `Verified  ${info.known ?? "no"}`,
    `Replaces  ${[info.minerd_bytes && `mujina-minerd (${mib(info.minerd_bytes)})`, info.harness_bytes && `harness (${mib(info.harness_bytes)})`]
      .filter(Boolean)
      .join(", ")}`,
    ...info.warnings.map((w) => `Warning   ${w}`),
  ].join("\n");
}

// Network update for a Nano 3S already running nano-mujina: uploads an
// MJBUNDL1 bundle (from github.com/aadhi1014/nano-mujina/releases) to the
// device's /api/v0/firmware/bundle. Settings on the device are kept. The
// backend repeats the bundle check and confirms the device before uploading.
export default function Nano3sUpdatePanel() {
  const [ip, setIp] = useState("");
  const [token, setToken] = useState("");
  const [bundlePath, setBundlePath] = useState("");
  const [info, setInfo] = useState<BundleInfo | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<"checking" | "uploading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function reset() {
    setInfo(null);
    setAccepted(false);
    setResult(null);
  }

  async function browse() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "nano-mujina bundle", extensions: ["bin"] }],
    });
    if (typeof picked === "string") {
      setBundlePath(picked);
      reset();
    }
  }

  async function check() {
    setBusy("checking");
    setError(null);
    reset();
    try {
      setInfo(await inspectNano3sBundle(cleanPath(bundlePath)));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    if (!info) return;
    setBusy("uploading");
    setError(null);
    try {
      setResult(await updateNano3sBundle(ip.trim(), info.path, info.warnings.length > 0, token.trim() || undefined));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const bundleOk = info !== null && info.problems.length === 0;

  return (
    <div className="config-form-wrap">
      <div className="config-form-ring" aria-hidden="true" />
      <div className="config-form">
        <label>
          Update over the network
          <small>
            For a Nano 3S already running nano-mujina. Uploads a firmware bundle (.bin), replaces mujina-minerd
            and reboots. Wi-Fi, pool, fan and tuning settings are kept. The old binary isn't kept on the device:
            to roll back, upload a bundle of the previous version, or flash a .kdimg over USB above.
          </small>
        </label>
        <label>
          Device IP
          <input
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setToken("");
            }}
            placeholder="e.g. 192.168.4.61"
          />
        </label>
        <label>
          API token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="optional — only if the device has one"
          />
        </label>
        <label>
          Bundle (.bin)
          <input
            value={bundlePath}
            onChange={(e) => {
              setBundlePath(e.target.value);
              reset();
            }}
            placeholder="path to nano-mujina-alpha-v4-bundle.bin"
          />
        </label>
        <div className="scan-controls">
          <button type="button" onClick={browse}>
            Browse...
          </button>
          <button type="button" onClick={check} disabled={busy !== null || cleanPath(bundlePath) === ""}>
            {busy === "checking" ? "Checking bundle..." : "Check bundle"}
          </button>
        </div>

        {info && info.problems.length > 0 && (
          <p className="error">Can't upload this bundle: {info.problems.join("; ")}</p>
        )}
        {info && <pre className="confirm-modal-preview">{formatBundleSummary(info)}</pre>}
        {bundleOk && (
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              {info.warnings.length > 0
                ? "I've checked the warnings above. Upload and reboot the device."
                : "Upload and reboot the device."}
            </span>
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {result && (
          <p className="scan-hint">
            Device says: {result}. Give it a minute, then monitor it at {ip.trim()}.
          </p>
        )}

        <div className="config-form-actions">
          <button
            type="button"
            className="confirm-modal-danger"
            disabled={!bundleOk || !accepted || ip.trim() === "" || busy !== null || result !== null}
            onClick={upload}
          >
            {busy === "uploading" ? "Uploading..." : "Upload bundle"}
          </button>
        </div>
      </div>
    </div>
  );
}
