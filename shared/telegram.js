const reserved = new Set([
  "share",
  "login",
  "proxy",
  "socks",
  "c",
  "s",
  "iv",
  "addstickers",
  "addemoji",
  "setlanguage",
  "confirmphone",
  "joinchat",
  "boost",
]);
export function normalizeTelegramUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return "";
  if (text.length > 2048 || !/^https:\/\//i.test(text) || /[\s\\]/.test(text))
    return null;
  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      !["t.me", "telegram.me"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const path = url.pathname;
    const username = /^\/([A-Za-z][A-Za-z0-9_]{3,63})$/.exec(path);
    if (username && !reserved.has(username[1].toLowerCase()))
      return `https://t.me/${username[1]}`;
    if (
      /^\/\+[A-Za-z0-9_-]{8,128}$/.test(path) ||
      /^\/joinchat\/[A-Za-z0-9_-]{8,128}$/.test(path)
    )
      return `https://t.me${path}`;
    return null;
  } catch {
    return null;
  }
}
