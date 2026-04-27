export type UserAgentInfo = {
  browser: string;
  os: string;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
};

function detectBrowser(ua: string): string {
  if (!ua) return "Unknown";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/SamsungBrowser\//i.test(ua)) return "Samsung Internet";
  return "Other";
}

function detectOs(ua: string): string {
  if (!ua) return "Unknown";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function detectDeviceType(ua: string): UserAgentInfo["deviceType"] {
  if (!ua) return "unknown";
  if (/bot|crawler|spider|crawling/i.test(ua)) return "bot";
  if (/iPad|Tablet|Tab/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export function parseUserAgent(ua: string): UserAgentInfo {
  return {
    browser: detectBrowser(ua),
    os: detectOs(ua),
    deviceType: detectDeviceType(ua),
  };
}
