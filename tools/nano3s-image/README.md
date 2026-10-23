# Nano 3S image tooling

Rebuilds the nano-mujina images Torii flashes to the Avalon Nano 3S, from
aadhi1014/nano-mujina's public `alpha-v3` release, with:

- the app and data partitions sanitized: aadhi's logs, Wi-Fi backup, pool
  login and saved state removed; Canaan's stock `cgminer.conf` and
  `systemcfg.ini` put back; his `factory/` calibration kept
- `wifi_bringup.sh` replaced: it waits up to 120 s for `wlan0`, retries
  `wpa_supplicant`, and logs to `/data/userdata/log/wifi_bringup.log`
- optionally, a Wi-Fi network pre-written to `/data/userconfig/wpa_supplicant.conf`,
  which skips nano-mujina's BLE setup. Its scan list comes back empty on iOS:
  `ble_setup` only reports its own scans, which take ~3 s, and the Avalon
  Family app reads 1 s after asking.

The rootfs, kernel, U-Boot and RTT partitions are copied unchanged from the
source image.

## Build

Needs Python 3, `ubi_reader` (`pip install ubi_reader`), and Canaan's `genimage`
from `resource/tools_2025012201.tar.gz` in
[Canaan-Creative/Avalon_Nano3s](https://github.com/Canaan-Creative/Avalon_Nano3s).
That `genimage` links against libssl 1.1, so on newer distros point
`LD_LIBRARY_PATH` at a libssl1.1 copy (or build in Ubuntu 20.04 / WSL).

```sh
./prepare_stage.sh nano-mujina-alpha-v3.kdimg path/to/Avalon_Nano3s stage
GENIMAGE=path/to/genimage ./build_image.sh stage nano-mujina-alpha-v3.kdimg out.kdimg
# with a pre-configured network (PSK = 64-hex hashed key or the passphrase):
GENIMAGE=... ./build_image.sh stage nano-mujina-alpha-v3.kdimg out.kdimg "SSID" PSK
```

Hashed WPA key without the password touching a shell history or chat:

```sh
python -c "import hashlib,getpass;s=input('SSID: ');print(hashlib.pbkdf2_hmac('sha1',getpass.getpass().encode(),s.encode(),4096,32).hex())"
```

An image with a network in it carries that network's key: don't share it.

## Layout

`genimage-fix.cfg` matches the Nano 3S NAND (PEB 128 KiB, LEB 126976, min
I/O 2048) and the device-tree partitions: `app_ubi` 12 MiB at `0x4200000`
(ubifs 10 MiB, 82 LEBs), `data` 56 MiB at `0xC800000` (ubifs 404 LEBs).
`pack_kdimg.py` keeps each partition's erase size and offset from the source
image and recomputes the SHA-256s and CRCs.

Flash with K230BurningTool or Torii. Both erase each partition's spare
region before writing. Plain `k230-flash` (≤ 1.4.0) doesn't, which leaves
stale UBI blocks that hang boot at the logo.

## Known images

| Image | SHA-256 |
|---|---|
| `nano-mujina-alpha-v3.kdimg` (aadhi's release, source) | `2065e8ce563c627a5b0f20c21eb9d57b870373dae2a006e6e6f177f09507466e` |
| `nano-mujina-alpha-v3-wififix3.kdimg` (this tooling, no network) | `9b2cfea5b89fd49adec692659daff9ec086aa5e011eada1be25a89a485c74f40` |
| Canaan stock `25012001_85ce93f` (rollback) | `a5c1e591853b49552b70cdd77030faee8a8c520fcfd7e0537b138ef58b349027` |

UBI images aren't byte-reproducible (the image sequence number changes each
build), so a rebuild's hash differs while its files are identical.
