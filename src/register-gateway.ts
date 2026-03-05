// @ts-nocheck

export function registerWecomGatewayMethods({ api, setGatewayBroadcastContext }) {
  api.registerGatewayMethod("wecom.init", async (ctx, nodeId, params) => {
    setGatewayBroadcastContext(ctx);
    api.logger.info?.("wecom: gateway broadcast context captured");
    return { ok: true };
  });

  api.registerGatewayMethod("wecom.broadcast", async (ctx, nodeId, params) => {
    const { sessionKey, runId, message, state } = params || {};
    if (!sessionKey || !message) {
      return { ok: false, error: { message: "missing sessionKey or message" } };
    }

    const chatPayload = {
      runId: runId || `wecom-${Date.now()}`,
      sessionKey,
      seq: 0,
      state: state || "final",
      message: {
        role: message.role || "user",
        content: [{ type: "text", text: message.text || "" }],
        timestamp: Date.now(),
      },
    };

    ctx.broadcast("chat", chatPayload);
    ctx.bridgeSendToSession(sessionKey, "chat", chatPayload);

    setGatewayBroadcastContext(ctx);

    return { ok: true };
  });
}
