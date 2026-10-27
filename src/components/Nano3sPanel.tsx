import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { inspectNano3sImage, listK230BurnDevices, nano3sDefaultImage } from "../api";
import { formatKdimgSummary, type K230BurnDevice, type KdimgInfo, type Nano3sImageRole } from "../types";

interface Props {
  onReady: (info: KdimgInfo, role: Nano3sImageRole) => void;
}

function cleanPath(path: string): string {
  return path.trim().replace(/^"(.*)"$/, "$1").trim();
}

export default function Nano3sPanel({ onReady }: Props) {
  const [role, setRole] = useState<Nano3sImageRole>("mujina");
  const [imagePath, setImagePath] = useState("");
  const [pathEdited, setPathEdited] = useState(false);
  const [devices, setDevices] = useState<K230BurnDevice[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [info, setInfo] = useState<KdimgInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Auto-detect burn device on mount
  useEffect(() => {
    detect();
  }, []);

  // Update default image whenever role changes (unless manually edited)
  useEffect(() => {
    setInfo(null);
    if (pathEdited) return;
    let cancelled = false;
    nano3sDefaultImage(role)
      .then((path) => {
        if (!cancelled && path) {
          setImagePath(path);
          // auto-check default image
          inspectNano3sImage(cleanPath(path), role)
            .then((res) => {
              if (!cancelled) setInfo(res);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role, pathEdited]);

  async function detect() {
    setDetecting(true);
    setError(null);
    try {
      const found = await listK230BurnDevices();
      setDevices(found);
    } catch (e) {
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function browse() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "K230 image", extensions: ["kdimg"] }],
    });
    if (typeof picked === "string") {
      setPathEdited(true);
      setImagePath(picked);
      setInfo(null);
      // Auto check after browsing
      setChecking(true);
      setError(null);
      try {
        const checked = await inspectNano3sImage(cleanPath(picked), role);
        setInfo(checked);
      } catch (e) {
        setError(String(e));
      } finally {
        setChecking(false);
      }
    }
  }

  async function checkImage() {
    if (!imagePath) return;
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      const checked = await inspectNano3sImage(cleanPath(imagePath), role);
      setInfo(checked);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }

  const oneDevice = devices?.length === 1;
  const imageOk = info !== null && info.problems.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "680px" }}>
      {/* 1. Action Segmented Control */}
      <div>
        <label style={{ fontSize: "0.75rem", letterSpacing: "0.08em", color: "#8a9ba8", textTransform: "uppercase", display: "block", marginBottom: "0.5rem" }}>
          Target Action
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => setRole("mujina")}
            style={{
              padding: "0.75rem 1rem",
              background: role === "mujina" ? "rgba(0, 240, 255, 0.15)" : "rgba(255, 255, 255, 0.03)",
              border: role === "mujina" ? "2px solid #00f0ff" : "1px solid rgba(255, 255, 255, 0.12)",
              color: role === "mujina" ? "#00f0ff" : "#8a9ba8",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: "4px",
              textAlign: "center",
              transition: "all 0.15s ease",
            }}
          >
            ⚡ Install Mujina (nano-mujina)
          </button>
          <button
            type="button"
            onClick={() => setRole("stock")}
            style={{
              padding: "0.75rem 1rem",
              background: role === "stock" ? "rgba(255, 176, 0, 0.15)" : "rgba(255, 255, 255, 0.03)",
              border: role === "stock" ? "2px solid #ffb000" : "1px solid rgba(255, 255, 255, 0.12)",
              color: role === "stock" ? "#ffb000" : "#8a9ba8",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: "4px",
              textAlign: "center",
              transition: "all 0.15s ease",
            }}
          >
            ↩ Restore Canaan Stock Firmware
          </button>
        </div>
      </div>

      {/* 2. Hardware Connection Status Card */}
      <div
        style={{
          background: "rgba(5, 12, 20, 0.6)",
          border: oneDevice ? "1px solid rgba(0, 240, 255, 0.4)" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "6px",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.1rem" }}>{oneDevice ? "🟢" : "🟡"}</span>
            <div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: oneDevice ? "#00f0ff" : "#e0e6ed" }}>
                {oneDevice
                  ? `K230 Burn Device Ready (Bus ${devices![0].bus_id}, Addr ${devices![0].address})`
                  : detecting
                  ? "Scanning for K230 Burn Mode Device..."
                  : "No K230 in Burn Mode Detected"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#8a9ba8", marginTop: "2px" }}>
                {oneDevice
                  ? "Direct USB connection verified. Ready for firmware flashing."
                  : "Connect USB-A cable and power on while holding recessed button."}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={detect}
              disabled={detecting}
              style={{
                fontSize: "0.75rem",
                padding: "6px 12px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#fff",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {detecting ? "Checking..." : "🔄 Re-Scan"}
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              style={{
                fontSize: "0.75rem",
                padding: "6px 12px",
                background: showGuide ? "rgba(0, 240, 255, 0.2)" : "transparent",
                border: "1px solid rgba(0, 240, 255, 0.4)",
                color: "#00f0ff",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {showGuide ? "Hide Guide ▲" : "Hardware Setup Guide ▼"}
            </button>
          </div>
        </div>

        {/* Collapsible Connection Guide */}
        {showGuide && (
          <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px dashed rgba(255, 255, 255, 0.12)" }}>
            <div className="flash-step-list" style={{ margin: 0 }}>
              <div className="flash-step-item">
                <div className="flash-step-num">1</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Unplug the Wi-Fi module</div>
                  <div className="flash-step-desc">The burn cable uses the same internal USB port.</div>
                </div>
              </div>
              <div className="flash-step-item">
                <div className="flash-step-num">2</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Connect USB-A to USB-A cable</div>
                  <div className="flash-step-desc">Between the Nano 3S and this PC while powered off.</div>
                </div>
              </div>
              <div className="flash-step-item">
                <div className="flash-step-num">3</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Enter burn mode</div>
                  <div className="flash-step-desc">Hold the recessed button with a pin, then power on while still holding it.</div>
                </div>
              </div>
              <div className="flash-step-item">
                <div className="flash-step-num">4</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">WinUSB Driver (Windows Only)</div>
                  <div className="flash-step-desc">Select "K230 USB Boot Device" (29F1:0230) in Zadig once.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Firmware Image Card */}
      <div
        style={{
          background: "rgba(5, 12, 20, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "6px",
          padding: "1rem",
        }}
      >
        <label style={{ fontSize: "0.75rem", letterSpacing: "0.08em", color: "#8a9ba8", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>
          Firmware Image (.kdimg)
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            style={{
              flex: 1,
              background: "#03080e",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#fff",
              padding: "0.55rem 0.75rem",
              borderRadius: "4px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "0.85rem",
            }}
            value={imagePath}
            onChange={(e) => {
              setPathEdited(true);
              setImagePath(e.target.value);
              setInfo(null);
            }}
            placeholder={role === "mujina" ? "Select nano-mujina .kdimg..." : "Select Canaan stock .kdimg..."}
          />
          <button
            type="button"
            onClick={browse}
            style={{
              padding: "0.55rem 1rem",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#fff",
              cursor: "pointer",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            Browse...
          </button>
          <button
            type="button"
            onClick={checkImage}
            disabled={checking || cleanPath(imagePath) === ""}
            style={{
              padding: "0.55rem 1rem",
              background: "rgba(0, 240, 255, 0.1)",
              border: "1px solid #00f0ff",
              color: "#00f0ff",
              cursor: "pointer",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            {checking ? "Checking..." : "Verify"}
          </button>
        </div>

        {error && <p className="error" style={{ margin: "0.75rem 0 0" }}>{error}</p>}
        {info && info.problems.length > 0 && (
          <p className="error" style={{ margin: "0.75rem 0 0" }}>Can't flash this image: {info.problems.join("; ")}</p>
        )}
        {info && (
          <div style={{ marginTop: "0.75rem" }}>
            <pre className="confirm-modal-preview" style={{ maxHeight: "140px", margin: 0 }}>
              {formatKdimgSummary(info)}
            </pre>
          </div>
        )}
      </div>

      {/* 4. Action Button */}
      <div>
        <button
          type="button"
          disabled={!oneDevice || !imageOk}
          onClick={() => info && onReady(info, role)}
          style={{
            width: "100%",
            padding: "0.85rem",
            background: (!oneDevice || !imageOk) ? "rgba(255, 255, 255, 0.05)" : "#00f0ff",
            color: (!oneDevice || !imageOk) ? "#4a5a68" : "#050811",
            border: (!oneDevice || !imageOk) ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
            borderRadius: "4px",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: "0.95rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            cursor: (!oneDevice || !imageOk) ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
            boxShadow: (!oneDevice || !imageOk) ? "none" : "0 0 16px rgba(0, 240, 255, 0.4)",
          }}
        >
          {role === "mujina" ? "⚡ Review & Flash nano-mujina ➔" : "↩ Review & Restore Canaan Stock ➔"}
        </button>
        {(!oneDevice || !imageOk) && (
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#6a7b8a", margin: "0.5rem 0 0" }}>
            {!oneDevice
              ? "Put Nano 3S in USB burn mode to enable flashing."
              : !imagePath
              ? "Select a firmware image above to continue."
              : "Verify the firmware image above to continue."}
          </p>
        )}
      </div>
    </div>
  );
}
