import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import registerChannel from "./channel.ts";

export function registerWecom(api: OpenClawPluginApi): void {
  registerChannel(api);
}
