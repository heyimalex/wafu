// This file is taken almost verbatim from fuse, but converted to typescript.
// In need of a full re-write, but in the interest of time and keeping
// edge-case compatibility I'm leaving it as is for now.

function internalDeepValue(obj: any, path: string | null, list: any[]): any {
  if (!path) {
    // If there's no path left, we've gotten to the object we care about.
    list.push(obj);
  } else {
    const dotIndex = path.indexOf(".");
    let firstSegment = path;
    let remaining = null;

    if (dotIndex !== -1) {
      firstSegment = path.slice(0, dotIndex);
      remaining = path.slice(dotIndex + 1);
    }

    const value = obj[firstSegment];

    if (value !== null && value !== undefined) {
      if (
        !remaining &&
        (typeof value === "string" || typeof value === "number")
      ) {
        list.push(value.toString());
      } else if (Array.isArray(value)) {
        // Search each item in the array.
        for (let i = 0, len = value.length; i < len; i += 1) {
          internalDeepValue(value[i], remaining, list);
        }
      } else if (remaining) {
        // An object. Recurse further.
        internalDeepValue(value, remaining, list);
      }
    }
  }
  return list;
}

export function deepValue(obj: any, path: string): any {
  return internalDeepValue(obj, path, []);
}
