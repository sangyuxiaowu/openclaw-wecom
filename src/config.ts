// @ts-nocheck

export function createWecomConfigService({ requireEnv, asNumber, getRuntimeConfig }) {
  const defaultAccountId = "default";

  function pickConfiguredValue(...values) {
    for (const value of values) {
      if (value != null && value !== "") {
        return value;
      }
    }
    return null;
  }

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

    return {
      corpId: pickConfiguredValue(channelConfig.corpId),
      corpSecret: pickConfiguredValue(channelConfig.corpSecret),
      agentId: asNumber(pickConfiguredValue(channelConfig.agentId)),
      callbackToken: channelConfig.callbackToken,
      callbackAesKey: channelConfig.callbackAesKey,
      webhookPath: channelConfig.webhookPath || "/wecom/callback",
      proxyMode: pickConfiguredValue(channelConfig.proxyMode),
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
    let proxyMode = envVars.WECOM_PROXY_MODE;
    let proxyUrl = envVars.WECOM_PROXY_URL || envVars.WECOM_PROXY || envVars.HTTPS_PROXY;
    let historyLimit = envVars.WECOM_HISTORY_LIMIT;

    if (!corpId) corpId = requireEnv("WECOM_CORP_ID");
    if (!corpSecret) corpSecret = requireEnv("WECOM_CORP_SECRET");
    if (!agentId) agentId = requireEnv("WECOM_AGENT_ID");
    if (!callbackToken) callbackToken = requireEnv("WECOM_CALLBACK_TOKEN");
    if (!callbackAesKey) callbackAesKey = requireEnv("WECOM_CALLBACK_AES_KEY");
    if (!proxyMode) proxyMode = requireEnv("WECOM_PROXY_MODE");
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
      proxyMode,
      proxyUrl,
      historyLimit: asNumber(historyLimit),
      enabled: true,
    };
  }

  function getWecomConfig(api, accountId = null) {
    const cfg = resolveRuntimeConfig(api);
    const channelConfig = resolveChannelConfig(cfg);
    const baseResolved = resolveBaseConfig(channelConfig);
    const envResolved = resolveEnvConfig(cfg);

    const corpId = pickConfiguredValue(baseResolved?.corpId, envResolved?.corpId);
    const corpSecret = pickConfiguredValue(baseResolved?.corpSecret, envResolved?.corpSecret);
    const agentId = asNumber(pickConfiguredValue(baseResolved?.agentId, envResolved?.agentId));

    if (!corpId || !corpSecret || !agentId) {
      return null;
    }

    return {
      accountId: defaultAccountId,
      corpId,
      corpSecret,
      agentId,
      callbackToken: pickConfiguredValue(baseResolved?.callbackToken, envResolved?.callbackToken),
      callbackAesKey: pickConfiguredValue(baseResolved?.callbackAesKey, envResolved?.callbackAesKey),
      webhookPath: pickConfiguredValue(baseResolved?.webhookPath, envResolved?.webhookPath, "/wecom/callback"),
      proxyMode: pickConfiguredValue(baseResolved?.proxyMode, envResolved?.proxyMode, "forward"),
      proxyUrl: pickConfiguredValue(baseResolved?.proxyUrl, envResolved?.proxyUrl),
      historyLimit: asNumber(pickConfiguredValue(baseResolved?.historyLimit, envResolved?.historyLimit)),
      enabled: baseResolved?.enabled !== false,
      name: pickConfiguredValue(baseResolved?.name),
    };
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
