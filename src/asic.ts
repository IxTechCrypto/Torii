// ASIC identification from a stock-firmware (AxeOS) serial console peek.
//
// mujina-minerd currently drives ONLY the Bitaxe Gamma: its board bring-up
// (mujina-miner/src/board/bitaxe.rs) does no model detection — it always
// initializes a TPS546D24A regulator and then verifies a BM1370 ASIC
// ("wrong chip type for Bitaxe Gamma: expected BM1370"). A board with any
// other ASIC fails bring-up at "power controller init failed" (it probes a
// TPS546 that isn't on the board), so Torii warns and refuses to flash an
// unsupported board before it overwrites AxeOS for nothing.
//
// AxeOS logs its ASIC over the serial console as e.g. "bm1366: Job ID: 00",
// which the confirm-step console peek captures. That console text is the only
// pre-flash signal we have: VID/PID can't tell Bitaxe models apart (every
// Bitaxe shares the ESP32-S3's generic USB identity).

export interface AsicIdentity {
  chip: string; // normalized, e.g. "BM1366"
  model: string; // human name, e.g. "Bitaxe Ultra"
  supported: boolean; // true only for the ASIC mujina can drive today
}

// The one ASIC mujina-minerd supports today. Keep in sync with
// mujina-miner/src/board/bitaxe.rs (which hardcodes the Bitaxe Gamma /
// BM1370). When mujina gains support for more boards, widen this.
const SUPPORTED_CHIPS: ReadonlySet<string> = new Set(["BM1370"]);

const KNOWN_MODELS: Record<string, string> = {
  BM1370: "Bitaxe Gamma",
  BM1368: "Bitaxe Supra",
  BM1366: "Bitaxe Ultra",
  BM1397: "Bitaxe Max",
};

// Parse the ASIC chip id out of a console peek. Returns null when nothing
// identifiable was captured — an empty peek or a firmware that just wasn't
// logging during the 3s window. Callers MUST treat null as "unknown", never
// as "unsupported": a quiet-but-supported board must still be flashable.
export function detectAsic(peekText: string | null | undefined): AsicIdentity | null {
  if (!peekText) return null;
  const m = peekText.match(/\bbm(\d{4})\b/i);
  if (!m) return null;
  const chip = `BM${m[1]}`;
  return {
    chip,
    model: KNOWN_MODELS[chip] ?? `unrecognized board (${chip})`,
    supported: SUPPORTED_CHIPS.has(chip),
  };
}
