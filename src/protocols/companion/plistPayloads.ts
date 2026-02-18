/**
 * Helper functions to generate payloads for RTI service.
 *
 * In the absence of a robust NSKeyedArchiver implementation, these are
 * pre-encoded using bplist-creator.
 */

import bplistCreator from 'bplist-creator';

interface BplistUID {
  UID: number;
}

function uid(value: number): BplistUID {
  return { UID: value };
}

/**
 * Prepare an NSKeyedArchiver encoded payload for clearing the RTI text.
 */
export function getRtiClearTextPayload(sessionUuid: Buffer): Buffer {
  return bplistCreator({
    $version: 100000,
    $archiver: "RTIKeyedArchiver",
    $top: {
      textOperations: uid(1),
    },
    $objects: [
      "$null",
      {
        $class: uid(7),
        targetSessionUUID: uid(5),
        keyboardOutput: uid(2),
        textToAssert: uid(4),
      },
      {
        $class: uid(3),
      },
      {
        $classname: "TIKeyboardOutput",
        $classes: ["TIKeyboardOutput", "NSObject"],
      },
      "",
      {
        "NS.uuidbytes": sessionUuid,
        $class: uid(6),
      },
      {
        $classname: "NSUUID",
        $classes: ["NSUUID", "NSObject"],
      },
      {
        $classname: "RTITextOperations",
        $classes: ["RTITextOperations", "NSObject"],
      },
    ],
  });
}

/**
 * Prepare an NSKeyedArchiver encoded payload for RTI text input.
 */
export function getRtiInputTextPayload(
  sessionUuid: Buffer,
  text: string,
): Buffer {
  return bplistCreator({
    $version: 100000,
    $archiver: "RTIKeyedArchiver",
    $top: {
      textOperations: uid(1),
    },
    $objects: [
      "$null",
      {
        keyboardOutput: uid(2),
        $class: uid(7),
        targetSessionUUID: uid(5),
      },
      {
        insertionText: uid(3),
        $class: uid(4),
      },
      text,
      {
        $classname: "TIKeyboardOutput",
        $classes: ["TIKeyboardOutput", "NSObject"],
      },
      {
        "NS.uuidbytes": sessionUuid,
        $class: uid(6),
      },
      {
        $classname: "NSUUID",
        $classes: ["NSUUID", "NSObject"],
      },
      {
        $classname: "RTITextOperations",
        $classes: ["RTITextOperations", "NSObject"],
      },
    ],
  });
}
