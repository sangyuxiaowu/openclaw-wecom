// @ts-nocheck
import { wecomFetch } from "./fetch.ts";

const WECOM_API_BASE = "https://qyapi.weixin.qq.com";

export async function fetchAccessToken({ corpId, corpSecret }) {
  const tokenUrl = `${WECOM_API_BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`;
  const tokenRes = await wecomFetch(tokenUrl);
  const tokenJson = await tokenRes.json();
  if (!tokenJson?.access_token) {
    throw new Error(`WeCom gettoken failed: ${JSON.stringify(tokenJson)}`);
  }
  return tokenJson;
}

export async function sendApiMessage({ accessToken, body, errorPrefix }) {
  const sendUrl = `${WECOM_API_BASE}/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`;
  const sendRes = await wecomFetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const sendJson = await sendRes.json();
  if (sendJson?.errcode !== 0) {
    throw new Error(
      `${errorPrefix}: errcode=${sendJson?.errcode}, errmsg=${sendJson?.errmsg || "unknown"}, payload=${JSON.stringify({
        touser: body?.touser,
        msgtype: body?.msgtype,
        agentid: body?.agentid,
      })}`
    );
  }
  return sendJson;
}

export async function uploadApiMedia({ accessToken, type, buffer, filename, contentType }) {
  const uploadUrl = `${WECOM_API_BASE}/cgi-bin/media/upload?access_token=${encodeURIComponent(accessToken)}&type=${encodeURIComponent(type)}`;

  const boundary = "----WecomMediaUpload" + Date.now();
  const normalizedContentType = contentType || "application/octet-stream";
  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${filename}"; filelength=${buffer.length}\r\n` +
      `Content-Type: ${normalizedContentType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const reqBody = Buffer.concat([header, buffer, footer]);

  const res = await wecomFetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: reqBody,
  });

  const json = await res.json();
  if (json.errcode !== 0) {
    throw new Error(
      `WeCom media upload failed: errcode=${json?.errcode}, errmsg=${json?.errmsg || "unknown"}, type=${type}, filename=${filename}, bytes=${buffer?.length || 0}, contentType=${normalizedContentType}`
    );
  }

  return json;
}

export async function downloadApiMedia({ accessToken, mediaId }) {
  const mediaUrl = `${WECOM_API_BASE}/cgi-bin/media/get?access_token=${encodeURIComponent(accessToken)}&media_id=${encodeURIComponent(mediaId)}`;

  const res = await wecomFetch(mediaUrl);
  if (!res.ok) {
    throw new Error(`Failed to download media: status=${res.status}, mediaId=${mediaId}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    throw new Error(
      `WeCom media download failed: errcode=${json?.errcode}, errmsg=${json?.errmsg || "unknown"}, mediaId=${mediaId}`
    );
  }

  const buffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(buffer),
    contentType,
  };
}
