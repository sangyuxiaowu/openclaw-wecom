// @ts-nocheck
import {
  buildBaseChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import { WecomChannelConfigSchema } from "./config-schema.ts";
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

  const normalizeAccountId = (accountId) => String(accountId || "").trim() || defaultAccountId;

  const resolveAccountsConfig = (cfg) => {
    const accounts = resolveRootConfig(cfg)?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return null;
    }
    return accounts;
  };

  const listConfiguredAccountIds = (cfg) => {
    const accounts = resolveAccountsConfig(cfg);
    if (!accounts) {
      return [];
    }
    return Object.keys(accounts)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  };

  const resolveDefaultConfiguredAccountId = (cfg) => {
    const root = resolveRootConfig(cfg);
    const configuredAccountIds = listConfiguredAccountIds(cfg);
    if (configuredAccountIds.length === 0) {
      return defaultAccountId;
    }

    const preferred = String(root?.defaultAccount || "").trim();
    if (preferred && configuredAccountIds.includes(preferred)) {
      return preferred;
    }

    return configuredAccountIds[0];
  };

  const resolveRequestedAccountId = (cfg, accountId) => {
    const configuredAccountIds = listConfiguredAccountIds(cfg);
    if (configuredAccountIds.length === 0) {
      return defaultAccountId;
    }

    const requested = String(accountId || "").trim();
    if (requested && configuredAccountIds.includes(requested)) {
      return requested;
    }

    return resolveDefaultConfiguredAccountId(cfg);
  };

  const pickConfiguredValue = (...values) => {
    for (const value of values) {
      if (value != null && value !== "") {
        return value;
      }
    }
    return null;
  };

  const resolveBaseAccountShape = (configLike) => {
    if (!configLike || typeof configLike !== "object") {
      return null;
    }

    return {
      enabled: configLike.enabled !== false,
      name: configLike.name,
      corpId: configLike.corpId,
      webhookPath: configLike.webhookPath || "/wecom/callback",
      proxyMode: configLike.proxyMode || "forward",
      proxyUrl: configLike.proxyUrl,
      historyLimit: configLike.historyLimit,
      callbackToken: configLike.callbackToken,
      callbackAesKey: configLike.callbackAesKey,
      agentId: configLike.agentId,
      corpSecret: configLike.corpSecret,
    };
  };

  const resolveAccountFromConfig = (cfg, accountId) => {
    const root = resolveRootConfig(cfg);
    const resolvedAccountId = resolveRequestedAccountId(cfg, accountId);
    const accountOverrides = resolveAccountsConfig(cfg)?.[resolvedAccountId];
    const rootResolved = resolveBaseAccountShape(root);
    const accountResolved = resolveBaseAccountShape(accountOverrides);
    const corpId = pickConfiguredValue(accountResolved?.corpId, rootResolved?.corpId);
    const corpSecret = pickConfiguredValue(accountResolved?.corpSecret, rootResolved?.corpSecret);
    const agentId = pickConfiguredValue(accountResolved?.agentId, rootResolved?.agentId);

    return {
      accountId: resolvedAccountId,
      enabled: rootResolved?.enabled !== false && accountResolved?.enabled !== false,
      configured: Boolean(corpId && corpSecret && agentId),
      name: pickConfiguredValue(accountResolved?.name, rootResolved?.name),
      corpId,
      webhookPath: pickConfiguredValue(accountResolved?.webhookPath, rootResolved?.webhookPath, "/wecom/callback"),
      proxyMode: pickConfiguredValue(accountResolved?.proxyMode, rootResolved?.proxyMode, "forward"),
      proxyUrl: pickConfiguredValue(accountResolved?.proxyUrl, rootResolved?.proxyUrl),
      historyLimit: pickConfiguredValue(accountResolved?.historyLimit, rootResolved?.historyLimit),
      callbackToken: pickConfiguredValue(accountResolved?.callbackToken, rootResolved?.callbackToken),
      callbackAesKey: pickConfiguredValue(accountResolved?.callbackAesKey, rootResolved?.callbackAesKey),
      agentId,
      corpSecret,
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
    configSchema: WecomChannelConfigSchema,
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
      listAccountIds: (cfg) => {
        const configuredAccountIds = listConfiguredAccountIds(cfg);
        if (configuredAccountIds.length > 0) {
          return configuredAccountIds;
        }
        return resolveRootConfig(cfg)?.corpId ? [defaultAccountId] : [];
      },
      resolveAccount: (cfg, accountId) => resolveAccountFromConfig(cfg, accountId),
      defaultAccountId: (cfg) => resolveDefaultConfiguredAccountId(cfg),
      setAccountEnabled: ({ cfg, accountId, enabled }) => {
        const normalizedAccountId = resolveRequestedAccountId(cfg, accountId);
        if (listConfiguredAccountIds(cfg).length > 0) {
          return {
            ...cfg,
            channels: {
              ...cfg.channels,
              wecom: {
                ...cfg.channels?.wecom,
                accounts: {
                  ...cfg.channels?.wecom?.accounts,
                  [normalizedAccountId]: {
                    ...cfg.channels?.wecom?.accounts?.[normalizedAccountId],
                    enabled,
                  },
                },
              },
            },
          };
        }

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
        const normalizedAccountId = resolveRequestedAccountId(cfg, accountId);
        if (listConfiguredAccountIds(cfg).length > 0) {
          const next = { ...cfg };
          const nextChannels = { ...(cfg.channels || {}) };
          const nextWecom = { ...(cfg.channels?.wecom || {}) };
          const nextAccounts = { ...(cfg.channels?.wecom?.accounts || {}) };
          delete nextAccounts[normalizedAccountId];
          if (Object.keys(nextAccounts).length > 0) {
            nextWecom.accounts = nextAccounts;
            if (nextWecom.defaultAccount === normalizedAccountId) {
              delete nextWecom.defaultAccount;
            }
            nextChannels.wecom = nextWecom;
            next.channels = nextChannels;
          } else {
            delete nextChannels.wecom;
            if (Object.keys(nextChannels).length > 0) {
              next.channels = nextChannels;
            } else {
              delete next.channels;
            }
          }
          return next;
        }

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
      resolveAccountId: ({ cfg }) => resolveDefaultConfiguredAccountId(cfg),
      applyAccountConfig: ({ cfg, accountId }) => {
        const normalizedAccountId = resolveRequestedAccountId(cfg, accountId);
        if (listConfiguredAccountIds(cfg).length > 0) {
          return {
            ...cfg,
            channels: {
              ...cfg.channels,
              wecom: {
                ...cfg.channels?.wecom,
                defaultAccount: normalizedAccountId,
                accounts: {
                  ...cfg.channels?.wecom?.accounts,
                  [normalizedAccountId]: {
                    ...cfg.channels?.wecom?.accounts?.[normalizedAccountId],
                    enabled: true,
                  },
                },
              },
            },
          };
        }

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
        await waitUntilAbort(ctx?.abortSignal);
      },
      stopAccount: async (ctx) => {
        const accountId = ctx?.accountId || defaultAccountId;
        ctx?.log?.info?.(`[${accountId}] wecom gateway account stopped`);
      },
    },
  };
}
