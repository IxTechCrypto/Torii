// Mujina telemetry parsing, ported from nexus-miner-app's
// services/mujinaApi.ts (raw schema + parseMujinaState logic). Trimmed to
// just the fields Torii renders — not importing cross-repo from Nexus.

// ── Raw schema (mirrors mujina-miner/src/api_client/types.rs) ──────────────

interface MujinaFan {
  name: string;
  rpm?: number | null;
  percent?: number | null;
  target_percent?: number | null;
}

interface MujinaTemperatureSensor {
  name: string;
  temperature_c?: number | null;
}

interface MujinaPowerMeasurement {
  name: string;
  voltage_v?: number | null;
  current_a?: number | null;
  power_w?: number | null;
}

interface MujinaBoard {
  name: string;
  model: string;
  serial?: string | null;
  fans: MujinaFan[];
  temperatures: MujinaTemperatureSensor[];
  powers: MujinaPowerMeasurement[];
}

interface MujinaSource {
  name: string;
  url?: string | null;
  difficulty?: number | null;
}

export interface MujinaMinerState {
  uptime_secs: number;
  hashrate: number; // H/s
  shares_submitted: number;
  best_difficulty?: number | null;
  boards: MujinaBoard[];
  sources: MujinaSource[];
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

// Trimmed local stats shape — only what TelemetryView renders.
export interface MinerStats {
  hostname: string;
  model: string;
  hashRateTH: number;
  chipTemps: number[]; // one representative temp per board
  vrTemp: number;
  powerWatts: number;
  efficiencyWTH: number;
  fanSpeedPct: number;
  fanRPM: number;
  sharesAccepted: number;
  bestDiff: string;
  poolURL: string;
  poolUser: string;
  uptimeSeconds: number;
}

const CHIP_SENSOR = /asic|chip|core|hash/i;
const VR_SENSOR = /\bvr|vreg|vrm|reg|pmic/i;

export function parseMujinaState(raw: unknown): MinerStats {
  const state = raw as MujinaMinerState;
  const hashRateTH = num(state.hashrate) / 1e12;

  const chipTemps: number[] = [];
  let vrTemp = 0;
  for (const board of state.boards ?? []) {
    let boardChipNamed = 0;
    let boardHottest = 0;
    for (const sensor of board.temperatures ?? []) {
      const t = num(sensor.temperature_c);
      if (t <= 0) continue;
      const name = sensor.name ?? "";
      if (CHIP_SENSOR.test(name)) {
        if (t > boardChipNamed) boardChipNamed = t;
      } else if (VR_SENSOR.test(name)) {
        if (t > vrTemp) vrTemp = t;
      }
      if (t > boardHottest) boardHottest = t;
    }
    const rep = boardChipNamed > 0 ? boardChipNamed : boardHottest;
    if (rep > 0) chipTemps.push(rep);
  }

  let fanRPM = 0;
  let fanSpeedPct = 0;
  for (const board of state.boards ?? []) {
    for (const fan of board.fans ?? []) {
      const rpm = num(fan.rpm);
      if (rpm > fanRPM) fanRPM = rpm;
      const pct = num(fan.target_percent ?? fan.percent);
      if (pct > fanSpeedPct) fanSpeedPct = pct;
    }
  }

  let powerWatts = 0;
  for (const board of state.boards ?? []) {
    for (const p of board.powers ?? []) {
      const w = num(p.power_w);
      if (w > 0) {
        powerWatts += w;
      } else {
        const v = num(p.voltage_v);
        const a = num(p.current_a);
        if (v > 0 && a > 0) powerWatts += v * a;
      }
    }
  }
  const efficiencyWTH = hashRateTH > 0 && powerWatts > 0 ? powerWatts / hashRateTH : 0;

  // Mujina's built-in "dummy" source is fake local work, not a real pool.
  const isDummySource = (s: MujinaSource): boolean =>
    (!s.url || s.url.length === 0) && (s.name ?? "").trim().toLowerCase() === "dummy";
  const realSources = (state.sources ?? []).filter((s) => !isDummySource(s));
  const onDummySource = realSources.length === 0 && (state.sources ?? []).some(isDummySource);
  const activeSource = realSources[0];

  const firstBoard = state.boards?.[0];
  const boardModel = firstBoard?.model?.trim() ?? "";
  const hostname = firstBoard?.name?.trim() || boardModel || "Mujina";

  const bestDiffNum = num(state.best_difficulty);
  const bestDiff = bestDiffNum > 0 ? String(bestDiffNum) : "—";

  return {
    hostname,
    model: boardModel || "Mujina",
    hashRateTH,
    chipTemps,
    vrTemp,
    powerWatts,
    efficiencyWTH,
    fanSpeedPct: Math.min(100, Math.round(fanSpeedPct)),
    fanRPM,
    sharesAccepted: state.shares_submitted ?? 0,
    bestDiff,
    poolURL:
      activeSource?.url ?? (onDummySource ? "No pool configured (dummy source)" : "—"),
    poolUser: "—", // Mujina v0 has no per-source worker/username field.
    uptimeSeconds: state.uptime_secs ?? 0,
  };
}
