import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';
import { maybePullPostsFromRedditWorldNews } from './datasources/Reddit';

async function main() {
  console.log("Kicking off jobs...");
  await kickOffJobs();
}
main();

async function kickOffJobs() {
  await maybeKickOffCongressFeed();
  await maybePullPostsFromRedditWorldNews();
}

const cronEveryMidnight = '0 0 * * *'; // Run once every day at midnight
const MainJob = new CronJob(cronEveryMidnight, main); // change to scheduleExpressionMinute for testing
MainJob.start();
