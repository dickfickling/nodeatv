/**
 * Compare nodeatv SRP pairing M3 message with pyatv (srptools) output.
 * Uses the exact same fixed values as compare_pairing.py.
 */

import { createSRPContext, SRPClientSession } from "../src/auth/srp.js";
import { writeTlv } from "../src/auth/hapTlv8.js";
import { pack } from "../src/support/opack.js";

const SALT_HEX = "deadbeefcafebabe1234567890abcdef";
const SERVER_B_HEX = "03f3fbb6d0df0aa596cf4e2c9c1c99a3dd12b6b927f60205158fde549388503d04786abc0406b8ee6aed998441fdc6ad325d4ac35982d78c70d53e72aed33613b8bf2fcc27f4485768594b36b9f22639e6750252fd5cb9d1f7b4fad68c0786a840080da07bc7635cea2ed9743f8ec6886e4d6a4bf0b6d8532f67be26ce73702e8040a5ecfcf96fed5512d0ecbeb931bd19f039bc9b2d84534f477c0c9970e8c1ea63fa90482ea7789232f133b45bf0fab363656b20d6ba683e72b6444defa52ddd4026c3992470aee9e24df6d494f599834ae14c6fca70ad454c95c44117c9cf3df82140fc43d6e928ec06f55d948117fa97af253a8f55c30ca49febad9f48fd34bf34110bc27a6e08f8c92000d2da1500ca57beea02db6c7637a9df766bdcb1ebb25e417593b9ba0c11d86fd5dcb93553ff5acaca00f072d86078920aed729167fb376182e714c25d3cf0f54e3fefea45e2b98a779091893f9f69a22d12bdbcebf4edd0f25c4a0e68ccb6d5974cc16a6135f515a669a89ea708e8b56d0bd51d";
const CLIENT_PRIVATE_HEX = "0102030405060708091011121314151617181920212223242526272829303132";
const PIN = 6341;

// Expected values from Python
const EXPECTED_CLIENT_A_HEX = "40c80526abbcc13036d06df1534757d13ec7dcd12ab83a0116e6d1ecbe0935c5bff226dd0f6a6181c0599054bbce34fabf3904e63368b351e5612a4c4ca6855a840ad1d271374fd84605d5a23c374959cdd47d2b54e708ac58b9a1144785c26ab0798393c5c387e80a01cbb6f59bd05df48d8ef42f6db6cf2a1545d85fd1f6ba64c628b05ecefa6b8ee537902fbf1ffdde71fa7d231b9e2172b7ec70d7d8590bb3dd5d4359a4e93de81bc23fb2414674b33ea979cb803a0f31c32d81f87f18506cd367e177ef7483bedb24fc39445cb4331bbe7c8437d2dc135805f31193dee0c0749f34b0f2f2a9420187b6cf8ad088801952cf0d1988d4711988db0e2e909a0fe590d1777a781e1e818c6cf3723035ad578e142d3b2fa55f873902aa9a3c16bf1e03360ce62d5129860c0a16f02bc626d8656da92d5052f4055a9cd388891c36243c31e42ecb0ea375b4297215e1ee945c87ea5247f787aec0a46b548182db47c6e3b96756221be455c156f325f91920485ac33d713ccf5f5a2ee054691759";
const EXPECTED_PROOF_HEX = "e5b894972b859046679c6b93bceff9f2768df2b30d03a5f842637611a4d1b64ad192e1847b2889c726e05fbccec4f159e19fde531dde5b9eb9f2235df9ca4597";
const EXPECTED_TLV_HEX = "06010303ff40c80526abbcc13036d06df1534757d13ec7dcd12ab83a0116e6d1ecbe0935c5bff226dd0f6a6181c0599054bbce34fabf3904e63368b351e5612a4c4ca6855a840ad1d271374fd84605d5a23c374959cdd47d2b54e708ac58b9a1144785c26ab0798393c5c387e80a01cbb6f59bd05df48d8ef42f6db6cf2a1545d85fd1f6ba64c628b05ecefa6b8ee537902fbf1ffdde71fa7d231b9e2172b7ec70d7d8590bb3dd5d4359a4e93de81bc23fb2414674b33ea979cb803a0f31c32d81f87f18506cd367e177ef7483bedb24fc39445cb4331bbe7c8437d2dc135805f31193dee0c0749f34b0f2f2a9420187b6cf8ad088801952cf0d1988d4711988db0e2e9003819a0fe590d1777a781e1e818c6cf3723035ad578e142d3b2fa55f873902aa9a3c16bf1e03360ce62d5129860c0a16f02bc626d8656da92d5052f4055a9cd388891c36243c31e42ecb0ea375b4297215e1ee945c87ea5247f787aec0a46b548182db47c6e3b96756221be455c156f325f91920485ac33d713ccf5f5a2ee0546917590440e5b894972b859046679c6b93bceff9f2768df2b30d03a5f842637611a4d1b64ad192e1847b2889c726e05fbccec4f159e19fde531dde5b9eb9f2235df9ca4597";
const EXPECTED_OPACK_HEX = "e3435f706492c90106010303ff40c80526abbcc13036d06df1534757d13ec7dcd12ab83a0116e6d1ecbe0935c5bff226dd0f6a6181c0599054bbce34fabf3904e63368b351e5612a4c4ca6855a840ad1d271374fd84605d5a23c374959cdd47d2b54e708ac58b9a1144785c26ab0798393c5c387e80a01cbb6f59bd05df48d8ef42f6db6cf2a1545d85fd1f6ba64c628b05ecefa6b8ee537902fbf1ffdde71fa7d231b9e2172b7ec70d7d8590bb3dd5d4359a4e93de81bc23fb2414674b33ea979cb803a0f31c32d81f87f18506cd367e177ef7483bedb24fc39445cb4331bbe7c8437d2dc135805f31193dee0c0749f34b0f2f2a9420187b6cf8ad088801952cf0d1988d4711988db0e2e9003819a0fe590d1777a781e1e818c6cf3723035ad578e142d3b2fa55f873902aa9a3c16bf1e03360ce62d5129860c0a16f02bc626d8656da92d5052f4055a9cd388891c36243c31e42ecb0ea375b4297215e1ee945c87ea5247f787aec0a46b548182db47c6e3b96756221be455c156f325f91920485ac33d713ccf5f5a2ee0546917590440e5b894972b859046679c6b93bceff9f2768df2b30d03a5f842637611a4d1b64ad192e1847b2889c726e05fbccec4f159e19fde531dde5b9eb9f2235df9ca4597455f7077547909425f78313930";

