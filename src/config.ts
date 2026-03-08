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

  function normalizeAccountId(accountId) {
    const normalized = String(accountId || "").trim();
    return normalized || defaultAccountId;
  }

  function resolveAccountsConfig(channelConfig) {
    const accounts = channelConfig?.accounts;
    if (!accounts || typeof accounts !== "object") {
      return null;
    }
    return accounts;
  }

  function listConfiguredAccountIds(channelConfig) {
    const accounts = resolveAccountsConfig(channelConfig);
    if (!accounts) {
      return [];
    }
    return Object.keys(accounts)
      .map((accountId) => normalizeAccountId(accountId))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  function resolveDefaultConfiguredAccountId(channelConfig) {
    const configuredAccountIds = listConfiguredAccountIds(channelConfig);
    if (configuredAccountIds.length === 0) {
      return defaultAccountId;
    }

    const preferred = String(channelConfig?.defaultAccount || "").trim();
    if (preferred && configuredAccountIds.includes(preferred)) {
      return preferred;
    }

    return configuredAccountIds[0];
  }

  function resolveRequestedAccountId(channelConfig, accountId) {
    const configuredAccountIds = listConfiguredAccountIds(channelConfig);
    if (configuredAccountIds.length === 0) {
      return defaultAccountId;
    }

    const requested = String(accountId || "").trim();
    if (requested && configuredAccountIds.includes(requested)) {
      return requested;
    }

    return resolveDefaultConfiguredAccountId(channelConfig);
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

  function resolveAccountOverrideConfig(channelConfig, accountId) {
    const accounts = resolveAccountsConfig(channelConfig);
    if (!accounts) {
      return null;
    }

    const resolvedAccountId = resolveRequestedAccountId(channelConfig, accountId);
    const accountConfig = accounts?.[resolvedAccountId];
    if (!accountConfig || typeof accountConfig !== "object") {
      return null;
    }

    return resolveBaseConfig(accountConfig);
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
    const resolvedAccountId = resolveRequestedAccountId(channelConfig, accountId);
    const rootResolved = resolveBaseConfig(channelConfig);
    const accountResolved = resolveAccountOverrideConfig(channelConfig, resolvedAccountId);
    const hasConfiguredAccounts = listConfiguredAccountIds(channelConfig).length > 0;
    const envResolved = hasConfiguredAccounts ? null : resolveEnvConfig(cfg);

    const corpId = pickConfiguredValue(accountResolved?.corpId, rootResolved?.corpId, envResolved?.corpId);
    const corpSecret = pickConfiguredValue(accountResolved?.corpSecret, rootResolved?.corpSecret, envResolved?.corpSecret);
    const agentId = asNumber(
      pickConfiguredValue(accountResolved?.agentId, rootResolved?.agentId, envResolved?.agentId)
    );

    if (!corpId || !corpSecret || !agentId) {
      return null;
    }

    return {
      accountId: resolvedAccountId,
      corpId,
      corpSecret,
      agentId,
      callbackToken: pickConfiguredValue(
        accountResolved?.callbackToken,
        rootResolved?.callbackToken,
        envResolved?.callbackToken
      ),
      callbackAesKey: pickConfiguredValue(
        accountResolved?.callbackAesKey,
        rootResolved?.callbackAesKey,
        envResolved?.callbackAesKey
      ),
      webhookPath: pickConfiguredValue(
        accountResolved?.webhookPath,
        rootResolved?.webhookPath,
        envResolved?.webhookPath,
        "/wecom/callback"
      ),
      proxyMode: pickConfiguredValue(accountResolved?.proxyMode, rootResolved?.proxyMode, envResolved?.proxyMode, "forward"),
      proxyUrl: pickConfiguredValue(accountResolved?.proxyUrl, rootResolved?.proxyUrl, envResolved?.proxyUrl),
      historyLimit: asNumber(
        pickConfiguredValue(accountResolved?.historyLimit, rootResolved?.historyLimit, envResolved?.historyLimit)
      ),
      enabled: rootResolved?.enabled !== false && accountResolved?.enabled !== false,
      name: pickConfiguredValue(accountResolved?.name, rootResolved?.name),
    };
  }

  function listWecomAccountIds(api) {
    const cfg = resolveRuntimeConfig(api);
    const channelConfig = resolveChannelConfig(cfg);
    const configuredAccountIds = listConfiguredAccountIds(channelConfig);
    if (configuredAccountIds.length > 0) {
      return configuredAccountIds;
    }

    const config = getWecomConfig(api, defaultAccountId);
    return config ? [defaultAccountId] : [];
  }

  return {
    getWecomConfig,
    listWecomAccountIds,
  };
}
