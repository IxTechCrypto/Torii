"""Tests for src-tauri/resources/k230_flash_erase.py.

Run with the Python that has k230-flash installed:
    TORII_TEST_KDIMG=/path/to/image.kdimg python -m unittest discover tests
"""

import importlib.util
import os
import struct
import unittest
from pathlib import Path

import k230_flash.burners as burners
import k230_flash.kdimg_utils as kdimg_utils
from k230_flash.kdimage import get_kdimage_items

SCRIPT = Path(__file__).resolve().parent.parent / "src-tauri" / "resources" / "k230_flash_erase.py"
spec = importlib.util.spec_from_file_location("k230_flash_erase", SCRIPT)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)

BLOCK = 128 * 1024


class FakeDev:
    """Records command packets and answers each erase with KBURN_RESULT_OK."""

    def __init__(self):
        self.erases = []

    def write(self, ep, packet, timeout):
        cmd, _, size = struct.unpack("<HHH", bytes(packet[:6]))
        if cmd == burners.KBURN_CMD_ERASE_LBA:
            self.erases.append(struct.unpack("<QQ", bytes(packet[6:6 + size])))
        return len(packet)

    def read(self, ep, length, timeout):
        reply = struct.pack("<HHH", burners.KBURN_CMD_ERASE_LBA | burners.CMD_FLAG_DEV_TO_HOST, burners.KBURN_RESULT_OK, 0)
        return reply.ljust(length, b"\x00")


class FakeBurner:
    def __init__(self):
        self.dev = FakeDev()
        self.ep_in, self.ep_out = 0x81, 0x01
        self.erase_size = BLOCK
        self.capacity = 256 * 1024 * 1024
        self.events = []

    def kburn_nop(self):
        pass

    def write_image_stream(self, stream, size, offset):
        stream.read()
        self.events.append(("write", offset, size))
        return True


class EraseRangeTest(unittest.TestCase):
    def test_matches_canaan_rounding(self):
        # Content ends mid-block: start rounds up, end rounds down.
        self.assertEqual(wrapper.erase_range(0x1200000, 0x1580001, 0x3000000, BLOCK),
                         (0x2780000 + BLOCK, 0x4200000 - (0x2780000 + BLOCK)))

    def test_no_erase_when_region_absent_or_covered(self):
        self.assertIsNone(wrapper.erase_range(0, 0x37000, 0, BLOCK))
        self.assertIsNone(wrapper.erase_range(0xC800000, 0x3800000, 0x3800000, BLOCK))


@unittest.skipUnless(os.environ.get("TORII_TEST_KDIMG"), "set TORII_TEST_KDIMG to a real .kdimg")
class RealImageTest(unittest.TestCase):
    def test_erases_each_spare_region_before_its_write(self):
        path = Path(os.environ["TORII_TEST_KDIMG"])
        burner = FakeBurner()
        burner.dev.write = self._log_erase(burner, burner.dev.write)
        wrapper.erasing_write_kdimg(kdimg_utils.write_kdimg)(path, burner)

        expected = []
        for item in get_kdimage_items(path).data:
            span = wrapper.erase_range(item.partOffset, item.writeSize, item.partEraseSize, BLOCK)
            if span:
                expected.append(("erase", *span))
            expected.append(("write", item.partOffset, item.writeSize))
        self.assertEqual(burner.events, expected)
        for kind, offset, size in burner.events:
            print(f"  {kind:5s} 0x{offset:08X} +0x{size:X}")

    @staticmethod
    def _log_erase(burner, write):
        def wrapped(ep, packet, timeout):
            cmd, _, size = struct.unpack("<HHH", bytes(packet[:6]))
            if cmd == burners.KBURN_CMD_ERASE_LBA:
                burner.events.append(("erase", *struct.unpack("<QQ", bytes(packet[6:6 + size]))))
            return write(ep, packet, timeout)
        return wrapped


if __name__ == "__main__":
    unittest.main()
