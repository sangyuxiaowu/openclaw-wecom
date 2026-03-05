// @ts-nocheck
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { computeMsgSignature, decryptWecom } from "./messaging/wecom-crypto.ts";
import { parseIncomingXml, readRequestBody } from "./messaging/wecom-xml.ts";
import { registerWecomWebhookRoute } from "./webhook.ts";
import { setGatewayBroadcastContext } from "./transport.ts";
import { registerWecomGatewayMethods } from "./register-gateway.ts";
import { createWecomChannelRuntime } from "./channel-runtime.ts";
import { configureWecomProxyUrl } from "./wecom-api/fetch.ts";

const _require = createRequire(import.meta.url);
const PLUGIN_VERSION = _require("../package.json").version;

const execFileAsync = promisify(execFile);

const {
  setGatewayRuntime,
  getWecomConfig,
  wecomChannelPlugin,
  processInboundMessage,
} = createWecomChannelRuntime({
  pluginVersion: PLUGIN_VERSION,
  execFileAsync,
});

export default function register(api) {
  setGatewayRuntime(api.runtime);

  // 初始化配置
  const cfg = getWecomConfig(api);
  if (cfg) {
    api.logger.info?.(`wecom: config loaded (corpId=${cfg.corpId?.slice(0, 8)}...)`);
    if (cfg.proxyUrl) {
      configureWecomProxyUrl(cfg.proxyUrl);
      api.logger.info?.("wecom: proxy configured from channels.wecom.proxyUrl");
    }
  } else {
    api.logger.warn?.("wecom: no configuration found (check channels.wecom in clawdbot.json)");
  }

  api.registerChannel({ plugin: wecomChannelPlugin });

  registerWecomGatewayMethods({ api, setGatewayBroadcastContext });

  registerWecomWebhookRoute({
    api,
    cfg,
    getWecomConfig,
    processInboundMessage,
    computeMsgSignature,
    decryptWecom,
    readRequestBody,
    parseIncomingXml,
  });
}
