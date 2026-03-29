// @ts-nocheck
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const WecomAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    corpId: z.string().optional(),
    corpSecret: z.string().optional(),
    agentId: z.number().int().min(1).optional(),
    callbackToken: z.string().optional(),
    callbackAesKey: z.string().optional(),
    webhookPath: z.string().optional(),
    proxyMode: z.enum(["forward", "reverse"]).optional(),
    proxyUrl: z.string().optional(),
    historyLimit: z.number().int().min(0).optional(),
  })
  .strict();

export const WecomConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultAccount: z.string().optional(),
    name: z.string().optional(),
    corpId: z.string().optional(),
    corpSecret: z.string().optional(),
    agentId: z.number().int().min(1).optional(),
    callbackToken: z.string().optional(),
    callbackAesKey: z.string().optional(),
    webhookPath: z.string().optional(),
    proxyMode: z.enum(["forward", "reverse"]).optional(),
    proxyUrl: z.string().optional(),
    historyLimit: z.number().int().min(0).optional(),
    accounts: z.record(z.string(), WecomAccountConfigSchema.optional()).optional(),
  })
  .strict();

export const wecomChannelConfigUiHints = {
  corpId: { label: "Corp ID" },
  corpSecret: { label: "Corp Secret", sensitive: true },
  agentId: { label: "Agent ID" },
  callbackToken: { label: "Callback Token", sensitive: true },
  callbackAesKey: { label: "Callback AES Key", sensitive: true },
  webhookPath: { label: "Webhook Path", placeholder: "/wecom/callback" },
  proxyMode: { label: "Proxy Mode" },
  proxyUrl: { label: "Proxy URL" },
  historyLimit: { label: "History Limit" },
  "accounts.*.corpId": { label: "Corp ID" },
  "accounts.*.corpSecret": { label: "Corp Secret", sensitive: true },
  "accounts.*.agentId": { label: "Agent ID" },
  "accounts.*.callbackToken": { label: "Callback Token", sensitive: true },
  "accounts.*.callbackAesKey": { label: "Callback AES Key", sensitive: true },
  "accounts.*.webhookPath": { label: "Webhook Path", placeholder: "/wecom/callback" },
  "accounts.*.proxyMode": { label: "Proxy Mode" },
  "accounts.*.proxyUrl": { label: "Proxy URL" },
  "accounts.*.historyLimit": { label: "History Limit" },
};

export const WecomChannelConfigSchema = buildChannelConfigSchema(WecomConfigSchema, {
  uiHints: wecomChannelConfigUiHints,
});