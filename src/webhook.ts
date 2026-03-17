// @ts-nocheck

function asText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";

  if (typeof value["#text"] === "string") return value["#text"];
  if (typeof value["__cdata"] === "string") return value["__cdata"];
  if (typeof value["$text"] === "string") return value["$text"];
  if (typeof value["value"] === "string") return value["value"];

  return "";
}

function normalizeWebhookPath(path, fallback = "/wecom/callback") {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (!trimmed) {
    return fallback;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function listConfiguredAccountIds(channelConfig) {
  const accounts = channelConfig?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts)
    .map((accountId) => String(accountId || "").trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function resolveRouteBindings(api, getWecomConfig) {
  const channelConfig = api?.config?.channels?.wecom;
  const configuredAccountIds = listConfiguredAccountIds(channelConfig);
  const defaultAccount = String(channelConfig?.defaultAccount || "").trim();
  const bindingCandidates = [];

  if (configuredAccountIds.length === 0) {
    const config = getWecomConfig(api);
    if (config) {
      bindingCandidates.push({
        path: normalizeWebhookPath(config.webhookPath),
        accountId: config.accountId,
        priority: 2,
      });
    }
  } else {
    for (const accountId of configuredAccountIds) {
      const config = getWecomConfig(api, accountId);
      if (!config) {
        continue;
      }
      bindingCandidates.push({
        path: normalizeWebhookPath(config.webhookPath),
        accountId: config.accountId,
        priority: accountId === defaultAccount ? 2 : 1,
      });
    }
  }

  bindingCandidates.push({ path: "/wecom/callback", accountId: null, priority: 0 });

  const bindings = [];
  const seen = new Set();
  for (const candidate of bindingCandidates.sort((left, right) => right.priority - left.priority)) {
    const key = `${candidate.path}::${candidate.accountId ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    bindings.push(candidate);
  }
  return bindings;
}

function resolveAccountIdForPath(api, getWecomConfig, routePath) {
  const normalizedPath = normalizeWebhookPath(routePath);
  const bindings = resolveRouteBindings(api, getWecomConfig).filter(
    (binding) => binding.path === normalizedPath,
  );
  return bindings[0]?.accountId ?? null;
}

export function registerWecomWebhookRoutes({
  api,
  getWecomConfig,
  processInboundMessage,
  computeMsgSignature,
  decryptWecom,
  readRequestBody,
  parseIncomingXml,
}) {

  const createHandler = (routePath) => async (req, res) => {
    const resolvedAccountId = resolveAccountIdForPath(api, getWecomConfig, routePath);
    const config = getWecomConfig(api, resolvedAccountId);
    const token = config?.callbackToken;
    const aesKey = config?.callbackAesKey;

    const url = new URL(req.url ?? "/", "http://localhost");
    const msg_signature = url.searchParams.get("msg_signature") ?? "";
    const timestamp = url.searchParams.get("timestamp") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";
    const echostr = url.searchParams.get("echostr") ?? "";

    if (req.method === "GET" && !echostr) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("wecom webhook ok");
      return;
    }

    if (!token || !aesKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("WeCom plugin not configured (missing token/aesKey)");
      return;
    }

    if (req.method === "GET") {
      const expected = computeMsgSignature({ token, timestamp, nonce, encrypt: echostr });
      if (!msg_signature || expected !== msg_signature) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Invalid signature");
        return;
      }
      const { msg: plainEchostr } = decryptWecom({ aesKey, cipherTextBase64: echostr });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(plainEchostr);
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST");
      res.end();
      return;
    }

    const rawXml = await readRequestBody(req);
    const incoming = parseIncomingXml(rawXml);
    const encrypt = incoming?.Encrypt;
    if (!encrypt) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Missing Encrypt");
      return;
    }

    const expected = computeMsgSignature({ token, timestamp, nonce, encrypt });
    if (!msg_signature || expected !== msg_signature) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid signature");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("success");

    const { msg: decryptedXml } = decryptWecom({ aesKey, cipherTextBase64: encrypt });
    const msgObj = parseIncomingXml(decryptedXml);

    const chatId = null;
    const isGroupChat = false;

    const textContent = asText(msgObj?.Content);
    api.logger.info?.(
      `wecom inbound: FromUserName=${msgObj?.FromUserName} MsgType=${msgObj?.MsgType} Content=${textContent.slice(0, 80)}`
    );

    const fromUser = msgObj.FromUserName;
    const msgType = msgObj.MsgType;

    if (msgType === "text" && textContent) {
      processInboundMessage({ api, accountId: config?.accountId, fromUser, content: textContent, msgType: "text", chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async message processing failed: ${err.message}`);
      });
    } else if (msgType === "image" && msgObj?.MediaId) {
      processInboundMessage({ api, accountId: config?.accountId, fromUser, mediaId: msgObj.MediaId, msgType: "image", picUrl: msgObj.PicUrl, chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async image processing failed: ${err.message}`);
      });
    } else if (msgType === "voice" && msgObj?.MediaId) {
      processInboundMessage({ api, accountId: config?.accountId, fromUser, mediaId: msgObj.MediaId, msgType: "voice", recognition: asText(msgObj.Recognition), chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async voice processing failed: ${err.message}`);
      });
    } else if (msgType === "video" && msgObj?.MediaId) {
      processInboundMessage({
        api,
        accountId: config?.accountId,
        fromUser,
        mediaId: msgObj.MediaId,
        msgType: "video",
        thumbMediaId: msgObj.ThumbMediaId,
        chatId,
        isGroupChat,
      }).catch((err) => {
        api.logger.error?.(`wecom: async video processing failed: ${err.message}`);
      });
    } else if (msgType === "file" && msgObj?.MediaId) {
      processInboundMessage({
        api,
        accountId: config?.accountId,
        fromUser,
        mediaId: msgObj.MediaId,
        msgType: "file",
        fileName: asText(msgObj.FileName),
        fileSize: asText(msgObj.FileSize),
        chatId,
        isGroupChat,
      }).catch((err) => {
        api.logger.error?.(`wecom: async file processing failed: ${err.message}`);
      });
    } else if (msgType === "link") {
      processInboundMessage({
        api,
        accountId: config?.accountId,
        fromUser,
        msgType: "link",
        linkTitle: asText(msgObj.Title),
        linkDescription: asText(msgObj.Description),
        linkUrl: asText(msgObj.Url),
        linkPicUrl: asText(msgObj.PicUrl),
        chatId,
        isGroupChat,
      }).catch((err) => {
        api.logger.error?.(`wecom: async link processing failed: ${err.message}`);
      });
    } else {
      api.logger.info?.(`wecom: ignoring unsupported message type=${msgType}`);
    }
  };

  const routePaths = Array.from(
    new Set(resolveRouteBindings(api, getWecomConfig).map((binding) => binding.path)),
  );

  for (const routePath of routePaths) {
    api.registerHttpRoute({
      path: routePath,
      match: "exact",
      auth: "plugin",
      replaceExisting: true,
      handler: createHandler(routePath),
    });
    api.logger.info?.(`wecom: registered webhook route at ${routePath}`);
  };

  return () => {};
}
