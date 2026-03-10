// @ts-nocheck

export function createWecomSendInterface({ sendWecomText, sendMediaByUrl }) {
  async function sendText({ corpId, corpSecret, agentId, toUser, text, logger }) {
    if (!text) return;
    await sendWecomText({ corpId, corpSecret, agentId, toUser, text, logger });
  }

  async function sendMediaAndText({
    corpId,
    corpSecret,
    agentId,
    toUser,
    mediaUrl,
    text,
    logger,
    mediaFailTextFallback,
  }) {
    let mediaSent = false;
    let mediaError = null;

    if (mediaUrl) {
      try {
        mediaSent = await sendMediaByUrl({ mediaUrl, corpId, corpSecret, agentId, toUser, logger });
      } catch (err) {
        mediaError = err;
        const message = err?.message || String(err);
        logger?.warn?.(`wecom: failed to send media, to=${toUser}, source=${mediaUrl}, error=${message}`);
      }
    }

    const finalText = text || (!mediaSent && mediaUrl ? mediaFailTextFallback || "" : "");
    if (finalText) {
      await sendText({ corpId, corpSecret, agentId, toUser, text: finalText, logger });
    }

    return { mediaSent, mediaError, textSent: Boolean(finalText) };
  }

  return {
    sendText,
    sendMediaAndText,
  };
}
