#!/bin/sh
# Rebuild the sanitized app/data trees the wififix images are made from.
#   prepare_stage.sh NANO_MUJINA_ALPHA_V3.kdimg AVALON_NANO3S_REPO STAGE_DIR
#
# Source: aadhi1014/nano-mujina's alpha-v3 release image. Its app and data
# partitions were captured from a running unit, so they carry that unit's
# logs, Wi-Fi backup, pool login and saved state; those are removed here and
# Canaan's stock config templates (Canaan-Creative/Avalon_Nano3s,
# resource/app_25012001_85ce93f.tar.gz) put back. factory/ (aadhi's
# calibration) is kept. Needs ubi_reader (pip install ubi_reader).
set -eu
IMG=$1 CANAAN=$2 STAGE=$3
HERE=$(cd "$(dirname "$0")" && pwd)
[ ! -e "$STAGE" ] || { echo "$STAGE already exists" >&2; exit 1; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
python3 -I "$HERE/pack_kdimg.py" --extract "$IMG" "$T" app_ubi data
ubireader_extract_files -k -o "$T/app" "$T/app_ubi.bin" > /dev/null
ubireader_extract_files -k -o "$T/data" "$T/data.bin" > /dev/null
mkdir -p "$STAGE"
mv "$T"/app/*/ubi_app_part "$STAGE/app"
mv "$T"/data/*/ubi_data_part "$STAGE/data"

A=$STAGE/app/release
rm -f "$A"/linux/app/mujina_display_startup.sh.pre_* "$A"/rtt/*.log
sed -i 's/MUJINA_POOL_USER=[^ ]*/MUJINA_POOL_USER=YOUR_WALLET.YOUR_WORKER/' \
	"$A/linux/app/mujina_display_startup.sh"
cp "$HERE/wifi_bringup.sh" "$A/linux/app/wifi_bringup.sh"

D=$STAGE/data
rm -rf "$D/.savegame" "$D/userdata/nano"
rm -f "$D/gc_fill.bin" "$D"/*.log "$D"/userdata/log/*.log* "$D"/userdata/log/biglog/* \
	"$D/userconfig/pool.conf" "$D/userconfig/wpa_supplicant.conf.real_backup"
for f in cgminer.conf systemcfg.ini; do
	tar -xzOf "$CANAAN/resource/app_25012001_85ce93f.tar.gz" "app/release/linux/confiles/$f" \
		> "$D/userconfig/$f"
done
printf 'ctrl_interface=/var/run/wpa_supplicant\nupdate_config=1\n' > "$D/userconfig/wpa_supplicant.conf"
echo "staged in $STAGE"
