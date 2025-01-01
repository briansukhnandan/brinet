import moment from "moment-timezone";
import {
  fetchSecret,
  handlePromiseAllSettled,
  prepareObjForRequest
} from "../util";

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
import { postToBluesky } from "../Bluesky";
import { DataSourceContext } from "../constants";
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
  billUrl: string
): Promise<CongressBillDetailed> => {
  if (!billUrl) {
    throw new Error("Could not find URL!");
  }
  const billDetailsRaw = await _fetchFromUrlGivenFromBillResponse(billUrl);
  return billDetailsRaw.bill;
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
  const billNumberToSummary = {};
  billSummaries.forEach(summary => {
    billNumberToSummary[summary.bill.number] = summary;
  });

  const billInfoCongregated: CongressBillFieldsOfInterest[] = [];
  for (const billInfo of billInfos) {
    const summary = billNumberToSummary[billInfo.number];
    billInfoCongregated.push({
      summary,
      sponsors: billInfo.sponsors,
      congress: billInfo.congress,
      policyArea: billInfo.policyArea.name,
      title: billInfo.title,
      updateDate: billInfo.updateDate,
      introducedDate: billInfo.introducedDate,
    });
  }
  return billInfoCongregated;
}

const postBillToBluesky = async(bill: CongressBillFieldsOfInterest) => {
  let parentPostText = "";
  const paddedTitle = bill.title.length < 175 
    ? bill.title 
    : `${bill.title.slice(0, 175)}...`;
  parentPostText += paddedTitle+"\n\n";
  parentPostText += "First Introduced: "+bill.introducedDate+"\n";
  parentPostText += "Last Updated: "+bill.updateDate+"\n";

  const rootPost = await postToBluesky(
    { text: parentPostText },
    DataSourceContext.CONGRESS
  );

  const summaryText = bill.summary.text;
  const summaryReplyText = summaryText.length > 300 
    ? `${summaryText.slice(0, 298)}...`
    : summaryText;

  const summaryReplyPost = await postToBluesky(
    { 
      text: summaryReplyText, 
      reply: {
        root: rootPost,
        parent: rootPost,
      }
    },
    DataSourceContext.CONGRESS
  );

  let sponsorsReplyText = "Sponsors of this Bill:\n";
  for (const sponsor of bill.sponsors) {
    if (sponsorsReplyText.length < 250) {
      sponsorsReplyText += `${sponsor.fullName}\n`;
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
    DataSourceContext.CONGRESS
  );
}

export const maybeKickOffCongressFeed = async() => {
  const bills = await getBillsOp({
    limit: 20,
    sort: "updateDate+desc",
  });
  const todaysDate = moment()
    .tz("America/New_York")
    .format("YYYY-MM-DD");
  const billsActionedToday = bills.filter(
    bill => bill.updateDate === todaysDate
  );
  if (!billsActionedToday.length) return;

  const billInfoProms: Promise<CongressBillDetailed>[] = 
    billsActionedToday.map((b) => getDetailsAboutSpecificBill(b.url));
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
    setTimeout(async() => await postBillToBluesky(billToPost), 5_000);
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
  congress: number;
  policyArea: string;
  introducedDate: string;
  updateDate: string;
  summary: CongressBillSummary;
  sponsors: CongressBillDetailed["sponsors"];
};
