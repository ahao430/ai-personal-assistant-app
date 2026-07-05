export interface LocatedCity {
  city: string;
  detail: string;
  latitude: number;
  longitude: number;
  source?: "gps" | "ip";
}

export type SystemPlatform = "mac" | "win" | "linux" | "other";

export function detectPlatform(): SystemPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  if (ua.includes("linux")) return "linux";
  return "other";
}

export function locationSettingsUrl(platform: SystemPlatform): string | null {
  switch (platform) {
    case "mac":
      return "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices";
    case "win":
      return "ms-settings:privacy-location";
    default:
      return null;
  }
}

export async function openLocationSettings(): Promise<boolean> {
  const url = locationSettingsUrl(detectPlatform());
  if (!url) return false;
  try {
    const mod = await import("@tauri-apps/plugin-opener");
    if (typeof mod.openUrl === "function") {
      await mod.openUrl(url);
      return true;
    }
  } catch {
    // fallthrough
  }
  window.open(url, "_blank");
  return true;
}

interface ReverseGeoResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  localityInfo?: {
    administrative?: Array<{ name?: string }>;
  };
}

export async function reverseGeocode(lat: number, lon: number): Promise<LocatedCity> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("localityLanguage", "zh");
  const res = await fetch(url);
  if (!res.ok) throw new Error("反查城市失败");
  const j = (await res.json()) as ReverseGeoResult;
  const city = j.city || j.locality || j.principalSubdivision || j.countryName || "当前位置";
  const detail = [j.principalSubdivision, j.countryName].filter(Boolean).join(" · ");
  return { city, detail, latitude: lat, longitude: lon, source: "gps" };
}

interface IpGeoResult {
  city?: string;
  region?: string;
  country_name?: string;
  latitude?: number;
  longitude?: number;
  error?: boolean;
  reason?: string;
}

/** IP 兜底定位：精度城市级，对天气足够；无需任何权限，Android WebView 走不通 GPS 时用 */
export async function ipLocate(): Promise<LocatedCity> {
  const res = await fetch("https://ipapi.co/json/");
  if (!res.ok) throw new Error(`IP 定位失败 (HTTP ${res.status})`);
  const j = (await res.json()) as IpGeoResult;
  if (j.error) throw new Error(`IP 定位失败：${j.reason || "未知原因"}`);
  if (typeof j.latitude !== "number" || typeof j.longitude !== "number") {
    throw new Error("IP 定位无经纬度返回");
  }
  const city = j.city || j.region || "当前位置";
  const detail = [j.region, j.country_name].filter(Boolean).join(" · ");
  return { city, detail, latitude: j.latitude, longitude: j.longitude, source: "ip" };
}

export function queryCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("当前环境不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "定位权限被拒绝，请在系统设置中允许";
    case err.POSITION_UNAVAILABLE:
      return "暂时无法获取位置";
    case err.TIMEOUT:
      return "定位超时";
    default:
      return err.message || "定位失败";
  }
}
