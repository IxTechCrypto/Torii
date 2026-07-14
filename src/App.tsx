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
  const [installExitCode, setInstallExitCode] = useState<number | null>(null);

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
    setInstallExitCode(null);
    setPreviewText(null);
    setScreen("installing");
  }

  function handleCancelPreview() {
    setPendingConfig(null);
    setPreviewText(null);
  }

  function handleInstallDone(exitCode: number) {
    setInstallExitCode(exitCode);
    if (exitCode === 0) {
      setScreen("telemetry");
    }
  }

  function isScreenReachable(s: Screen): boolean {
    switch (s) {
      case "scan":
        return true;
      case "config":
        return selected !== null;
      case "installing":
        // Disabled once an install has succeeded — re-entering would remount
        // InstallLog and re-run the installer against a board that's already
        // been flashed.
        return installConfig !== null && installExitCode !== 0;
      case "telemetry":
        return installExitCode === 0;
    }
  }

  return (
    <main className="container">
      <div className="hud-frame-wrap">
        <div className="hud-frame-ring" aria-hidden="true" />
        <div className="hud-frame">
        <div className="hud-tick-row" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <header className="app-header">
          <img src="/torii-icon.svg" alt="" className="app-logo" />
          <h1>Torii</h1>
        </header>

        <nav className="screen-nav">
          {(["scan", "config", "installing", "telemetry"] as Screen[]).map((s) => {
            const reachable = isScreenReachable(s);
            return (
              <button
                key={s}
                className={[
                  s === screen ? "screen-nav-active" : "",
                  reachable ? "" : "screen-nav-disabled",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!reachable}
                onClick={() => reachable && setScreen(s)}
              >
                {s}
              </button>
            );
          })}
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
      </div>
    </main>
  );
}

export default App;
