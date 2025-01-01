export enum DataSourceContext {
  CONGRESS,
  WORLDNEWS,
  USNEWS,
};

export const DataSourceContextToLabel = {
  [DataSourceContext.CONGRESS]: "CONGRESS",
  [DataSourceContext.WORLDNEWS]: "WORLDNEWS",
  [DataSourceContext.USNEWS]: "USNEWS",
};
