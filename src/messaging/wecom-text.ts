// @ts-nocheck
const WECOM_TEXT_BYTE_LIMIT = 2000;

export function markdownToWecomText(markdown) {
  if (!markdown) return markdown;

  let text = markdown;
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.trim().split("\n").map(line => "  " + line).join("\n");
    return lang ? `[${lang}]\n${lines}` : lines;
  });

  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^### (.+)$/gm, "▸ $1");
  text = text.replace(/^## (.+)$/gm, "■ $1");
  text = text.replace(/^# (.+)$/gm, "◆ $1");
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/___([^_]+)___/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  text = text.replace(/^[\*\-] /gm, "• ");
  text = text.replace(/^[-*_]{3,}$/gm, "────────────");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[图片: $1]");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

export function getByteLength(str) {
  return Buffer.byteLength(str, "utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitWecomText(text, byteLimit = WECOM_TEXT_BYTE_LIMIT) {
  if (getByteLength(text) <= byteLimit) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (getByteLength(remaining) <= byteLimit) {
      chunks.push(remaining);
      break;
    }

    let low = 1;
    let high = remaining.length;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (getByteLength(remaining.slice(0, mid)) <= byteLimit) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    let splitIndex = low;

    const searchStart = Math.max(0, splitIndex - 200);
    const searchText = remaining.slice(searchStart, splitIndex);

    let naturalBreak = searchText.lastIndexOf("\n\n");
    if (naturalBreak === -1) {
      naturalBreak = searchText.lastIndexOf("\n");
    }
    if (naturalBreak === -1) {
      naturalBreak = searchText.lastIndexOf("。");
      if (naturalBreak !== -1) naturalBreak += 1;
    }
    if (naturalBreak !== -1 && naturalBreak > 0) {
      splitIndex = searchStart + naturalBreak;
    }

    if (splitIndex <= 0) {
      splitIndex = Math.min(remaining.length, Math.floor(byteLimit / 3));
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks.filter(c => c.length > 0);
}
