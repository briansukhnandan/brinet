import moment from "moment-timezone";

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

export function truncateText(text: string, length = 250) {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 3)}...`;
}

export function baseFileName(pathToFile: string) {
  const split = pathToFile.split("/");
  if (!split.length) {
    throw new Error("Could not split by / character.");
  }
  return split.at(-1) as string;
}

export function getFileExtension(fileName: string): string {
  const split = fileName.split(".");
  if (!split.length) {
    throw new Error("Could not split by period!");
  }
  return split.at(-1) as string;
}
export function getMimeTypeFromFileExt(ext: string) {
  const mimeType = {
    "txt": "text/html",
    "pdf": "application/pdf",
  }[ext];
  if (!mimeType) {
    throw new Error(`Could not fetch mimetype for extension ${ext}!`);
  }
  return mimeType;
}

export const getCurrentDate = () =>
  moment().tz("America/New_York").format("YYYY-MM-DD");

export const IS_DEV = () => {
  return fetchSecret("ENVIRONMENT") === "dev";
}

const IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif"];
export const doesFileHaveImageExtension = (fileName: string) =>
  IMAGE_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));
