import moment from "moment-timezone";
import fs from "fs";
import { DataSourceContext, DataSourceContextToLabel } from "./Constants";
import { fetchSecret } from "./Util";

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

/** 
 * Logger works by taking in a path, and checking to see if the
 * latest log file exceeds a certain size. If so, creates a new
 * log file and uses that for all subsequent logs.
 */
const contextToSecret = {
  [DataSourceContext.CONGRESS]: "CONGRESS_API_LOG_PATH",
  [DataSourceContext.WORLDNEWS]: "REDDIT_WORLDNEWS_LOG_PATH",
};
const contextToLogFileBaseNameWithPath = {
  [DataSourceContext.CONGRESS]: "CONGRESS_BLUESKY_LOG.txt",
  [DataSourceContext.WORLDNEWS]: "REDDIT_WORLDNEWS_LOG.txt",
};

const formatMsgForLogging = (msg: string, context: DataSourceContext)  =>
  `[${moment().format("YYYY-MM-DD HH:mm:ss")}][${DataSourceContextToLabel[context]}] ${msg}`;

export class Logger {
  private writePath: string;
  private context: DataSourceContext;
  constructor(context: DataSourceContext) {
    // Strip trailing slash from secret if it exists
    const writePathSecret = fetchSecret(contextToSecret[context]);
    this.writePath = writePathSecret.at(-1) === "/"
      ? writePathSecret.slice(0, writePathSecret.length - 1)
      : writePathSecret;
    this.context = context;
  }

  log(msg: string) {
    const baseFileName = contextToLogFileBaseNameWithPath[this.context];
    const logPath = `${this.writePath}/${baseFileName}`;
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, "");
    }
    const msgToLog = formatMsgForLogging(msg, this.context);
    fs.appendFileSync(logPath, msgToLog+"\n");
    console.log(msgToLog);
  }
}
