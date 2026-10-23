#!/bin/sh
# Build a nano-mujina image from a stage made by prepare_stage.sh, optionally
# with a Wi-Fi network pre-written to /data/userconfig/wpa_supplicant.conf in
# the format nano-mujina's ble_setup writes (ble_setup.rs), which skips the
# BLE setup. Works on a copy of the stage so credentials never land in it.
#   build_image.sh STAGE_DIR SRC_ALPHA_V3.kdimg OUT.kdimg [SSID PSK]
# PSK is the 64-hex-digit hashed key (preferred) or the 8-63 char passphrase.
# Env: GENIMAGE (Canaan's genimage, resource/tools_2025012201.tar.gz in
# Avalon_Nano3s; needs libssl1.1, set LD_LIBRARY_PATH if the host lacks it).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
STAGE=$1 SRC=$2 OUT=$3
SSID=${4-} PSK=${5-}
GENIMAGE=${GENIMAGE:-genimage}

B=$(mktemp -d)
trap 'rm -rf "$B"' EXIT
cp -a "$STAGE" "$B/stage"

if [ -n "$SSID" ]; then
	case $SSID in *\"*|*\\*) echo "SSID with quotes or backslashes isn't handled" >&2; exit 1;; esac
	if printf %s "$PSK" | grep -Eq '^[0-9a-fA-F]{64}$'; then
		PSKLINE="psk=$PSK"
	else
		case $PSK in *\"*|*\\*) echo "passphrase with quotes or backslashes: use the hashed key" >&2; exit 1;; esac
		n=$(printf %s "$PSK" | wc -c)
		[ "$n" -ge 8 ] && [ "$n" -le 63 ] || { echo "WPA passphrase must be 8-63 chars" >&2; exit 1; }
		PSKLINE="psk=\"$PSK\""
	fi
	printf 'ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\n\nnetwork={\n\tssid="%s"\n\t%s\n\tkey_mgmt=WPA-PSK\n}\n' \
		"$SSID" "$PSKLINE" > "$B/stage/data/userconfig/wpa_supplicant.conf"
fi

mkdir -p "$B/out"
"$GENIMAGE" --rootpath "$B/stage" --tmppath "$B/gtmp" --inputpath "$B/out" --outputpath "$B/out" \
	--config "$HERE/genimage-fix.cfg" > "$B/genimage.log" 2>&1 || { cat "$B/genimage.log" >&2; exit 1; }
python3 -I "$HERE/pack_kdimg.py" "$SRC" "$OUT" app_ubi="$B/out/app.ubi" data="$B/out/data.ubi" > /dev/null
sha256sum "$OUT"
