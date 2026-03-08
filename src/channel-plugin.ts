// @ts-nocheck
import { buildBaseChannelStatusSummary, createDefaultChannelRuntimeState } from "openclaw/plugin-sdk";
import { configureWecomProxy } from "./wecom-api/fetch.ts";

export function createWecomChannelPlugin({ deliveryHandlers }) {
  const defaultAccountId = "default";

  function waitUntilAbort(signal) {
    return new Promise((resolve) => {
      if (!signal) return;
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  const resolveRootConfig = (cfg) => cfg?.channels?.wecom ?? null;

  const resolveAccountFromConfig = (cfg) => {
    const root = resolveRootConfig(cfg);
    return {
      accountId: defaultAccountId,
      enabled: root?.enabled !== false,
      configured: Boolean(root?.corpId && root?.corpSecret && root?.agentId),
      name: root?.name,
      corpId: root?.corpId,
      webhookPath: root?.webhookPath || "/wecom/callback",
      proxyMode: root?.proxyMode || "forward",
      proxyUrl: root?.proxyUrl,
      historyLimit: root?.historyLimit,
      callbackToken: root?.callbackToken,
      callbackAesKey: root?.callbackAesKey,
      agentId: root?.agentId,
      corpSecret: root?.corpSecret,
    };
  };

  return {
    id: "wecom",
    meta: {
      id: "wecom",
      label: "WeCom",
      selectionLabel: "WeCom (企业微信自建应用)",
      docsPath: "/channels/wecom",
      docsLabel: "wecom",
      blurb: "企业微信/WeCom enterprise messaging with doc/wiki tools.",
      aliases: ["wecom", "qyapi", "wework", "qiwei", "wxwork"],
      order: 60,
    },
    reload: { configPrefixes: ["channels.wecom"] },
    capabilities: {
      chatTypes: ["direct"],
      media: {
        inbound: true,
        outbound: true,
      },
      markdown: true,
    },
    configSchema: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          name: { type: "string" },
          corpId: { type: "string" },
          corpSecret: { type: "string" },
          agentId: { type: "integer", minimum: 1 },
          callbackToken: { type: "string" },
          callbackAesKey: { type: "string" },
          webhookPath: { type: "string" },
          proxyMode: { type: "string", enum: ["forward", "reverse"] },
          proxyUrl: { type: "string" },
          historyLimit: { type: "integer", minimum: 0 },
        },
      },
    },
    messaging: {
      targetResolver: {
        hint: "Use a WeCom UserId (e.g. ssq) or wecom:UserId",
        looksLikeId: (raw, normalized) => {
          if (!raw) return false;
          if (/^wecom:/i.test(raw)) return true;
          if (/^[a-zA-Z0-9_.-]+$/.test(raw)) return true;
          return false;
        },
      },
    },
    config: {
      listAccountIds: (cfg) => (resolveRootConfig(cfg)?.corpId ? [defaultAccountId] : []),
      resolveAccount: (cfg, accountId) => resolveAccountFromConfig(cfg, accountId),
      defaultAccountId: () => defaultAccountId,
      setAccountEnabled: ({ cfg, accountId, enabled }) => {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            wecom: {
              ...cfg.channels?.wecom,
              enabled,
            },
          },
        };
      },
      deleteAccount: ({ cfg, accountId }) => {
        const next = { ...cfg };
        const nextChannels = { ...(cfg.channels || {}) };
        delete nextChannels.wecom;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      },
      isConfigured: (account) => Boolean(account?.configured),
      describeAccount: (account) => ({
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        name: account.name,
        corpId: account.corpId,
        webhookPath: account.webhookPath,
        proxyMode: account.proxyMode,
        proxyUrl: account.proxyUrl,
        historyLimit: account.historyLimit,
      }),
    },
    setup: {
      resolveAccountId: () => defaultAccountId,
      applyAccountConfig: ({ cfg }) => {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            wecom: {
              ...cfg.channels?.wecom,
              enabled: true,
            },
          },
        };
      },
    },
    status: {
      defaultRuntime: createDefaultChannelRuntimeState(defaultAccountId, {
        mode: "webhook",
        webhookPath: "/wecom/callback",
      }),
      buildChannelSummary: ({ snapshot }) => ({
        ...buildBaseChannelStatusSummary(snapshot),
        mode: snapshot?.mode ?? "webhook",
        webhookPath: snapshot?.webhookPath ?? "/wecom/callback",
      }),
      buildAccountSnapshot: ({ account, runtime, probe }) => ({
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        name: account.name,
        corpId: account.corpId,
        webhookPath: account.webhookPath,
        mode: runtime?.mode ?? "webhook",
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? null,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      }),
    },
    outbound: deliveryHandlers.outbound,
    inbound: deliveryHandlers.inbound,
    gateway: {
      startAccount: async (ctx) => {
        const accountId = ctx?.accountId || defaultAccountId;
        const account = ctx?.account;
        const proxyConfigResult = configureWecomProxy({
          proxyMode: account?.proxyMode,
          proxyUrl: account?.proxyUrl,
        });

        if (proxyConfigResult?.ok && proxyConfigResult.proxyUrl) {
          ctx?.log?.info?.(
            `[${accountId}] wecom proxy configured (mode=${proxyConfigResult.proxyMode}, url=${proxyConfigResult.proxyUrl})`
          );
        } else if (proxyConfigResult?.ok === false) {
          ctx?.log?.warn?.(
            `[${accountId}] wecom invalid proxy config ignored (mode=${proxyConfigResult.proxyMode}, url=${account?.proxyUrl})`
          );
        }

        ctx?.setStatus?.({
          accountId,
          mode: "webhook",
          webhookPath: account?.webhookPath || "/wecom/callback",
          connected: null,
          lastError: null,
        });
        ctx?.log?.info?.(`[${accountId}] wecom gateway account started`);
        return waitUntilAbort(ctx?.abortSignal);
      },
      stopAccount: async (ctx) => {
        const accountId = ctx?.accountId || defaultAccountId;
        ctx?.log?.info?.(`[${accountId}] wecom gateway account stopped`);
      },
    },
  };
}
