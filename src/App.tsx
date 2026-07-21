import { useEffect, useState } from "react";
import ScanTable from "./components/ScanTable";
import ConfigForm from "./components/ConfigForm";
import ConfirmModal from "./components/ConfirmModal";
import InstallLog from "./components/InstallLog";
import TelemetryView from "./components/TelemetryView";
import BitaxeUsbTable from "./components/BitaxeUsbTable";
import BitaxeFlashLog from "./components/BitaxeFlashLog";
import { peekUsbSerial, preview } from "./api";
import { detectAsic } from "./asic";
import { formatUsbDeviceSummary, type HostRecord, type InstallConfig, type UsbDeviceRecord } from "./types";
import "./styles.css";

type Screen = "scan" | "config" | "installing" | "telemetry" | "usb" | "flash";

function App() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [selected, setSelected] = useState<{ record: HostRecord; scanFile: string } | null>(null);
  const [pendingConfig, setPendingConfig] = useState<InstallConfig | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installConfig, setInstallConfig] = useState<InstallConfig | null>(null);
  const [installExitCode, setInstallExitCode] = useState<number | null>(null);
  const [telemetryIp, setTelemetryIp] = useState<string | null>(null);
  const [usbConfirmPending, setUsbConfirmPending] = useState<UsbDeviceRecord | null>(null);
  const [usbPeekText, setUsbPeekText] = useState<string | null>(null);
  const [usbPeekLoading, setUsbPeekLoading] = useState(false);
  const [usbFlashPort, setUsbFlashPort] = useState<string | null>(null);
  const [usbFlashExitCode, setUsbFlashExitCode] = useState<number | null>(null);

  // Whenever a candidate device is up for confirmation, listen on its port
  // for a few seconds and capture whatever the firmware already running on
  // it is logging — much stronger identity evidence than the VID/PID match
  // alone, since it's real content from the chip, not just a USB descriptor.
  useEffect(() => {
    if (!usbConfirmPending) {
      setUsbPeekText(null);
      return;
    }
    let cancelled = false;
    setUsbPeekLoading(true);
    setUsbPeekText(null);
    peekUsbSerial(usbConfirmPending.port)
      .then((text) => {
        if (!cancelled) setUsbPeekText(text);
      })
      .catch((e) => {
        if (!cancelled) setUsbPeekText(`(couldn't read console: ${String(e)})`);
      })
      .finally(() => {
        if (!cancelled) setUsbPeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usbConfirmPending]);

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
    if (exitCode === 0 && selected) {
      setTelemetryIp(selected.record.host);
      setScreen("telemetry");
    }
  }

  function handleUsbSelect(record: UsbDeviceRecord) {
    setUsbConfirmPending(record);
  }

  function handleUsbConfirm() {
    if (!usbConfirmPending) return;
    setUsbFlashPort(usbConfirmPending.port);
    setUsbFlashExitCode(null);
    setUsbConfirmPending(null);
    setScreen("flash");
  }

  function handleUsbFlashDone(exitCode: number) {
    setUsbFlashExitCode(exitCode);
    if (exitCode === 0) {
      // mujina-minerd is already running on this host and picks up the
      // freshly-flashed Bitaxe on its own USB scan — poll it locally to
      // confirm rather than sending the user off to check some other way.
      setTelemetryIp("127.0.0.1");
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
        return telemetryIp !== null;
      case "usb":
        return true;
      case "flash":
        // Same re-entry guard as "installing": once a flash has succeeded,
        // re-entering would remount BitaxeFlashLog and re-run espflash
        // against a board that's already been flashed.
        return usbFlashPort !== null && usbFlashExitCode !== 0;
    }
  }

  // Identify the ASIC from the console peek (only once the peek has finished —
  // mid-peek we don't yet know). A positively-detected unsupported chip blocks
  // the flash; a null result (quiet/empty peek) is "unknown" and never blocks.
  const usbAsic = usbPeekLoading ? null : detectAsic(usbPeekText);
  const usbUnsupported = usbAsic !== null && !usbAsic.supported;
  const usbNotice = usbPeekLoading
    ? { level: "info" as const, text: "Identifying ASIC from the board's console…" }
    : usbUnsupported
      ? {
          level: "danger" as const,
          text: `Detected ${usbAsic!.chip} (${usbAsic!.model}) — not supported. mujina currently drives only the Bitaxe Gamma (BM1370). Flashing would overwrite AxeOS and the board still wouldn't mine, so it's blocked.`,
        }
      : usbAsic?.supported
        ? { level: "info" as const, text: `Detected ${usbAsic.chip} (${usbAsic.model}) — supported.` }
        : null;

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
          {(["scan", "config", "installing", "telemetry", "usb", "flash"] as Screen[]).map((s) => {
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
          (telemetryIp ? <TelemetryView ip={telemetryIp} /> : <p>No host selected.</p>)}

        {screen === "usb" && (
          <>
            <BitaxeUsbTable onSelect={handleUsbSelect} />
            {usbConfirmPending && (
              <ConfirmModal
                title="Confirm bitaxe-raw flash"
                warning="This writes new firmware onto the ESP32-S3 over USB."
                actionLabel="Flash bitaxe-raw — this is destructive"
                confirmDisabled={usbPeekLoading || usbUnsupported}
                notice={usbNotice}
                previewText={
                  formatUsbDeviceSummary(usbConfirmPending) +
                  "\n\n--- console output (read-only, 3s) ---\n" +
                  (usbPeekLoading
                    ? "listening..."
                    : usbPeekText
                      ? usbPeekText
                      : "(nothing captured — the firmware may just be quiet right now; this doesn't rule the device out)")
                }
                onConfirm={handleUsbConfirm}
                onCancel={() => setUsbConfirmPending(null)}
              />
            )}
          </>
        )}

        {screen === "flash" &&
          (usbFlashPort ? (
            <BitaxeFlashLog port={usbFlashPort} onDone={handleUsbFlashDone} />
          ) : (
            <p>No USB flash in progress.</p>
          ))}
        </div>
      </div>
    </main>
  );
}

export default App;
