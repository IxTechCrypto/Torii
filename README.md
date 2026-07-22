# Torii

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

Torii is a single guided path from "bare miner on the network" to "mining under
Mujina," with a hard safety stop before anything destructive happens:

1. **Scan** — sweeps the LAN (via `mujina-scan`) and lists every host it finds.
   Only devices running stock Bitmain firmware are selectable; anything else is
   greyed out, because those are the only ones Mujina can flash.
2. **Configure** — set the pool URL, worker name, user, and password for the
   node you're about to bring up.
3. **Confirm** — before a single byte is written to the device, Torii shows you
   the installer's real `--print-plan` output in a destructive-action modal. You
   read exactly what will happen, then you decide.
4. **Install** — streams the flash/install output live, stdout and stderr both,
   so you watch the conversion happen in real time instead of staring at a
   frozen spinner.
5. **Telemetry** — once the node comes up, Torii polls it every few seconds and
   shows hashrate, temps, fan, power, and pool status.

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
