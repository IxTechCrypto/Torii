import { useState } from "react";
import { copyLogToClipboard, downloadLogFile } from "../utils/logSaver";

interface Props {
  logTitle: string;
  lines: string[];
}

export default function LogActionBar({ logTitle, lines }: Props) {
  const [copied, setCopied] = useState(false);

  function handleSave() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const cleanTitle = logTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filename = `torii-${cleanTitle}-${timestamp}.log`;
    downloadLogFile(filename, lines);
  }

  async function handleCopy() {
    const ok = await copyLogToClipboard(lines);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0.5rem 0" }}>
      <span style={{ fontSize: "0.8rem", color: "#8a9ba8", fontFamily: "'Share Tech Mono', monospace" }}>
        {lines.length} lines logged
      </span>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={handleCopy}
          disabled={lines.length === 0}
          style={{
            fontSize: "0.75rem",
            padding: "4px 10px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: copied ? "#00f0ff" : "#d0d8e0",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          {copied ? "✓ Copied!" : "📋 Copy Log"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={lines.length === 0}
          style={{
            fontSize: "0.75rem",
            padding: "4px 10px",
            background: "rgba(0, 240, 255, 0.1)",
            border: "1px solid #00f0ff",
            color: "#00f0ff",
            cursor: "pointer",
            borderRadius: "4px",
            fontWeight: 600,
          }}
        >
          💾 Save Log to File
        </button>
      </div>
    </div>
  );
}
