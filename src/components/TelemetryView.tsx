import { useEffect, useState } from "react";
import { pollMiner } from "../api";
import { parseMujinaState, type MinerStats } from "../telemetry";

interface Props {
  ip: string;
}

export default function TelemetryView({ ip }: Props) {
  const [stats, setStats] = useState<MinerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function poll() {
      pollMiner(ip)
        .then((raw) => {
          if (cancelled) return;
          setStats(parseMujinaState(raw));
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(String(e));
        });
    }

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ip]);

  return (
    <div>
      <h2>Telemetry: {ip}</h2>
      {error && <p className="telemetry-error">{error}</p>}
      {!stats && !error && <p>Waiting for first poll...</p>}
      {stats && (
        <div className="telemetry-grid">
          <Stat label="Hashrate" value={`${stats.hashRateTH.toFixed(2)} TH/s`} />
          <Stat label="Power" value={`${stats.powerWatts.toFixed(0)} W`} />
          <Stat label="Efficiency" value={`${stats.efficiencyWTH.toFixed(1)} W/TH`} />
          <Stat
            label="Board temps"
            value={stats.chipTemps.length > 0 ? stats.chipTemps.map((t) => `${t.toFixed(0)}C`).join(", ") : "—"}
          />
          <Stat label="VR temp" value={stats.vrTemp > 0 ? `${stats.vrTemp.toFixed(0)}C` : "—"} />
          <Stat label="Fan" value={`${stats.fanRPM} RPM (${stats.fanSpeedPct}%)`} />
          <Stat label="Pool" value={stats.poolURL} />
          <Stat label="Pool user" value={stats.poolUser} />
          <Stat label="Shares accepted" value={String(stats.sharesAccepted)} />
          <Stat label="Best difficulty" value={stats.bestDiff} />
          <Stat label="Uptime" value={formatUptime(stats.uptimeSeconds)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="telemetry-stat-wrap">
      <div className="telemetry-stat-ring" aria-hidden="true" />
      <div className="telemetry-stat">
        <div className="telemetry-stat-label">{label}</div>
        <div className="telemetry-stat-value">{value}</div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
