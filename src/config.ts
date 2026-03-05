// @ts-nocheck

export function createWecomConfigService({ requireEnv, asNumber, getRuntimeConfig }) {
  const defaultAccountId = "default";

  function resolveRuntimeConfig(api) {
    return api?.config ?? getRuntimeConfig?.() ?? {};
  }

  function resolveChannelConfig(cfg) {
    return cfg?.channels?.wecom ?? null;
  }

  function resolveBaseConfig(channelConfig) {
    if (!channelConfig || typeof channelConfig !== "object") {
      return null;
    }

    const corpId = channelConfig.corpId;
    const corpSecret = channelConfig.corpSecret;
    const agentId = channelConfig.agentId;
    if (!corpId || !corpSecret || !agentId) {
      return null;
    }

    return {
      corpId,
      corpSecret,
      agentId: asNumber(agentId),
      callbackToken: channelConfig.callbackToken,
      callbackAesKey: channelConfig.callbackAesKey,
      webhookPath: channelConfig.webhookPath || "/wecom/callback",
      proxyUrl: channelConfig.proxyUrl,
      historyLimit: asNumber(channelConfig.historyLimit),
      enabled: channelConfig.enabled !== false,
      name: channelConfig.name,
    };
  }

  function resolveEnvConfig(cfg) {
    const envVars = cfg?.env?.vars ?? {};
    let corpId = envVars.WECOM_CORP_ID;
    let corpSecret = envVars.WECOM_CORP_SECRET;
    let agentId = envVars.WECOM_AGENT_ID;
    let callbackToken = envVars.WECOM_CALLBACK_TOKEN;
    let callbackAesKey = envVars.WECOM_CALLBACK_AES_KEY;
    let webhookPath = envVars.WECOM_WEBHOOK_PATH || "/wecom/callback";
    let proxyUrl = envVars.WECOM_PROXY_URL || envVars.WECOM_PROXY || envVars.HTTPS_PROXY;
    let historyLimit = envVars.WECOM_HISTORY_LIMIT;

    if (!corpId) corpId = requireEnv("WECOM_CORP_ID");
    if (!corpSecret) corpSecret = requireEnv("WECOM_CORP_SECRET");
    if (!agentId) agentId = requireEnv("WECOM_AGENT_ID");
    if (!callbackToken) callbackToken = requireEnv("WECOM_CALLBACK_TOKEN");
    if (!callbackAesKey) callbackAesKey = requireEnv("WECOM_CALLBACK_AES_KEY");
    if (!proxyUrl) {
      proxyUrl = requireEnv("WECOM_PROXY_URL") || requireEnv("WECOM_PROXY") || requireEnv("HTTPS_PROXY");
    }
    if (!historyLimit) historyLimit = requireEnv("WECOM_HISTORY_LIMIT");

    if (!corpId || !corpSecret || !agentId) {
      return null;
    }

    return {
      accountId: defaultAccountId,
      corpId,
      corpSecret,
      agentId: asNumber(agentId),
      callbackToken,
      callbackAesKey,
      webhookPath,
      proxyUrl,
      historyLimit: asNumber(historyLimit),
      enabled: true,
    };
  }

  function getWecomConfig(api, accountId = null) {
    const cfg = resolveRuntimeConfig(api);
    const channelConfig = resolveChannelConfig(cfg);

    if (channelConfig) {
      const baseResolved = resolveBaseConfig(channelConfig);
      if (baseResolved) {
        return {
          accountId: defaultAccountId,
          ...baseResolved,
        };
      }
    }

    return resolveEnvConfig(cfg);
  }

  function listWecomAccountIds(api) {
    const config = getWecomConfig(api);
    return config ? [defaultAccountId] : [];
  }

  return {
    getWecomConfig,
    listWecomAccountIds,
  };
}
