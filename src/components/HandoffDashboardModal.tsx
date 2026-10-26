import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  title: string;
  subtitle?: string;
  deviceType: "network" | "usb";
  targetUrl: string;
  steps: { num: number; heading: string; desc?: string }[];
  onBack: () => void;
}

export default function HandoffDashboardModal({
  title,
  subtitle,
  deviceType,
  targetUrl,
  steps,
  onBack,
}: Props) {
  async function handleOpenBrowser() {
    try {
      await openUrl(targetUrl);
    } catch {
      window.open(targetUrl, "_blank", "noreferrer");
    }
  }

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap flash-success-modal-wrap">
        <div className="flash-success-ring" aria-hidden="true" />
        <div className="confirm-modal flash-success-modal">
          <div className="flash-success-header">
            <div className="flash-success-badge">✓ PROVISIONING COMPLETE</div>
            <h2 className="flash-success-title">{title}</h2>
            {subtitle && <div className="flash-success-model">{subtitle}</div>}
          </div>

          <div className="flash-success-body">
            <p className="flash-success-intro">
              Hardware is prepared. Next steps to complete setup:
            </p>

            <div className="flash-step-list">
              {steps.map((s) => (
                <div key={s.num} className="flash-step-item">
                  <div className="flash-step-num">{s.num}</div>
                  <div className="flash-step-content">
                    <div className="flash-step-heading">{s.heading}</div>
                    {s.desc && <div className="flash-step-desc">{s.desc}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="confirm-modal-actions flash-success-actions">
            <button type="button" className="flash-btn-secondary" onClick={onBack}>
              ← Back to Discovery
            </button>
            <button
              type="button"
              className="flash-btn-primary"
              onClick={handleOpenBrowser}
              style={{ background: "#00f0ff", color: "#050811", fontWeight: 700 }}
            >
              Open Web Dashboard ({deviceType === "usb" ? "Local" : "Device"}) ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
