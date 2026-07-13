// TS mirrors of the Rust structs in src-tauri/src/commands/*.rs.
// Keep these in lockstep with the Rust side — this file is the frontend
// half of the handoff contract.

export interface ApiRaw {
  version: unknown | null;
  stats: unknown | null;
}

export interface InstallHint {
  ready: boolean;
  command: string | null;
}

// Mirrors mujina-scan's `Firmware` enum (`#[serde(rename_all = "kebab-case")]`).
// Only "stock-bitmain" is installable. Note "lux-os" (not "luxos") — the
// Rust enum variant is `LuxOs`, which kebab-cases on the capital-letter
// boundary.
export type Firmware =
  | "stock-bitmain"
  | "lux-os"
  | "braiins"
  | "unknown-cgminer"
  | "unknown";

export interface HostRecord {
  host: string;
  reachable_ports: number[];
  firmware: Firmware;
  firmware_version: string | null;
  model: string | null;
  model_family: string | null;
  control_board: string;
  chip: string | null;
  api_raw: ApiRaw;
  install_hint: InstallHint;
}

export interface ScanResult {
  records: HostRecord[];
  // Path to the JSON file mujina-scan.exe wrote its inventory to (app cache
  // dir / last-scan.json). Pass this back as `scanFile` to preview()/install().
  scan_file: string;
}

export interface InstallConfig {
  scan_file: string;
  host: string;
  user?: string;
  password?: string;
  rootfs?: string;
  env?: string;
  pool_url?: string;
  worker?: string;
}

export const INSTALLABLE_FIRMWARE: Firmware = "stock-bitmain";

export function isInstallable(r: HostRecord): boolean {
  return r.firmware === INSTALLABLE_FIRMWARE;
}
