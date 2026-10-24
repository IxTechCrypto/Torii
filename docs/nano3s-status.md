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
  MACs tell them apart: nano-mujina unit `e0:e1:a9:3f:1e:35`, stock unit
  `40:a5:ef:72:55:7b` (ARP table, 2026-10-23).
- **Pool is set** to `stratum+tcp://parasite.wtf:42069` (seen in
  `/api/v0/miner` `sources`, 2026-10-23). The boot script's default is the
  placeholder `YOUR_WALLET.YOUR_WORKER` on
  `stratum+tcp://pool.256foundation.org:3333`; `http://<ip>/pool` saves to
  `/data/userconfig/pool.conf`, overrides the boot script, and takes effect
  after a restart (no hot reload).
- Power target is aadhi's `MUJINA_NANO3S_POWER_TARGET_W=62.0` (stock
  baseline: 5.8 TH/s at 93 W, firmware 25011701_85ce93f).
- **First nano-mujina reading** (2026-10-23 23:20 UTC, 22 min uptime):
  3.51 TH/s (`ghsmm` 3510; `ghsspd` 3428), 605 shares accepted, 0 rejected,
  `err_crc` 0. Board input from the INA sensor: 27.74 V x 2.13 A = 59.2 W,
  so about 16.9 J/TH before PSU losses. ASICs 46.8–51.2 °C, fan 2430 rpm at 35%.
  All 12 chips at PLL 210/231/250/270 MHz, 294–301 mV each. Wall power not
  measured yet.
- Raw responses: `docs/nano3s-api-samples/` (`api_v0_miner.json`,
  `api_v0_boards.json`, `nano3s-detail.json`, same 2026-10-23 capture).
  Caveat for Option C: in `/api/v0/miner` and `/api/v0/boards`, the `core`
  power entry's `voltage_v` (3.626) is the commanded rail setting
  (`voltage_mv_commanded`), while `current_a` and `power_w` come from the
  INA sensor at the ~27.7 V input, so voltage x current doesn't equal power.

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
  (`nano-mujina-alpha-v4-bundle.bin`, SHA-256 `17977de4…4fcb`,
  mujina-minerd only), POSTed to `/api/v0/firmware/bundle`; alpha-v3 is the
  last full `.kdimg`. **Applied 2026-10-23 ~21:10 local through Torii's
  network-update panel**; the device came back in ~10 s with `/tuning`
  and the `psu` / `autotune-hashrate` endpoints, pool kept, all 12 chips on
  IPC, 76 shares accepted / 0 rejected in the first 30 s. PSU detected:
  27.77 V, 140 W ceiling (137 W effective). The device has the
  endpoint (its `/api/v0/openapi.json`). It overwrites `/data/mujina-minerd`
  and keeps no backup, so the rollback is a bundle of the current binary:
  `mujina-minerd` extracted from wififix3's `data` partition (SHA-256
  `c62ca2aa…dd03`), packed with aadhi's `pack_firmware_bundle.py`
  (`b86bce8f…8741`). Rebuild it the same way; it isn't committed (19 MB).
- Torii now does network updates: `src-tauri/src/commands/nano3s_update.rs`
  (same checks as the device, known-bundle hashes, confirms the target
  reports a Nano3s board) and `src/components/Nano3sUpdatePanel.tsx`.
  Used for the v4 update above.
- Dashboard comparison with the owner's: `docs/dashboard-diff.md`.

## Next

1. Measure wall power (pool set, hashrate recorded above).
2. ~~Capture real API responses~~ done: `docs/nano3s-api-samples/`. They
   define the data shape for step 3.
3. **Option C** (the owner's choice over A and B below): Nano 3S support in
   IxTechCrypto/mujina `main`, so one codebase runs the owner's autotuner,
   API and dashboard on Bitaxe, NerdQAxe++ and Nano 3S.
4. Torii follow-ups:
   - add wififix3 (`9b2cfea5…4f40`) to `KNOWN_IMAGES` in
     `src-tauri/src/commands/nano3s.rs`, so Torii shows it as verified;
   - back up the `data` partition over USB before any flash;
   - let the user enter Wi-Fi SSID and password before flashing, so the
     device joins on first boot without BLE setup (the iOS network list
     comes back empty). Baking it into the image (`build_image.sh`) needs
     Linux `genimage`. Better: after flashing, Torii acts as the BLE central
     and sends nano-mujina's `setssid,<hex_ssid>,<hex_pass>,<hex_id>,<auth>$$$$`
     to characteristic FFE2 (service 0xFFFF); `ble_setup` writes
     `wpa_supplicant.conf` itself (`mujina-miner/src/bin/ble_setup.rs`
     ~659-751). Only the scan is broken on iOS, not `setssid`. Needs
     `btleplug` and a BLE adapter; check the `auth` values and whether a
     hashed PSK is accepted before building it;
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
