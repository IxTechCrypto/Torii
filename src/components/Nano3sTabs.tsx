import { useState } from "react";
import Nano3sPanel from "./Nano3sPanel";
import Nano3sUpdatePanel from "./Nano3sUpdatePanel";
import type { KdimgInfo, Nano3sImageRole } from "../types";

interface Props {
  onReady: (info: KdimgInfo, role: Nano3sImageRole) => void;
}

export default function Nano3sTabs({ onReady }: Props) {
  const [tab, setTab] = useState<"burn" | "ota">("burn");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid rgba(255, 255, 255, 0.12)", paddingBottom: "0.5rem" }}>
        <button
          type="button"
          onClick={() => setTab("burn")}
          style={{
            padding: "0.45rem 1rem",
            background: tab === "burn" ? "rgba(0, 240, 255, 0.15)" : "transparent",
            border: tab === "burn" ? "1px solid #00f0ff" : "1px solid transparent",
            color: tab === "burn" ? "#00f0ff" : "#8a9ba8",
            borderRadius: "4px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          USB Burn / Flash (.kdimg)
        </button>
        <button
          type="button"
          onClick={() => setTab("ota")}
          style={{
            padding: "0.45rem 1rem",
            background: tab === "ota" ? "rgba(0, 240, 255, 0.15)" : "transparent",
            border: tab === "ota" ? "1px solid #00f0ff" : "1px solid transparent",
            color: tab === "ota" ? "#00f0ff" : "#8a9ba8",
            borderRadius: "4px",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Network OTA Update (.bin)
        </button>
      </div>

      {tab === "burn" ? (
        <Nano3sPanel onReady={onReady} />
      ) : (
        <Nano3sUpdatePanel />
      )}
    </div>
  );
}
