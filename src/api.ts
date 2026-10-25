// Typed invoke() wrappers for the four Rust commands registered in
// src-tauri/src/lib.rs, plus listeners for the install:: events emitted by
// the (not-yet-implemented) `install` command.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BundleInfo,
  HostRecord,
  InstallConfig,
  K230BurnDevice,
  KdimgInfo,
  Nano3sImageRole,
  ScanResult,
  UsbDeviceRecord,
} from "./types";

export function scan(cidr?: string, timeoutMs?: number): Promise<ScanResult> {
  return invoke("scan", { cidr, timeoutMs });
}

export function preview(scanFile: string, host: string): Promise<string> {
  return invoke("preview", { scanFile, host });
}

export function install(config: InstallConfig): Promise<number> {
  return invoke("install", { config });
}

export function pollMiner(ip: string, port?: number): Promise<Record<string, unknown>> {
  return invoke("poll_miner", { ip, port });
}

// Event contract for the `install` command (Worker B emits these):
//   "install://log"  — one event per line of installer output
//   "install://done" — emitted once, with the process exit code
export function onInstallLog(cb: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>("install://log", (event) => cb(event.payload));
}

export function onInstallDone(cb: (code: number) => void): Promise<UnlistenFn> {
  return listen<number>("install://done", (event) => cb(event.payload));
}

export function listUsbDevices(): Promise<UsbDeviceRecord[]> {
  return invoke("list_usb_devices");
}

// Read-only: captures whatever the firmware currently on the device is
// logging to its USB console for a few seconds. Best-effort identity
// evidence — may come back empty for a quiet device.
export function peekUsbSerial(port: string): Promise<string> {
  return invoke("peek_usb_serial", { port });
}

export function flashBitaxeRaw(port: string, model?: string): Promise<number> {
  return invoke("flash_bitaxe_raw", { port, model });
}

// Event contract for the `flash_bitaxe_raw` command:
//   "bitaxe-flash://log"  — one event per line of espflash output
//   "bitaxe-flash://done" — emitted once, with the process exit code
export function onBitaxeFlashLog(cb: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>("bitaxe-flash://log", (event) => cb(event.payload));
}

export function onBitaxeFlashDone(cb: (code: number) => void): Promise<UnlistenFn> {
  return listen<number>("bitaxe-flash://done", (event) => cb(event.payload));
}

export function listK230BurnDevices(): Promise<K230BurnDevice[]> {
  return invoke("list_k230_burn_devices");
}

export function inspectNano3sImage(path: string, role: Nano3sImageRole): Promise<KdimgInfo> {
  return invoke("inspect_nano3s_image", { path, role });
}

export function nano3sDefaultImage(role: Nano3sImageRole): Promise<string | null> {
  return invoke("nano3s_default_image", { role });
}

export function flashNano3s(imagePath: string, role: Nano3sImageRole, acceptWarnings: boolean): Promise<number> {
  return invoke("flash_nano3s", { imagePath, role, acceptWarnings });
}

export function inspectNano3sBundle(path: string): Promise<BundleInfo> {
  return invoke("inspect_nano3s_bundle", { path });
}

// Resolves with the device's own message; the device is rebooting by then.
export function updateNano3sBundle(ip: string, path: string, acceptWarnings: boolean, token?: string): Promise<string> {
  return invoke("update_nano3s_bundle", { ip, path, acceptWarnings, token });
}

// Event contract for the `flash_nano3s` command:
//   "nano3s-flash://log"      — one event per line of k230-flash output
//   "nano3s-flash://progress" — percent complete (0–100), in whole steps
//   "nano3s-flash://done"     — emitted once, with the process exit code
export function onNano3sFlashLog(cb: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>("nano3s-flash://log", (event) => cb(event.payload));
}

export function onNano3sFlashProgress(cb: (percent: number) => void): Promise<UnlistenFn> {
  return listen<number>("nano3s-flash://progress", (event) => cb(event.payload));
}

export function onNano3sFlashDone(cb: (code: number) => void): Promise<UnlistenFn> {
  return listen<number>("nano3s-flash://done", (event) => cb(event.payload));
}

export type { HostRecord };
