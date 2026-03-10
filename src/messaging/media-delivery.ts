// @ts-nocheck

export function createSendWecomMediaByUrl({
  fetchMediaFromUrl,
  resolveWecomMediaType,
  uploadWecomMedia,
  sendWecomImage,
  sendWecomVideo,
  sendWecomFile,
  sendWecomVoice,
  execFileAsync,
  tmpdir,
  join,
  mkdir,
  writeFile,
  readFile,
  unlink,
}) {
  return async function sendWecomMediaByUrl({ mediaUrl, corpId, corpSecret, agentId, toUser, logger }) {
    if (!mediaUrl) return false;

    logger?.info?.(`wecom: preparing media send, to=${toUser}, source=${mediaUrl}`);

    const { buffer, contentType } = await fetchMediaFromUrl(mediaUrl);
    const { type, filename } = resolveWecomMediaType(mediaUrl);

    logger?.info?.(
      `wecom: media source loaded, type=${type}, filename=${filename}, bytes=${buffer?.length || 0}, contentType=${contentType || "unknown"}`
    );

    let uploadBuffer = buffer;
    let uploadFilename = filename;
    let uploadContentType = contentType;

    if (type === "voice" && !String(filename || "").toLowerCase().endsWith(".amr")) {
      const tempDir = join(tmpdir(), "openclaw-wecom");
      await mkdir(tempDir, { recursive: true });

      const ts = Date.now();
      const ext = filename?.includes(".") ? filename.split(".").pop() : "wav";
      const srcPath = join(tempDir, `voice-src-${ts}.${ext || "wav"}`);
      const amrPath = join(tempDir, `voice-${ts}.amr`);

      try {
        await writeFile(srcPath, buffer);
        await execFileAsync("ffmpeg", ["-y", "-i", srcPath, "-ar", "8000", "-ac", "1", amrPath], {
          timeout: 30000,
        });
        uploadBuffer = await readFile(amrPath);
        const baseName = (filename || `voice-${ts}`).replace(/\.[^.]+$/, "");
        uploadFilename = `${baseName}.amr`;
        uploadContentType = "audio/amr";
        logger?.info?.(`wecom: converted voice file to AMR (${uploadFilename}) before upload`);
      } finally {
        unlink(srcPath).catch(() => {});
        unlink(amrPath).catch(() => {});
      }
    }

    logger?.info?.(
      `wecom: uploading media, type=${type}, filename=${uploadFilename}, bytes=${uploadBuffer?.length || 0}, contentType=${uploadContentType || "unknown"}`
    );

    const mediaId = await uploadWecomMedia({
      corpId,
      corpSecret,
      type,
      buffer: uploadBuffer,
      filename: uploadFilename,
      contentType: uploadContentType,
    });

    logger?.info?.(`wecom: media uploaded, mediaId=${mediaId}, type=${type}, to=${toUser}`);

    if (type === "image") {
      await sendWecomImage({ corpId, corpSecret, agentId, toUser, mediaId });
    } else if (type === "video") {
      await sendWecomVideo({ corpId, corpSecret, agentId, toUser, mediaId });
    } else if (type === "voice") {
      await sendWecomVoice({ corpId, corpSecret, agentId, toUser, mediaId });
    } else {
      await sendWecomFile({ corpId, corpSecret, agentId, toUser, mediaId });
    }

    logger?.info?.(`wecom: sent media from ${mediaUrl} as ${type}, to=${toUser}`);
    return true;
  };
}
