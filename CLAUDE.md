# Torii

Tauri v2 desktop app (Rust backend in `src-tauri/`, React/TS in `src/`) that
installs and monitors Mujina on miners: Antminer control boards over the
network, and the Avalon Nano 3S over K230 USB burn mode.

- Current hardware work and next steps: `docs/nano3s-status.md`. Read it first.
- Nano 3S image builds: `tools/nano3s-image/`.
- Mujina PR #76, branch cleanup, S19j Pro / S21e Hydro plans: `docs/other-work.md`.
- Older build notes: `STATUS.md` (2026-07, Antminer flow).

## Working rules

- Go to documentation and source first, not memory: vendor repos
  (Canaan-Creative/Avalon_Nano3s, kendryte/k230_flash_py,
  kendryte/K230BurningTool, aadhi1014/nano-mujina), datasheets, device trees.
  Cite the file you got a fact from.
- Never flash or send commands to a device without a confirmed protocol and a
  rollback path.
- Keep credentials (Wi-Fi keys, pool logins, wallets) out of commits and out
  of images that get shared.

## Checks

- `cd src-tauri && cargo test` (Rust; `inspects_real_image_from_env` is
  ignored unless `TORII_TEST_KDIMG` points at a real image)
- `python -m unittest discover tests` (erase wrapper, needs k230-flash installed)
- `npx tsc --noEmit`
- Windows installer from Linux: `npm run tauri build -- --target x86_64-pc-windows-gnu`
  (NSIS bundle)
