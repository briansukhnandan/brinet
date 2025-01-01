import { fetchSecret } from 'src/Util';

// These need to be loaded in every module that fetches 
// a secret at runtime.
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_BASE_URL = 'https://www.reddit.com/api/v1/access_token'
const API_BASE_URL = 'https://oauth.reddit.com';
const REQUEST_TIMEOUT = 30 * 1000;

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
    const listing = await this.makeRequest(`/r/worldnews/top`, {
      t: "day", 
      count: "25"
    });
    const posts: RedditPost[] = listing.data.children.map((
      child: { data: RedditPost }) => child.data
    );
    return posts;
  }
}

export const maybePullPostsFromRedditWorldNews = async() => {
  /** 
   * Unlike CongressSecretFetcher, RedditFetcher needs to be
   * destroyed and recreated whenever this function is called
   * bc the access token can expire. So we need to make sure it's
   * refetched as soon as it's needed again.
   */
  const redditFetcher = new RedditFetcher();
  await redditFetcher.initAccessToken();

  const posts = await redditFetcher.pullPostsFromRedditWorldNews();
}

type RedditPost = {
  title: string;
  url: string;
  permalink: string;
  created_utc: number; // unix timestamp
  thumbnail: string;
}
