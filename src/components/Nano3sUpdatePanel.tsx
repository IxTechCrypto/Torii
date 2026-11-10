import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { inspectNano3sBundle, pollMiner, updateNano3sBundle } from "../api";
import { parseMujinaState, type MinerStats } from "../telemetry";
import type { BundleInfo } from "../types";
import Toggle from "./Toggle";

// Windows' "Copy as path" wraps the path in double quotes.
function cleanPath(path: string): string {
  return path.trim().replace(/^"(.*)"$/, "$1").trim();
}

function formatBundleSummary(info: BundleInfo): string {
  const mib = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return [
    `File      ${info.path} (${mib(info.file_size)})`,
    `SHA-256   ${info.sha256}`,
    `Verified  ${info.known ?? "no (unverified signature)"}`,
    `Replaces  ${[
      info.minerd_bytes && `mujina-minerd (${mib(info.minerd_bytes)})`,
      info.harness_bytes && `harness (${mib(info.harness_bytes)})`,
    ]
      .filter(Boolean)
      .join(", ")}`,
    ...info.warnings.map((w) => `Warning   ${w}`),
  ].join("\n");
}

type UpdateStage = "idle" | "uploading" | "rebooting" | "verified" | "timeout";

// Network update for a Nano 3S already running nano-mujina: uploads an
// MJBUNDL1 bundle (from github.com/IxTechCrypto/mujina/releases) to the
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

  // Post-update telemetry verification
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [telemetry, setTelemetry] = useState<MinerStats | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  function stopTimers() {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopTimers();
  }, []);

  function reset() {
    stopTimers();
    setInfo(null);
    setAccepted(false);
    setResult(null);
    setStage("idle");
    setElapsed(0);
    setTelemetry(null);
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
    setStage("uploading");
    setError(null);
    stopTimers();

    try {
      const res = await updateNano3sBundle(
        ip.trim(),
        info.path,
        info.warnings.length > 0,
        token.trim() || undefined
      );
      setResult(res);
      startRebootWatcher(ip.trim());
    } catch (e) {
      setError(String(e));
      setStage("idle");
    } finally {
      setBusy(null);
    }
  }

  function startRebootWatcher(targetIp: string) {
    setStage("rebooting");
    setElapsed(0);

    const startTime = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startTime) / 1000));
    }, 1000);

    // Initial wait before polling to allow device to reset socket
    setTimeout(() => {
      pollTimerRef.current = window.setInterval(async () => {
        const secondsSoFar = Math.round((Date.now() - startTime) / 1000);
        if (secondsSoFar > 90) {
          stopTimers();
          setStage("timeout");
          return;
        }

        try {
          // Nano-mujina runs its API on port 80
          const raw = await pollMiner(targetIp, 80);
          const parsed = parseMujinaState(raw);
          if (parsed && (parsed.uptimeSeconds > 0 || parsed.hashRateTH > 0)) {
            setTelemetry(parsed);
            setStage("verified");
            // If already hashing, slow down poll or keep live updating
          }
        } catch {
          // Device still rebooting or bringing up network/minerd
        }
      }, 2500);
    }, 4000);
  }

  const bundleOk = info !== null && info.problems.length === 0;

  return (
    <div className="config-form-wrap">
      <div className="config-form-ring" aria-hidden="true" />
      <div className="config-form">
        <label>
          Update over the network
          <small>
            For a Nano 3S already running nano-mujina. Uploads a firmware bundle (.bin), replaces mujina-minerd,
            and safely reboots. Wi-Fi, pool, fan, and tuning settings are kept intact.
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
            placeholder="e.g. 192.168.4.37"
            disabled={stage === "uploading" || stage === "rebooting"}
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
            disabled={stage === "uploading" || stage === "rebooting"}
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
            placeholder="path to nano-mujina-v5.0.4-bundle.bin"
            disabled={stage === "uploading" || stage === "rebooting"}
          />
        </label>

        <div className="scan-controls">
          <button
            type="button"
            onClick={browse}
            disabled={stage === "uploading" || stage === "rebooting"}
          >
            Browse...
          </button>
          <button
            type="button"
            onClick={check}
            disabled={busy !== null || cleanPath(bundlePath) === "" || stage === "uploading" || stage === "rebooting"}
          >
            {busy === "checking" ? "Checking bundle..." : "Check bundle"}
          </button>
        </div>

        {info && info.problems.length > 0 && (
          <p className="error">Can't upload this bundle: {info.problems.join("; ")}</p>
        )}

        {info && <pre className="confirm-modal-preview">{formatBundleSummary(info)}</pre>}

        {bundleOk && stage === "idle" && (
          <Toggle
            checked={accepted}
            onChange={setAccepted}
            title={
              info.warnings.length > 0
                ? "Acknowledge Warnings & Authorize Update"
                : "Authorize Firmware Bundle Update & Reboot"
            }
            description={
              info.warnings.length > 0
                ? "I have reviewed the warnings above. Ready to upload to device and reboot."
                : "Deploy new firmware bundle over the network and automatically reboot the miner."
            }
          />
        )}

        {error && <p className="error">{error}</p>}

        {/* --- Telemetry Watcher & Verification Status --- */}
        {stage === "rebooting" && (
          <div className="ota-status-card">
            <div className="ota-status-header">
              <span className="ota-status-badge ota-status-badge-pulse">
                ⟳ Rebooting Device ({elapsed}s)
              </span>
              <span className="scan-hint" style={{ margin: 0 }}>
                {elapsed < 15
                  ? "Writing bundle to NAND & restarting Linux..."
                  : "Waiting for Wi-Fi and mujina-minerd IPC..."}
              </span>
            </div>
          </div>
        )}

        {stage === "verified" && telemetry && (
          <div className="ota-status-card ota-status-card-verified">
            <div className="ota-status-header">
              <span className="ota-status-badge ota-status-badge-verified">
                ✓ Verified Live & Hashing
              </span>
              <span className="scan-hint" style={{ margin: 0 }}>
                {telemetry.model || "Avalon Nano 3S"} · Uptime: {telemetry.uptimeSeconds}s
              </span>
            </div>
            <div className="ota-telemetry-grid">
              <div className="ota-stat-box">
                <span className="ota-stat-label">Hashrate</span>
                <span className="ota-stat-value" style={{ color: "var(--cyan)" }}>
                  {telemetry.hashRateTH.toFixed(2)} TH/s
                </span>
              </div>
              <div className="ota-stat-box">
                <span className="ota-stat-label">Power</span>
                <span className="ota-stat-value">
                  {telemetry.powerWatts.toFixed(0)} W
                </span>
              </div>
              <div className="ota-stat-box">
                <span className="ota-stat-label">ASIC Temp</span>
                <span className="ota-stat-value">
                  {telemetry.chipTemps[0] ? `${telemetry.chipTemps[0].toFixed(0)}°C` : "—"}
                </span>
              </div>
              <div className="ota-stat-box">
                <span className="ota-stat-label">Accepted Shares</span>
                <span className="ota-stat-value" style={{ color: "#1bff9c" }}>
                  {telemetry.sharesAccepted}
                </span>
              </div>
            </div>
          </div>
        )}

        {stage === "timeout" && (
          <div className="ota-status-card">
            <div className="ota-status-header">
              <span className="ota-status-badge ota-status-badge-warn">
                ⚠ Reboot Verification Timeout (90s)
              </span>
            </div>
            <p className="scan-hint" style={{ margin: 0 }}>
              The device was signaled to reboot, but did not respond on port 80 within 90 seconds.
              Check if the unit acquired a new DHCP IP address, or connect via SSH to check logs.
            </p>
          </div>
        )}

        {result && stage === "idle" && (
          <p className="scan-hint">
            Device says: {result}.
          </p>
        )}

        <div className="config-form-actions">
          <button
            type="button"
            className="confirm-modal-danger"
            disabled={!bundleOk || !accepted || ip.trim() === "" || busy !== null || stage === "uploading" || stage === "rebooting"}
            onClick={upload}
          >
            {busy === "uploading" ? "Uploading..." : "Upload bundle"}
          </button>
        </div>
      </div>
    </div>
  );
}
