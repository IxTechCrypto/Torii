Add native Windows support so `mujina-minerd` builds for Windows and mines with a Bitaxe over USB serial, without WSL or Docker.

Rebased onto current `main`. The earlier revision of this PR also carried three Bitaxe fixes (cold-chip discovery retry, ASIC frequency telemetry, sensor-fault vs. thermal-emergency handling); those are unrelated to Windows and have been dropped from this PR so it stays one reviewable change. They can come as separate PRs if wanted.

## Commits

1. **build(miner): depend on nix and rustix only on Unix.** Both wrap POSIX interfaces and don't build for Windows. The Bitaxe Gamma hardware tests, which stop the daemon with SIGINT via nix, are now Unix-only too. No change on Linux or macOS.
2. **feat(daemon): shut down on Ctrl-C on Windows.** Windows has no SIGINT/SIGTERM.
3. **feat(board/bitaxe): match Bitaxe boards by VID:PID on Windows.** Windows reports the CDC ACM driver's generic strings ("Microsoft") instead of "OSMU"/"Bitaxe", so string matching can't work there. On Windows only, both descriptors match on VID:PID (c0de:cafe for bitaxe-raw, 1209:6102 for RHAP-D). Linux and macOS matching is unchanged.
4. **feat(transport): add Windows serial ports and USB discovery.** `serial_windows.rs` gives `serial.rs`'s public API on top of tokio-serial. `usb/windows.rs` maps nusb devices to COM ports by VID:PID:serial, ordered by USB interface number.

## Windows-specific behavior worth reviewing

- **Zero-byte reads.** tokio-serial reads a COM port through a named pipe, which reports an overlapped read that completes empty as `Ok(0)`, and the framed reader treats that as EOF. The reader treats it as "no data yet". mio also maps `ERROR_BROKEN_PIPE` to `Ok(0)` on every retry, so after 16 consecutive empty reads the reader reports EOF, which bounds the retries and still surfaces a dead port.
- **Serial-number fallback.** Windows sometimes reports a serial number to nusb but none to the COM-port enumeration. Discovery then falls back to VID:PID, but only when that yields exactly one device's worth of ports with distinct interface numbers, so two identical boards never have their ports mixed.
- **Baud-rate change** doesn't drain the output buffer first on Windows (documented in the module header).

## Testing

- `cargo fmt --check`, `cargo clippy --release --locked -- -D warnings`, and `cargo test --locked` pass on Linux at every commit.
- `cargo check --all-targets` and `cargo clippy --lib --bins -- -D warnings` pass for `x86_64-pc-windows-gnu` at the tip.
- Hardware: <!-- fill in: Windows version, board(s), what you ran, e.g. "Windows 11, Bitaxe Gamma (bitaxe-raw): discovers, mines, accepted shares, clean Ctrl-C shutdown" -->

`Cargo.lock` gains only dependency edges (serialport, tokio feature on nusb) — no new crate versions.
