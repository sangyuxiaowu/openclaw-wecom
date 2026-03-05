// @ts-nocheck
import { normalizePluginHttpPath, registerPluginHttpRoute } from "openclaw/plugin-sdk";

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

export function registerWecomWebhookRoute({
  api,
  cfg,
  getWecomConfig,
  processInboundMessage,
  computeMsgSignature,
  decryptWecom,
  readRequestBody,
  parseIncomingXml,
}) {
  const configuredWebhookPath = api?.config?.channels?.wecom?.webhookPath;
  const webhookPath = configuredWebhookPath ?? cfg?.webhookPath;
  const normalizedPath = normalizePluginHttpPath(webhookPath, "/wecom/callback") ?? "/wecom/callback";
  const defaultPath = "/wecom/callback";
  const routePaths = Array.from(new Set([normalizedPath, defaultPath]));

  const handler = async (req, res) => {
    const config = getWecomConfig(api);
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
      processInboundMessage({ api, fromUser, content: textContent, msgType: "text", chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async message processing failed: ${err.message}`);
      });
    } else if (msgType === "image" && msgObj?.MediaId) {
      processInboundMessage({ api, fromUser, mediaId: msgObj.MediaId, msgType: "image", picUrl: msgObj.PicUrl, chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async image processing failed: ${err.message}`);
      });
    } else if (msgType === "voice" && msgObj?.MediaId) {
      processInboundMessage({ api, fromUser, mediaId: msgObj.MediaId, msgType: "voice", recognition: asText(msgObj.Recognition), chatId, isGroupChat }).catch((err) => {
        api.logger.error?.(`wecom: async voice processing failed: ${err.message}`);
      });
    } else if (msgType === "video" && msgObj?.MediaId) {
      processInboundMessage({
        api,
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

  for (const routePath of routePaths) {
    if (typeof api?.registerHttpRoute === "function") {
      api.registerHttpRoute({
        path: routePath,
        match: "exact",
        auth: "plugin",
        replaceExisting: true,
        handler,
      });
      api.logger.info?.(`wecom: registered webhook route via api.registerHttpRoute at ${routePath}`);
      continue;
    }

    registerPluginHttpRoute({
      path: routePath,
      fallbackPath: routePath,
      match: "exact",
      auth: "plugin",
      replaceExisting: true,
      pluginId: "wecom",
      accountId: getWecomConfig(api)?.accountId,
      source: "wecom.webhook",
      log: (msg) => api.logger.info?.(msg),
      handler,
    });
    api.logger.info?.(`wecom: registered webhook route via registerPluginHttpRoute at ${routePath}`);
  }
}
