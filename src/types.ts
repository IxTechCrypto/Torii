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

// Mirrors commands::usb::BitaxeUsbStatus (`#[serde(rename_all = "kebab-case")]`).
export type BitaxeUsbStatus = "raw-installed" | "flash-candidate";

export interface UsbDeviceRecord {
  port: string;
  vid: number;
  pid: number;
  manufacturer: string | null;
  product: string | null;
  serial_number: string | null;
  status: BitaxeUsbStatus;
}

// "flash-candidate" devices match the ESP32-S3's generic default USB
// identity (VID 0x303A/PID 0x1001), not something unique to a Bitaxe, so
// this is never a positive identification — just eligibility to attempt a
// flash. The frontend must get explicit user confirmation either way.
export function isFlashCandidate(d: UsbDeviceRecord): boolean {
  return d.status === "flash-candidate";
}

export function isFlashable(_d: UsbDeviceRecord): boolean {
  return true;
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, "0").toUpperCase();
}

export function formatUsbDeviceSummary(d: UsbDeviceRecord): string {
  const isRaw = d.status === "raw-installed";
  const note = isRaw
    ? [
        "This device is already running bitaxe-raw firmware.",
        "Proceeding will re-flash it with the selected hardware model firmware.",
        "If re-flashing fails to connect, hold the physical BOOT button while",
        "attaching power/USB to enter the ROM bootloader.",
      ]
    : [
        "This VID/PID is the ESP32-S3's generic default identity, not unique to",
        "Bitaxe boards — any other unflashed ESP32-S3 device would match it too.",
        "Confirm this is actually your Bitaxe (e.g. unplug it and check this",
        "entry disappears) before flashing.",
      ];

  return [
    `Port: ${d.port}`,
    `VID:PID: ${hex4(d.vid)}:${hex4(d.pid)}`,
    `Manufacturer: ${d.manufacturer ?? "—"}`,
    `Product: ${d.product ?? "—"}`,
    `Serial: ${d.serial_number ?? "—"}`,
    `Status: ${d.status}`,
    "",
    ...note,
  ].join("\n");
}

// Mirrors commands::nano3s::Nano3sImageRole (`#[serde(rename_all = "kebab-case")]`).
// "mujina" installs nano-mujina; "stock" restores Canaan's stock firmware.
export type Nano3sImageRole = "mujina" | "stock";

// Mirrors commands::nano3s::K230BurnDevice: a K230 boot ROM in USB burn
// mode (VID 29f1 / PID 0230).
export interface K230BurnDevice {
  bus_id: string;
  address: number;
  product: string | null;
}

export interface KdimgPart {
  name: string;
  offset: number;
  size: number;
  content_size: number;
}

// Mirrors commands::nano3s::KdimgInfo. `problems` block the flash;
// `warnings` need the user's explicit acknowledgement.
export interface KdimgInfo {
  path: string;
  file_size: number;
  sha256: string;
  header_version: number;
  image_info: string;
  chip_info: string;
  board_info: string;
  parts: KdimgPart[];
  known: { label: string; role: Nano3sImageRole } | null;
  problems: string[];
  warnings: string[];
}

// nano-mujina serves its API on port 80 rather than mujina's default 7785.
export const NANO_MUJINA_API_PORT = 80;

export function formatKdimgSummary(info: KdimgInfo): string {
  const mib = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return [
    `Image: ${info.path}`,
    `Size: ${mib(info.file_size)}`,
    `SHA-256: ${info.sha256}`,
    `Verified image: ${info.known ? info.known.label : "no (not in Torii's list)"}`,
    `Header: v${info.header_version} · image "${info.image_info}" · chip "${info.chip_info}" · board "${info.board_info}"`,
    "",
    "Partitions (all SHA-256 checked):",
    ...info.parts.map(
      (p) => `  ${p.name.padEnd(14)} @ 0x${p.offset.toString(16).padStart(8, "0")}  ${mib(p.content_size)}`,
    ),
  ].join("\n");
}
