import { Dbc } from "src/db/Dbc";
import puppeteer from "puppeteer";
import { parse } from "node-html-parser";
import moment from "moment-timezone";
import {
  IS_DEV,
  fetchSecret,
  getCurrentDate,
  getCurrentTime,
  handlePromiseAllSettled,
  numWithOrdinalSuffix,
  prepareObjForRequest,
  removeHtmlTagsFromText,
  truncateText
} from "../Util";
import { BlueskyClient } from "../Bluesky";
import {
  CongressBillActionsRow,
  Context,
  Nullable
} from "../Constants";
import { Logger } from "src/Logger";

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

class CongressSecretFetcher {
  private secret: string;
  constructor() {
    this.secret = fetchSecret("CONGRESS_API_KEY");
  }
  public getSecret() {
    return this.secret;
  }
}

const secretFetcher = new CongressSecretFetcher();
const congressLogger = new Logger(Context.CONGRESS);

const BASE_URL = "https://api.congress.gov/v3";
const urlForRequest = (
  endpoint: string, 
  queryParams: Record<string, string> = {},
  baseEndpointOverride?: string,
) => {
  const baseUrl = `${baseEndpointOverride ?? BASE_URL}/${endpoint}`;
  const params = {
    api_key: secretFetcher.getSecret(),
    ...queryParams
  };
  const paramsQs = new URLSearchParams(params);
  return `${baseUrl}?${paramsQs}`;
}
const _fetchFromUrlGivenFromBillResponse = async(urlFromBill: string) => {
  const baseUrlOverride = urlFromBill.split("?")[0];
  const url = urlForRequest(
    "", 
    { format: "json" }, 
    baseUrlOverride
  );

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
    }
  });
  return await res.json();
}

const getBillsOp = async(opts: Partial<{
  congress: number;
  fromDateTime: string; // YYYY-MM-DDTHH:mm:ssZ
  toDateTime: string; // YYYY-MM-DDTHH:mm:ssZ
  limit: number;
  sort: "updateDate+asc" | "updateDate+desc"
}> = {}) => {
  const optsForReq = prepareObjForRequest(opts);
  const url = urlForRequest("bill", {
    format: "json", 
    ...optsForReq,
  });
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
    }
  });
  const billsDataRaw = await res.json();
  return billsDataRaw.bills as CongressBillBasic[];
}

const getDetailsAboutSpecificBill = async(
  bill: CongressBillBasic
): Promise<CongressBillDetailed> => {
  if (!bill.url) {
    throw new Error("Could not find URL!");
  }
  const billDetailsRaw = await _fetchFromUrlGivenFromBillResponse(bill.url);

  // Some details about the bill aren't given on
  // the Detailed object.
  return {
    ...billDetailsRaw.bill,
    originChamber: bill.originChamber,
  }
}

/** 
 * Launches a puppeteer instance with a valid
 * User agent to bypass congress.gov cloudflare
 * restrictions.
 */
const scrapeSummaryForBillFromCongressDotGov = async(
  bill: CongressBillDetailed
): Promise<CongressBillSummary> => {
  const url = getBillUrlForViewer(bill);
  const chromeUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

  let html: string = "";
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(chromeUserAgent);
    await page.goto(url);
    html = await page.content();

    if (/Verifying you are human. This may take a few seconds/i.test(html)) {
      throw new Error("Scraper hit with CloudFlare!");
    }
  } catch(e) {
    congressLogger.log(`Failed to scrape summary from link: ${url}: ${e?.message}`);
  } finally {
    await browser.close();
    congressLogger.log(`Terminated Puppeteer session!`);
  }

  const billSummaryDiv = parse(html)
    .querySelectorAll("div")
    .find((div) => (
      div.getAttribute("id") === "bill-summary" && 
      div.getAttribute("class") === "main-wrapper"
    ));

  let summaryToReturn: CongressBillSummary = { 
    text: "",
    bill,
    currentChamber: "House"
  };
  if (!billSummaryDiv) {
    return summaryToReturn;
  }

  const currentVersionElem = billSummaryDiv
    .querySelectorAll("span")
    .find((span) => span.innerText?.match(/Introduced in/));
  if (currentVersionElem) {
    const chamber = currentVersionElem
      .innerText
      .match(/Introduced in ([a-zA-Z]+) \(\d/)?.[1];
    if (chamber && ["House", "Senate"].includes(chamber)) {
      summaryToReturn.currentChamber = chamber as CongressBillDetailed["originChamber"];
    }
  }

  const allParagraphs = billSummaryDiv
    .querySelectorAll("p");

  const idxOfParaWithStrongElem = allParagraphs.findIndex(
    (para) => !!para.querySelectorAll("strong").length
  );

  const relevantParagraphs = idxOfParaWithStrongElem > -1
    ? allParagraphs.slice(idxOfParaWithStrongElem)
    : allParagraphs;

  summaryToReturn.text = relevantParagraphs
    .map((para) => para.innerText)
    .join(" ");

  return summaryToReturn;
}

