// @ts-nocheck

export function createWecomInboundCommands({
  sendWecomText,
  PLUGIN_VERSION
}) {
  async function handleHelpCommand({ fromUser, corpId, corpSecret, agentId, sessionId }) {
    
    const historyKey = sessionId || `wecom:${fromUser}`.toLowerCase();
    const helpText = `🤖 AI 助手使用帮助

渠道：企业微信 (WeCom)
会话ID：${historyKey}
插件版本：${PLUGIN_VERSION}

可用命令：
/help - 显示此帮助信息
/new - 开始新对话
/status - 查看系统状态
/model - 模型管理
/compact - 压缩上下文
/commands - 列出可用命令

直接发送消息即可与 AI 对话。`;

    await sendWecomText({ corpId, corpSecret, agentId, toUser: fromUser, text: helpText });
    return true;
  }
  return {
    "/help": handleHelpCommand
  };
}