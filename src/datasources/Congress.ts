import { Dbc } from "src/db/Dbc";
import moment from "moment-timezone";
import {
  fetchSecret,
  getCurrentDate,
  handlePromiseAllSettled,
  numWithOrdinalSuffix,
  prepareObjForRequest,
  truncateText
} from "../Util";
import { postToBluesky } from "../Bluesky";
import {
  CongressBillActionsRow,
  Context
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

const getLatestSummaryForBill = async(
  {
    billSummaryUrl,
    billNumber,
    billCongressNumber,
  }: {
    billSummaryUrl: string,
    billNumber: string,
    billCongressNumber: number,
  }
): Promise<CongressBillSummary> => {
  if (!billSummaryUrl) {
    throw new Error("Could not find summary URL!");
  }
  const summaryDetailsRaw = await _fetchFromUrlGivenFromBillResponse(billSummaryUrl);
  const summaries: CongressBillSummary[] = summaryDetailsRaw.summaries;
  
  const updateDates = summaries.map(s => s.lastSummaryUpdateDate);
  const latestUpdateDate = updateDates.reduce((latestDate, currDate) => {
    return moment(latestDate).isBefore(moment(currDate)) ? currDate : latestDate
  }, updateDates[0]);

  const latestSummary = summaries.find(
    s => s.lastSummaryUpdateDate === latestUpdateDate
  );
  if (!latestSummary) {
    throw new Error("Could not find latest summary for bill!");
  }
  return {
    ...latestSummary,
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
      summary,
      sponsors: billInfo.sponsors,
      congress: billInfo.congress,
      policyArea: billInfo.policyArea.name,
      title: billInfo.title,
      updateDate: billInfo.updateDate,
      introducedDate: billInfo.introducedDate,
      number: billInfo.number,
      originChamber: billInfo.originChamber,
    });
  }
  return billInfoCongregated;
}

const getBillUrlForViewer = (bill: CongressBillFieldsOfInterest) =>
  `https://www.congress.gov/bill/${numWithOrdinalSuffix(bill.congress)}-congress/${bill.originChamber === "House" ? "house" : "senate"}-bill/${bill.number}`;

const insertBillInfoToDb = (dbc: Dbc, bill: CongressBillFieldsOfInterest) => {
  const billToInsert: CongressBillActionsRow = {
    billNumber: bill.number,
    congressNumber: bill.congress,
    billUpdateDate: bill.updateDate,
    blueskyPostTime: moment().tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")
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

const postBillToBluesky = async(bill: CongressBillFieldsOfInterest) => {
  let parentPostText = `Action on Bill: ${bill.number} - ${getBillUrlForViewer(bill)}\n\n`;
  const paddedTitle = truncateText(bill.title, 175); 
  parentPostText += paddedTitle+"\n\n";
  parentPostText += 
    "First Introduced: " +
    moment(bill.introducedDate).format("lll") +
    "\n";
  parentPostText +=
    "Last Updated: " +
    moment(bill.updateDate).format("lll")
    +"\n";

  const rootPost = await postToBluesky(
    { text: parentPostText },
    Context.CONGRESS
  );

  const summaryText = bill.summary.text;
  const summaryReplyText = truncateText(summaryText, 300);
  const summaryReplyPost = await postToBluesky(
    { 
      text: summaryReplyText, 
      reply: {
        root: rootPost,
        parent: rootPost,
      }
    },
    Context.CONGRESS
  );

  let sponsorsReplyText = "Sponsors of this Bill:\n";
  for (const sponsor of bill.sponsors) {
    if (sponsorsReplyText.length < 250) {
      sponsorsReplyText += `- ${sponsor.fullName}\n`;
    }
  }

  await postToBluesky(
    {
      text: sponsorsReplyText,
      reply: {
        root: rootPost,
        parent: summaryReplyPost,
      }
    },
    Context.CONGRESS
  );
}

export const maybeKickOffCongressFeed = async(dbc: Dbc) => {
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

  const billInfosWithSummaries = billInfos
    .filter(info => !!info.summaries)
  const billSummariesProms = billInfosWithSummaries.map((b) => 
    getLatestSummaryForBill({
      billCongressNumber: b.congress,
      billSummaryUrl: b.summaries.url,
      billNumber: b.number
    }
  ));
  const billSummaries = await handlePromiseAllSettled(billSummariesProms);
  if (!billSummaries.length) return;

  const billsToPost = mapBillInfoToSummaries(billInfos, billSummaries);
  for (const billToPost of billsToPost) {
    setTimeout(async() => {
      await postBillToBluesky(billToPost);
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
  actionDate: string;
  actionDesc: string;
  bill: Pick<CongressBillBasic, "congress" | "number">;
  currentChamber: "House" | "Senate";
  lastSummaryUpdateDate: string;
  text: string;
};

/** Our own conglomerated type */
type CongressBillFieldsOfInterest = {
  title: string;
  number: string;
  congress: number;
  policyArea: string;
  introducedDate: string;
  updateDate: string;
  summary: CongressBillSummary;
  sponsors: CongressBillDetailed["sponsors"];
  originChamber: "House" | "Senate";
};
