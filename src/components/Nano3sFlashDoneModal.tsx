import { useState } from "react";
import type { Nano3sImageRole } from "../types";

interface Props {
  role: Nano3sImageRole;
  onMonitor: (ip: string) => void;
  onBack: () => void;
}

export default function Nano3sFlashDoneModal({ role, onMonitor, onBack }: Props) {
  const [ip, setIp] = useState("");
  const isMujina = role === "mujina";

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap flash-success-modal-wrap">
        <div className="flash-success-ring" aria-hidden="true" />
        <div className="confirm-modal flash-success-modal">
          <div className="flash-success-header">
            <div className="flash-success-badge">✓ FLASH COMPLETE</div>
            <h2 className="flash-success-title">
              {isMujina ? "nano-mujina is on the Nano 3S" : "Canaan stock firmware restored"}
            </h2>
          </div>

          <div className="flash-success-body">
            <div className="flash-step-list">
              <Step n={1} heading="Power off and unplug the USB cable" />
              <Step n={2} heading="Plug the Wi-Fi module back in">
                It has to be in before power-on so it's detected at boot.
              </Step>
              <Step n={3} heading="Power on and set up Wi-Fi over Bluetooth">
                {isMujina ? (
                  <>
                    In the Avalon Family app, connect to the device named <code>nan3s_…</code> and enter your
                    2.4&nbsp;GHz Wi-Fi details. The screen shows each setup step.
                  </>
                ) : (
                  <>
                    In the Avalon Family app: New devices → Nano 3S → Search → <code>nano3s_…</code>, with the phone
                    on the 2.4&nbsp;GHz Wi-Fi the miner should join.
                  </>
                )}
              </Step>
              {isMujina && (
                <Step n={4} heading="Enter the miner's IP address">
                  From your router or the device's screen. nano-mujina serves its dashboard and API on port 80.
                  <div className="scan-controls" style={{ marginTop: "0.5rem" }}>
                    <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.x" />
                  </div>
                </Step>
              )}
            </div>
          </div>

          <div className="confirm-modal-actions flash-success-actions">
            <button type="button" className="flash-btn-secondary" onClick={onBack}>
              Back to devices
            </button>
            {isMujina && (
              <button
                type="button"
                className="flash-btn-primary"
                disabled={ip.trim() === ""}
                onClick={() => onMonitor(ip.trim())}
              >
                Open monitor &rarr;
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, heading, children }: { n: number; heading: string; children?: React.ReactNode }) {
  return (
    <div className="flash-step-item">
      <div className="flash-step-num">{n}</div>
      <div className="flash-step-content">
        <div className="flash-step-heading">{heading}</div>
        {children && <div className="flash-step-desc">{children}</div>}
      </div>
    </div>
  );
}
