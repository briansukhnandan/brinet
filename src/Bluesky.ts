import { AtpAgent } from '@atproto/api';
import { contextToBlueskySecretKeys, DataSourceContext } from './Constants';
import { fetchSecret } from './Util';

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

function fetchBlueskyCredsFromContext(
  context: DataSourceContext
): {
  identifier: string;
  password: string;
} {
  if (!contextToBlueskySecretKeys[context]) {
    throw new Error("Did not find secret pair for given context!");
  }

  const {
    identifier: identifierSecret, 
    password: passwordSecret
  } = contextToBlueskySecretKeys[context];

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
