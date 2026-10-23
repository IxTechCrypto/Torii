import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { inspectNano3sImage, listK230BurnDevices, nano3sDefaultImage } from "../api";
import { formatKdimgSummary, type K230BurnDevice, type KdimgInfo, type Nano3sImageRole } from "../types";

interface Props {
  onReady: (info: KdimgInfo, role: Nano3sImageRole) => void;
}

// Windows' "Copy as path" wraps the path in double quotes.
function cleanPath(path: string): string {
  return path.trim().replace(/^"(.*)"$/, "$1").trim();
}

// Avalon Nano 3S (Canaan K230) flash setup: pick the action, put the device
// in USB burn mode, then pick and check the .kdimg. The backend repeats both
// the device check and the image check before it writes anything.
export default function Nano3sPanel({ onReady }: Props) {
  const [role, setRole] = useState<Nano3sImageRole>("mujina");
  const [imagePath, setImagePath] = useState("");
  const [pathEdited, setPathEdited] = useState(false);
  const [devices, setDevices] = useState<K230BurnDevice[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [info, setInfo] = useState<KdimgInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest the default image for the chosen action until the user types
  // their own path.
  useEffect(() => {
    setInfo(null);
    if (pathEdited) return;
    let cancelled = false;
    nano3sDefaultImage(role)
      .then((path) => {
        if (!cancelled) setImagePath(path ?? "");
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
      setDevices(await listK230BurnDevices());
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
    }
  }

  async function checkImage() {
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      setInfo(await inspectNano3sImage(cleanPath(imagePath), role));
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }

  const oneDevice = devices?.length === 1;
  const imageOk = info !== null && info.problems.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="config-form-wrap">
        <div className="config-form-ring" aria-hidden="true" />
        <div className="config-form">
          <label>
            Action
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="radio" name="nano3sRole" checked={role === "mujina"} onChange={() => setRole("mujina")} />
                <span>Install Mujina (nano-mujina)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="radio" name="nano3sRole" checked={role === "stock"} onChange={() => setRole("stock")} />
                <span>Restore Canaan stock firmware</span>
              </label>
            </div>
          </label>

          <div className="flash-step-list">
            <Step n={1} heading="Unplug the Wi-Fi module">
              Remove the USB Wi-Fi receiver first. The burn cable uses the same USB port (Canaan's flashing
              instructions).
            </Step>
            <Step n={2} heading="Connect a USB-A to USB-A cable">
              Between the Nano 3S and this computer, with the Nano 3S powered off.
            </Step>
            <Step n={3} heading="Enter burn mode">
              Hold the recessed button with a pin, then power the Nano 3S on while still holding it.
            </Step>
            <Step n={4} heading="Windows only: install the WinUSB driver once">
              With Zadig, select "K230 USB Boot Device" (VID 29F1, PID 0230) and install WinUSB, as the{" "}
              <code>k230-flash</code> documentation describes.
            </Step>
          </div>

          <div className="scan-controls">
            <button type="button" onClick={detect} disabled={detecting}>
              {detecting ? "Detecting..." : "Detect burn-mode device"}
            </button>
          </div>
          {devices !== null && devices.length === 0 && (
            <p className="scan-hint">No K230 in burn mode found. Repeat steps 1–4 and detect again.</p>
          )}
          {devices !== null && devices.length > 1 && (
            <p className="error">
              {devices.length} K230 devices are in burn mode. Connect only the one you want to flash.
            </p>
          )}
          {oneDevice && (
            <p className="scan-hint">
              Found one K230 in burn mode (bus {devices[0].bus_id}, address {devices[0].address}).
            </p>
          )}

          <label>
            Image (.kdimg, decompressed)
            <input
              value={imagePath}
              onChange={(e) => {
                setPathEdited(true);
                setImagePath(e.target.value);
                setInfo(null);
              }}
              placeholder={role === "mujina" ? "path to nano-mujina-alpha-v3.kdimg" : "path to Canaan stock .kdimg"}
            />
            <small>
              {role === "mujina"
                ? "nano-mujina release image from github.com/aadhi1014/nano-mujina/releases."
                : "Canaan stock image, built from github.com/Canaan-Creative/Avalon_Nano3s (scripts/build)."}
            </small>
          </label>
          <div className="scan-controls">
            <button type="button" onClick={browse}>
              Browse...
            </button>
            <button type="button" onClick={checkImage} disabled={checking || cleanPath(imagePath) === ""}>
              {checking ? "Checking image..." : "Check image"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
          {info && info.problems.length > 0 && (
            <p className="error">Can't flash this image: {info.problems.join("; ")}</p>
          )}
          {info && <pre className="confirm-modal-preview">{formatKdimgSummary(info)}</pre>}

          <div className="config-form-actions">
            <button
              type="button"
              className="confirm-modal-danger"
              disabled={!oneDevice || !imageOk}
              onClick={() => info && onReady(info, role)}
            >
              Review and flash
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, heading, children }: { n: number; heading: string; children: React.ReactNode }) {
  return (
    <div className="flash-step-item">
      <div className="flash-step-num">{n}</div>
      <div className="flash-step-content">
        <div className="flash-step-heading">{heading}</div>
        <div className="flash-step-desc">{children}</div>
      </div>
    </div>
  );
}
