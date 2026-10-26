import { useEffect, useState } from "react";
import ScanTable from "./components/ScanTable";
import ConfigForm from "./components/ConfigForm";
import ConfirmModal from "./components/ConfirmModal";
import InstallLog from "./components/InstallLog";
import TelemetryView from "./components/TelemetryView";
import BitaxeUsbTable from "./components/BitaxeUsbTable";
import BitaxeFlashLog from "./components/BitaxeFlashLog";
import FlashSuccessModal from "./components/FlashSuccessModal";
import Nano3sPanel from "./components/Nano3sPanel";
import Nano3sUpdatePanel from "./components/Nano3sUpdatePanel";
import Nano3sFlashLog from "./components/Nano3sFlashLog";
import Nano3sFlashDoneModal from "./components/Nano3sFlashDoneModal";
import HardwareArchetypeSelector, { type HardwareArchetype } from "./components/HardwareArchetypeSelector";
import HandoffDashboardModal from "./components/HandoffDashboardModal";
import { peekUsbSerial, preview } from "./api";
import { detectAsic } from "./asic";
import {
  formatKdimgSummary,
  formatUsbDeviceSummary,
  NANO_MUJINA_API_PORT,
  type HostRecord,
  type InstallConfig,
  type KdimgInfo,
  type Nano3sImageRole,
  type UsbDeviceRecord,
} from "./types";
import "./styles.css";

type Screen = "discovery" | "config" | "usb-confirm" | "nano3s-confirm" | "deploying" | "telemetry";

