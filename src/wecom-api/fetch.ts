// @ts-nocheck
import { ProxyAgent as UndiciProxyAgent } from "undici";

const WECOM_API_HOST = "qyapi.weixin.qq.com";
const DEFAULT_PROXY_MODE = "forward";

function normalizeWecomProxyMode(proxyMode) {
  const normalized = String(proxyMode || DEFAULT_PROXY_MODE).trim().toLowerCase();
  return normalized === "reverse" ? "reverse" : DEFAULT_PROXY_MODE;
}

function normalizeWecomProxyUrl(proxyUrl) {
  const normalized = String(proxyUrl || "").trim();
  if (!normalized) {
    return "";
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalized)) {
    return normalized;
  }
  return `http://${normalized}`;
}

function isWecomApiUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.hostname === WECOM_API_HOST;
  } catch {
    return false;
  }
}

function buildReverseProxyUrl(proxyBaseUrl, targetUrl) {
  const base = new URL(proxyBaseUrl);
  const target = new URL(String(targetUrl));
  const basePath = base.pathname.replace(/\/+$/, "");
  const targetPath = target.pathname.replace(/^\/+/, "");

  base.pathname = `${basePath}/${targetPath}`;
  base.search = target.search;
  base.hash = "";

  return base.toString();
}

function validateForwardProxyUrl(proxyUrl) {
  const parsed = new URL(proxyUrl);
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("forward proxyUrl must not include path, query, or hash");
  }
  return parsed.origin;
}

function validateReverseProxyUrl(proxyUrl) {
  return new URL(proxyUrl).toString();
}

function applyWecomProxy({ proxyUrl, proxyMode }) {
  const normalizedMode = normalizeWecomProxyMode(proxyMode);
  const normalizedUrl = normalizeWecomProxyUrl(proxyUrl);
  if (!normalizedUrl) {
    wecomProxyMode = normalizedMode;
    wecomProxyUrl = "";
    wecomProxyDispatcher = null;
    return { ok: true, proxyMode: normalizedMode, proxyUrl: "" };
  }

  try {
    const validatedUrl =
      normalizedMode === "reverse"
        ? validateReverseProxyUrl(normalizedUrl)
        : validateForwardProxyUrl(normalizedUrl);

    wecomProxyMode = normalizedMode;
    wecomProxyUrl = validatedUrl;
    wecomProxyDispatcher = normalizedMode === "forward" ? new UndiciProxyAgent(validatedUrl) : null;
    return { ok: true, proxyMode: normalizedMode, proxyUrl: validatedUrl };
  } catch (error) {
    wecomProxyMode = normalizedMode;
    wecomProxyUrl = "";
    wecomProxyDispatcher = null;
    return { ok: false, proxyMode: normalizedMode, proxyUrl: normalizedUrl, error };
  }
}

let wecomProxyMode = DEFAULT_PROXY_MODE;
let wecomProxyUrl = "";
let wecomProxyDispatcher = null;

applyWecomProxy({
  proxyMode: process.env.WECOM_PROXY_MODE,
  proxyUrl: process.env.WECOM_PROXY_URL || process.env.WECOM_PROXY || process.env.HTTPS_PROXY || "",
});

export function configureWecomProxy({ proxyUrl, proxyMode }) {
  const nextMode = normalizeWecomProxyMode(proxyMode);
  const next = normalizeWecomProxyUrl(proxyUrl);
  if (nextMode === wecomProxyMode && next === wecomProxyUrl) {
    return { ok: true, proxyMode: wecomProxyMode, proxyUrl: wecomProxyUrl };
  }
  return applyWecomProxy({ proxyUrl: next, proxyMode: nextMode });
}

export function wecomFetch(url, opts = {}) {
  if (wecomProxyMode === "reverse" && wecomProxyUrl && isWecomApiUrl(url)) {
    return fetch(buildReverseProxyUrl(wecomProxyUrl, url), opts);
  }
  if (wecomProxyDispatcher && isWecomApiUrl(url)) {
    return fetch(url, { ...opts, dispatcher: wecomProxyDispatcher });
  }
  return fetch(url, opts);
}