const getSummaryContentForBill = async(
  bill: CongressBillDetailed
): Promise<CongressBillSummary> => {
  const billCongressNumber = bill.congress;
  const billNumber = bill.number;

  /** 
   * This is not always guaranteed. If it's not there
   * we attempt to scrape a summary from congress.gov.
   */
  const billSummaryUrl = bill.summaries?.url;
  let summaryToUse: Nullable<CongressBillSummary> = null;
  if (!billSummaryUrl) {
    if (!IS_DEV()) {
      throw new Error("Puppeteer scraping is not available in PROD. Yet..");
    }
    summaryToUse = await scrapeSummaryForBillFromCongressDotGov(bill);
  } else {
    const summaryDetailsRaw = await _fetchFromUrlGivenFromBillResponse(billSummaryUrl);
    const summaries: CongressBillSummary[] = summaryDetailsRaw.summaries;

    const updateDates = summaries.map(s => s.lastSummaryUpdateDate);
    const latestUpdateDate = updateDates.reduce((latestDate, currDate) => {
      return moment(latestDate).isBefore(moment(currDate)) ? currDate : latestDate
    }, updateDates[0]);

    const latestSummary = summaries.find(
      s => s.lastSummaryUpdateDate === latestUpdateDate
    );
    if (latestSummary) {
      summaryToUse = latestSummary;
    }
  }

  if (!summaryToUse?.text) {
    throw new Error(`Could not fetch latest summary for bill ${bill.number}`);
  }

  /** 
   * If we're pulling from the Congress API, they literally
   * just return the raw HTML from the congress.gov equivalent,
   * a.k.a what we pull from puppeteer above...
   */
  summaryToUse.text = removeHtmlTagsFromText(summaryToUse.text);
  return {
    ...summaryToUse,
    bill: {
      number: billNumber,
      congress: billCongressNumber,
    }
  };
}

const mapBillInfoToSummaries = (
  billInfos: CongressBillDetailed[], 
  billSummaries: CongressBillSummary[]
) => {
  const billNumberToSummary: Record<string, CongressBillSummary> = {};
  billSummaries.forEach(summary => {
    billNumberToSummary[summary.bill.number] = summary;
  });

  const billInfoCongregated: CongressBillFieldsOfInterest[] = [];
  for (const billInfo of billInfos) {
    const summary = billNumberToSummary[billInfo.number];
    if (!summary) continue;

    billInfoCongregated.push({
      summaryText: summary.text,
      sponsors: billInfo.sponsors,
      congress: billInfo.congress,
      policyArea: billInfo.policyArea?.name ?? "Not Available",
      title: billInfo.title,
      updateDate: billInfo.updateDate,
      introducedDate: billInfo.introducedDate,
      number: billInfo.number,
      originChamber: billInfo.originChamber,
    });
  }
  return billInfoCongregated;
}

const getBillUrlForViewer = (
  bill: Pick<
    CongressBillFieldsOfInterest, 
    "congress" | "originChamber" | "number"
  >
) =>
  `https://www.congress.gov/bill/${numWithOrdinalSuffix(bill.congress)}-congress/${bill.originChamber === "House" ? "house" : "senate"}-bill/${bill.number}`;

const insertBillInfoToDb = (dbc: Dbc, bill: CongressBillFieldsOfInterest) => {
  const billToInsert: CongressBillActionsRow = {
    billNumber: bill.number,
    congressNumber: bill.congress,
    billUpdateDate: bill.updateDate,
    blueskyPostTime: getCurrentTime(),
  };
  const q = `
    INSERT INTO congress_bill_actions (
      bill_number, 
      congress_number, 
      bill_update_date, 
      bluesky_post_time
    ) VALUES (?, ?, ?, ?)
  `;
  dbc.run(
    q,
    billToInsert.billNumber,
    billToInsert.congressNumber,
    billToInsert.billUpdateDate,
    billToInsert.blueskyPostTime
  );
}