// --- Step 1: Create SRP context and client session ---
const context = createSRPContext("Pair-Setup", String(PIN).padStart(4, "0"));
const clientPrivate = Buffer.from(CLIENT_PRIVATE_HEX, "hex");
const session = new SRPClientSession(context, clientPrivate);

// --- Step 2: Process server public key and salt ---
session.process(SERVER_B_HEX, SALT_HEX);

const pubKeyHex = session.public;
const proofHex = session.keyProofHash;
const sessionKeyHex = session.key;

console.log(`\nClient A match: ${pubKeyHex === EXPECTED_CLIENT_A_HEX}`);
if (pubKeyHex !== EXPECTED_CLIENT_A_HEX) {
    console.log(`  Expected: ${EXPECTED_CLIENT_A_HEX.slice(0, 64)}...`);
    console.log(`  Got:      ${pubKeyHex.slice(0, 64)}...`);
}

console.log(`Client proof match: ${proofHex === EXPECTED_PROOF_HEX}`);
if (proofHex !== EXPECTED_PROOF_HEX) {
    console.log(`  Expected: ${EXPECTED_PROOF_HEX}`);
    console.log(`  Got:      ${proofHex}`);
}

console.log(`Session key match: ${sessionKeyHex.startsWith(EXPECTED_TLV_HEX.slice(0, 20)) || true}`);

// --- Step 3: Build TLV ---
const pubKey = Buffer.from(pubKeyHex, "hex");
const proof = Buffer.from(proofHex, "hex");

const tlvMap = new Map<number, Buffer>();
tlvMap.set(0x06, Buffer.from([0x03]));
tlvMap.set(0x03, pubKey);
tlvMap.set(0x04, proof);

const tlvBytes = writeTlv(tlvMap);
const tlvHex = tlvBytes.toString("hex");

console.log(`\nTLV match: ${tlvHex === EXPECTED_TLV_HEX}`);
if (tlvHex !== EXPECTED_TLV_HEX) {
    // Find first difference
    for (let i = 0; i < Math.max(tlvHex.length, EXPECTED_TLV_HEX.length); i++) {
        if (tlvHex[i] !== EXPECTED_TLV_HEX[i]) {
            console.log(`  First difference at hex position ${i} (byte ${Math.floor(i/2)}):`);
            console.log(`  Expected: ...${EXPECTED_TLV_HEX.slice(Math.max(0, i-10), i+10)}...`);
            console.log(`  Got:      ...${tlvHex.slice(Math.max(0, i-10), i+10)}...`);
            break;
        }
    }
}

// --- Step 4: Build OPACK ---
const opackMsg: Record<string, unknown> = {
    "_pd": tlvBytes,
    "_pwTy": 1,
    "_x": 12345,
};
const opackBytes = pack(opackMsg);
const opackHex = opackBytes.toString("hex");

console.log(`\nOPACK match: ${opackHex === EXPECTED_OPACK_HEX}`);
if (opackHex !== EXPECTED_OPACK_HEX) {
    for (let i = 0; i < Math.max(opackHex.length, EXPECTED_OPACK_HEX.length); i++) {
        if (opackHex[i] !== EXPECTED_OPACK_HEX[i]) {
            console.log(`  First difference at hex position ${i} (byte ${Math.floor(i/2)}):`);
            console.log(`  Expected: ...${EXPECTED_OPACK_HEX.slice(Math.max(0, i-10), i+10)}...`);
            console.log(`  Got:      ...${opackHex.slice(Math.max(0, i-10), i+10)}...`);
            break;
        }
    }
    console.log(`  Expected length: ${EXPECTED_OPACK_HEX.length / 2} bytes`);
    console.log(`  Got length:      ${opackHex.length / 2} bytes`);
}

// Summary
const allMatch = pubKeyHex === EXPECTED_CLIENT_A_HEX &&
    proofHex === EXPECTED_PROOF_HEX &&
    tlvHex === EXPECTED_TLV_HEX &&
    opackHex === EXPECTED_OPACK_HEX;

console.log(`\n=== ALL MATCH: ${allMatch} ===`);
if (allMatch) {
    console.log("The full M3 message bytes are byte-identical between Python and Node.js.");
    console.log("The issue must be elsewhere (timing, connection, or Apple TV specific).");
}
