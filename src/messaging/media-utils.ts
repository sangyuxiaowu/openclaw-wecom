// @ts-nocheck
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

function isWindowsAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function isLikelyLocalPath(value) {
  return value.startsWith("/") || value.startsWith("~") || isWindowsAbsolutePath(value);
}

function resolveLocalPath(value) {
  if (value.startsWith("~")) {
    return value.replace("~", homedir());
  }
  return value;
}

function getFilenameFromSource(source) {
  try {
    const parsed = new URL(source);
    const pathname = decodeURIComponent(parsed.pathname || "");
    const fromPath = pathname.split("/").filter(Boolean).pop();
    return fromPath || "file";
  } catch {
    const normalized = source.replace(/\\/g, "/");
    return normalized.split("/").filter(Boolean).pop() || "file";
  }
}

function getExtensionFromFilename(filename) {
  const cleanName = filename.split("?")[0].split("#")[0];
  const idx = cleanName.lastIndexOf(".");
  if (idx < 0) return "";
  return cleanName.slice(idx + 1).toLowerCase();
}

export async function fetchMediaFromUrl(url) {
  if (isLikelyLocalPath(url)) {
    const filePath = resolveLocalPath(url);
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (err) {
      const platform = process.platform;
      const isUnixStyleAbsolute = filePath.startsWith("/");
      const windowsPathHint =
        platform === "win32" && isUnixStyleAbsolute
          ? " On Windows, please use paths like C:/path/to/file.png or C:\\\\path\\\\to\\\\file.png."
          : "";
      throw new Error(
        `Failed to read local media file: path=${filePath}, platform=${platform}, reason=${err?.message || String(err)}.${windowsPathHint}`
      );
    }
    const filename = getFilenameFromSource(filePath);
    const ext = getExtensionFromFilename(filename);
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
  const filename = getFilenameFromSource(mediaUrl);
  const ext = getExtensionFromFilename(filename);
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
  const videoExts = ["mp4", "mov", "avi"];
  const voiceExts = ["amr", "mp3", "wav"];
  if (imageExts.includes(ext)) return { type: "image", filename };
  if (videoExts.includes(ext)) return { type: "video", filename };
  if (voiceExts.includes(ext)) return { type: "voice", filename };
  return { type: "file", filename };
}
