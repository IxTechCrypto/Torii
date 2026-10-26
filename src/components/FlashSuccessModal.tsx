import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  model?: string;
  onProceedToMonitor: () => void;
  onBackToDevices: () => void;
}

export default function FlashSuccessModal({
  model,
  onProceedToMonitor,
  onBackToDevices,
}: Props) {
  const modelName = model === "nerdqaxe-pp" ? "NerdQAxe++ (0xcaf1)" : "Bitaxe Gamma (0xcafe)";

  async function handleOpenLocalDashboard() {
    const url = "http://127.0.0.1:7785";
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noreferrer");
    }
  }

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap flash-success-modal-wrap">
        <div className="flash-success-ring" aria-hidden="true" />
        <div className="confirm-modal flash-success-modal">
          <div className="flash-success-header">
            <div className="flash-success-badge">✓ FLASH COMPLETE</div>
            <h2 className="flash-success-title">Successfully flashed the Miner!</h2>
            <div className="flash-success-model">
              Firmware Target: <strong>{modelName}</strong>
            </div>
          </div>

          <div className="flash-success-body">
            <p className="flash-success-intro">
              The <code>bitaxe-raw</code> firmware image has been written to the board. Complete the following steps to bring it online:
            </p>

            <div className="flash-step-list">
              <div className="flash-step-item">
                <div className="flash-step-num">1</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Press Hardware RESET Button</div>
                  <div className="flash-step-desc">
                    The ESP32-S3 stays in bootloader download mode after native USB flashing. Press the physical <strong>RESET</strong> button on the Bitaxe once (or unplug and replug the USB cable) to boot the new firmware.
                  </div>
                </div>
              </div>

              <div className="flash-step-item">
                <div className="flash-step-num">2</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Verify Windows Enumeration</div>
                  <div className="flash-step-desc">
                    After resetting, Windows will re-enumerate the device as a custom pass-through mining board (<code>C0DE:CAFE</code> or <code>C0DE:CAF1</code>).
                  </div>
                </div>
              </div>

              <div className="flash-step-item">
                <div className="flash-step-num">3</div>
                <div className="flash-step-content">
                  <div className="flash-step-heading">Restart Mujina Miner Host Daemon</div>
                  <div className="flash-step-desc">
                    The local mining daemon binds to USB hardware during initialization. Restart Mujina via the dashboard (<a href="http://127.0.0.1:7785" target="_blank" rel="noreferrer">http://127.0.0.1:7785</a>) or by running <code>start-mujina.ps1</code>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="confirm-modal-actions flash-success-actions">
            <button type="button" className="flash-btn-secondary" onClick={onBackToDevices}>
              ← Flash Another Board
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="flash-btn-secondary" onClick={onProceedToMonitor}>
                Inline Monitor
              </button>
              <button
                type="button"
                className="flash-btn-primary"
                onClick={handleOpenLocalDashboard}
                style={{ background: "#ff2e97", color: "#fff", fontWeight: 700 }}
              >
                Open Host Dashboard ↗
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
