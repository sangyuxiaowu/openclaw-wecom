// @ts-nocheck
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

export async function fetchMediaFromUrl(url) {
  if (url.startsWith("/") || url.startsWith("~")) {
    const filePath = url.startsWith("~") ? url.replace("~", homedir()) : url;
    const buffer = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      amr: "audio/amr",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      md: "text/markdown",
      txt: "text/plain",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";
    return { buffer, contentType };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch media from URL: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}

export function resolveWecomMediaType(mediaUrl) {
  const filename = mediaUrl.split("/").pop() || "file";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
  const videoExts = ["mp4", "mov", "avi"];
  const voiceExts = ["amr", "mp3", "wav"];
  if (imageExts.includes(ext)) return { type: "image", filename };
  if (videoExts.includes(ext)) return { type: "video", filename };
  if (voiceExts.includes(ext)) return { type: "voice", filename };
  return { type: "file", filename };
}
