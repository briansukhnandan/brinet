import { AtpAgent } from '@atproto/api';
import { DataSourceContext } from './constants';
import { fetchSecret } from './util';

const { CONGRESS } = DataSourceContext;

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

function fetchBlueskyCredsFromContext(
  context: DataSourceContext
): {
  identifier: string;
  password: string;
} {
  const contextToSecretKeys: Partial<
    Record<
      DataSourceContext, 
      {
        identifier: string,
        password: string,
      }
    >
  > = {
    [CONGRESS]: {
      identifier: "CONGRESS_TRACKER_BLUESKY_USERNAME",
      password: "CONGRESS_TRACKER_BLUESKY_PASSWORD"
    }
  };

  if (!contextToSecretKeys[context]) {
    throw new Error("Did not find secret pair for given context!");
  }

  const {
    identifier: identifierSecret, 
    password: passwordSecret
  } = contextToSecretKeys[context];

  return {
    identifier: fetchSecret(identifierSecret),
    password: fetchSecret(passwordSecret),
  };
}

export const postToBluesky = async(
  post: {
    text: string,
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
  return await agent.post({
    ...post,
    createdAt,
  });
}
