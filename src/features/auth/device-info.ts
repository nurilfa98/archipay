// Membaca info perangkat & perkiraan lokasi login (BUSINESS-FLOW §2.1).
// Fungsi murni tanpa akses database, agar mudah diuji.
//
// - Perangkat: dari header User-Agent → "Chrome di Android", "Safari di
//   iPhone", "Edge di Windows". Model HP ikut ditampilkan bila ada ("Chrome di
//   Android (SM-A155F)"), tetapi Chrome modern menyembunyikannya (jadi "K"),
//   dan iPhone memang tidak pernah menyebut model. Ini perkiraan, bukan bukti.
// - Lokasi: dari header Vercel (x-vercel-ip-city & x-vercel-ip-country),
//   gratis dan tanpa panggilan API luar. Hanya tingkat KOTA dan berupa
//   PERKIRAAN dari IP: jaringan seluler sering terbaca di kota pusat operator.
//   Di localhost header ini tidak ada → lokasi null.

const UNKNOWN_DEVICE = "Perangkat tidak dikenal";

export function describeDevice(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").slice(0, 400);
  if (!ua) return UNKNOWN_DEVICE;

  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  if (!browser && !os) return UNKNOWN_DEVICE;
  if (!browser) return os!.name;
  if (!os) return browser;

  const model = os.model ? ` (${os.model})` : "";
  return `${browser} di ${os.name}${model}`;
}

function detectBrowser(ua: string): string | null {
  // Urutan penting: banyak browser memalsukan token "Chrome" / "Safari".
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\b/.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/\b(FBAN|FBAV)\b/.test(ua)) return "Facebook";
  if (/\bInstagram\b/.test(ua)) return "Instagram";
  if (/\bLine\//.test(ua)) return "LINE";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "Firefox";
  // WebView Android ("; wv)") = browser di dalam aplikasi lain, mis. WhatsApp.
  if (/; wv\)/.test(ua)) return "Browser dalam aplikasi";
  if (/\bCriOS\/|\bChrome\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua)) return "Safari";
  return null;
}

function detectOs(ua: string): { name: string; model?: string } | null {
  if (/\bAndroid\b/.test(ua)) {
    // Contoh: "Android 14; SM-A155F Build/..." atau "Android 10; K" (disamarkan).
    const model = ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/)?.[1]?.trim();
    const usable = model && model.length > 2 && !/^(K|Mobile|Android)$/i.test(model);
    return { name: "Android", model: usable ? model : undefined };
  }
  if (/\biPhone\b/.test(ua)) return { name: "iPhone" };
  if (/\biPad\b/.test(ua)) return { name: "iPad" };
  if (/\bWindows\b/.test(ua)) return { name: "Windows" };
  if (/\bCrOS\b/.test(ua)) return { name: "ChromeOS" };
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return { name: "macOS" };
  if (/\bLinux\b/.test(ua)) return { name: "Linux" };
  return null;
}

// Nama kota dari header Vercel ber-encode URL ("Jakarta", "S%C3%A3o%20Paulo").
export function describeLocation(city: string | null | undefined, countryCode: string | null | undefined) {
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value).trim();
    } catch {
      return value.trim();
    }
  };
  const cityName = city ? decode(city) : "";
  const country = countryCode ? countryName(countryCode.trim().toUpperCase()) : "";
  const label = [cityName, country].filter(Boolean).join(", ");
  return label ? label.slice(0, 100) : null;
}

function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  try {
    return new Intl.DisplayNames(["id"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// "budi@contoh.com" → "b***@contoh.com" (untuk email pemberitahuan).
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

// "6281234567890" → "62812****7890" (untuk email pemberitahuan).
export function maskPhone(phone: string) {
  if (phone.length <= 7) return "****";
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}
