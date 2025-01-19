import { CronJob } from 'cron';
import { maybeKickOffCongressFeed } from './datasources/Congress';
import { maybePullPostsFromRedditWorldNews } from './datasources/Reddit';
import { wasDbInitialized, withDbc } from './db/Dbc';
import { Logger } from './Logger';
import {
  Context,
  contextToLogPath,
  cronEvery1AM,
  cronEvery6AM,
  cronEvery6PM,
  DataSourceContext,
  MaybePromise
} from './Constants';
import { Emailer } from './Emailer';
import { getCurrentDate } from './Util';
import { BlueskyClient } from './Bluesky';

const systemLogger = new Logger(Context.SYSTEM);
const agentsByContext: Record<DataSourceContext, BlueskyClient> = {
  [Context.WORLDNEWS]: new BlueskyClient(Context.WORLDNEWS),
  [Context.CONGRESS]: new BlueskyClient(Context.CONGRESS),
};

async function kickOffCongressBillFeed() {
  const agent = agentsByContext[Context.CONGRESS];
  await agent.prepareAgent();
  await withDbc(async(dbc) => {
    try {
      systemLogger.log("Starting Congress Feed!");
      await maybeKickOffCongressFeed(dbc, agent);
      systemLogger.log("Finished Congress Feed!");
    } catch(e) {
      systemLogger.log(`Ran into error posting Congress feed!`);
      console.error(e);
    }
  });
}
async function kickOffRedditWorldnewsFeed() {
  const agent = agentsByContext[Context.WORLDNEWS];
  await agent.prepareAgent();
  await withDbc(async(dbc) => {
    try {
      systemLogger.log("Starting Reddit Worldnews Feed!");
      await maybePullPostsFromRedditWorldNews(dbc, agent);
      systemLogger.log("Ending Reddit Worldnews Feed!");
    } catch(e) {
      systemLogger.log(`Ran into error posting Reddit r/worldnews feed!`);
      console.error(e);
    }
  });
}
function kickOffEmailJob() {
  const emailer = new Emailer();
  emailer.sendEmail(
    `Log files for ${getCurrentDate()}`,
    "Please see the attached files:",
    Object.values(contextToLogPath),
  );
  systemLogger.log(`Sent email for ${getCurrentDate()}`);
}

const createCronJob = (
  fn: () => MaybePromise<void>,
  cron: string
): CronJob => {
  return new CronJob(
    cron, 
    fn, 
    null, 
    false, 
    "America/New_York"
  );
}

async function root() {
  if (!wasDbInitialized) {
    throw new Error(
      "DB was not initialized. Please run `db/bootstrap_db.sh`!"
    );
  }
  
  const jobs = [
    {
      fn: kickOffCongressBillFeed,
      cron: cronEvery6PM,
      tag: "congress-job",
    },
    {
      fn: kickOffRedditWorldnewsFeed,
      cron: cronEvery6AM,
      tag: "worldnews-job",
    },
    {
      fn: kickOffEmailJob,
      cron: cronEvery1AM,
      tag: "email-job",
    },
  ].map(
    ({ fn, cron, tag }) => ({
      job: createCronJob(fn, cron),
      tag,
    })
  );

  for (const { job, tag } of jobs) {
    systemLogger.log(`Started job with tag: ${tag}`);
    job.start();
  }
}
root();
