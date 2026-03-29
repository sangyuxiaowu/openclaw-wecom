import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { registerWecom } from "./register.ts";

const plugin = {
  id: "wecom",
  name: "WeCom",
  description: "WeCom channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    registerWecom(api);
  },
};

export default plugin;
