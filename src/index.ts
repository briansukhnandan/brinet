import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';
import { maybePullPostsFromRedditWorldNews } from './datasources/Reddit';
import { wasDbInitialized, withDbc } from './db/Dbc';
import { Logger } from './Logger';
import {
  Context,
  contextToLogPath,
  cronEvery1AM,
  cronEvery11PM
} from './Constants';
import { Emailer } from './Emailer';
import { getCurrentDate } from './Util';

const systemLogger = new Logger(Context.SYSTEM);

async function kickOffBlueskyJobs() {
  if (!wasDbInitialized) {
    throw new Error(
      "DB was not initialized. Please run `db/bootstrap_db.sh`!"
    );
  }

  systemLogger.log("Kicking off jobs...");
  await withDbc(async(dbc) => {
    systemLogger.log("Starting Congress Feed!");
    await maybeKickOffCongressFeed(dbc);
    systemLogger.log("Finished Congress Feed!");

    systemLogger.log("Starting Reddit Worldnews Feed!");
    await maybePullPostsFromRedditWorldNews(dbc);
    systemLogger.log("Ending Reddit Worldnews Feed!");
  });
  systemLogger.log("Finished Bluesky jobs...");
}

async function kickOffEmailJob() {
  const emailer = new Emailer();
  emailer.sendEmail(
    `Log files for ${getCurrentDate()}`,
    "Please see the attached files:",
    Object.values(contextToLogPath),
  );
  systemLogger.log(`Sent email for ${getCurrentDate()}`);
}

const BlueskyJob = new CronJob(
  cronEvery11PM, 
  kickOffBlueskyJobs, 
  null, 
  false, 
  "America/New_York"
);
const EmailJob = new CronJob(
  cronEvery1AM, 
  kickOffEmailJob, 
  null, 
  false, 
  "America/New_York"
);

BlueskyJob.start();
EmailJob.start();
