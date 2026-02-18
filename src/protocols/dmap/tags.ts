/**
 * Util functions for extracting and constructing DMAP data.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import bplistParser from 'bplist-parser';

export type TagReader = (
  data: Buffer,
  start: number,
  length: number,
) => unknown;

export function readStr(data: Buffer, start: number, length: number): string {
  return data.subarray(start, start + length).toString("utf-8");
}

export function readUint(data: Buffer, start: number, length: number): number {
  if (length === 0) return 0;
  return Number(data.readUIntBE(start, length));
}

export function readBool(data: Buffer, start: number, length: number): boolean {
  return readUint(data, start, length) === 1;
}

export function readBplist(
  data: Buffer,
  start: number,
  length: number,
): unknown {
  const buf = data.subarray(start, start + length);
  const parsed = bplistParser.parseBuffer(buf);
  return parsed[0];
}

export function readBytes(data: Buffer, start: number, length: number): string {
  return `0x${data.subarray(start, start + length).toString("hex")}`;
}

export function readIgnore(
  _data: Buffer,
  _start: number,
  _length: number,
): undefined {
  return undefined;
}

export function uint8Tag(name: string, value: number): Buffer {
  const buf = Buffer.alloc(4 + 4 + 1);
  buf.write(name, 0, 4, "utf-8");
  buf.writeUInt32BE(1, 4);
  buf.writeUInt8(value, 8);
  return buf;
}

export function uint16Tag(name: string, value: number): Buffer {
  const buf = Buffer.alloc(4 + 4 + 2);
  buf.write(name, 0, 4, "utf-8");
  buf.writeUInt32BE(2, 4);
  buf.writeUInt16BE(value, 8);
  return buf;
}

export function uint32Tag(name: string, value: number): Buffer {
  const buf = Buffer.alloc(4 + 4 + 4);
  buf.write(name, 0, 4, "utf-8");
  buf.writeUInt32BE(4, 4);
  buf.writeUInt32BE(value, 8);
  return buf;
}

export function uint64Tag(name: string, value: number | bigint): Buffer {
  const buf = Buffer.alloc(4 + 4 + 8);
  buf.write(name, 0, 4, "utf-8");
  buf.writeUInt32BE(8, 4);
  buf.writeBigUInt64BE(BigInt(value), 8);
  return buf;
}

export function boolTag(name: string, value: boolean): Buffer {
  const buf = Buffer.alloc(4 + 4 + 1);
  buf.write(name, 0, 4, "utf-8");
  buf.writeUInt32BE(1, 4);
  buf.writeUInt8(value ? 1 : 0, 8);
  return buf;
}

export function rawTag(name: string, value: Buffer): Buffer {
  const nameBuf = Buffer.alloc(4);
  nameBuf.write(name, 0, 4, "utf-8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(value.length, 0);
  return Buffer.concat([nameBuf, lenBuf, value]);
}

export function stringTag(name: string, value: string): Buffer {
  const valueBuf = Buffer.from(value, "utf-8");
  const nameBuf = Buffer.alloc(4);
  nameBuf.write(name, 0, 4, "utf-8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(valueBuf.length, 0);
  return Buffer.concat([nameBuf, lenBuf, valueBuf]);
}

export function containerTag(name: string, data: Buffer): Buffer {
  return rawTag(name, data);
}
