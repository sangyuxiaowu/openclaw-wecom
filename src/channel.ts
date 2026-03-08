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
import { configureWecomProxy } from "./wecom-api/fetch.ts";

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
      const proxyConfigResult = configureWecomProxy({
        proxyMode: cfg.proxyMode,
        proxyUrl: cfg.proxyUrl,
      });
      if (proxyConfigResult?.ok) {
        api.logger.info?.(
          `wecom: proxy configured (mode=${proxyConfigResult.proxyMode}, url=${proxyConfigResult.proxyUrl})`
        );
      } else if (proxyConfigResult?.ok === false) {
        api.logger.warn?.(
          `wecom: invalid proxy config ignored (mode=${proxyConfigResult.proxyMode}, url=${cfg.proxyUrl})`
        );
      }
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
