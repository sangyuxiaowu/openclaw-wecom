declare module "openclaw/plugin-sdk" {
  export type OpenClawPluginApi = any;
  export function emptyPluginConfigSchema(): any;
  export function normalizePluginHttpPath(path?: string, fallback?: string): string | null;
  export function registerPluginHttpRoute(params: any): () => void;
  export function buildPendingHistoryContextFromMap(...args: any[]): any;
  export function recordPendingHistoryEntry(...args: any[]): any;
  export function clearHistoryEntriesIfEnabled(...args: any[]): void;
}
