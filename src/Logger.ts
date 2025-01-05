import moment from "moment-timezone";
import fs from "fs";
import {
  contextToLogPath,
  Context,
} from "./Constants";

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

const formatMsgForLogging = (msg: string, context: Context)  =>
  `[${moment().format("YYYY-MM-DD HH:mm:ss")}][${context}] ${msg}`;

export class Logger {
  private writePath: string;
  private context: Context;
  constructor(context: Context) {
    // Strip trailing slash from secret if it exists
    const writePathSecret = contextToLogPath[context];
    this.writePath = writePathSecret.at(-1) === "/"
      ? writePathSecret.slice(0, -1)
      : writePathSecret;
    this.context = context;

    const allLogPaths = Object.values(contextToLogPath);
    const nonExistentPaths = allLogPaths.filter(path => !fs.existsSync(path));
    for (const path of nonExistentPaths) {
      fs.writeFileSync(path, "");
      console.log(
        formatMsgForLogging(`Created the log file ${path}!`, Context.SYSTEM)
      );
    }
  }

  log(msg: string) {
    const msgToLog = formatMsgForLogging(msg, this.context);
    fs.appendFileSync(this.writePath, msgToLog+"\n");
    console.log(msgToLog);
  }
}
