# Torii

> [!CAUTION]
> **PROTOTYPE SOFTWARE — USE AT YOUR OWN RISK**  
> Torii is an experimental developer prototype for hardware provisioning and firmware flashing. Flashing firmware over network/USB carries inherent risks, including device unreachability ("bricking") or hardware damage if interrupted or misconfigured. Ensure you have physical access, serial UART recovery tools, or stock USB burn tools available before attempting to flash real hardware.

![Torii — the gateway to Mujina](docs/torii-mujina-gateway.jpg)

**Torii is the gateway to Mujina.** A *torii*
is the gate that marks the entrance to a shrine, the threshold you pass through
to get to what's on the other side. This app is the same idea for your miners:
it's the front door that walks a stock, factory-firmware ASIC through to a
running Mujina node, without you ever touching a shell.

It's a desktop app (Tauri + React + TypeScript, with a cyberpunk HUD skin) that
replaces hand-running Mujina's CLI tools. You point it at your LAN, it finds the
miners, and it provisions the ones it can safely convert.

## What it does

Torii is a single guided wizard path from "unprovisioned hardware" to "mining under Mujina," featuring two main workflows:

### A. LAN Network Install (Antminer Hardware)
1. **Discovery** — Sweeps the local network (via `mujina-scan`). Only devices running stock Bitmain firmware are selectable.
2. **Configuration** — Set pool configurations and SSH authentication credentials.
3. **Plan Review** — Preview the dry-run plan (`install_mujina_aml.sh --print-plan`) inline before executing.
4. **Deploy** — Stream the SSH-based install log live (stdout & stderr) to monitor rootfs writing.
5. **Telemetry** — Once Mujina starts, poll hashrate, temperatures, and fan speeds in a real-time monitor.

### B. USB Firmware Flash (Bitaxe & NerdQAxe++ Hardware)
1. **Discovery** — Scans USB serial ports for ESP32-S3 chips. Unflashed devices (VID `0x303a`/PID `0x1001`) are classified as flash candidates. Already-flashed boards show as `raw-installed` (VID `0xc0de`/PID `0xcafe`).
2. **ASIC & Model Review** — Peeks at the board's console logs over UART for 3 seconds. It auto-detects the ASIC model:
   - **Supported**: Bitaxe Gamma / NerdQAxe++ (BM1370 ASIC).
   - **Safety-Blocked**: Bitaxe Ultra (BM1366 ASIC) or unrecognized boards are blocked from flashing in the UI to prevent overwriting AxeOS/ESP-Miner for an unsupported hardware target.
3. **Deploy** — Spawns `espflash` over USB with the native JTAG `--before usb-reset` configuration, streaming flash percentages live.
4. **Telemetry** — Automatically configures telemetry monitoring to point to the local host (`127.0.0.1:7785`), where the resident `mujina-minerd` auto-detects and drives the newly flashed board.

## How it works with Mujina

Mujina is the mining stack that runs *on* the hardware. Torii is the tool that
gets the hardware *to* Mujina. It doesn't reimplement any of Mujina's logic — it
orchestrates Mujina's own artifacts:

- **`mujina-scan`** does the network discovery and firmware fingerprinting.
- **`install_mujina_aml.sh`** (from `mujina-loader`) does the actual conversion,
  and Torii shells out to it for both the dry-run plan and the real install.

So the division is clean: Mujina knows how to scan and how to flash; Torii is the
gate you walk your miners through to reach it, plus the safety rails that stop you
from flashing a device Mujina can't drive.

### Safety guard

The firmware check is not just a greyed-out row in the UI. The backend re-reads
the scan record and returns an error on any non-stock-Bitmain device *before* it
can ever spawn the install script. A miner Mujina can't safely convert is
structurally unable to reach the destructive step.

## Running it

```bash
npm install
npm run tauri dev
```

Torii shells out to already-built Mujina artifacts (the `mujina-scan` binary and
`install_mujina_aml.sh`). See [STATUS.md](./STATUS.md) for the exact paths it
expects, what's been verified against real hardware, and what's still stubbed.

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
