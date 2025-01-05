import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';
import { maybePullPostsFromRedditWorldNews } from './datasources/Reddit';
import { wasDbInitialized, withDbc } from './db/Dbc';

async function main() {
  if (!wasDbInitialized) {
    throw new Error(
      "DB was not initialized! Please run `db/bootstrap_db.sh`"
    );
  }

  console.log("Kicking off jobs...");
  await kickOffJobs();
}
main();

async function kickOffJobs() {
  await withDbc(async(dbc) => {
    await maybeKickOffCongressFeed(dbc);
    await maybePullPostsFromRedditWorldNews(dbc);
  });
}

const cronEveryMidnight = '0 0 * * *'; // Run once every day at midnight
const MainJob = new CronJob(cronEveryMidnight, main); // change to scheduleExpressionMinute for testing
MainJob.start();
