"""
Compare the full SRP pairing M3 message between srptools and nodeatv.
Uses srptools directly without importing pyatv.
"""

import hashlib
import binascii
import struct
import sys
import os

sys.path.insert(0, '/Users/dick/work/honeycrisp/python_server/venv/lib/python3.13/site-packages')

from srptools import SRPClientSession, SRPContext, constants
from srptools.utils import int_to_bytes, hex_from

# Fixed test values
SALT = bytes.fromhex("deadbeefcafebabe1234567890abcdef")
CLIENT_PRIVATE = bytes.fromhex("0102030405060708091011121314151617181920212223242526272829303132")
PIN = 6341

# We need to create a server session to get B
# First, compute verifier from salt + PIN
server_context = SRPContext(
    "Pair-Setup",
    str(PIN),
    prime=constants.PRIME_3072,
    generator=constants.PRIME_3072_GEN,
    hash_func=hashlib.sha512,
)

# x = H(salt, H(I:P))
salt_int = int.from_bytes(SALT, 'big')
x = server_context.get_common_password_hash(salt_int)
v = server_context.get_common_password_verifier(x)

# Server private key (fixed for reproducibility)
SERVER_PRIVATE = 0xfedcba9876543210fedcba9876543210
B = server_context.get_server_public(v, SERVER_PRIVATE)
B_bytes = int_to_bytes(B)

print(f"Salt ({len(SALT)} bytes): {SALT.hex()}")
print(f"Server B ({len(B_bytes)} bytes): {B_bytes.hex()[:64]}...")

# --- Client session (simulating pyatv) ---
client_context = SRPContext(
    "Pair-Setup",
    str(PIN),
    prime=constants.PRIME_3072,
    generator=constants.PRIME_3072_GEN,
    hash_func=hashlib.sha512,
)
client_session = SRPClientSession(
    client_context,
    binascii.hexlify(CLIENT_PRIVATE).decode()
)

pk_str = binascii.hexlify(B_bytes).decode()
salt_hex = binascii.hexlify(SALT).decode()
client_session.process(pk_str, salt_hex)

pub_key = binascii.unhexlify(client_session.public)
proof = binascii.unhexlify(client_session.key_proof)
session_key = client_session.key

print(f"\nClient A ({len(pub_key)} bytes): {pub_key.hex()[:64]}...")
print(f"Client proof ({len(proof)} bytes): {proof.hex()}")
print(f"Session key: {session_key[:64]}...")

# --- TLV8 encoding ---
def write_tlv8(data):
    """Simple TLV8 encoder matching both pyatv and nodeatv."""
    result = b""
    for tag, value in data.items():
        remaining = len(value)
        pos = 0
        while pos < len(value):
            size = min(remaining, 255)
            result += bytes([tag, size]) + value[pos:pos+size]
            pos += size
            remaining -= size
    return result

tlv_data = write_tlv8({
    0x06: b"\x03",      # SeqNo = M3
    0x03: pub_key,       # PublicKey
    0x04: proof,         # Proof
})

print(f"\nM3 TLV ({len(tlv_data)} bytes)")
print(f"  first 40 hex: {tlv_data.hex()[:80]}")
print(f"  last 40 hex:  {tlv_data.hex()[-80:]}")

# --- OPACK encoding (inline, matching pyatv/srptools) ---
def opack_pack(data):
    """Simplified OPACK encoder matching pyatv."""
    object_list = []
    return _opack_pack(data, object_list)

def _opack_pack(data, object_list):
    packed_bytes = None

    if data is None:
        packed_bytes = bytes([0x04])
    elif isinstance(data, bool):
        packed_bytes = bytes([1 if data else 2])
    elif isinstance(data, int):
        if data < 0x28:
            packed_bytes = bytes([data + 8])
        elif data <= 0xFF:
            packed_bytes = bytes([0x30]) + data.to_bytes(1, 'little')
        elif data <= 0xFFFF:
            packed_bytes = bytes([0x31]) + data.to_bytes(2, 'little')
        elif data <= 0xFFFFFFFF:
            packed_bytes = bytes([0x32]) + data.to_bytes(4, 'little')
        else:
            packed_bytes = bytes([0x33]) + data.to_bytes(8, 'little')
    elif isinstance(data, str):
        encoded = data.encode('utf-8')
        if len(encoded) <= 0x20:
            packed_bytes = bytes([0x40 + len(encoded)]) + encoded
        elif len(encoded) <= 0xFF:
            packed_bytes = bytes([0x61]) + len(encoded).to_bytes(1, 'little') + encoded
        else:
            packed_bytes = bytes([0x62]) + len(encoded).to_bytes(2, 'little') + encoded
    elif isinstance(data, (bytes, bytearray)):
        if len(data) <= 0x20:
            packed_bytes = bytes([0x70 + len(data)]) + data
        elif len(data) <= 0xFF:
            packed_bytes = bytes([0x91]) + len(data).to_bytes(1, 'little') + data
        elif len(data) <= 0xFFFF:
            packed_bytes = bytes([0x92]) + len(data).to_bytes(2, 'little') + data
        else:
            packed_bytes = bytes([0x93]) + len(data).to_bytes(4, 'little') + data
    elif isinstance(data, dict):
        parts = [bytes([0xe0 + min(len(data), 0xf)])]
        for k, v in data.items():
            parts.append(_opack_pack(k, object_list))
            parts.append(_opack_pack(v, object_list))
        if len(data) >= 0xf:
            parts.append(bytes([0x03]))
        packed_bytes = b"".join(parts)
    else:
        raise TypeError(f"unsupported type: {type(data)}")

    # UID referencing
    if packed_bytes in object_list:
        idx = object_list.index(packed_bytes)
        if idx < 0x21:
            packed_bytes = bytes([0xa0 + idx])
        else:
            packed_bytes = bytes([0xc1]) + idx.to_bytes(1, 'little')
    elif len(packed_bytes) > 1:
        object_list.append(packed_bytes)

    return packed_bytes

opack_msg = {
    "_pd": tlv_data,
    "_pwTy": 1,
    "_x": 12345,
}
opack_bytes = opack_pack(opack_msg)
print(f"\nM3 OPACK ({len(opack_bytes)} bytes)")
print(f"  first 40 hex: {opack_bytes.hex()[:80]}")

# Output values for node.js comparison
print("\n\n=== VALUES FOR NODE.JS COMPARISON ===")
print(f"SALT_HEX={SALT.hex()}")
print(f"SERVER_B_HEX={B_bytes.hex()}")
print(f"CLIENT_PRIVATE_HEX={CLIENT_PRIVATE.hex()}")
print(f"PIN={PIN}")
print(f"EXPECTED_CLIENT_A_HEX={pub_key.hex()}")
print(f"EXPECTED_PROOF_HEX={proof.hex()}")
print(f"EXPECTED_SESSION_KEY_HEX={session_key}")
print(f"EXPECTED_TLV_HEX={tlv_data.hex()}")
print(f"EXPECTED_OPACK_HEX={opack_bytes.hex()}")
