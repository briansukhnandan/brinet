import moment from "moment";
import {
  AtpAgent,
  AtpSessionData,
  RichText
} from '@atproto/api';
import {
  dataSourceContextToBlueskySecretKeys, 
  DataSourceContext,
  Context
} from './Constants';
import {
  fetchSecret,
  getCurrentTime,
  truncateText
} from './Util';
import { Record as BlueskyRecord } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import { Logger } from './Logger';

const SERVICE = "https://bsky.social";
const systemLogger = new Logger(Context.SYSTEM);

type SessionWrapper = {
  session: AtpSessionData;
  lastFetched: string; // timestamp
};

export class BlueskyClient {
  private agent: AtpAgent;
  private sessionData: SessionWrapper;
  private context: DataSourceContext;
  constructor(context: DataSourceContext) {
    this.context = context;
    this.agent = new AtpAgent({
      service: SERVICE,
      persistSession: (_evt, session) => {
        if (session) {
          this.setSessionData({
            session,
            lastFetched: getCurrentTime(),
          });
        }
      },
    });
  }

  private setSessionData(session: SessionWrapper) {
    this.sessionData = session;
  }
  private getSessionData() {
    return this.sessionData;
  }

  private fetchBlueskyCredsFromContext(
    context: DataSourceContext
  ): {
    identifier: string;
    password: string;
  } {
    if (!dataSourceContextToBlueskySecretKeys[context]) {
      throw new Error("Did not find secret pair for given context!");
    }

    const {
      identifier: identifierSecret, 
      password: passwordSecret
    } = dataSourceContextToBlueskySecretKeys[context];

    return {
      identifier: fetchSecret(identifierSecret),
      password: fetchSecret(passwordSecret),
    };
  }

  public async prepareAgent() {
    const currSessionData = this.getSessionData();
    const sessionIsStale = (sw: SessionWrapper) =>
      /** 
       * We explicitly check to see if we re-init'd the session
       * within the last day bc we want them to refresh every 24 hours.
       * However if we set the below to 24, then it won't hit so we need
       * a slight buffer.
       */
      sw && moment(sw.lastFetched).isBefore(moment().subtract(23, "hour"));

    const isStale = sessionIsStale(currSessionData);
    if (!currSessionData || isStale) {
      if (isStale) {
        systemLogger.log("Detected stale session, reinitializing!");
      }
      const { identifier, password } = 
        this.fetchBlueskyCredsFromContext(this.context);
      await this.agent.login({ identifier, password });
      systemLogger.log(`Successfully initialized new session for context ${this.context}!`);
    } else {
      // This will call the `persistSession()` fn and update the fetch time.
      await this.agent.resumeSession(currSessionData.session);
      systemLogger.log(`Resumed session from ${currSessionData.lastFetched}!`);
    }
  }

  /** 
   * Very simple wrapper around posting to Bluesky.
   * Does not do any sort of internal validation to
   * determine whether or not the post has a valid length,
   * content, etc.
   *
   * All error handling is left up to the caller!
   */
  public postToBluesky = async(
    post: {
      text: string,
      link?: string,
      image?: Blob,
      createdAt?: string; // YYYY-MM-DDTHH:mm:ss.000000Z
      reply?: {
        root: {
          uri: string;
          cid: string;
        };
        parent: {
          uri: string;
          cid: string;
        };
      }
    },
  ) => {
    const createdAt = post.createdAt ?? new Date().toISOString();
    let textToUse = post.text.slice();

    let facets = null;
    if (post.link) {
      if (post.link.length > 150) {
        textToUse = textToUse.slice(
          0, 
          textToUse.length - 1 - post.link.length
        );
      }

      /** Sometimes we desire to just post a link */
      const rawText = !post.text 
        ? post.link
        : `${textToUse}\n${post.link}`;
      const rt = new RichText({
        text: rawText,
      });
      await rt.detectFacets(this.agent);

      /** Need to reupdate with the richtext props. */
      textToUse = rt.text;
      facets = rt.facets;
    }

    const { text: _text, ...postWithoutText } = post;
    const postToSend: Partial<BlueskyRecord> = {
      ...postWithoutText,
      text: textToUse,
      createdAt,
    };

    if (facets) {
      postToSend.facets = facets;
    }

    if (post.image) {
      const blobArr = await post.image.arrayBuffer();
      const { data } = await this.agent.uploadBlob(
        new Uint8Array(blobArr)
      );
      postToSend.embed = { 
        $type: 'app.bsky.embed.images',
        images: [
          {
            alt: "thumbnail",
            image: data.blob,
            aspectRatio: {
              width: 200,
              height: 150,
            }
          }
        ] 
      };
    }

    return await this.agent.post(postToSend);
  }
}
