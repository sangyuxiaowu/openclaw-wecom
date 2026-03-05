// @ts-nocheck
import { ProxyAgent as UndiciProxyAgent } from "undici";

let wecomProxyUrl =
  process.env.WECOM_PROXY_URL || process.env.WECOM_PROXY || process.env.HTTPS_PROXY || "";
let wecomProxyDispatcher = wecomProxyUrl ? new UndiciProxyAgent(wecomProxyUrl) : null;

export function configureWecomProxyUrl(proxyUrl) {
  const next = String(proxyUrl || "").trim();
  if (next === wecomProxyUrl) {
    return;
  }
  wecomProxyUrl = next;
  wecomProxyDispatcher = wecomProxyUrl ? new UndiciProxyAgent(wecomProxyUrl) : null;
}

export function wecomFetch(url, opts = {}) {
  if (wecomProxyDispatcher && typeof url === "string" && url.includes("qyapi.weixin.qq.com")) {
    return fetch(url, { ...opts, dispatcher: wecomProxyDispatcher });
  }
  return fetch(url, opts);
}
