# Other work in flight (as of 2026-10-23)

## IxTechCrypto/mujina

- README's NerdQAxe++ chip corrected to BM1370 and merged to `main`
  (IxTechCrypto/mujina#1, `3e0ff34`).
- **Upstream PR [256foundation/mujina#76](https://github.com/256foundation/mujina/pull/76)**
  (Windows support) runs from branch `claude/win-main-port`. It was rebuilt
  on upstream `main` as four commits, each passing fmt, clippy `-D warnings`
  and tests on Linux:
  `be643aa` nix/rustix Unix-only, `cf88093` Ctrl-C shutdown on Windows,
  `02bb3f3` Bitaxe VID:PID matching on Windows only, `31a62db` Windows serial
  and USB discovery (16-empty-read EOF cap; VID:PID fallback only when the
  ports clearly belong to one device).
  Still to do: test on real Windows hardware (one Gamma, then two); replace
  the PR description with `docs/pr76-description.md` and fill in its hardware
  line; consider opening the upstream "Ideas" discussion CONTRIBUTING asks
  for. Three unrelated Bitaxe fixes were dropped from it and could go as
  separate PRs. #76 supersedes aadhi's #75.
- **Branches.** Keep `main`, `claude/win-main-port` (deleting it closes #76),
  `amlogic-s19jpro` and `s19jpro-bitcranev3` (only copies of Skot's S19j
  work). Safe to delete: `claude/mujina-blog-seo-outline-iet7hv`,
  `claude/readme-nerdqx-chip-version-5b5573`, `claude/fan-control`,
  `feature/windows-support` (#75 runs from aadhi's own fork),
  `bitaxefpga`, `feat-emberone`, `macos-usb`, `macos-warnings-fix`,
  `tangminer` (exact copies of Skot's branches).

## S19j Pro on the Amlogic control board (paused)

The owner has one S19j Pro on Braiins OS with root SSH. An earlier attempt
with mujina-loader's install script bricked the control board: the loader
writes a pre-made S21 U-Boot environment (board-specific `aml_dt`), and its
rootfs contains no miner at all.

Rules any install must follow: never write `mtd0`–`mtd4`; verified full
backup before any write; identify the board from the device (NAND ID,
device tree, partition table), never the model name; edit the live U-Boot
environment and show the diff, never write a canned one; install beside the
existing system with a try-once fallback; one-click rollback.

Best code to start from: Michael Schmid's ("Schnitzel") fork,
`github.com/schnitzel/mujina` branch **`ry3t`**: one driver,
`s19x_amlogic.rs`, covering all three hashboards on the shared APW12 rail
(`ChainCoordinator`), PIC and non-PIC S19j Pro boards, S19k Pro (BM1366,
branch `amlogic-s19kpro-support`, the "K Pro" work), fan and thermal safety.
He deploys it by running `mujina-minerd` from `start.sh` on top of the board's
existing firmware (tested on LuxOS), with no flash rewrite. It's on
February-era Mujina (the old chain model), depends on `skot/amlogic-cb-tools`
through a local path, and is untested by us.

Planned order: **0** Torii lockdown of network installs + read-only inspect
and full NAND backup over SSH; **1** build `ry3t` for aarch64-musl and run it
from RAM beside Braiins; **2** port `s19x_amlogic` onto the owner's `main`
once it mines; **3** persistent install with fallback (UART attached), with
deliberate failure tests; **4** Torii flow Inspect → Backup → Test run →
Install → Verify → Rollback. Open questions for the owner: rollback target
(Braiins or Bitmain stock), how the bricked board was recovered, a USB-UART
adapter, a spare control board, whether to contact Michael and Skot before
porting.

## S21e Hydro (after S19j)

Same pipeline as per-machine profiles. Differences to confirm from the
hardware, not assume: control board (Amlogic or CVITek), chip model, PSU
protocol. Cooling is the main hazard: no fans, so Mujina must refuse power
unless coolant readings are present and in range. No Mujina code for it
exists in any branch found.
