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

type Screen = "discovery" | "config" | "usb-confirm" | "deploying" | "telemetry";

function App() {
  const [screen, setScreen] = useState<Screen>("discovery");
  const [discoveryMode, setDiscoveryMode] = useState<"lan" | "usb">("lan");
  const [selected, setSelected] = useState<{ record: HostRecord; scanFile: string } | null>(null);
  const [pendingConfig, setPendingConfig] = useState<InstallConfig | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installConfig, setInstallConfig] = useState<InstallConfig | null>(null);
  const [telemetryIp, setTelemetryIp] = useState<string | null>(null);
  const [usbConfirmPending, setUsbConfirmPending] = useState<UsbDeviceRecord | null>(null);
  const [usbPeekText, setUsbPeekText] = useState<string | null>(null);
  const [usbPeekLoading, setUsbPeekLoading] = useState(false);
  const [usbFlashPort, setUsbFlashPort] = useState<string | null>(null);

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
    setPreviewText(null);
    setScreen("deploying");
  }

  function handleCancelPreview() {
    setPendingConfig(null);
    setPreviewText(null);
  }

  function handleInstallDone(exitCode: number) {
    if (exitCode === 0 && selected) {
      setTelemetryIp(selected.record.host);
      setScreen("telemetry");
    }
  }

  function handleUsbSelect(record: UsbDeviceRecord) {
    setUsbConfirmPending(record);
    setScreen("usb-confirm");
  }

  function handleUsbConfirm() {
    if (!usbConfirmPending) return;
    setUsbFlashPort(usbConfirmPending.port);
    setScreen("deploying");
  }

  function handleUsbFlashDone(exitCode: number) {
    if (exitCode === 0) {
      // mujina-minerd is already running on this host and picks up the
      // freshly-flashed Bitaxe on its own USB scan — poll it locally to
      // confirm rather than sending the user off to check some other way.
      setTelemetryIp("127.0.0.1");
      setScreen("telemetry");
    }
  }

  // Determine current wizard step based on active screen
  const currentStep = (() => {
    switch (screen) {
      case "discovery":
        return 1;
      case "config":
      case "usb-confirm":
        return 2;
      case "deploying":
        return 3;
      case "telemetry":
        return 4;
      default:
        return 1;
    }
  })();

  const steps = [
    { id: 1, label: "Discovery" },
    { id: 2, label: "Configure & Review" },
    { id: 3, label: "Deploying" },
    { id: 4, label: "Monitor" },
  ];

  function handleStepperClick(stepId: number) {
    if (stepId === 1) {
      setSelected(null);
      setUsbConfirmPending(null);
      setInstallConfig(null);
      setUsbFlashPort(null);
      setPreviewText(null);
      setScreen("discovery");
    } else if (stepId === 2) {
      if (selected) {
        setScreen("config");
      } else if (usbConfirmPending) {
        setScreen("usb-confirm");
      }
    } else if (stepId === 3) {
      if (installConfig || usbFlashPort) {
        setScreen("deploying");
      }
    } else if (stepId === 4) {
      if (telemetryIp) {
        setScreen("telemetry");
      }
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

        <nav className="wizard-stepper">
          {steps.map((s) => {
            const isActive = currentStep === s.id;
            const isCompleted = currentStep > s.id;
            const isClickable = isCompleted || s.id === 1;

            return (
              <div key={s.id} className="wizard-step-container" style={{ display: "flex", alignItems: "center", flex: s.id === 4 ? "0" : "1" }}>
                <div
                  className={[
                    "wizard-step",
                    isActive ? "wizard-step-active" : "",
                    isCompleted ? "wizard-step-completed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => isClickable && handleStepperClick(s.id)}
                >
                  <div className="wizard-step-number">{s.id}</div>
                  <span>{s.label}</span>
                </div>
                {s.id < 4 && (
                  <div
                    className={[
                      "wizard-step-divider",
                      currentStep > s.id ? "wizard-step-divider-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {screen === "discovery" && (
          <div className="discovery-container">
            <div className="discovery-toggle-group">
              <button
                className={`discovery-toggle-btn ${discoveryMode === "lan" ? "discovery-toggle-btn-active" : ""}`}
                onClick={() => setDiscoveryMode("lan")}
              >
                LAN Miner Scan
              </button>
              <button
                className={`discovery-toggle-btn ${discoveryMode === "usb" ? "discovery-toggle-btn-active" : ""}`}
                onClick={() => setDiscoveryMode("usb")}
              >
                USB Device Flash
              </button>
            </div>

            {discoveryMode === "lan" ? (
              <ScanTable onSelect={handleSelect} />
            ) : (
              <BitaxeUsbTable onSelect={handleUsbSelect} />
            )}
          </div>
        )}

        {screen === "config" && selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {previewText === null ? (
              <ConfigForm
                record={selected.record}
                scanFile={selected.scanFile}
                onSubmit={handleConfigSubmit}
                onBack={() => {
                  setSelected(null);
                  setScreen("discovery");
                }}
              />
            ) : (
              <ConfirmModal
                isInline={true}
                previewText={previewText}
                onConfirm={handleConfirm}
                onCancel={handleCancelPreview}
              />
            )}
            {previewError && <p className="error">{previewError}</p>}
          </div>
        )}

        {screen === "usb-confirm" && usbConfirmPending && (
          <ConfirmModal
            isInline={true}
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
            onCancel={() => {
              setUsbConfirmPending(null);
              setScreen("discovery");
            }}
          />
        )}

        {screen === "deploying" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {installConfig && (
              <>
                <h2>Installing over LAN: {installConfig.host}</h2>
                <InstallLog config={installConfig} onDone={handleInstallDone} />
              </>
            )}
            {usbFlashPort && (
              <>
                <h2>Flashing USB device on {usbFlashPort}</h2>
                <BitaxeFlashLog port={usbFlashPort} onDone={handleUsbFlashDone} />
              </>
            )}
          </div>
        )}

        {screen === "telemetry" && telemetryIp && (
          <TelemetryView ip={telemetryIp} />
        )}
        </div>
      </div>
    </main>
  );
}

export default App;
