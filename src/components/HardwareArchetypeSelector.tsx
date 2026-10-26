export type HardwareArchetype = "network" | "usb";

interface Props {
  selected: HardwareArchetype;
  onSelect: (type: HardwareArchetype) => void;
  subMode?: "lan" | "nano3s";
  onSubModeSelect?: (sub: "lan" | "nano3s") => void;
}

export default function HardwareArchetypeSelector({
  selected,
  onSelect,
  subMode,
  onSubModeSelect,
}: Props) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <button
          type="button"
          onClick={() => onSelect("network")}
          style={{
            background: selected === "network" ? "rgba(0, 240, 255, 0.12)" : "rgba(255, 255, 255, 0.03)",
            border: selected === "network" ? "2px solid #00f0ff" : "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "6px",
            padding: "1rem",
            textAlign: "left",
            cursor: "pointer",
            color: "#fff",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#00f0ff" }}>
              🌐 Network Miner
            </span>
            <span style={{ fontSize: "0.75rem", color: "#8a9ba8", textTransform: "uppercase" }}>Standalone / Embedded</span>
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#a0b0c0", lineHeight: 1.4 }}>
            For standalone miners on your LAN (Avalon Nano 3S, Antminer S19j). Mines autonomously; web dashboard served directly on device IP.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelect("usb")}
          style={{
            background: selected === "usb" ? "rgba(255, 46, 151, 0.12)" : "rgba(255, 255, 255, 0.03)",
            border: selected === "usb" ? "2px solid #ff2e97" : "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "6px",
            padding: "1rem",
            textAlign: "left",
            cursor: "pointer",
            color: "#fff",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "1rem", fontWeight: 700, color: "#ff2e97" }}>
              🔌 USB Tethered Board
            </span>
            <span style={{ fontSize: "0.75rem", color: "#8a9ba8", textTransform: "uppercase" }}>Host-Driven / Dongle</span>
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#a0b0c0", lineHeight: 1.4 }}>
            For USB accelerators plugged into your PC/Pi (Bitaxe Gamma, NerdQAxe++). Flashes raw firmware; driven by local host daemon.
          </p>
        </button>
      </div>

      {selected === "network" && subMode && onSubModeSelect && (
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: "0.75rem" }}>
          <button
            type="button"
            className={`discovery-toggle-btn ${subMode === "nano3s" ? "discovery-toggle-btn-active" : ""}`}
            onClick={() => onSubModeSelect("nano3s")}
          >
            Avalon Nano 3S (USB Burn / Flash)
          </button>
          <button
            type="button"
            className={`discovery-toggle-btn ${subMode === "lan" ? "discovery-toggle-btn-active" : ""}`}
            onClick={() => onSubModeSelect("lan")}
          >
            Antminer / LAN Scan
          </button>
        </div>
      )}
    </div>
  );
}
