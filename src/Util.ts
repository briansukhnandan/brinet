export const fetchSecret = (secretName: string): string => {
  const secret = process.env[secretName];
  if (!secret) {
    throw new Error(`Secret ${secretName} does not exist!`);
  }
  return secret;
}

export const prepareObjForRequest = (
  obj: Record<string, string | number | boolean>
): Record<string, string> => {
  const newObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") {
      newObj[k] = v.toString();
      continue;
    } else if (typeof v === "boolean") {
      newObj[k] = v ? "true" : "false";
    } else if (typeof v === "string") {
      newObj[k] = v;
    }
  }
  return newObj;
}

export const handlePromiseAllSettled = async <T>(
  promises: Promise<T>[],
  throwErrorOnRejected = false,
): Promise<T[]> => {
  if (!promises.length) return [];
  const results = await Promise.allSettled(promises);
  const fulfilledProms = results
    .filter(res => res.status === "fulfilled")
    .map(res => res.value);
  const rejectedProms = results
    .filter(res => res.status !== "fulfilled");
  if (throwErrorOnRejected && rejectedProms.length) {
    throw new Error("Some promises failed to resolve!");
  }
  return fulfilledProms;
}

// Taken from:
// https://stackoverflow.com/questions/13627308/add-st-nd-rd-and-th-ordinal-suffix-to-a-number
export function numWithOrdinalSuffix(i: number) {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) {
    return i + "st";
  }
  if (j === 2 && k !== 12) {
    return i + "nd";
  }
  if (j === 3 && k !== 13) {
    return i + "rd";
  }
  return i + "th";
}

export const IS_DEV = () => {
  return fetchSecret("ENVIRONMENT") === "dev";
}
