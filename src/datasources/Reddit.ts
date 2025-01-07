import { 
  doesFileHaveImageExtension,
  fetchSecret, 
  IS_DEV, 
  prepareObjForRequest, 
  truncateText 
} from 'src/Util';
import { postToBluesky } from 'src/Bluesky';
import { Context, RedditWorldnewsPostsRow } from 'src/Constants';
import moment from 'moment-timezone';
import { Logger } from 'src/Logger';
import { Dbc } from 'src/db/Dbc';

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_BASE_URL = 'https://www.reddit.com/api/v1/access_token'
const API_BASE_URL = 'https://oauth.reddit.com';
const worldNewsLogger = new Logger(Context.WORLDNEWS);

class RedditFetcher {
  private accessToken: string;
  private secret: {
    id: string;
    secret: string;
    username: string;
    password: string;
  };

  constructor() {
    this.secret = {
      id: fetchSecret("REDDIT_APP_ID"),
      secret: fetchSecret("REDDIT_APP_SECRET"),
      username: fetchSecret("REDDIT_USERNAME"),
      password: fetchSecret("REDDIT_PASSWORD")
    };
  }

  public getSecret() {
    return this.secret;
  }
  public getAccessToken() {
    return this.accessToken;
  }
  private setAccessToken(token: string) {
    this.accessToken = token;
  }

  public async initAccessToken() {
    const redditSecret = this.getSecret();
    const params = {
      grant_type: 'password',
      username: redditSecret.username,
      password: redditSecret.password,
    };
    const paramsQs = new URLSearchParams(params);
    const accessTokenUrl = `${TOKEN_BASE_URL}?${paramsQs}`;
    const res = await fetch(accessTokenUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(
          `${redditSecret.id}:${redditSecret.secret}`
        ).toString('base64')}`
      },
    });
    const tokenInfo = await res.json();
    if (!tokenInfo.access_token) {
      throw new Error("Unable to fetch access token!");
    }
    this.setAccessToken(tokenInfo.access_token);
  }

  private async makeRequest(url: string, params: Record<string, string>) {
    const paramsQs = new URLSearchParams(params);
    const urlToFetch = `${API_BASE_URL}${url}?${paramsQs}`;

    const res = await fetch(urlToFetch, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.getAccessToken()}`
      },
    });
    return await res.json();
  }

  public async pullPostsFromRedditWorldNews() {
    const listing = await this.makeRequest(`/r/worldnews/top`, 
      prepareObjForRequest({
        t: "day", 
        limit: IS_DEV() ? 3 : 10
      })
    );
    const posts: RedditPost[] = listing.data.children.map((
      child: { data: RedditPost }) => child.data
    );
    return posts;
  }
}

const fetchBlobFromRedditLink = async(link: string): Promise<Blob> => {
  const res = await fetch(link, {
    method: "GET"
  });
  return await res.blob();
}

const postRedditPostToBluesky = async(redditPost: RedditPost) => {
  let rootPostText = "";
  rootPostText += `Posted on ${
    moment(redditPost.created_utc * 1000).tz("America/New_York").format("lll")
  }\n\n${truncateText(redditPost.title, 150)}`.slice(0, 275);

  let thumbnailBlob: Blob | undefined; 
  if (
    redditPost.thumbnail && 
    doesFileHaveImageExtension(redditPost.thumbnail)
  ) {
    thumbnailBlob = await fetchBlobFromRedditLink(redditPost.thumbnail);
  }

  try {
    const rootPost = await postToBluesky(
      { 
        text: rootPostText, 
        image: thumbnailBlob,
      },
      Context.WORLDNEWS
    );

    await postToBluesky(
      {
        text: "Link to post:",
        link: `https://reddit.com${redditPost.permalink}`,
        reply: {
          root: rootPost,
          parent: rootPost,
        },
      },
      Context.WORLDNEWS
    );
  } catch(e) {
    if (e?.message) {
      worldNewsLogger.log(e.message);
    }
  }
}

const insertRedditPostToDb = (dbc: Dbc, redditPost: RedditPost) => {
  const postToInsert: RedditWorldnewsPostsRow = {
    permalink: redditPost.permalink,
    redditPostId: redditPost.id,
    blueskyPostTime: moment().tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")
  };
  const q = `
    INSERT INTO reddit_worldnews_posts (
      reddit_post_id, 
      permalink, 
      bluesky_post_time
    ) VALUES (?, ?, ?)
  `;
  dbc.run(
    q,
    postToInsert.redditPostId,
    postToInsert.permalink,
    postToInsert.blueskyPostTime
  );
}

export const maybePullPostsFromRedditWorldNews = async(dbc: Dbc) => {
  /**
   * Unlike CongressSecretFetcher, RedditFetcher needs to be
   * destroyed and recreated whenever this function is called
   * bc the access token can expire. So we need to make sure it's
   * refetched as soon as it's needed again.
   */
  const redditFetcher = new RedditFetcher();
  await redditFetcher.initAccessToken();

  const posts = await redditFetcher.pullPostsFromRedditWorldNews();
  for (const redditPost of posts) {
    setTimeout(async() => {
      await postRedditPostToBluesky(redditPost);
      insertRedditPostToDb(dbc, redditPost);
      worldNewsLogger.log(
        `Posted the following thread with ID ${redditPost.id}: ${redditPost.title.slice(0, 200)}`
      );
    }, 5_000);
  }
}

type RedditPost = {
  id: string;
  title: string;
  url: string;
  permalink: string;
  created_utc: number; // unix timestamp
  thumbnail: string;
  preview: {
    images: {
      source: {
        url: string;
      }
    }[];
  };
}
