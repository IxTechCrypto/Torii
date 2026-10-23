#!/bin/sh
# Replicates the exact WiFi bring-up commands mm_miner itself shells out to
# (found via `strings` on the mm_miner binary), so wlan0 still comes up when
# mm_miner is absent.
#
# Runs in the background so the rest of boot isn't held up: waits for wlan0
# (up to 120 s), retries wpa_supplicant, and starts one scan to warm up
# wpa_supplicant's results. (ble_setup still answers the app's first scan
# read empty: it only reports its own scans, which take ~3 s, and the app
# reads 1 s after asking, so refreshing once in the app is still needed.)
# What happened is logged to /data/userdata/log/wifi_bringup.log.

LOG=/data/userdata/log/wifi_bringup.log
mkdir -p /data/userdata/log
: >"$LOG"

(
	echo "=== wifi_bringup at uptime $(cut -d' ' -f1 /proc/uptime)s"
	i=0
	while [ ! -e /sys/class/net/wlan0 ] && [ "$i" -lt 120 ]; do
		sleep 1
		i=$((i + 1))
	done
	echo "interfaces after ${i}s: $(ls /sys/class/net)"

	if [ -e /sys/class/net/wlan0 ]; then
		n=0
		until wpa_cli -i wlan0 status >/dev/null 2>&1 || [ "$n" -ge 5 ]; do
			n=$((n + 1))
			echo "starting wpa_supplicant (attempt $n)"
			wpa_supplicant -B -D nl80211 -i wlan0 -c /data/userconfig/wpa_supplicant.conf
			sleep 2
		done
		if wpa_cli -i wlan0 status; then
			wpa_cli -a /etc/wpa_action.sh -B -i wlan0 -P /var/run/wpa_cli.pid
			udhcpc -i wlan0 -b -p /var/run/udhcpc.wlan0.pid >/dev/null 2>&1 &
			echo "scan: $(wpa_cli -i wlan0 scan)"
		else
			echo "wpa_supplicant did not start"
		fi
	else
		echo "wlan0 never appeared"
	fi

	echo "--- kernel log (usb/wifi)"
	dmesg | grep -i -E 'usb|8723|rtw|rtl|wlan|cfg80211|firmware' | tail -60
	echo "=== done at uptime $(cut -d' ' -f1 /proc/uptime)s"
) >>"$LOG" 2>&1 &
