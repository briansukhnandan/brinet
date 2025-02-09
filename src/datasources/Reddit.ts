import { 
  doesFileHaveImageExtension,
  fetchSecret, 
  getCurrentTime, 
  IS_DEV, 
  prepareObjForRequest, 
  truncateText 
} from 'src/Util';
import { parse } from "node-html-parser";
import { BlueskyClient } from 'src/Bluesky';
import { Context, RedditWorldnewsPostsRow } from 'src/Constants';
import moment from 'moment-timezone';
import { Logger } from 'src/Logger';
import { Dbc } from 'src/db/Dbc';

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

const redditUrlLink = (permalink: string) => `https://reddit.com${permalink}`;
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

const fetchPostImageFromRedditPost = async(post: RedditPost): Promise<Blob | undefined> => {
  let res = await fetch(redditUrlLink(post.permalink), {
    method: "GET"
  });

  /** 
   * If an image on the post exists, it's contained within
   * an <img /> tag with the post-image id.
   */
  const html = await res.text();
  const postImage = parse(html)
    .querySelectorAll("img")
    .find((img) => img.getAttribute("id") === "post-image");
  const postImageSrc = postImage?.getAttribute("src");
  if (!postImageSrc) {
    worldNewsLogger.log(`Could not get post image for post ${post.id}.`);
    return;
  }

  res = await fetch(postImageSrc, {
    method: "GET"
  });

  const imgData = await res.arrayBuffer();
  if (imgData.byteLength > 104_857_600) {
    worldNewsLogger.log(
      `Encountered image with size ${imgData.byteLength} which exceeds 100MB. Skipping`
    );
    return;
  }

  const imgBuffer = Buffer.from(imgData);
  return new Blob([imgBuffer]);
}

const postRedditPostToBluesky = async(agent: BlueskyClient, redditPost: RedditPost) => {
  const redditPostDate = 
    moment(redditPost.created_utc * 1000).tz("America/New_York").format("YYYY-MM-DD");
  const rootPostText = `Posted on ${redditPostDate}\n\n${truncateText(redditPost.title, 270)}`;

  let imgBlob: Blob | undefined;
  try {
    imgBlob = await fetchPostImageFromRedditPost(redditPost);
    if (
      !imgBlob && 
      redditPost.thumbnail && 
      doesFileHaveImageExtension(redditPost.thumbnail)
    ) {
      imgBlob = await fetchBlobFromRedditLink(redditPost.thumbnail);
    }
  } catch(e) {
    worldNewsLogger.log(`Failed to get post/thumbnail images for post ${redditPost.id}`);
  }


  try {
    const rootPost = await agent.postToBluesky(
      { 
        text: rootPostText, 
        image: imgBlob,
      },
    );

    await agent.postToBluesky(
      {
        text: "Link to post:",
        link: redditUrlLink(redditPost.permalink),
        reply: {
          root: rootPost,
          parent: rootPost,
        },
      },
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
    blueskyPostTime: getCurrentTime(),
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

export const maybePullPostsFromRedditWorldNews = async(dbc: Dbc, agent: BlueskyClient) => {
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
    await postRedditPostToBluesky(agent, redditPost);
    insertRedditPostToDb(dbc, redditPost);
    worldNewsLogger.log(
      `Posted the following thread with ID ${redditPost.id}: ${redditPost.title.slice(0, 200)}`
    );
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
