# Avalon Nano 3S — status (2026-10-23)

## Where it stands

- The Nano 3S runs nano-mujina **wififix4**: wififix3 (see
  `tools/nano3s-image/`) built with the home Wi-Fi pre-configured. It joined
  Wi-Fi, got a DHCP address (192.168.4.61 at the time; hostname `canaan`) and
  the screen shows MINING. The image file itself isn't kept anywhere: it
  carries the Wi-Fi key.
- **A second Nano 3S stays on Canaan stock** (192.168.4.67 at the time):
  cgminer 4.11.1 API on port 4028, firmware MM319 build 25061101. It's the
  control unit for stock vs nano-mujina comparisons. nano-mujina runs no
  cgminer and nothing listens on 4028 (aadhi's `fb_hijack/src/fb_button.rs`),
  so a 4028 answer means stock firmware and a 7785 scan finds neither unit.
  Its 25061101 is newer than the rollback image Torii knows
  (25012001_85ce93f).
- **Pool isn't set.** The boot script's pool user is the placeholder
  `YOUR_WALLET.YOUR_WORKER` on `stratum+tcp://pool.256foundation.org:3333`.
  Set it at `http://<ip>/pool`. It's saved to `/data/userconfig/pool.conf`,
  overrides the boot script, and takes effect after a restart (no hot reload).
- Power target is aadhi's `MUJINA_NANO3S_POWER_TARGET_W=62.0` (stock
  baseline: 5.8 TH/s at 93 W, firmware 25011701_85ce93f).
- No baseline hashrate or wall power on nano-mujina recorded yet.

## nano-mujina on the device

- API and dashboard on **port 80** (not 7785): `/dashboard`, `/nano3s-detail`
  (per-chip), `/pool`, `/swagger-ui`, `/api/v0/miner`, `/api/v0/boards`.
  Torii's monitor already uses 80 for this device (`NANO_MUJINA_API_PORT`).
- Screen button cycles: live, diagnostics, **IP ADDRESS**, pizza.
- Wi-Fi: `rtl8723du` is built into the kernel. `wifi_bringup.sh` logs to
  `/data/userdata/log/wifi_bringup.log`. BLE Wi-Fi setup (`ble_setup`) works
  but returns an empty network list on iOS, which is why the network was
  pre-configured. The radio itself is fine.

## Found the hard way

- **Logo hang after flashing** came from `k230-flash` (Python, ≤ 1.4.0) never
  erasing a partition's spare erase region; Canaan's K230BurningTool does.
  Torii's `src-tauri/resources/k230_flash_erase.py` adds the erase.
- aadhi's alpha-v3 image carries his unit's logs, Wi-Fi backup and pool login.
  `tools/nano3s-image/prepare_stage.sh` strips them. He hasn't been told yet
  (needs the owner's OK first).
- Windows flashing needs Zadig (WinUSB on "K230 USB Boot Device", 29F1:0230)
  and libusb's DLL next to Python.

- aadhi's alpha-v3 `data` partition replaced this unit's own
  `factory/hashrate_cali.ini` and `factory/efuse_info.txt` with his unit's.
  There's no backup of the originals (Torii didn't read flash before
  writing). Impact unknown: stock firmware may use them, nano-mujina may not.
- aadhi's latest release, alpha-v4 (Sept 17), is only an update bundle
  (`nano-mujina-alpha-v4-bundle.bin`, uploaded on the device's `/firmware`
  page); alpha-v3 is the last full `.kdimg`. Not applied here yet.

## Next

1. Set the pool, then record hashrate and wall power after ~10 min.
2. Capture real `/api/v0/miner`, `/api/v0/boards` and `/nano3s-detail`
   responses from the device. They define the data shape for step 3.
3. **Option C** (the owner's choice over A and B below): Nano 3S support in
   IxTechCrypto/mujina `main`, so one codebase runs the owner's autotuner,
   API and dashboard on Bitaxe, NerdQAxe++ and Nano 3S.
4. Torii follow-ups:
   - add wififix3 (`9b2cfea5…4f40`) to `KNOWN_IMAGES` in
     `src-tauri/src/commands/nano3s.rs`, so Torii shows it as verified;
   - back up the `data` partition over USB before any flash;
   - warn when an image writes `data`, and when it carries another unit's
     factory files.
5. Needs the owner's OK first: report the k230-flash erase bug to
   kendryte/k230_flash_py; tell aadhi his public alpha-v3 image contains his
   Wi-Fi credentials, pool login and factory data.

## Option C in detail

What's in the way, from the code (not yet a commit-by-commit plan):

- **Hardware:** aadhi's driver reports "Avalon Nano3s (A3197S x12)": 12
  Canaan A3197S chips on one chain, 4 clock generators each, one shared
  power rail, fan control. Not BM13xx. The chips are driven by a separate
  real-time core running aadhi's `rtos_core/` (C, RISC-V musl toolchain),
  not by Linux directly.
- **To port from aadhi1014/nano-mujina:** `mujina-miner/src/board/nano3s.rs`
  (~145 KB), which talks to the RTOS core through `nano3s_ipc_shim.c` and
  Canaan's IPC library, so it needs a RISC-V (riscv64) cross-build with that
  library linked; `rtos_core/` carried over as-is; `.kdimg` and update-bundle
  packaging. aadhi's repo has no shared history with the owner's `main` and
  is built on older Mujina internals, so expect adaptation, not a merge.
- **The owner's autotuner** (`mujina-miner/src/api/autotune.rs` on
  IxTechCrypto/mujina `main`) takes its limits from the BM1370 profile in
  `chip_profile` (BM1362 also known) and sends BM13xx frequency and
  core-voltage commands. It needs an **A3197S profile** and a mapping onto
  this board's 12 x 4 clocks and shared rail.
- **aadhi's tuner** (hashrate autotune, power-target loop, PSU protection)
  lives inside his driver. Only one tuner may run: his must be off when the
  owner's is on.
- **The owner's dashboard** (`dashboard.py` + `dashboard.html`) is hardwired
  to `http://127.0.0.1:7785` and reads per-chip data from `threads[].chips`.
  nano-mujina serves on port 80 and puts per-chip data (temperature, voltage,
  4 clocks, hashrate per chip) on `/nano3s-detail` instead. Its tuning
  buttons call endpoint shapes nano-mujina doesn't have.

The alternatives considered: **A.** point the owner's dashboard at the Nano 3S
(configurable host and port, 12 chips from `/nano3s-detail`) and keep aadhi's
tuner, about a day; **B.** put the owner's tuner into aadhi's code, a fork of
a fork. A is still a cheap stepping stone while C is under way. Talking to
aadhi first is worth it: he's already contributing upstream
(256foundation/mujina#75), and a joint port beats two forks.

Other projects (mujina PR #76, branch cleanup, S19j Pro / S21e Hydro plans):
`docs/other-work.md`.
