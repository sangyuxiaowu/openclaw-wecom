// @ts-nocheck
import { createSendWecomMediaByUrl } from "./messaging/media-delivery.ts";
import { createWecomInboundCommands } from "./messaging/inbound-commands.ts";
import { createWecomSendInterface } from "./messaging/send-interface.ts";

export function createInboundMessageProcessor(deps) {
  const {
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
    PLUGIN_VERSION,
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
  } = deps;

  async function downloadWecomMedia({ corpId, corpSecret, mediaId }) {
    const accessToken = await getWecomAccessToken({ corpId, corpSecret });
    return downloadApiMedia({ accessToken, mediaId });
  }

  const COMMANDS = createWecomInboundCommands({
    getWecomConfig,
    listWecomAccountIds,
    sendWecomText,
    clearHistoryEntriesIfEnabled,
    sessionHistories,
    DEFAULT_HISTORY_LIMIT,
    PLUGIN_VERSION,
    existsSync,
  });

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

  function extractMediaHint(text, payloadMediaUrl) {
    const explicitMediaUrl = typeof payloadMediaUrl === "string" ? payloadMediaUrl.trim() : "";
    const rawText = typeof text === "string" ? text : "";
    return { mediaUrl: explicitMediaUrl, textWithoutHint: rawText };
  }

  function ensureText(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value == null) return "";
    return "";
  }

  return async function processInboundMessage({ api, fromUser, content, msgType, mediaId, picUrl, recognition, thumbMediaId, fileName, fileSize, linkTitle, linkDescription, linkUrl, linkPicUrl, chatId, isGroupChat }) {
    const config = getWecomConfig(api);
    const cfg = api.config;
    const runtime = api.runtime;

    if (!config?.corpId || !config?.corpSecret || !config?.agentId) {
      api.logger.warn?.("wecom: not configured (check channels.wecom in clawdbot.json)");
      return;
    }

    const { corpId, corpSecret, agentId } = config;

    try {
      const sessionId = `wecom:${fromUser}`.toLowerCase();
      api.logger.info?.(`wecom: processing ${msgType} message for session ${sessionId}`);

      let route;
      try {
        route = runtime.channel.routing.resolveAgentRoute({
          cfg,
          channel: "wecom",
          accountId: config.accountId || "default",
          peer: {
            kind: "direct",
            id: fromUser,
          },
        });
      } catch (_routeErr) {
        route = runtime.channel.routing.resolveAgentRoute({
          cfg,
          sessionKey: sessionId,
          channel: "wecom",
          accountId: config.accountId || "default",
        });
      }

      const canonicalSessionKey = route?.sessionKey || sessionId;
      const resolvedAccountId = route?.accountId || config.accountId || "default";

      const normalizedContent = ensureText(content);
      const normalizedRecognition = ensureText(recognition);

      if (msgType === "text" && normalizedContent.startsWith("/")) {
        const commandKey = normalizedContent.split(/\s+/)[0].toLowerCase();
        const handler = COMMANDS[commandKey];
        if (handler) {
          api.logger.info?.(`wecom: handling command ${commandKey}`);
          await handler({
            api,
            fromUser,
            corpId,
            corpSecret,
            agentId,
            chatId,
            isGroupChat,
            sessionId: canonicalSessionKey,
          });
          return;
        }
      }

      let messageText = normalizedContent;
      let imageBase64 = null;
      let imageMimeType = null;

      if (msgType === "image" && mediaId) {
        api.logger.info?.(`wecom: downloading image mediaId=${mediaId}`);

        try {
          const { buffer, contentType } = await downloadWecomMedia({ corpId, corpSecret, mediaId });
          imageBase64 = buffer.toString("base64");
          imageMimeType = contentType || "image/jpeg";
          messageText = "[用户发送了一张图片]";
          api.logger.info?.(`wecom: image downloaded, size=${buffer.length} bytes, type=${imageMimeType}`);
        } catch (downloadErr) {
          api.logger.warn?.(`wecom: failed to download image via mediaId: ${downloadErr.message}`);

          if (picUrl) {
            try {
              const { buffer, contentType } = await fetchMediaFromUrl(picUrl);
              imageBase64 = buffer.toString("base64");
              imageMimeType = contentType || "image/jpeg";
              messageText = "[用户发送了一张图片]";
              api.logger.info?.(`wecom: image downloaded via PicUrl, size=${buffer.length} bytes`);
            } catch (picUrlErr) {
              api.logger.warn?.(`wecom: failed to download image via PicUrl: ${picUrlErr.message}`);
              messageText = "[用户发送了一张图片，但下载失败]\n\n请告诉用户图片处理暂时不可用。";
            }
          } else {
            messageText = "[用户发送了一张图片，但下载失败]\n\n请告诉用户图片处理暂时不可用。";
          }
        }
      }

      if (msgType === "voice" && mediaId) {
        api.logger.info?.(`wecom: received voice message mediaId=${mediaId}`);

        if (normalizedRecognition) {
          api.logger.info?.(`wecom: voice recognition result: ${normalizedRecognition.slice(0, 50)}...`);
          messageText = `[语音消息] ${normalizedRecognition}`;
        } else {
          let voiceAmrPath = null;
          let voiceWavPath = null;
          try {
            const { buffer } = await downloadWecomMedia({ corpId, corpSecret, mediaId });
            const tempDir = join(tmpdir(), "openclaw-wecom");
            await mkdir(tempDir, { recursive: true });
            const ts = Date.now();
            voiceAmrPath = join(tempDir, `voice-${ts}.amr`);
            voiceWavPath = join(tempDir, `voice-${ts}.wav`);
            await writeFile(voiceAmrPath, buffer);
            api.logger.info?.(`wecom: saved voice to ${voiceAmrPath}, size=${buffer.length} bytes`);

            await execFileAsync("ffmpeg", ["-y", "-i", voiceAmrPath, "-ar", "16000", "-ac", "1", voiceWavPath], { timeout: 10000 });
            api.logger.info?.(`wecom: converted voice to WAV saved to ${voiceWavPath}`);
            messageText = `[用户发送了一条语音消息，存储位置: ${voiceWavPath}，请使用合适的工具识别并查看内容。]`;
          } catch (ffErr) {
            api.logger.error?.(`wecom: converted failed: ${ffErr.message}`);
            messageText = "[用户发送了一条语音消息，但转换失败]\n\n可能是 FFmpeg 调用异常，请告诉用户语音暂时出现问题，建议发送文字消息。";
          } finally {
            if (voiceAmrPath) unlink(voiceAmrPath).catch(() => {});
            //if (voiceWavPath) unlink(voiceWavPath).catch(() => {});
          }
        }
      }

      if (msgType === "video" && mediaId) {
        api.logger.info?.(`wecom: received video message mediaId=${mediaId}`);
        try {
          const { buffer } = await downloadWecomMedia({ corpId, corpSecret, mediaId });
          const tempDir = join(tmpdir(), "openclaw-wecom");
          await mkdir(tempDir, { recursive: true });
          const videoTempPath = join(tempDir, `video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
          await writeFile(videoTempPath, buffer);
          api.logger.info?.(`wecom: saved video to ${videoTempPath}, size=${buffer.length} bytes`);
          messageText = `[用户发送了一个视频文件，已保存到: ${videoTempPath}]\n\n请告知用户您已收到视频。`;
        } catch (downloadErr) {
          api.logger.warn?.(`wecom: failed to download video: ${downloadErr.message}`);
          messageText = "[用户发送了一个视频，但下载失败]\n\n请告诉用户视频处理暂时不可用。";
        }
      }

      if (msgType === "file" && mediaId) {
        api.logger.info?.(`wecom: received file message mediaId=${mediaId}, fileName=${fileName}, size=${fileSize}`);
        try {
          const { buffer } = await downloadWecomMedia({ corpId, corpSecret, mediaId });
          const ext = fileName ? fileName.split(".").pop() : "bin";
          const safeFileName = fileName || `file-${Date.now()}.${ext}`;
          const tempDir = join(tmpdir(), "openclaw-wecom");
          await mkdir(tempDir, { recursive: true });
          const fileTempPath = join(tempDir, `${Date.now()}-${safeFileName}`);
          await writeFile(fileTempPath, buffer);
          api.logger.info?.(`wecom: saved file to ${fileTempPath}, size=${buffer.length} bytes`);

          const readableTypes = [".txt", ".md", ".json", ".xml", ".csv", ".log", ".pdf"];
          const isReadable = readableTypes.some((t) => safeFileName.toLowerCase().endsWith(t));

          if (isReadable) {
            messageText = `[用户发送了一个文件: ${safeFileName}，已保存到: ${fileTempPath}]\n\n请使用 Read 工具查看这个文件的内容。`;
          } else {
            messageText = `[用户发送了一个文件: ${safeFileName}，大小: ${fileSize || buffer.length} 字节，已保存到: ${fileTempPath}]\n\n请告知用户您已收到文件。`;
          }
        } catch (downloadErr) {
          api.logger.warn?.(`wecom: failed to download file: ${downloadErr.message}`);
          messageText = `[用户发送了一个文件${fileName ? `: ${fileName}` : ""}，但下载失败]\n\n请告诉用户文件处理暂时不可用。`;
        }
      }

      if (msgType === "link") {
        api.logger.info?.(`wecom: received link message title=${linkTitle}, url=${linkUrl}`);
        messageText = `[用户分享了一个链接]\n标题: ${linkTitle || "(无标题)"}\n描述: ${linkDescription || "(无描述)"}\n链接: ${linkUrl || "(无链接)"}\n\n请根据链接内容回复用户。如需要，可以使用 WebFetch 工具获取链接内容。`;
      }

      if (!messageText) {
        api.logger.warn?.("wecom: empty message content");
        return;
      }

      let imageTempPath = null;
      if (imageBase64 && imageMimeType) {
        try {
          const ext = imageMimeType.includes("png") ? "png" : imageMimeType.includes("gif") ? "gif" : "jpg";
          const tempDir = join(tmpdir(), "openclaw-wecom");
          await mkdir(tempDir, { recursive: true });
          imageTempPath = join(tempDir, `image-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
          await writeFile(imageTempPath, Buffer.from(imageBase64, "base64"));
          api.logger.info?.(`wecom: saved image to ${imageTempPath}`);
          messageText = `[用户发送了一张图片，已保存到: ${imageTempPath}]\n\n请使用 Read 工具查看这张图片并描述内容。`;
        } catch (saveErr) {
          api.logger.warn?.(`wecom: failed to save image: ${saveErr.message}`);
          messageText = "[用户发送了一张图片，但保存失败]\n\n请告诉用户图片处理暂时不可用。";
          imageTempPath = null;
        }
      }

      const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
        agentId: route.agentId,
      });

      const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
      const chatType = "direct";
      const formattedBody = runtime.channel.reply.formatInboundEnvelope({
        channel: "WeCom",
        from: fromUser,
        timestamp: Date.now(),
        body: messageText,
        chatType,
        sender: {
          name: fromUser,
          id: fromUser,
        },
        envelope: envelopeOptions,
      });

      const body = buildPendingHistoryContextFromMap({
        historyMap: sessionHistories,
        historyKey: canonicalSessionKey,
        limit: DEFAULT_HISTORY_LIMIT,
        currentMessage: formattedBody,
        formatEntry: (entry) =>
          runtime.channel.reply.formatInboundEnvelope({
            channel: "WeCom",
            from: fromUser,
            timestamp: entry.timestamp,
            body: entry.body,
            chatType,
            senderLabel: entry.sender,
            envelope: envelopeOptions,
          }),
      });

      recordPendingHistoryEntry({
        historyMap: sessionHistories,
        historyKey: canonicalSessionKey,
        entry: {
          sender: fromUser,
          body: messageText,
          timestamp: Date.now(),
          messageId: `wecom-${Date.now()}`,
        },
        limit: DEFAULT_HISTORY_LIMIT,
      });

      const ctxPayload = {
        Body: body,
        RawBody: content || messageText || "",
        From: `wecom:${fromUser}`,
        To: `wecom:${fromUser}`,
        SessionKey: canonicalSessionKey,
        AccountId: resolvedAccountId,
        ChatType: "direct",
        ConversationLabel: fromUser,
        SenderName: fromUser,
        SenderId: fromUser,
        Provider: "wecom",
        Surface: "wecom",
        MessageSid: `wecom-${Date.now()}`,
        Timestamp: Date.now(),
        OriginatingChannel: "wecom",
        OriginatingTo: `wecom:${fromUser}`,
        CommandAuthorized: true,
      };

      await runtime.channel.session.recordInboundSession({
        storePath,
        sessionKey: canonicalSessionKey,
        ctx: ctxPayload,
        updateLastRoute: {
          sessionKey: canonicalSessionKey,
          channel: "wecom",
          to: fromUser,
          accountId: resolvedAccountId,
        },
        onRecordError: (err) => {
          api.logger.warn?.(`wecom: failed to record session: ${err}`);
        },
      });
      api.logger.info?.(`wecom: session registered for ${canonicalSessionKey}`);

      runtime.channel.activity.record({
        channel: "wecom",
        accountId: resolvedAccountId,
        direction: "inbound",
      });

      const inboundRunId = `wecom-inbound-${Date.now()}`;
      broadcastToChatUI({
        sessionKey: canonicalSessionKey,
        role: "user",
        text: messageText,
        runId: inboundRunId,
        state: "final",
      });

      api.logger.info?.(`wecom: dispatching message via agent runtime for session ${canonicalSessionKey}`);

      const chunkMode = runtime.channel.text.resolveChunkMode(cfg, "wecom", resolvedAccountId);
      const tableMode = runtime.channel.text.resolveMarkdownTableMode({
        cfg,
        channel: "wecom",
        accountId: resolvedAccountId,
      });

      try {
        const outboundRunId = `wecom-outbound-${Date.now()}`;
        await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
          ctx: ctxPayload,
          cfg,
          dispatcherOptions: {
            deliver: async (payload, info) => {
              const rawReplyText = typeof payload.text === "string" ? payload.text : "";
              const { mediaUrl, textWithoutHint } = extractMediaHint(rawReplyText, payload.mediaUrl);

              api.logger.info?.(
                `wecom: delivering ${info.kind} reply, textLength=${rawReplyText.length}, mediaUrl=${mediaUrl || "none"}`
              );

              const textToSend = textWithoutHint || "";
              const formattedReply = textToSend ? markdownToWecomText(textToSend) : "";

              const sendResult = await sendInterface.sendMediaAndText({
                corpId,
                corpSecret,
                agentId,
                toUser: fromUser,
                mediaUrl,
                text: formattedReply,
                logger: api.logger,
                mediaFailTextFallback: mediaUrl ? `[文件: ${mediaUrl}]` : "",
              });
              const mediaSent = sendResult.mediaSent;
              const finalBroadcastText = rawReplyText || formattedReply || (mediaUrl && !mediaSent ? `[文件: ${mediaUrl}]` : "");

              if (formattedReply) {
                api.logger.info?.(`wecom: sent AI reply to ${fromUser}: ${formattedReply.slice(0, 50)}...`);
              }

              if (finalBroadcastText || mediaSent) {
                broadcastToChatUI({
                  sessionKey: canonicalSessionKey,
                  role: "assistant",
                  text: finalBroadcastText,
                  runId: outboundRunId,
                  state: info.kind === "final" ? "final" : "streaming",
                });
              }

              if (info.kind === "final") {
                clearHistoryEntriesIfEnabled({
                  historyMap: sessionHistories,
                  historyKey: canonicalSessionKey,
                  limit: DEFAULT_HISTORY_LIMIT,
                });
              }
            },
            onError: (err, info) => {
              api.logger.error?.(`wecom: ${info.kind} reply failed: ${String(err)}`);
              clearHistoryEntriesIfEnabled({
                historyMap: sessionHistories,
                historyKey: canonicalSessionKey,
                limit: DEFAULT_HISTORY_LIMIT,
              });
            },
          },
          replyOptions: {
            disableBlockStreaming: true,
          },
        });
      } finally {
        if (imageTempPath) {
          unlink(imageTempPath).catch(() => {});
        }
      }
    } catch (err) {
      api.logger.error?.(`wecom: failed to process message: ${err.message}`);
      api.logger.error?.(`wecom: stack trace: ${err.stack}`);

      try {
        await sendWecomText({
          corpId,
          corpSecret,
          agentId,
          toUser: fromUser,
          text: `抱歉，处理您的消息时出现错误，请稍后重试。\n错误: ${err.message?.slice(0, 100) || "未知错误"}`,
          logger: api.logger,
        });
      } catch (sendErr) {
        api.logger.error?.(`wecom: failed to send error message: ${sendErr.message}`);
        api.logger.error?.(`wecom: send error stack: ${sendErr.stack}`);
        api.logger.error?.(`wecom: original error was: ${err.message}`);
      }
    }
  };
}
