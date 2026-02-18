"""Compare SRP intermediate values between srptools and our implementation."""
import hashlib
import binascii

# RFC 5054 3072-bit prime
PRIME_3072_HEX = (
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08"
    "8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B"
    "302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9"
    "A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6"
    "49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8"
    "FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D"
    "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C"
    "180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718"
    "3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D"
    "04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D"
    "B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D22"
    "61AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200"
    "CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BF"
    "CE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF"
)

def int_to_bytes_minimal(val):
    """Like srptools int_to_bytes - minimal representation."""
    hex_str = '%x' % val
    if len(hex_str) % 2:
        hex_str = '0' + hex_str
    return bytes.fromhex(hex_str)

N = int(PRIME_3072_HEX, 16)
g = 5

# Compute H(N) and H(g)
N_bytes = int_to_bytes_minimal(N)
g_bytes = int_to_bytes_minimal(g)  # = b'\x05'

print(f"N bytes length: {len(N_bytes)}")
print(f"g bytes length: {len(g_bytes)}")

hN = hashlib.sha512(N_bytes).digest()
hg = hashlib.sha512(g_bytes).digest()

print(f"\nH(N) first 4 bytes: {hN[:4].hex()}")
print(f"H(g) first 4 bytes: {hg[:4].hex()}")

# XOR as integers (srptools way)
hN_int = int.from_bytes(hN, 'big')
hg_int = int.from_bytes(hg, 'big')
xor_int = hN_int ^ hg_int

# Convert XOR result to minimal bytes (srptools way)
xor_bytes_minimal = int_to_bytes_minimal(xor_int)

# XOR as full 64-byte buffer (nodeatv way)
xor_bytes_full = bytes(a ^ b for a, b in zip(hN, hg))

print(f"\nH(N) XOR H(g) - srptools (minimal bytes): {len(xor_bytes_minimal)} bytes")
print(f"H(N) XOR H(g) - nodeatv  (full 64 bytes): {len(xor_bytes_full)} bytes")
print(f"First byte of XOR: 0x{xor_bytes_full[0]:02x}")
print(f"Are they equal? {xor_bytes_minimal == xor_bytes_full}")
if xor_bytes_minimal != xor_bytes_full:
    print(f"DIFFERENCE! srptools strips leading zeros!")
    print(f"  srptools: {xor_bytes_minimal[:8].hex()}...")
    print(f"  nodeatv:  {xor_bytes_full[:8].hex()}...")

# Now check H(username) = H("Pair-Setup")
hI = hashlib.sha512(b"Pair-Setup").digest()
hI_int = int.from_bytes(hI, 'big')
hI_minimal = int_to_bytes_minimal(hI_int)

print(f"\nH('Pair-Setup') - srptools (minimal bytes): {len(hI_minimal)} bytes")
print(f"H('Pair-Setup') - nodeatv  (full 64 bytes): {len(hI)} bytes")
print(f"First byte of H(I): 0x{hI[0]:02x}")
print(f"Are they equal? {hI_minimal == hI}")
if hI_minimal != hI:
    print(f"DIFFERENCE! srptools strips leading zeros!")
    print(f"  srptools: {hI_minimal[:8].hex()}...")
    print(f"  nodeatv:  {hI[:8].hex()}...")

# Also check: does srptools' hash() of the full M computation differ?
# Let's compute the full proof with both approaches
salt = bytes.fromhex("aabbccdd")  # dummy salt
a_private = 0x1234567890abcdef  # dummy private key
A = pow(g, a_private, N)
B = pow(g, 0xfedcba9876543210, N)  # dummy server public

# Session key (dummy)
K = hashlib.sha512(b"dummy_session_key").digest()

# srptools way: all ints go through int_to_bytes (minimal)
srptools_input = (
    xor_bytes_minimal +
    hI_minimal +
    salt +
    int_to_bytes_minimal(A) +
    int_to_bytes_minimal(B) +
    K
)

# nodeatv way: XOR and hI keep full 64 bytes, A and B use bigintToBuffer (minimal)
nodeatv_input = (
    xor_bytes_full +
    hI +
    salt +
    int_to_bytes_minimal(A) +
    int_to_bytes_minimal(B) +
    K
)

srptools_M = hashlib.sha512(srptools_input).digest()
nodeatv_M = hashlib.sha512(nodeatv_input).digest()

print(f"\n--- Full proof comparison ---")
print(f"srptools input length: {len(srptools_input)}")
print(f"nodeatv  input length: {len(nodeatv_input)}")
print(f"srptools M: {srptools_M[:16].hex()}...")
print(f"nodeatv  M: {nodeatv_M[:16].hex()}...")
print(f"Proofs match: {srptools_M == nodeatv_M}")
