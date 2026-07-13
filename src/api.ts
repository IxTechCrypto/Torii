// Typed invoke() wrappers for the four Rust commands registered in
// src-tauri/src/lib.rs, plus listeners for the install:: events emitted by
// the (not-yet-implemented) `install` command.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { HostRecord, InstallConfig, ScanResult } from "./types";

export function scan(cidr?: string, timeoutMs?: number): Promise<ScanResult> {
  return invoke("scan", { cidr, timeoutMs });
}

export function preview(scanFile: string, host: string): Promise<string> {
  return invoke("preview", { scanFile, host });
}

export function install(config: InstallConfig): Promise<number> {
  return invoke("install", { config });
}

export function pollMiner(ip: string): Promise<Record<string, unknown>> {
  return invoke("poll_miner", { ip });
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

export type { HostRecord };
