// @ts-nocheck
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createSendWecomMediaByUrl } from "./messaging/media-delivery.ts";
import { createWecomSendInterface } from "./messaging/send-interface.ts";

const execFileAsync = promisify(execFile);

function serializeError(err) {
  if (!err) return { message: "Unknown error" };
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
    };
  }
  if (typeof err === "string") {
    return { message: err };
  }
  return { message: String(err) };
}

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
  function formatNotConfiguredMessage(accountId) {
    const normalized = String(accountId || "").trim() || "(default)";
    return `WeCom not configured for accountId=${normalized} (check channels.wecom and channels.wecom.accounts)`;
  }

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
        if (!trimmed) return { ok: false, error: { message: "WeCom requires --to <UserId>" } };
        return { ok: true, to: trimmed };
      },
      sendText: async ({ cfg, to, text, accountId }) => {
        const config = getConfig(cfg, accountId);
        if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
          return { ok: false, error: { message: formatNotConfiguredMessage(accountId) } };
        }
        const userId = to.startsWith("wecom:") ? to.slice(6) : to;
        try {
          await sendInterface.sendText({
            corpId: config.corpId,
            corpSecret: config.corpSecret,
            agentId: config.agentId,
            toUser: userId,
            text,
            logger: undefined,
          });
          return { ok: true, provider: "wecom" };
        } catch (err) {
          const error = serializeError(err);
          console.warn?.(`wecom: outbound sendText failed, to=${userId}, error=${error.message}`);
          return { ok: false, error, provider: "wecom" };
        }
      },
      sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
        const config = getConfig(cfg, accountId);
        if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
          return { ok: false, error: { message: formatNotConfiguredMessage(accountId) } };
        }
        const { corpId, corpSecret, agentId } = config;
        const userId = to.startsWith("wecom:") ? to.slice(6) : to;
        try {
          const sendResult = await sendInterface.sendMediaAndText({
            corpId,
            corpSecret,
            agentId,
            toUser: userId,
            mediaUrl,
            text,
            logger: undefined,
            mediaFailTextFallback: mediaUrl ? `[文件: ${mediaUrl}]` : "",
          });

          if (mediaUrl && !sendResult.mediaSent) {
            const error = serializeError(sendResult.mediaError);
            console.warn?.(
              `wecom: outbound sendMedia media phase failed, to=${userId}, source=${mediaUrl}, error=${error.message}`
            );
            return {
              ok: false,
              provider: "wecom",
              error,
              textSent: Boolean(sendResult.textSent),
            };
          }

          return { ok: true, provider: "wecom", textSent: Boolean(sendResult.textSent) };
        } catch (err) {
          const error = serializeError(err);
          console.warn?.(`wecom: outbound sendMedia failed, to=${userId}, source=${mediaUrl || "none"}, error=${error.message}`);
          return { ok: false, error, provider: "wecom" };
        }
      },
    },
    inbound: {
      deliverReply: async ({ cfg, to, text, accountId, mediaUrl, mediaType }) => {
        const config = getConfig(cfg, accountId);
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
          logger: undefined,
        });

        return { ok: true };
      },
    },
  };
}
