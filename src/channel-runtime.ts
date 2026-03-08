// @ts-nocheck
import {
  buildPendingHistoryContextFromMap,
  recordPendingHistoryEntry,
  clearHistoryEntriesIfEnabled,
} from "openclaw/plugin-sdk";
import { writeFile, unlink, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { markdownToWecomText } from "./messaging/wecom-text.ts";
import { broadcastToChatUI } from "./transport.ts";
import { createWecomConfigService } from "./config.ts";
import { createInboundMessageProcessor } from "./inbound.ts";
import { fetchMediaFromUrl, resolveWecomMediaType } from "./messaging/media-utils.ts";
import { createWecomDeliveryHandlers } from "./outbound.ts";
import { fetchAccessToken, sendApiMessage, uploadApiMedia, downloadApiMedia } from "./wecom-api/client.ts";
import { createWecomMessagingService } from "./wecom-api/service.ts";

function requireEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  return v;
}

function asNumber(v, fallback = null) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function createWecomChannelRuntime({ pluginVersion, execFileAsync }) {
  const {
    getWecomAccessToken,
    sendWecomText,
    uploadWecomMedia,
    sendWecomImage,
    sendWecomVideo,
    sendWecomFile,
    sendWecomVoice,
  } = createWecomMessagingService({
    fetchAccessToken,
    sendApiMessage,
    uploadApiMedia,
  });

  let gatewayRuntime = null;

  const { getWecomConfig, listWecomAccountIds } = createWecomConfigService({
    requireEnv,
    asNumber,
    getRuntimeConfig: () => gatewayRuntime?.config,
  });

  const deliveryHandlers = createWecomDeliveryHandlers({
    getConfig: (accountId) => getWecomConfig(undefined, accountId),
    fetchMediaFromUrl,
    resolveWecomMediaType,
    uploadWecomMedia,
    sendWecomImage,
    sendWecomVideo,
    sendWecomFile,
    sendWecomVoice,
    sendWecomText,
  });

  const sessionHistories = new Map();
  const resolvedConfig = getWecomConfig(undefined, null);
  const configuredHistoryLimit = resolvedConfig?.historyLimit;
  const DEFAULT_HISTORY_LIMIT =
    Number.isFinite(configuredHistoryLimit) && configuredHistoryLimit >= 0
      ? Math.floor(configuredHistoryLimit)
      : 20;

  const processInboundMessage = createInboundMessageProcessor({
    getWecomConfig,
    listWecomAccountIds,
    getWecomAccessToken,
    downloadApiMedia,
    sendWecomText,
    resolveWecomMediaType,
    uploadWecomMedia,
    sendWecomImage,
    sendWecomVideo,
    sendWecomFile,
    sendWecomVoice,
    fetchMediaFromUrl,
    execFileAsync,
    clearHistoryEntriesIfEnabled,
    sessionHistories,
    DEFAULT_HISTORY_LIMIT,
    PLUGIN_VERSION: pluginVersion,
    existsSync,
    tmpdir,
    join,
    mkdir,
    writeFile,
    readFile,
    dirname,
    unlink,
    buildPendingHistoryContextFromMap,
    recordPendingHistoryEntry,
    broadcastToChatUI,
    markdownToWecomText,
  });

  return {
    setGatewayRuntime(runtime) {
      gatewayRuntime = runtime;
    },
    getWecomConfig,
    deliveryHandlers,
    processInboundMessage,
  };
}
