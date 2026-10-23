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

import k230_flash.burners as burners
from k230_flash.kdimage import get_kdimage_items
from k230_flash.main import main

# A large NAND erase takes a while; the C tool keeps waiting through up to 30
# read timeouts before giving up.
ERASE_TIMEOUT_MS = 60_000


def erase_range(offset, write_size, part_erase_size, medium_erase_size):
    """Range Canaan's burner erases before writing a partition, as (start, size).

    Starts at the end of the written content rounded up to an erase block and
    ends at the end of the partition's erase region rounded down, so it never
    touches the bytes being written or anything past the declared region.
    """
    if not part_erase_size or not medium_erase_size:
        return None
    start = -(-(offset + write_size) // medium_erase_size) * medium_erase_size
    end = (offset + part_erase_size) // medium_erase_size * medium_erase_size
    return (start, end - start) if end > start else None


def send_erase(burner, offset, size):
    """Send KBURN_CMD_ERASE_LBA and wait for the device to finish it."""
    burner.kburn_nop()
    header = struct.pack("<HHH", burners.KBURN_CMD_ERASE_LBA, 0, 16)
    packet = header + struct.pack("<QQ", offset, size).ljust(burners.MAX_DATA_SIZE, b"\x00")
    burner.dev.write(burner.ep_out, packet, timeout=ERASE_TIMEOUT_MS)
    response = bytes(burner.dev.read(burner.ep_in, burners.PACKET_SIZE, timeout=ERASE_TIMEOUT_MS))
    cmd, result, _ = struct.unpack("<HHH", response[: burners.HEADER_SIZE])
    expected = burners.KBURN_CMD_ERASE_LBA | burners.CMD_FLAG_DEV_TO_HOST
    if cmd != expected or result != burners.KBURN_RESULT_OK:
        raise RuntimeError(f"erase 0x{offset:X}+0x{size:X} failed: cmd 0x{cmd:04X} result 0x{result:04X}")


def erasing_write_kdimg(original):
    """Wrap k230_flash's write_kdimg so each partition's spare region is erased first."""

    def write_kdimg(kdimg_path, burner, selected_partitions=None):
        items = {item.partOffset: item for item in get_kdimage_items(kdimg_path).data}
        write_image_stream = burner.write_image_stream

        def write_with_erase(stream, size, offset):
            item = items.get(offset)
            if item is not None:
                span = erase_range(offset, size, item.partEraseSize, burner.erase_size)
                if span is not None:
                    start, length = span
                    print(f"Erase 0x{start:08X} to 0x{start + length:08X} ({item.partName})", flush=True)
                    send_erase(burner, start, length)
            return write_image_stream(stream, size, offset)

        burner.write_image_stream = write_with_erase
        return original(kdimg_path, burner, selected_partitions=selected_partitions)

    return write_kdimg


if __name__ == "__main__":
    burners.write_kdimg = erasing_write_kdimg(burners.write_kdimg)
    sys.exit(main())