function App() {
  const [screen, setScreen] = useState<Screen>("discovery");
  const [archetype, setArchetype] = useState<HardwareArchetype>("network");
  const [networkSubMode, setNetworkSubMode] = useState<"lan" | "nano3s">("nano3s");
  const [discoveryMode, setDiscoveryMode] = useState<"lan" | "usb" | "nano3s">("nano3s");
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
  const [selectedHardwareModel, setSelectedHardwareModel] = useState<"gamma" | "nerdqaxe-pp">("gamma");
  const [showFlashSuccessModal, setShowFlashSuccessModal] = useState(false);
  const [telemetryPort, setTelemetryPort] = useState<number | undefined>(undefined);
  const [nano3sPending, setNano3sPending] = useState<{ info: KdimgInfo; role: Nano3sImageRole } | null>(null);
  const [nano3sWarningsAccepted, setNano3sWarningsAccepted] = useState(false);
  const [nano3sFlash, setNano3sFlash] = useState<{
    imagePath: string;
    role: Nano3sImageRole;
    acceptWarnings: boolean;
  } | null>(null);
  const [nano3sDoneRole, setNano3sDoneRole] = useState<Nano3sImageRole | null>(null);
  const [lanHandoffHost, setLanHandoffHost] = useState<string | null>(null);

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
        if (!cancelled) setUsbPeekText(`(peek error: ${e})`);
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
      setLanHandoffHost(selected.record.host);
      setInstallConfig(null);
    }
  }

  function handleUsbSelect(record: UsbDeviceRecord) {
    setUsbConfirmPending(record);
    if (record.product?.toLowerCase().includes("nerdqaxe") || record.pid === 0xcaf1) {
      setSelectedHardwareModel("nerdqaxe-pp");
    } else {
      setSelectedHardwareModel("gamma");
    }
    setScreen("usb-confirm");
  }

  function handleUsbConfirm() {
    if (!usbConfirmPending) return;
    setUsbFlashPort(usbConfirmPending.port);
    setScreen("deploying");
  }

  function handleUsbFlashDone(exitCode: number) {
    if (exitCode === 0) {
      setShowFlashSuccessModal(true);
    }
  }

  function handleProceedToMonitor() {
    setShowFlashSuccessModal(false);
    setTelemetryIp("127.0.0.1");
    setTelemetryPort(undefined);
    setScreen("telemetry");
  }

  function handleBackToDevices() {
    setShowFlashSuccessModal(false);
    setSelected(null);
    setUsbConfirmPending(null);
    setUsbFlashPort(null);
    setPreviewText(null);
    setDiscoveryMode("usb");
    setScreen("discovery");
  }

  function handleNano3sReady(info: KdimgInfo, role: Nano3sImageRole) {
    setNano3sPending({ info, role });
    setNano3sWarningsAccepted(false);
    setScreen("nano3s-confirm");
  }

  function handleNano3sConfirm() {
    if (!nano3sPending) return;
    setNano3sFlash({
      imagePath: nano3sPending.info.path,
      role: nano3sPending.role,
      acceptWarnings: nano3sWarningsAccepted,
    });
    setScreen("deploying");
  }

  function handleNano3sFlashDone(exitCode: number) {
    if (exitCode === 0 && nano3sFlash) {
      setNano3sDoneRole(nano3sFlash.role);
    }
  }

  function handleNano3sMonitor(ip: string) {
    setNano3sDoneRole(null);
    setTelemetryIp(ip);
    setTelemetryPort(NANO_MUJINA_API_PORT);
    setScreen("telemetry");
  }

  function handleNano3sBack() {
    setNano3sDoneRole(null);
    setNano3sPending(null);
    setNano3sFlash(null);
    setDiscoveryMode("nano3s");
    setScreen("discovery");
  }

  // Determine current wizard step based on active screen
  const currentStep = (() => {
    switch (screen) {
      case "discovery":
        return 1;
      case "config":
      case "usb-confirm":
      case "nano3s-confirm":
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
      setNano3sPending(null);
      setNano3sFlash(null);
      setPreviewText(null);
      setScreen("discovery");
    } else if (stepId === 2) {
      if (selected) {
        setScreen("config");
      } else if (usbConfirmPending) {
        setScreen("usb-confirm");
      } else if (nano3sPending) {
        setScreen("nano3s-confirm");
      }
    } else if (stepId === 3) {
      if (installConfig || usbFlashPort || nano3sFlash) {
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
            <HardwareArchetypeSelector
              selected={archetype}
              onSelect={(type) => {
                setArchetype(type);
                if (type === "network") {
                  setDiscoveryMode(networkSubMode);
                } else {
                  setDiscoveryMode("usb");
                }
              }}
              subMode={networkSubMode}
              onSubModeSelect={(sub) => {
                setNetworkSubMode(sub);
                setDiscoveryMode(sub);
              }}
            />

            {discoveryMode === "lan" && <ScanTable onSelect={handleSelect} />}
            {discoveryMode === "usb" && <BitaxeUsbTable onSelect={handleUsbSelect} />}
            {discoveryMode === "nano3s" && (
              <>
                <Nano3sPanel onReady={handleNano3sReady} />
                <Nano3sUpdatePanel />
              </>
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
            actionLabel={`Flash bitaxe-raw (${selectedHardwareModel === "nerdqaxe-pp" ? "NerdQAxe++" : "Bitaxe Gamma"})`}
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
          >
            <div style={{ margin: "1rem 0", padding: "0.75rem 1rem", backgroundColor: "var(--bg-panel-alt)", border: "1px solid var(--border)", borderRadius: "4px" }}>
              <div style={{ fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.5rem", color: "var(--cyan)" }}>
                Target Hardware Model:
              </div>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="hardwareModel"
                    value="gamma"
                    checked={selectedHardwareModel === "gamma"}
                    onChange={() => setSelectedHardwareModel("gamma")}
                  />
                  <span>Bitaxe Gamma (BM1370, 1 chip, 0xcafe)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="hardwareModel"
                    value="nerdqaxe-pp"
                    checked={selectedHardwareModel === "nerdqaxe-pp"}
                    onChange={() => setSelectedHardwareModel("nerdqaxe-pp")}
                  />
                  <span>NerdQAxe++ (BM1370, 4 chips, 0xcaf1)</span>
                </label>
              </div>
            </div>
          </ConfirmModal>
        )}

        {screen === "nano3s-confirm" && nano3sPending && (
          <ConfirmModal
            isInline={true}
            title={nano3sPending.role === "mujina" ? "Confirm nano-mujina install" : "Confirm stock firmware restore"}
            warning="This rewrites the Nano 3S's whole SPI NAND over USB, replacing the firmware on both cores and its saved Wi-Fi and pool settings. A failed flash can be retried from burn mode."
            actionLabel={nano3sPending.role === "mujina" ? "Flash nano-mujina" : "Flash stock firmware"}
            confirmDisabled={nano3sPending.info.warnings.length > 0 && !nano3sWarningsAccepted}
            previewText={formatKdimgSummary(nano3sPending.info)}
            onConfirm={handleNano3sConfirm}
            onCancel={() => {
              setNano3sPending(null);
              setScreen("discovery");
            }}
          >
            {nano3sPending.info.warnings.length > 0 && (
              <div style={{ margin: "1rem 0" }}>
                {nano3sPending.info.warnings.map((w) => (
                  <p key={w} className="confirm-modal-notice confirm-modal-notice-danger">
                    {w}
                  </p>
                ))}
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={nano3sWarningsAccepted}
                    onChange={(e) => setNano3sWarningsAccepted(e.target.checked)}
                  />
                  <span>I've checked the SHA-256 above against the image's source and want to flash it.</span>
                </label>
              </div>
            )}
          </ConfirmModal>
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
                <BitaxeFlashLog port={usbFlashPort} model={selectedHardwareModel} onDone={handleUsbFlashDone} />
              </>
            )}
            {nano3sFlash && (
              <Nano3sFlashLog
                imagePath={nano3sFlash.imagePath}
                role={nano3sFlash.role}
                acceptWarnings={nano3sFlash.acceptWarnings}
                onDone={handleNano3sFlashDone}
              />
            )}
          </div>
        )}

        {screen === "telemetry" && telemetryIp && (
          <TelemetryView ip={telemetryIp} port={telemetryPort} />
        )}

        {nano3sDoneRole && (
          <Nano3sFlashDoneModal role={nano3sDoneRole} onMonitor={handleNano3sMonitor} onBack={handleNano3sBack} />
        )}

        {lanHandoffHost && (
          <HandoffDashboardModal
            title="Mujina Installed on Miner"
            subtitle={`Host IP: ${lanHandoffHost}`}
            deviceType="network"
            targetUrl={`http://${lanHandoffHost}`}
            steps={[
              { num: 1, heading: "Mining Daemon Auto-Started", desc: "mujina-minerd is actively running on the miner with the pool credentials provided." },
              { num: 2, heading: "Embedded Web Dashboard Online", desc: "The miner is serving its cyberpunk dashboard and REST API directly on port 80." },
              { num: 3, heading: "Torii Setup Complete", desc: "Torii's job is done. You can manage frequency, voltage, fan targets, and pools from the browser." }
            ]}
            onBack={() => {
              setLanHandoffHost(null);
              setSelected(null);
              setScreen("discovery");
            }}
          />
        )}

        {showFlashSuccessModal && (
          <FlashSuccessModal
            model={selectedHardwareModel}
            onProceedToMonitor={handleProceedToMonitor}
            onBackToDevices={handleBackToDevices}
          />
        )}
        </div>
      </div>
    </main>
  );
}

export default App;
