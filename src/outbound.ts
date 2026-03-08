// @ts-nocheck
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createSendWecomMediaByUrl } from "./messaging/media-delivery.ts";
import { createWecomSendInterface } from "./messaging/send-interface.ts";

const execFileAsync = promisify(execFile);

export function createWecomDeliveryHandlers({
  getConfig,
  fetchMediaFromUrl,
  resolveWecomMediaType,
  uploadWecomMedia,
  sendWecomImage,
  sendWecomVideo,
  sendWecomFile,
  sendWecomVoice,
  sendWecomText,
}) {
  const sendMediaByUrl = createSendWecomMediaByUrl({
    fetchMediaFromUrl,
    resolveWecomMediaType,
    uploadWecomMedia,
    sendWecomImage,
    sendWecomVideo,
    sendWecomFile,
    sendWecomVoice,
    execFileAsync,
    tmpdir,
    join,
    mkdir,
    writeFile,
    readFile,
    unlink,
  });

  const sendInterface = createWecomSendInterface({
    sendWecomText,
    sendMediaByUrl,
  });

  return {
    outbound: {
      deliveryMode: "direct",
      resolveTarget: ({ to }) => {
        const trimmed = to?.trim();
        if (!trimmed) return { ok: false, error: new Error("WeCom requires --to <UserId>") };
        return { ok: true, to: trimmed };
      },
      sendText: async ({ to, text, accountId }) => {
        const config = getConfig(accountId);
        if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
          return { ok: false, error: new Error("WeCom not configured (check channels.wecom in clawdbot.json)") };
        }
        const userId = to.startsWith("wecom:") ? to.slice(6) : to;
        await sendInterface.sendText({
          corpId: config.corpId,
          corpSecret: config.corpSecret,
          agentId: config.agentId,
          toUser: userId,
          text,
          logger: console,
        });
        return { ok: true, provider: "wecom" };
      },
      sendMedia: async ({ to, text, mediaUrl, accountId }) => {
        const config = getConfig(accountId);
        if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
          return { ok: false, error: new Error("WeCom not configured") };
        }
        const { corpId, corpSecret, agentId } = config;
        const userId = to.startsWith("wecom:") ? to.slice(6) : to;
        await sendInterface.sendMediaAndText({
          corpId,
          corpSecret,
          agentId,
          toUser: userId,
          mediaUrl,
          text,
          logger: console,
          mediaFailTextFallback: mediaUrl ? `[文件: ${mediaUrl}]` : "",
        });
        return { ok: true, provider: "wecom" };
      },
    },
    inbound: {
      deliverReply: async ({ to, text, accountId, mediaUrl, mediaType }) => {
        const config = getConfig(accountId);
        if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
          throw new Error("WeCom not configured (check channels.wecom in clawdbot.json)");
        }
        const { corpId, corpSecret, agentId } = config;
        const userId = to.startsWith("wecom:") ? to.slice(6) : to;
        await sendInterface.sendMediaAndText({
          corpId,
          corpSecret,
          agentId,
          toUser: userId,
          mediaUrl,
          text,
          logger: console,
        });

        return { ok: true };
      },
    },
  };
}
