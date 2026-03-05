// @ts-nocheck
import { existsSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

let gatewayBroadcastCtx = null;

export function setGatewayBroadcastContext(ctx) {
  gatewayBroadcastCtx = ctx;
}

export async function writeToTranscript({ sessionKey, role, text, logger }) {
  try {
    const stateDir = process.env.CLAWDBOT_STATE_DIR || join(homedir(), ".openclaw");
    const sessionsDir = join(stateDir, "agents", "main", "sessions");
    const sessionsJsonPath = join(sessionsDir, "sessions.json");

    if (!existsSync(sessionsJsonPath)) {
      logger?.warn?.("wecom: sessions.json not found");
      return;
    }

    const { readFileSync } = await import("node:fs");
    const sessionsData = JSON.parse(readFileSync(sessionsJsonPath, "utf8"));
    const sessionEntry = sessionsData[sessionKey] || sessionsData[sessionKey.toLowerCase()];

    if (!sessionEntry?.sessionId) {
      logger?.warn?.(`wecom: session entry not found for ${sessionKey}`);
      return;
    }

    const transcriptPath = sessionEntry.sessionFile || join(sessionsDir, `${sessionEntry.sessionId}.jsonl`);

    const now = Date.now();
    const messageId = randomUUID().slice(0, 8);

    const transcriptEntry = {
      type: "message",
      id: messageId,
      timestamp: new Date(now).toISOString(),
      message: {
        role,
        content: [{ type: "text", text }],
        timestamp: now,
        stopReason: role === "assistant" ? "end_turn" : undefined,
        usage: role === "assistant" ? { input: 0, output: 0, totalTokens: 0 } : undefined,
      },
    };

    appendFileSync(transcriptPath, `${JSON.stringify(transcriptEntry)}\n`, "utf-8");
    logger?.info?.(`wecom: wrote ${role} message to transcript`);
  } catch (err) {
    logger?.warn?.(`wecom: failed to write transcript: ${err.message}`);
  }
}

export function broadcastToChatUI({ sessionKey, role, text, runId, state }) {
  if (!gatewayBroadcastCtx) {
    return;
  }

  try {
    const chatPayload = {
      runId: runId || `wecom-${Date.now()}`,
      sessionKey,
      seq: 0,
      state: state || "final",
      message: {
        role: role || "user",
        content: [{ type: "text", text: text || "" }],
        timestamp: Date.now(),
      },
    };

    gatewayBroadcastCtx.broadcast("chat", chatPayload);
    gatewayBroadcastCtx.bridgeSendToSession(sessionKey, "chat", chatPayload);
  } catch (_err) {
    // ignore broadcast errors
  }
}
