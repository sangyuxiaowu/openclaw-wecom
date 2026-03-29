declare module "openclaw/plugin-sdk/core" {
  export type OpenClawPluginApi = any;
  export function emptyPluginConfigSchema(): any;
}

declare module "openclaw/plugin-sdk/status-helpers" {
  export function createDefaultChannelRuntimeState(accountId: string, extra?: any): any;
  export function buildBaseChannelStatusSummary(snapshot: any, extra?: any): any;
}

declare module "openclaw/plugin-sdk/reply-history" {
  export function buildPendingHistoryContextFromMap(...args: any[]): any;
  export function recordPendingHistoryEntry(...args: any[]): any;
  export function clearHistoryEntriesIfEnabled(...args: any[]): void;
}
