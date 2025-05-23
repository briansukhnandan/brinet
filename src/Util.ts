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

export function chunkText(text: string, length = 275, includePrefix = false) {
  let list: string[] = [];
  const total = parseInt(((text.length / length) + 1).toString());
  let textCtr = 0;
  while (text.length) {
    const prefix = includePrefix && total > 1
      // Space at the end is intentional
      ? `[${textCtr + 1}/${total}] `
      : "";
    list.push(prefix + text.slice(0, length));
    text = text.slice(length);
    textCtr += 1;
  }
  return list;
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
export const getCurrentTime = () =>
  moment().tz("America/New_York").format("YYYY-MM-DD HH:mm:ss");

export const IS_DEV = () => {
  return fetchSecret("ENVIRONMENT") === "dev";
}

const IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif"];
export const doesFileHaveImageExtension = (fileName: string) =>
  IMAGE_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));

/** 
 * Please note, this list is not exhaustive. This is
 * just the set of HTML tags that appear in Congress
 * API summaries; which are directly fetched from their website.
 */
const COMMON_HTML_TAGS = [
  "p",
  "strong",
  "a", 
  "h1",
  "h2",
  "h3",
  "em",
  "li",
  "ul",
];
export const removeHtmlTagsFromText = (text: string): string => {
  let textToReturn = text.slice();
  for (const tag of COMMON_HTML_TAGS) {
    const openingTag = `<${tag}>`;
    const closingTag = `</${tag}>`;
    textToReturn = textToReturn
      .replaceAll(openingTag, " ")
      .replaceAll(closingTag, " ")
  }

  // Why does .replaceAll() not work with a regex input?
  // don't care enough to debug this, this while loop will do.
  while(/\s{2,}/.test(textToReturn)) {
    textToReturn = textToReturn.replace(/\s{2,}/, " ")
  }
  return textToReturn.trim();
}
