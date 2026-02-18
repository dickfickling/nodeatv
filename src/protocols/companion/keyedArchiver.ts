/**
 * Support for working with NSKeyedArchiver serialized data.
 */

import bplistParser from 'bplist-parser';

interface UID {
  UID: number;
}

function isUID(value: unknown): value is UID {
  return (
    typeof value === "object" &&
    value !== null &&
    "UID" in value &&
    typeof (value as UID).UID === "number"
  );
}

/**
 * Get properties from NSKeyedArchiver encoded plist.
 *
 * In the absence of a robust NSKeyedArchiver implementation, read one or
 * more properties from the archived plist by following UID references.
 */
export function readArchiveProperties(
  archive: Buffer,
  ...paths: string[][]
): (unknown | null)[] {
  const parsed = bplistParser.parseBuffer(archive);
  const data = parsed[0] as Record<string, unknown>;
  const results: (unknown | null)[] = [];

  const objects = data.$objects as unknown[];

  for (const path of paths) {
    let element: unknown = (data as Record<string, unknown>).$top;
    try {
      for (const key of path) {
        element = (element as Record<string, unknown>)[key];
        if (isUID(element)) {
          element = objects[element.UID];
        }
      }
      results.push(element);
    } catch {
      results.push(null);
    }
  }

  return results;
}
