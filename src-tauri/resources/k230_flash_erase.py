"""Run k230-flash, erasing each partition's spare erase region first.

A .kdimg partition can declare an erase size larger than its content (Canaan's
Nano 3S image gives rootfs_ubi 48 MiB of erase region for ~21 MiB of UBI
image). Canaan's K230BurningTool erases from the end of the written content to
the end of that region before writing (K230BurningProcess::begin), so stale
UBI blocks from the previous firmware can't survive next to the new image.
k230-flash (as of v1.4.0) never sends that erase, which leaves the old blocks
in place and can stop the board booting. This wrapper adds the erase and
otherwise runs k230-flash unchanged, with the same arguments and exit codes.
"""

import struct
import sys
from importlib.metadata import version

import k230_flash.burners as burners
from k230_flash.kdimage import get_kdimage_items
from k230_flash.main import main

# A large NAND erase takes a while; the C tool keeps waiting through up to 30
# read timeouts before giving up.
ERASE_TIMEOUT_MS = 60_000

# k230-flash writes .kdimg partitions through write_image_stream from 1.3.0;
# 1.2.x calls write_image instead, which this wrapper doesn't hook.
MIN_K230_FLASH = (1, 3, 0)


def check_k230_flash_version(installed):
    """Raise unless `installed` (a version string) is at least MIN_K230_FLASH."""
    parts = tuple(int(p) for p in installed.split("+")[0].split(".")[:3] if p.isdigit())
    if parts < MIN_K230_FLASH:
        wanted = ".".join(map(str, MIN_K230_FLASH))
        raise SystemExit(f"k230-flash {installed} is too old; Torii needs {wanted} or newer "
                         f"(pip install -U k230-flash)")


def erase_range(offset, write_size, part_erase_size, medium_erase_size):
    """Range Canaan's burner erases before writing a partition, as (start, size).

    Starts at the end of the written content rounded up to an erase block and
    ends at the end of the partition's erase region rounded down, so it never
    touches the bytes being written or anything past the declared region.
    """
    if not part_erase_size:
        return None
    if not medium_erase_size:
        # Canaan's tool refuses to continue without the medium's erase size.
        raise RuntimeError("device reported no erase size; cannot erase safely")
    start = -(-(offset + write_size) // medium_erase_size) * medium_erase_size
    end = (offset + part_erase_size) // medium_erase_size * medium_erase_size
    return (start, end - start) if end > start else None


def send_erase(burner, offset, size):
    """Send KBURN_CMD_ERASE_LBA and wait for the device to finish it."""
    burner.kburn_nop()
    header = struct.pack("<HHH", burners.KBURN_CMD_ERASE_LBA, 0, 16)
    packet = header + struct.pack("<QQ", offset, size).ljust(burners.MAX_DATA_SIZE, b"\x00")
    try:
        burner.dev.write(burner.ep_out, packet, timeout=ERASE_TIMEOUT_MS)
        response = bytes(burner.dev.read(burner.ep_in, burners.PACKET_SIZE, timeout=ERASE_TIMEOUT_MS))
    except Exception as e:
        raise RuntimeError(f"erase 0x{offset:X}+0x{size:X} failed: {e}") from e
    cmd, result, _ = struct.unpack("<HHH", response[: burners.HEADER_SIZE])
    expected = burners.KBURN_CMD_ERASE_LBA | burners.CMD_FLAG_DEV_TO_HOST
    if cmd != expected or result != burners.KBURN_RESULT_OK:
        raise RuntimeError(f"erase 0x{offset:X}+0x{size:X} failed: cmd 0x{cmd:04X} result 0x{result:04X}")


def erasing_write_kdimg(original):
    """Wrap k230_flash's write_kdimg so each partition's spare region is erased first."""

    def write_kdimg(kdimg_path, burner, selected_partitions=None):
        items = {(item.partOffset, item.writeSize): item for item in get_kdimage_items(kdimg_path).data}
        write_image_stream = burner.write_image_stream
        hooked_writes = 0

        def write_with_erase(stream, size, offset):
            nonlocal hooked_writes
            hooked_writes += 1
            item = items.get((offset, size))
            if item is not None:
                span = erase_range(offset, size, item.partEraseSize, burner.erase_size)
                if span is not None:
                    start, length = span
                    print(f"Erase 0x{start:08X} to 0x{start + length:08X} ({item.partName})", flush=True)
                    send_erase(burner, start, length)
            return write_image_stream(stream, size, offset)

        burner.write_image_stream = write_with_erase
        result = original(kdimg_path, burner, selected_partitions=selected_partitions)
        if not hooked_writes:
            # k230-flash wrote through some other path, so nothing was erased.
            # The version check above should prevent this; if it happens
            # anyway, fail so the flash isn't reported as a success.
            raise RuntimeError("k230-flash bypassed the erase hook; partitions were written without erasing")
        return result

    return write_kdimg


if __name__ == "__main__":
    check_k230_flash_version(version("k230-flash"))
    burners.write_kdimg = erasing_write_kdimg(burners.write_kdimg)
    sys.exit(main())
