# Torii — overnight build status (2026-07-13)

Standalone Tauri desktop app that replaces hand-running Mujina's CLI tools:
scan the LAN → list miners → pick one → configure → confirm a destructive
install → watch it stream → check it's mining. Built overnight, autonomously,
per the locked plan in `mujina`'s
`.claude/worktrees/interesting-lehmann-2fc234/.orchestration/PLAN-provisioner-app.md`.

Repo: `D:\github\torii`, branch `torii-v1`, 3 commits, nothing pushed (no
remote configured).

```
f41d2f3  scaffold + scan command + results table
d1313f5  preview/install/poll_miner commands + config/confirm/install/telemetry screens
a82ed7d  fix: drain install's stderr on a separate thread (deadlock risk)
```

## Run it

```
cd D:\github\torii
npm install          # if not already done
npm run tauri dev
```

Needs, already confirmed present on this machine:
- `D:\github\mujina\.claude\worktrees\interesting-lehmann-2fc234\target\release\mujina-scan.exe` (built tonight, `cargo build --release` in that workspace)
- Git for Windows at `C:\Program Files\Git\bin\bash.exe` (for the install script; falls back to `bash` on PATH)
- `D:\github\mujina-loader\tools\network_install\install_mujina_aml.sh` on branch `claude/network-install-parameterize`

All three paths are hardcoded constants in `src-tauri/src/external.rs` — no
env vars or config needed tonight, but that's also why moving either repo
would break Torii (fine for now, flagged for later cleanup below).

## What's built

- **Scan** — shells out to `mujina-scan.exe --auto`/`--cidr`, writes JSON to
  the app cache dir, renders a results table. Rows are greyed out and
  unselectable unless `firmware == "stock-bitmain"`.
- **Configure** — pool URL / worker name / user / password form. No Wi-Fi
  fields (this deployment is wired Ethernet + an external Vonets bridge, so
  Wi-Fi UI was deliberately left out).
- **Confirm** — destructive-action modal showing the real
  `install_mujina_aml.sh --print-plan` output before anything touches the
  device.
- **Install** — streams the install script's stdout+stderr live via Tauri
  events (`install://log`, `install://done`).
- **Telemetry** — polls `GET http://{ip}:7785/api/v0/miner` every 5s and
  renders hashrate/temps/fan/power/pool, ported from Nexus's
  `services/mujinaApi.ts`.

## What's genuinely verified vs. what isn't

**Verified for real, tonight:**
- `cargo build --release` (both `mujina-scan` and Torii's Rust backend) — clean.
- `npx tsc --noEmit` / `npm run build` — clean.
- Live LAN scan via `mujina-scan.exe --auto` found 4 real hosts on this
  network (port-80 reachable, `firmware: "unknown"` — none are Mujina/stock
  Bitmain miners, which is expected since no Antminer is flashed yet). JSON
  round-trips cleanly as `HostRecord`.
- `install_mujina_aml.sh --from-scan <fixture> --host <ip> --print-plan`
  run directly: produces real plan text for a hand-written `stock-bitmain`
  fixture, and a clean refusal (`ERROR: ... firmware class 'luxos' is not
  stock-bitmain`) for a non-stock fixture. Torii's `preview` command wraps
  this faithfully.
- `poll_miner`'s fetch+validate logic, tested against a real Mujina/Bitaxe
  daemon on `127.0.0.1:7785` (happy path, real data) and an unroutable IP
  (clean error, no panic).
- The **safety-critical firmware guard** in `install()`: reviewed directly —
  it reads the scan file, looks up the host record, and returns `Err` on
  non-stock firmware *before* `resolve_bash()` or `Command::new` are ever
  reached. Structurally cannot spawn bash for a non-stock host.

**Verified by code inspection, not a live run:**
- The full `install` Tauri command, end-to-end inside a running app. No
  Mujina-installable device is on the LAN tonight (see scan result above),
  and I stopped short of a full windowed `tauri dev` click-through after a
  `cargo build` hit a transient rustc OOM and a background `tauri dev`
  process load coincided with the machine feeling unresponsive — I killed
  those processes rather than push further GUI verification tonight. Not
  worth risking your machine to get a screenshot.
- `ConfigForm`/`ConfirmModal`/`InstallLog`/`TelemetryView` render logic —
  confirmed by reading the code and via a browser pointed at the raw Vite
  dev server (so real component tree renders, real state transitions), but
  not through the actual Tauri webview with real `invoke()`/event IPC.

**Explicitly stubbed / deferred, on purpose:**
- **Pool/worker config isn't wired to the installer.** `install_mujina_aml.sh`
  has no `--pool`/`--worker` flag — pool config is seeded via the rootfs/env
  blob, which is out of scope tonight. `ConfigForm` collects pool_url/worker
  and carries them on `InstallConfig`, but `install()` doesn't pass them to
  the script (see the `TODO(PD)` comment at the call site). The confirm
  modal's preview will not reflect them — that's correct, not a bug.
- **No packaging** — no installer/bundle, no bash+sshpass auto-detection
  beyond the git-bash path check already in `resolve_bash()`. Run from
  source via `npm run tauri dev` for now.
- **Sidecar bundling** — `mujina-scan.exe` and the install script are
  invoked by hardcoded absolute path (see `external.rs`), not bundled as a
  Tauri sidecar. Fine for one machine, will break if the app moves off this
  box or the sibling repos move.
- **Live flash against real hardware** — never attempted, per your explicit
  instruction. Everything up to and including the confirm modal's preview
  is real; the destructive step itself is wired but untested.

## Fixed during review

`install()` originally piped both stdout and stderr but only read stdout in
a loop before calling `child.wait()`. If the install script wrote enough to
stderr to fill the OS pipe buffer while stdout was still open, the child
could block writing to stderr and deadlock the whole install. Fixed by
draining stderr on a background thread and forwarding it into the same
`install://log` stream, prefixed with `[stderr]`. This wasn't caught by
either worker's testing because neither ran a script invocation that wrote
enough stderr to trigger it — worth keeping in mind if tomorrow's real
install hangs partway through and never emits `install://done`.

## For tomorrow's S19j hardware test

Once a stock-Bitmain S19j Pro is reachable on the LAN:
1. `npm run tauri dev`, click Scan — it should show up as `stock-bitmain`,
   selectable (not greyed out).
2. Walk through Configure → Confirm (read the real `--print-plan` preview
   carefully before confirming — this step is intentionally not automatable).
3. Watch `InstallLog` for real installer output, including the stderr fix
   above actually getting exercised for the first time.
4. After install, Telemetry should start returning real data once
   `mujina-minerd` comes up and answers on `:7785`.

If `preview`/`install` fail with something like "requires jq or python3",
git-bash's PATH is missing both — `install_mujina_aml.sh`'s `--from-scan`
parsing needs one of them. `python3`/`python` is the more likely fallback to
already be present; wasn't hit tonight so isn't confirmed either way.

## Related context

Built on top of, and only usable alongside, uncommitted-to-remote local work
in two other repos:
- `mujina` branch `claude/mujina-s19j-orchestration-a3c308` (worktree
  `D:\github\mujina\.claude\worktrees\interesting-lehmann-2fc234`) —
  `mujina-scan` crate.
- `mujina-loader` branch `claude/network-install-parameterize` —
  `install_mujina_aml.sh`.

Neither of those was touched tonight. Torii only shells out to their
already-built artifacts.