const postBillToBluesky = async(
  bill: CongressBillFieldsOfInterest,
  agent: BlueskyClient
) => {
  try {
    const paddedTitle = truncateText(bill.title, 175); 
    let parentPostText = `${paddedTitle}\n\n`;
    parentPostText += `URL: ${getBillUrlForViewer(bill)}\n`;
    parentPostText +=
      "Updated: " +
      moment(bill.updateDate).format("YYYY-MM-DD")
      +"\n";
    parentPostText += 
      "Introduced: " +
      moment(bill.introducedDate).format("YYYY-MM-DD");
    const rootPost = await agent.postToBluesky({ text: parentPostText });

    const summaryText = bill.summaryText;
    const summaryReplyText = truncateText(summaryText, 300);
    const summaryReplyPost = await agent.postToBluesky(
      { 
        text: summaryReplyText, 
        reply: {
          root: rootPost,
          parent: rootPost,
        }
      },
    );

    let sponsorsReplyText = "Sponsors:\n";
    for (const sponsor of bill.sponsors) {
      if (sponsorsReplyText.length < 270) {
        sponsorsReplyText += `- ${sponsor.fullName}\n`;
      }
    }

    await agent.postToBluesky(
      {
        text: sponsorsReplyText,
        reply: {
          root: rootPost,
          parent: summaryReplyPost,
        }
      },
    );
  } catch(e) {
    if (e?.message) {
      congressLogger.log(
        `Ran into error posting bill: ${bill.number}: ${e.message}`
      );
    }
  }
}

export const maybeKickOffCongressFeed = async(dbc: Dbc, agent: BlueskyClient) => {
  const bills = await getBillsOp({
    limit: 20,
    sort: "updateDate+desc",
  });
  const billsActionedToday = bills.filter(
    bill => bill.updateDate === getCurrentDate()
  );
  if (!billsActionedToday.length) return;

  const billInfoProms: Promise<CongressBillDetailed>[] = 
    billsActionedToday.map(getDetailsAboutSpecificBill);
  const billInfos = await handlePromiseAllSettled(billInfoProms);
  if (!billInfos.length) return;

  const billSummariesProms = billInfos.map(getSummaryContentForBill);
  const billSummaries = await handlePromiseAllSettled(billSummariesProms);
  if (!billSummaries.length) return;

  const billsToPost = mapBillInfoToSummaries(billInfos, billSummaries);
  for (const billToPost of billsToPost) {
    setTimeout(async() => {
      await postBillToBluesky(billToPost, agent);
      insertBillInfoToDb(dbc, billToPost);
      congressLogger.log(
        `Posted the following bill: ${billToPost.title.slice(0, 200)}`
      );
    }, 5_000);
  }
}

/** Taken from the Congress API. */
type CongressBillBasic = {
  congress: number;
  number: string; // very misleading, but seems to be an identifier
  originChamber: "House" | "Senate";
  title: string;
  updateDate: string;
  url: string;
};
type CongressBillDetailed = {
  title: string;
  congress: number;
  number: string;
  originChamber: "House" | "Senate";
  policyArea: { name: string };
  introducedDate: string;
  updateDate: string;
  summaries: {
    count: number;
    url: string;
  };
  textVersions: {
    count: number;
    url: string;
  };
  // Represents a congressperson.
  sponsors: {
    district: number;
    firstName: string;
    lastName: string;
    fullName: string;
    party: string;
    state: string;
    url: string;
  }[];
};
type CongressBillSummary = {
  text: string;
  bill: Pick<CongressBillBasic, "congress" | "number">;
  currentChamber: "House" | "Senate";

  /** 
   * Summaries can either be scraped or fetched
   * from Congress.gov, the latter giving us the
   * below fields.
   */
  actionDate?: string;
  lastSummaryUpdateDate?: string;
  actionDesc?: string;
};

/** Our own conglomerated type */
type CongressBillFieldsOfInterest = {
  title: string;
  number: string;
  congress: number;
  policyArea: string;
  introducedDate: string;
  updateDate: string;
  sponsors: CongressBillDetailed["sponsors"];
  summaryText: string;
  originChamber: "House" | "Senate";
};
