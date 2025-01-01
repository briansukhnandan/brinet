import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';

async function main() {
  console.log("Kicking off jobs...");
  await kickOffJobs();
}
main();

async function kickOffJobs() {
  await maybeKickOffCongressFeed();
}

const cronEveryMinute = '* * * * *'; // Run once every minute
const cronEveryMidnight = '0 0 * * *'; // Run once every day at midnight

const MainJob = new CronJob(cronEveryMidnight, main); // change to scheduleExpressionMinute for testing
MainJob.start();
