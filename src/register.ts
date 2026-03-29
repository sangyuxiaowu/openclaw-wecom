import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import registerChannel from "./channel.ts";

export function registerWecom(api: OpenClawPluginApi): void {
  registerChannel(api);
}
