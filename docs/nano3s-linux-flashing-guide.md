# Canaan Avalon Nano 3S: Linux Flashing & Setup Guide

This guide walks through taking a factory-stock Canaan Avalon Nano 3S and flashing the latest **nano-mujina** full system image (`.kdimg`) onto its onboard 256 MiB SPI NAND on Linux (Ubuntu, Debian, Fedora, Arch, etc.).

---

## ⚡ Key Differences: Linux vs. Windows
* **No Zadig / WinUSB required:** Linux natively handles direct USB access via `libusb` and the kernel's `usbfs` interface.
* **udev Permission Rule:** Linux restricts raw USB access to `root` by default. Adding a simple 1-line `udev` rule grants non-root access to the K230 Bootloader without needing `sudo`.
* **Two Flashing Options on Linux:**
  1. **Option A (GUI):** Using the **Torii** desktop app (built with Tauri v2).
  2. **Option B (Direct CLI):** Using Kendryte's native `k230-flash` tool (instant setup, no GUI compilation needed).

---

## 🧰 Hardware Prerequisites

* **Avalon Nano 3S** miner.
* **USB-A to USB-A data cable**.
* **SIM ejector tool** or small paperclip.
* **140W USB-C PD power supply** for the Nano 3S.
* **Linux PC** (Ubuntu, Debian, Fedora, Arch, etc.).
* **Firmware Image:** The latest `nano-mujina-*.kdimg` release file.

---

## Step 1: Linux System Setup (udev & Python Environment)

### 1.1 Add the udev Rule for K230 Boot Device
Allow your standard user account to communicate with the K230 bootloader (`VID 29f1: PID 0230`):

```bash
echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="29f1", ATTR{idProduct}=="0230", MODE="0666", TAG+="uaccess"' | sudo tee /etc/udev/rules.d/99-k230.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### 1.2 Install the Flashing Engine (`k230-flash`)
Torii and the CLI both use Kendryte's `k230-flash` utility. Modern Linux distributions enforce PEP 668, so install it using `pipx` or in a dedicated virtual environment:

```bash
# Recommended via pipx:
sudo apt install pipx    # Fedora: sudo dnf install pipx | Arch: sudo pacman -S python-pipx
pipx install k230-flash
pipx ensurepath
```
*(Alternatively, via virtualenv: `python3 -m venv ~/.k230-venv && ~/.k230-venv/bin/pip install k230-flash`)*

---

## Step 2: Place Nano 3S into Hardware USB Burn Mode

> **Safety Notice:** The K230 bootloader lives in on-chip hardware mask ROM. It cannot be corrupted or overwritten. If any flash is interrupted, simply reboot while holding the button and re-flash.

1. **Power off** the Nano 3S and unplug the USB-C power supply.
2. **Remove the Wi-Fi module:** Slide off the rear grille cover and unplug the small Wi-Fi USB dongle from the internal USB-A port.
   *(The USB burn cable connects to this exact internal USB-A port).*
3. **Connect the USB cable:** Connect the USB-A to USB-A cable between the Nano 3S's internal port and your Linux PC.
4. **Locate the recessed pin button:** Find the small pinhole next to the USB-A port.
5. **Enter Burn Mode:**
   - Press and hold the recessed button with your SIM ejector or paperclip.
   - While continuing to hold the pin down, plug in the USB-C power supply.
   - Hold the pin for **3 seconds**, then release.

### Verify USB Connection
Verify that Linux detected the device in Bootloader mode:
```bash
lsusb -d 29f1:0230
```
Expected output:
```text
Bus 001 Device 005: ID 29f1:0230 Kendryte K230 USB Boot Device
```

---

## Step 3: Flash the Firmware

### Option A: Using the Torii Desktop App (GUI)

Torii is built with Tauri v2 (Rust + React). If running from source on Linux:
```bash
git clone https://github.com/IxTechCrypto/Torii.git
cd Torii
npm install
npm run tauri dev   # Or: npm run tauri build
```

1. In the Torii window, select the **Avalon Nano 3S** panel and click the **USB Burn / Flash (.kdimg)** tab.
2. Confirm the status card shows:
   `🟢 K230 Burn Device Ready (Bus X, Addr Y) - Direct USB connection verified.`
3. Under **Target Action**, select **⚡ Install Mujina (nano-mujina)**.
4. Browse to your `nano-mujina-*.kdimg` file (Torii will automatically verify header magic `0x27CB8F93`, partition CRCs, and partition SHA-256 hashes).
5. Click **Flash nano-mujina to Device** and watch the real-time progress bar.

---

### Option B: Direct Terminal Flash (CLI - No GUI Required)

If you do not have the Torii GUI compiled on Linux, you can flash directly using the `k230-flash` CLI (which performs the exact same low-level SPI NAND write):

```bash
k230-flash --media-type SPI_NAND --log-level INFO /path/to/nano-mujina-alpha-v3.kdimg
```

Wait for the partition progress bar to reach `100.0%` and exit with success.

---

## Step 4: Post-Flash Setup & Wi-Fi Provisioning

1. When flashing finishes:
   - Disconnect the USB-C power supply.
   - Unplug and remove the USB-A to USB-A burn cable.
2. **Re-insert the Wi-Fi module:**
   > ⚠️ **CRITICAL:** Plug the original Wi-Fi USB dongle back into the Nano 3S internal USB-A port **before powering on**, so the Linux kernel recognizes it at boot.
3. **Power On:** Reconnect the USB-C power supply.
4. **Provision Wi-Fi via Bluetooth:**
   - Open the **Avalon Family** mobile app on your phone.
   - Connect to the device advertised as `nan3s_...`.
   - Select your 2.4 GHz Wi-Fi SSID and enter your network password.
5. **Access the Web Dashboard:**
   - The Nano 3S front display will show its new local IP address (e.g. `192.168.1.50`).
   - Open `http://<miner-ip>/` in your web browser.
   - You are now running **nano-mujina** with the **Auto Tuner** ready to configure!
