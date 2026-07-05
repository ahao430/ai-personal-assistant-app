import { defineStore } from "pinia";
import { ref } from "vue";
import { kvGetJson, kvSetJson, KV_KEYS } from "@/api/kv";
import { queryCurrentPosition, reverseGeocode, ipLocate, type LocatedCity } from "@/api/weather-location";

export type WeatherMode = "gps" | "manual";

export interface WeatherSettings {
  mode: WeatherMode;
  city: string;
  detail?: string;
  latitude?: number;
  longitude?: number;
  updatedAt?: number;
}

export const useWeatherSettingsStore = defineStore("weather-settings", () => {
  const mode = ref<WeatherMode>("manual");
  const city = ref<string>("");
  const detail = ref<string>("");
  const latitude = ref<number | undefined>();
  const longitude = ref<number | undefined>();
  const updatedAt = ref<number | undefined>();
  const locating = ref(false);

  async function load() {
    const s = await kvGetJson<WeatherSettings>(KV_KEYS.weather);
    if (!s) return;
    mode.value = s.mode ?? "manual";
    city.value = s.city ?? "";
    detail.value = s.detail ?? "";
    latitude.value = s.latitude;
    longitude.value = s.longitude;
    updatedAt.value = s.updatedAt;
  }

  async function saveManual(cityName: string) {
    const trimmed = cityName.trim();
    if (!trimmed) throw new Error("请输入城市名");
    mode.value = "manual";
    city.value = trimmed;
    detail.value = "";
    latitude.value = undefined;
    longitude.value = undefined;
    updatedAt.value = Date.now();
    await persist();
  }

  async function locate(): Promise<LocatedCity> {
    if (locating.value) throw new Error("正在定位");
    locating.value = true;
    try {
      let located: LocatedCity;
      try {
        // 先 GPS（桌面浏览器/有原生权限时正常）
        const pos = await queryCurrentPosition();
        located = await reverseGeocode(pos.latitude, pos.longitude);
      } catch {
        // GPS 失败/超时（Android WebView 常见）→ IP 兜底
        located = await ipLocate();
      }
      mode.value = "gps";
      city.value = located.city;
      detail.value = located.detail;
      latitude.value = located.latitude;
      longitude.value = located.longitude;
      updatedAt.value = Date.now();
      await persist();
      return located;
    } finally {
      locating.value = false;
    }
  }

  async function clear() {
    mode.value = "manual";
    city.value = "";
    detail.value = "";
    latitude.value = undefined;
    longitude.value = undefined;
    updatedAt.value = undefined;
    await persist();
  }

  async function persist() {
    const s: WeatherSettings = {
      mode: mode.value,
      city: city.value,
      detail: detail.value || undefined,
      latitude: latitude.value,
      longitude: longitude.value,
      updatedAt: updatedAt.value,
    };
    await kvSetJson(KV_KEYS.weather, s);
  }

  return {
    mode,
    city,
    detail,
    latitude,
    longitude,
    updatedAt,
    locating,
    load,
    saveManual,
    locate,
    clear,
  };
});
