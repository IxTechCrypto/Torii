"""Repack a K230 .kdimg, replacing the content of named partitions.

  pack_kdimg.py SRC.kdimg OUT.kdimg NAME=FILE...      repack
  pack_kdimg.py --extract SRC.kdimg OUT_DIR NAME...  write NAME.bin files

Every other header and partition-table field is copied unchanged from the
source image. Layout follows Kendryte's kdimage format (k230_flash_py
kdimage.md): 512-byte header (magic, CRC32 with its own field zeroed,
flag, version, part count, part-table CRC32, image/chip/board info),
then one 256-byte V1 descriptor per partition, then the contents.
"""
import hashlib
import struct
import sys
import zlib

HEADER_SIZE = 512
PART_SIZE = 256


def repack(src_path, out_path, replacements):
    src = open(src_path, "rb").read()
    header = bytearray(src[:HEADER_SIZE])
    magic, _, _, version, count, _ = struct.unpack_from("<6I", header, 0)
    assert magic == 0x27CB8F93, "not a kdimg"
    assert version < 2, "only V1 partition tables are handled"

    table = bytearray(src[HEADER_SIZE:HEADER_SIZE + count * PART_SIZE])
    payload = bytearray()
    cursor = HEADER_SIZE + len(table)
    for i in range(count):
        desc = memoryview(table)[i * PART_SIZE:(i + 1) * PART_SIZE]
        name = bytes(desc[64:96]).rstrip(b"\0").decode()
        _, offset, size, erase, max_size, _, c_off, c_size = struct.unpack_from("<8I", desc, 0)
        if name in replacements:
            content = open(replacements[name], "rb").read()
            limit = max_size
            assert len(content) <= limit, f"{name}: {len(content)} > part_max_size {limit}"
            # part_size is the bytes written; erase stays the full region so
            # a conforming burner clears what the smaller image doesn't cover.
            struct.pack_into("<I", desc, 8, len(content))
        else:
            content = src[c_off:c_off + c_size]
        struct.pack_into("<II", desc, 24, cursor, len(content))
        desc[32:64] = hashlib.sha256(content).digest()
        payload += content
        cursor += len(content)
        print(f"{name:12s} off={offset:#010x} size={len(content):#09x} erase={erase:#09x}"
              f"{'  (replaced)' if name in replacements else ''}")

    struct.pack_into("<I", header, 20, zlib.crc32(table) & 0xFFFFFFFF)
    struct.pack_into("<I", header, 4, 0)
    struct.pack_into("<I", header, 4, zlib.crc32(header) & 0xFFFFFFFF)
    with open(out_path, "wb") as f:
        f.write(header + table + payload)


def extract(src_path, out_dir, names):
    src = open(src_path, "rb").read()
    count = struct.unpack_from("<I", src, 16)[0]
    for i in range(count):
        off = HEADER_SIZE + i * PART_SIZE
        name = src[off + 64:off + 96].rstrip(b"\0").decode()
        if name in names:
            c_off, c_size = struct.unpack_from("<II", src, off + 24)
            content = src[c_off:c_off + c_size]
            assert hashlib.sha256(content).digest() == src[off + 32:off + 64], f"{name}: bad sha256"
            open(f"{out_dir}/{name}.bin", "wb").write(content)


if __name__ == "__main__":
    if sys.argv[1] == "--extract":
        src, out_dir, *names = sys.argv[2:]
        extract(src, out_dir, names)
        sys.exit()
    src, out, *pairs = sys.argv[1:]
    repack(src, out, dict(p.split("=", 1) for p in pairs))
