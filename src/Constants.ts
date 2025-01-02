export enum DataSourceContext {
  CONGRESS,
  WORLDNEWS,
};

export const DataSourceContextToLabel = {
  [DataSourceContext.CONGRESS]: "CONGRESS",
  [DataSourceContext.WORLDNEWS]: "WORLDNEWS",
};

export const contextToSecret = {
  [DataSourceContext.CONGRESS]: "CONGRESS_API_LOG_PATH",
  [DataSourceContext.WORLDNEWS]: "REDDIT_WORLDNEWS_LOG_PATH",
};

export const contextToLogFileBaseNameWithPath = {
  [DataSourceContext.CONGRESS]: "CONGRESS_BLUESKY_LOG.txt",
  [DataSourceContext.WORLDNEWS]: "REDDIT_WORLDNEWS_LOG.txt",
};

export const contextToBlueskySecretKeys: Record<
  DataSourceContext, 
  {
    identifier: string,
    password: string,
  }
> = {
  [DataSourceContext.CONGRESS]: {
    identifier: "CONGRESS_TRACKER_BLUESKY_USERNAME",
    password: "CONGRESS_TRACKER_BLUESKY_PASSWORD"
  },
  [DataSourceContext.WORLDNEWS]: {
    identifier: "REDDIT_WORLDNEWS_BLUESKY_USERNAME",
    password: "REDDIT_WORLDNEWS_BLUESKY_PASSWORD"
  }
};
