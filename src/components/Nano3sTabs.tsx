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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="discovery-toggle-group">
        <button
          type="button"
          onClick={() => setTab("burn")}
          className={`discovery-toggle-btn ${tab === "burn" ? "discovery-toggle-btn-active" : ""}`}
        >
          USB Burn / Flash (.kdimg)
        </button>
        <button
          type="button"
          onClick={() => setTab("ota")}
          className={`discovery-toggle-btn ${tab === "ota" ? "discovery-toggle-btn-active" : ""}`}
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
