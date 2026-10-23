# Avalon Nano 3S — status (2026-10-23)

## Where it stands

- The Nano 3S runs nano-mujina **wififix4**: wififix3 (see
  `tools/nano3s-image/`) built with the home Wi-Fi pre-configured. It joined
  Wi-Fi, got a DHCP address (192.168.4.61 at the time; hostname `canaan`) and
  the screen shows MINING. The image file itself isn't kept anywhere: it
  carries the Wi-Fi key.
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

## Next

1. Set the pool, then record hashrate and wall power after ~10 min.
2. Capture real `/api/v0/miner` and `/api/v0/boards` responses from the
   device. They define the data shape for step 3.
3. **Option C**: port Nano 3S support into IxTechCrypto/mujina main (aadhi's
   `nano3s.rs`, rtos_core, IPC shim, riscv64 build, kdimg packaging) with an
   A3197S chip profile, so the owner's autotuner and dashboard run on it and
   show all 12 chips. aadhi's repo hasn't moved since September.
4. Optional: Torii backs up the `data` partition before flashing; warns when
   an image writes `data`; report the k230-flash erase bug upstream.

Paused, not abandoned: S19j Pro on the Amlogic board via Torii (with rollback),
then S21e Hydro.
