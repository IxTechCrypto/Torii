# Dashboard: aadhi's nano-mujina vs the owner's (2026-10-23)

Compared:

- **Owner:** `dashboard.html` + `dashboard.py` in IxTechCrypto/mujina
  (`dashboard.html` is identical in the repo, its worktrees and `D:\mujina-run`;
  the deployed `dashboard.py` differs from the repo by one `html_path` field).
- **aadhi:** `mujina-miner/assets/dashboard.html` at tag `alpha-v4` in
  aadhi1014/nano-mujina, served by `mujina-minerd` itself
  (`mujina-miner/src/api/dashboard.rs`). The device at 192.168.4.61 runs an
  earlier (alpha-v3 era) copy.

## Shared origin

aadhi's page is a fork of the owner's. Same title (`MUJINA // FLEET MONITOR`),
fonts, CSS variables, `/data` JSON shape and two breakpoints (480 px, 640 px).
The closest owner version is `0b5ed2d` (2026-07-30, "add dashboard assets ...
for the Pi"); his first commit (`3dd99c9`, 2026-08-14) already changed ~400
lines of it, and alpha-v4 adds ~170 more. 52 JS functions, 94 element IDs and
94 CSS classes are shared.

The backend is where they really split. The owner's `dashboard.py` is a Python
server that polls `http://127.0.0.1:7785/api/v0` and proxies writes to it.
aadhi ported its `/data` builder to Rust (`serve_data` in `dashboard.rs`), so
`mujina-minerd` serves the page and data on port 80 with no Python on the
device.

## Only in the owner's

- **Autotune**: pill, controls and calibration history, backed by
  `dashboard.py`'s `/autotune` proxy and `mujina-autotune.json`
  (`atChanged`, `currAuto`, `currTargetC`, ...). Talks to minerd's
  `/api/v0/boards/{name}/autotune`, which nano-mujina doesn't have.
- **Global Settings** (miner name, pool) via `GET/POST /minersettings` and
  restart through `dashboard.py`.
- **Live log feed** (`/logs`, ANSI colour rendering, clear button).
- **Theme picker**: Cyberpunk Neon, Minimal, Parasite Retro B&W (`uitheme`).
- **VR temperature** (`vr_c`, `avg_vr_c`, 80 °C alert): Bitaxe and NerdQAxe++
  have a VR sensor, the Nano 3S doesn't.

## Only in aadhi's

- **12-chip temperature grid** (`chipTempGrid`) fed from `/nano3s-detail`,
  colour bands cool/normal/warm/hot, 4 columns under 480 px.
- **Outlet temperature** (`outlet_c`, `avg_outlet_c`) from the board's NTC.
- **Tuning panel**: presets LOW 210-270, MED 338-398, HIGH 420-480 MHz (from
  the device's `/data/factory/hashrate_cali.ini`), or custom frequency,
  voltage, power target and chip temp target, via
  `PATCH /api/v0/boards/{name}/tuning`.
- **Fan**: auto (outlet-temp curve + chip-limit escalation) or manual duty;
  curve editor with live SVG preview (`/fan`, `/fan-curve`).
- **Pause/resume** mining and **reboot device** (`/pause`, `/api/v0/reboot`).
- **Nav bar** to his other pages: `/info`, `/led`, `/pool`, `/tuning` (v4),
  `/firmware`. Logo mark, and a Doom launcher (`/doom/launch`).

## Broken or leftover in aadhi's

- The **Global Settings** panel still fetches and posts `/minersettings`.
  nano-mujina has no such route (the device returns 404), so it shows nothing
  and saving does nothing. Pool config lives on `/pool` instead.
- The **autotune pill and note** ("Calibrated points persist to disk
  (mujina-autotune.json)") are carried over, but nothing on the device serves
  autotune in that shape. v4's real hashrate autotune is on `/tuning`.
- The tuning preset defaults to MED in the page while the device was running
  LOW clocks (210/231/250/270 MHz in `/nano3s-detail`), so opening the panel
  and pressing apply would change frequency.

## What it means for Option C

- The `/data` shape is already common ground. A single dashboard can serve
  both if the backend fills chip temps from `/nano3s-detail` (Nano 3S) or
  `threads[].chips` (BM13xx boards), and outlet vs VR temperature by board.
- Feature-gate panels on what the board reports: VR temp, outlet temp, chip
  grid, autotune vs aadhi's tuner, and only one tuner active at a time.
- Settings: pick one of `/minersettings` (owner) or `/pool` (aadhi) and drop
  the other's dead UI.
