import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';
import { maybePullPostsFromRedditWorldNews } from './datasources/Reddit';
import { wasDbInitialized, withDbc } from './db/Dbc';
import { Logger } from './Logger';
import { Context } from './Constants';

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
}

const cronEveryMidnight = '0 0 * * *'; // Every day at midnight
const BlueskyJob = new CronJob(cronEveryMidnight, kickOffBlueskyJobs);
BlueskyJob.start();
