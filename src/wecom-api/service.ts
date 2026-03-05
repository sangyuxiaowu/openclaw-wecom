// @ts-nocheck
import { splitWecomText, getByteLength, sleep } from "../messaging/wecom-text.ts";
import { RateLimiter } from "../rate-limiter.ts";

export function createWecomMessagingService({
  fetchAccessToken,
  sendApiMessage,
  uploadApiMedia,
}) {
  const accessTokenCaches = new Map();
  const apiLimiter = new RateLimiter({ maxConcurrent: 10, minInterval: 100 });

  async function getWecomAccessToken({ corpId, corpSecret }) {
    const cacheKey = corpId;
    let cache = accessTokenCaches.get(cacheKey);

    if (!cache) {
      cache = { token: null, expiresAt: 0, refreshPromise: null };
      accessTokenCaches.set(cacheKey, cache);
    }

    const now = Date.now();
    if (cache.token && cache.expiresAt > now + 60000) {
      return cache.token;
    }

    if (cache.refreshPromise) {
      return cache.refreshPromise;
    }

    cache.refreshPromise = (async () => {
      try {
        const tokenJson = await fetchAccessToken({ corpId, corpSecret });
        cache.token = tokenJson.access_token;
        cache.expiresAt = Date.now() + (tokenJson.expires_in || 7200) * 1000;
        return cache.token;
      } finally {
        cache.refreshPromise = null;
      }
    })();

    return cache.refreshPromise;
  }

  async function sendWecomTextSingle({ corpId, corpSecret, agentId, toUser, text }) {
    return apiLimiter.execute(async () => {
      const accessToken = await getWecomAccessToken({ corpId, corpSecret });
      const body = {
        touser: toUser,
        msgtype: "text",
        agentid: agentId,
        text: { content: text },
        safe: 0,
      };
      return sendApiMessage({
        accessToken,
        body,
        errorPrefix: "WeCom message/send failed",
      });
    });
  }

  async function sendWecomText({ corpId, corpSecret, agentId, toUser, text, logger }) {
    const chunks = splitWecomText(text);

    logger?.info?.(`wecom: splitting message into ${chunks.length} chunks, total bytes=${getByteLength(text)}`);

    for (let i = 0; i < chunks.length; i++) {
      logger?.info?.(`wecom: sending chunk ${i + 1}/${chunks.length}, bytes=${getByteLength(chunks[i])}`);
      await sendWecomTextSingle({ corpId, corpSecret, agentId, toUser, text: chunks[i] });
      if (i < chunks.length - 1) {
        await sleep(300);
      }
    }
  }

  async function uploadWecomMedia({ corpId, corpSecret, type, buffer, filename, contentType }) {
    const accessToken = await getWecomAccessToken({ corpId, corpSecret });
    const json = await uploadApiMedia({ accessToken, type, buffer, filename, contentType });
    return json.media_id;
  }

  async function sendWecomImage({ corpId, corpSecret, agentId, toUser, mediaId }) {
    return apiLimiter.execute(async () => {
      const accessToken = await getWecomAccessToken({ corpId, corpSecret });
      const body = {
        touser: toUser,
        msgtype: "image",
        agentid: agentId,
        image: { media_id: mediaId },
        safe: 0,
      };
      return sendApiMessage({
        accessToken,
        body,
        errorPrefix: "WeCom image send failed",
      });
    });
  }

  async function sendWecomVideo({ corpId, corpSecret, agentId, toUser, mediaId, title, description }) {
    return apiLimiter.execute(async () => {
      const accessToken = await getWecomAccessToken({ corpId, corpSecret });
      const body = {
        touser: toUser,
        msgtype: "video",
        agentid: agentId,
        video: {
          media_id: mediaId,
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
        },
        safe: 0,
      };
      return sendApiMessage({
        accessToken,
        body,
        errorPrefix: "WeCom video send failed",
      });
    });
  }

  async function sendWecomFile({ corpId, corpSecret, agentId, toUser, mediaId }) {
    return apiLimiter.execute(async () => {
      const accessToken = await getWecomAccessToken({ corpId, corpSecret });
      const body = {
        touser: toUser,
        msgtype: "file",
        agentid: agentId,
        file: { media_id: mediaId },
        safe: 0,
      };
      return sendApiMessage({
        accessToken,
        body,
        errorPrefix: "WeCom file send failed",
      });
    });
  }

  async function sendWecomVoice({ corpId, corpSecret, agentId, toUser, mediaId }) {
    return apiLimiter.execute(async () => {
      const accessToken = await getWecomAccessToken({ corpId, corpSecret });
      const body = {
        touser: toUser,
        msgtype: "voice",
        agentid: agentId,
        voice: { media_id: mediaId },
        safe: 0,
      };
      return sendApiMessage({
        accessToken,
        body,
        errorPrefix: "WeCom voice send failed",
      });
    });
  }

  return {
    getWecomAccessToken,
    sendWecomText,
    uploadWecomMedia,
    sendWecomImage,
    sendWecomVideo,
    sendWecomFile,
    sendWecomVoice,
  };
}
