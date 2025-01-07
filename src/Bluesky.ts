import { AtpAgent, RichText } from '@atproto/api';
import {
  dataSourceContextToBlueskySecretKeys, 
  DataSourceContext
} from './Constants';
import { fetchSecret, truncateText } from './Util';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post';

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

function fetchBlueskyCredsFromContext(
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

export const postToBluesky = async(
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
  context: DataSourceContext
) => {
  const createdAt = post.createdAt ?? new Date().toISOString();
  const { identifier, password } = fetchBlueskyCredsFromContext(context);
  await agent.login({ identifier, password });
  
  let textToUse: string = truncateText(post.text, 150);
  let facets = null;
  if (post.link) {
    if (post.link.length > 150) {
      textToUse = textToUse.slice(
        0, 
        textToUse.length - 1 - post.link.length
      );
    }

    const rt = new RichText({
      text: `${textToUse}\n${post.link}`,
    });
    await rt.detectFacets(agent);
    textToUse = rt.text;
    facets = rt.facets;
  }

  const { text: _text, ...postWithoutText } = post;
  const postToSend: Partial<Record> = {
    ...postWithoutText,
    text: textToUse,
    createdAt,
  };

  if (facets) {
    postToSend.facets = facets;
  }

  if (post.image) {
    const blobArr = await post.image.arrayBuffer();
    const { data } = await agent.uploadBlob(
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

  return await agent.post(postToSend);
}
