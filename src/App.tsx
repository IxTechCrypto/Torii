import { useState } from "react";
import ScanTable from "./components/ScanTable";
import ConfigForm from "./components/ConfigForm";
import ConfirmModal from "./components/ConfirmModal";
import InstallLog from "./components/InstallLog";
import TelemetryView from "./components/TelemetryView";
import { preview } from "./api";
import type { HostRecord, InstallConfig } from "./types";
import "./styles.css";

type Screen = "scan" | "config" | "installing" | "telemetry";

function App() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [selected, setSelected] = useState<{ record: HostRecord; scanFile: string } | null>(null);
  const [pendingConfig, setPendingConfig] = useState<InstallConfig | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installConfig, setInstallConfig] = useState<InstallConfig | null>(null);

  function handleSelect(record: HostRecord, scanFile: string) {
    setSelected({ record, scanFile });
    setScreen("config");
  }

  async function handleConfigSubmit(config: InstallConfig) {
    setPreviewError(null);
    try {
      const text = await preview(config.scan_file, config.host);
      setPendingConfig(config);
      setPreviewText(text);
    } catch (e) {
      setPreviewError(String(e));
    }
  }

  function handleConfirm() {
    setInstallConfig(pendingConfig);
    setPreviewText(null);
    setScreen("installing");
  }

  function handleCancelPreview() {
    setPendingConfig(null);
    setPreviewText(null);
  }

  function handleInstallDone(_exitCode: number) {
    setScreen("telemetry");
  }

  return (
    <main className="container">
      <div className="hud-frame">
        <header className="app-header">
          <img src="/torii-icon.svg" alt="" className="app-logo" />
          <h1>Torii</h1>
        </header>

        <nav className="screen-nav">
          {(["scan", "config", "installing", "telemetry"] as Screen[]).map((s) => (
            <button
              key={s}
              className={s === screen ? "screen-nav-active" : ""}
              onClick={() => setScreen(s)}
            >
              {s}
            </button>
          ))}
        </nav>

        {screen === "scan" && <ScanTable onSelect={handleSelect} />}

        {screen === "config" &&
          (selected ? (
            <>
              <ConfigForm
                record={selected.record}
                scanFile={selected.scanFile}
                onSubmit={handleConfigSubmit}
                onBack={() => setScreen("scan")}
              />
              {previewError && <p className="error">{previewError}</p>}
              {previewText !== null && (
                <ConfirmModal
                  previewText={previewText}
                  onConfirm={handleConfirm}
                  onCancel={handleCancelPreview}
                />
              )}
            </>
          ) : (
            <p>No host selected — go back to the scan screen and pick one.</p>
          ))}

        {screen === "installing" &&
          (installConfig ? (
            <InstallLog config={installConfig} onDone={handleInstallDone} />
          ) : (
            <p>No install configured yet.</p>
          ))}

        {screen === "telemetry" &&
          (selected ? (
            <TelemetryView ip={selected.record.host} />
          ) : (
            <p>No host selected.</p>
          ))}
      </div>
    </main>
  );
}

export default App;
