export const cronEvery6PM = '0 18 * * *';
export const cronEvery6AM = '0 6 * * *';
export const cronEvery1AM = "0 1 * * *";

// For testing
export const cronEveryMinute = "* * * * *";
export const cronEveryTwoMinutes = "*/2 * * * *";

export enum Context {
  CONGRESS = "CONGRESS",
  WORLDNEWS = "WORLDNEWS",
  SYSTEM = "SYSTEM",
};
export type DataSourceContext = Context.CONGRESS | Context.WORLDNEWS;

export const GLOBAL_LOGS_DIRECTORY = "./src/logs"
export const contextToLogPath = {
  [Context.CONGRESS]: `${GLOBAL_LOGS_DIRECTORY}/CONGRESS_API_LOGS.txt`,
  [Context.WORLDNEWS]: `${GLOBAL_LOGS_DIRECTORY}/REDDIT_WORLDNEWS_LOGS.txt`,
  [Context.SYSTEM]: `${GLOBAL_LOGS_DIRECTORY}/SYSTEM_LOGS.txt`,
};

export const dataSourceContextToBlueskySecretKeys: Record<
  DataSourceContext, 
  {
    identifier: string,
    password: string,
  }
> = {
  [Context.CONGRESS]: {
    identifier: "CONGRESS_TRACKER_BLUESKY_USERNAME",
    password: "CONGRESS_TRACKER_BLUESKY_PASSWORD"
  },
  [Context.WORLDNEWS]: {
    identifier: "REDDIT_WORLDNEWS_BLUESKY_USERNAME",
    password: "REDDIT_WORLDNEWS_BLUESKY_PASSWORD"
  }
};

export type CongressBillActionsRow = {
  id?: number; // Auto-incrementing
  billNumber: string;
  congressNumber: number;
  billUpdateDate: string;
  blueskyPostTime: string;
};

export type RedditWorldnewsPostsRow = {
  id?: number;
  redditPostId: string;
  permalink: string;
  blueskyPostTime: string;
};

export type Nullable<T> = T | null;
export type MaybePromise<T> = T | Promise<T>;
