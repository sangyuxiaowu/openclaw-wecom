# WeCom 插件（OpenClaw）

企业微信（WeCom）自建应用渠道插件。

当前版本已对齐新版 OpenClaw 插件结构，支持：
- 单账号配置（`channels.wecom`）
- Webhook 入站 + API 出站
- 文本/图片/文件/视频/语音消息
- 语音文件自动转 `amr` 后发送
- 可配置代理模式（`proxyMode` / `WECOM_PROXY_MODE`）
- 可配置代理地址（`proxyUrl` / `WECOM_PROXY_URL`）
- 可配置历史上限（`historyLimit` / `WECOM_HISTORY_LIMIT`）

---

## 1. 目录结构（核心）

```text
src/
	channel.ts                   # 插件注册入口
	channel-runtime.ts           # 运行时组装
	inbound.ts                   # 入站编排（主流程）
	outbound.ts                  # 出站适配
	messaging/
		inbound-commands.ts        # /help
		media-utils.ts             # 媒体下载与类型识别
		media-delivery.ts          # 媒体上传/发送（含语音 amr 转码）
		send-interface.ts          # 统一发送接口（文本+媒体）
		wecom-crypto.ts            # 回调验签/解密
		wecom-xml.ts               # XML 解析
		wecom-text.ts              # 文本分段与 markdown 清洗
	wecom-api/
		fetch.ts                   # HTTP 请求（支持代理）
		client.ts                  # 企业微信 API 封装
		service.ts                 # token 缓存、发送服务
```

---

## 2. 配置

### 2.1 `clawdbot.json` 示例

```json
{
	"channels": {
		"wecom": {
			"enabled": true,
			"name": "wecom-main",
			"corpId": "wwxxxxxxxxxxxxxxxx",
			"corpSecret": "xxxxxxxxxxxxxxxxxxxxxxxx",
			"agentId": 1000002,
			"callbackToken": "callback-token",
			"callbackAesKey": "callback-aes-key",
			"webhookPath": "/wecom/callback",
			"proxyMode": "forward",
			"proxyUrl": "http://127.0.0.1:7890",
			"historyLimit": 20
		}
	}
}
```

### 2.2 环境变量（可选）

当未在 `channels.wecom` 中配置时，可通过环境变量注入：

- `WECOM_CORP_ID`
- `WECOM_CORP_SECRET`
- `WECOM_AGENT_ID`
- `WECOM_CALLBACK_TOKEN`
- `WECOM_CALLBACK_AES_KEY`
- `WECOM_WEBHOOK_PATH`（默认 `/wecom/callback`）
- `WECOM_PROXY_MODE`（`forward` 或 `reverse`，默认 `forward`）
- `WECOM_PROXY_URL`（兼容 `WECOM_PROXY` / `HTTPS_PROXY`）
- `WECOM_HISTORY_LIMIT`（默认 `20`）

### 2.3 代理模式说明

- `forward`：`proxyUrl` 填写标准正向代理地址，例如 `http://127.0.0.1:7890` 或 `https://proxy.example.com`。
- `reverse`：`proxyUrl` 填写反向代理基地址，例如 `https://proxy.example.com/proxy/`，插件会把企业微信 API 请求改写到该前缀下。

---

## 3. Webhook 与企业微信配置

在企业微信自建应用后台配置回调 URL：

`https://<your-domain><webhookPath>`

例如：

`https://bot.example.com/wecom/callback`

插件会进行：
- `GET` 验签 + `echostr` 解密回包
- `POST` 消息验签 + 解密 + 分发

---

## 4. 消息与媒体行为

### 4.1 文本
- 自动做 markdown 到企业微信文本格式的兼容转换。
- 超长文本会按字节分段发送。

### 4.2 媒体

- 支持图片、视频、语音、文件。
- 语音若不是 `.amr`，会先调用 `ffmpeg` 转码为 `8k/mono/amr` 再上传。

> 运行语音发送前请确保机器可执行 `ffmpeg`。
