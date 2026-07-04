export interface WeatherLookupArgs {
  location: string;
  date?: string;
}

export interface WeatherHourlyPoint {
  time: string;
  temperature: number;
  conditionCode: number;
  condition: string;
  precipitationProbability: number;
}

export interface WeatherDailyPoint {
  date: string;
  tempMax: number;
  tempMin: number;
  conditionCode: number;
  condition: string;
  precipitationProbability: number;
}

export interface WeatherLookupResult {
  location: string;
  date: string;
  isSpecifiedDay: boolean;
  temperature: number;
  apparentTemperature: number;
  condition: string;
  conditionCode: number;
  humidity: number;
  windSpeed: number;
  windDirection?: number;
  precipitation: number;
  uvIndex?: number;
  cloudCover?: number;
  pressure?: number;
  sunrise?: string;
  sunset?: string;
  clothingIndex: string;
  hourly: WeatherHourlyPoint[];
  daily: WeatherDailyPoint[];
}

interface GeoResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface WeatherApiResult {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    surface_pressure?: number;
    cloud_cover?: number;
    is_day?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
}

export async function lookupWeather(
  args: WeatherLookupArgs
): Promise<WeatherLookupResult> {
  const location = args.location.trim();
  if (!location) throw new Error("缺少城市或地点");

  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", location);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) throw new Error("天气位置查询失败");
  const geoJson = (await geoRes.json()) as { results?: GeoResult[] };
  const geo = geoJson.results?.[0];
  if (!geo) throw new Error(`未找到地点：${location}`);

  const rawDate = args.date?.trim();
  const date = normalizeDate(rawDate);
  if (rawDate && !date) throw new Error(`日期格式无效：${rawDate}（需 YYYY-MM-DD）`);

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(geo.latitude));
  weatherUrl.searchParams.set("longitude", String(geo.longitude));
  weatherUrl.searchParams.set("timezone", "auto");
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,is_day"
  );
  weatherUrl.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,weather_code"
  );
  weatherUrl.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max"
  );

  if (date) {
    weatherUrl.searchParams.set("start_date", date);
    weatherUrl.searchParams.set("end_date", date);
    weatherUrl.searchParams.set("forecast_days", "1");
  } else {
    weatherUrl.searchParams.set("forecast_days", "15");
  }

  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) throw new Error("天气查询失败");
  const weather = (await weatherRes.json()) as WeatherApiResult;
  const name = [geo.name, geo.country].filter(Boolean).join("，");
  return buildResult(name, date, weather);
}

function buildResult(
  location: string,
  date: string | null,
  weather: WeatherApiResult
): WeatherLookupResult {
  const isSpecifiedDay = !!date;
  const targetDate = date ?? todayLocal();
  const cur = weather.current ?? {};
  const curCode = cur.weather_code ?? 0;
  const curTemp = round(cur.temperature_2m);
  const curApparent = round(cur.apparent_temperature ?? cur.temperature_2m);

  const dayCode = weather.daily?.weather_code?.[0];
  const dayMax = round(weather.daily?.temperature_2m_max?.[0]);
  const dayMin = round(weather.daily?.temperature_2m_min?.[0]);
  const dayAvg = dayMax != null && dayMin != null ? (dayMax + dayMin) / 2 : curApparent;

  const hourly = buildHourly(weather.hourly, isSpecifiedDay);
  const daily = buildDaily(weather.daily);

  const clothingTemp = isSpecifiedDay ? dayAvg : curApparent;

  return {
    location,
    date: targetDate,
    isSpecifiedDay,
    temperature: isSpecifiedDay ? (dayMax ?? 0) : (curTemp ?? 0),
    apparentTemperature: isSpecifiedDay ? (dayMax ?? 0) : (curApparent ?? 0),
    condition: describeWeather(isSpecifiedDay ? dayCode : curCode),
    conditionCode: (isSpecifiedDay ? dayCode : curCode) ?? 0,
    humidity: isSpecifiedDay ? 0 : cur.relative_humidity_2m ?? 0,
    windSpeed: isSpecifiedDay ? 0 : Math.round(cur.wind_speed_10m ?? 0),
    windDirection: isSpecifiedDay ? undefined : cur.wind_direction_10m,
    precipitation: isSpecifiedDay ? 0 : cur.precipitation ?? 0,
    uvIndex: weather.daily?.uv_index_max?.[0],
    cloudCover: cur.cloud_cover,
    pressure: cur.surface_pressure,
    sunrise: weather.daily?.sunrise?.[0]?.slice(11) || undefined,
    sunset: weather.daily?.sunset?.[0]?.slice(11) || undefined,
    clothingIndex: getClothingAdvice(clothingTemp ?? 20),
    hourly,
    daily,
  };
}

function buildHourly(
  hourly: WeatherApiResult["hourly"],
  isSpecifiedDay: boolean
): WeatherHourlyPoint[] {
  if (!hourly?.time?.length) return [];
  const times = hourly.time;
  const temps = hourly.temperature_2m ?? [];
  const codes = hourly.weather_code ?? [];
  const pops = hourly.precipitation_probability ?? [];

  const now = Date.now();
  const out: WeatherHourlyPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const ts = new Date(t).getTime();
    if (!isSpecifiedDay && ts < now - 60 * 60 * 1000) continue;
    const hh = new Date(t).getHours();
    out.push({
      time: `${String(hh).padStart(2, "0")}:00`,
      temperature: round(temps[i]) ?? 0,
      conditionCode: codes[i] ?? 0,
      condition: describeWeather(codes[i]),
      precipitationProbability: pops[i] ?? 0,
    });
    if (out.length >= 24) break;
  }
  return out;
}

function buildDaily(daily: WeatherApiResult["daily"]): WeatherDailyPoint[] {
  if (!daily?.time?.length) return [];
  const times = daily.time;
  const maxes = daily.temperature_2m_max ?? [];
  const mins = daily.temperature_2m_min ?? [];
  const codes = daily.weather_code ?? [];
  const pops = daily.precipitation_probability_max ?? [];
  const out: WeatherDailyPoint[] = [];
  for (let i = 0; i < times.length; i++) {
    out.push({
      date: times[i],
      tempMax: round(maxes[i]) ?? 0,
      tempMin: round(mins[i]) ?? 0,
      conditionCode: codes[i] ?? 0,
      condition: describeWeather(codes[i]),
      precipitationProbability: pops[i] ?? 0,
    });
  }
  return out;
}

function round(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.round(value);
}

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, y, m, d] = matched;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    dt.getFullYear() !== Number(y) ||
    dt.getMonth() + 1 !== Number(m) ||
    dt.getDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function describeWeather(code?: number): string {
  if (code == null) return "未知";
  if (code === 0) return "晴";
  if ([1].includes(code)) return "晴间多云";
  if ([2].includes(code)) return "多云";
  if ([3].includes(code)) return "阴";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55].includes(code)) return "毛毛雨";
  if ([56, 57].includes(code)) return "冻毛毛雨";
  if ([61].includes(code)) return "小雨";
  if ([63].includes(code)) return "中雨";
  if ([65].includes(code)) return "大雨";
  if ([66, 67].includes(code)) return "冻雨";
  if ([71].includes(code)) return "小雪";
  if ([73].includes(code)) return "中雪";
  if ([75].includes(code)) return "大雪";
  if ([77].includes(code)) return "米雪";
  if ([80, 81].includes(code)) return "阵雨";
  if ([82].includes(code)) return "强阵雨";
  if ([85, 86].includes(code)) return "阵雪";
  if ([95].includes(code)) return "雷暴";
  if ([96, 99].includes(code)) return "雷暴伴冰雹";
  return "未知";
}

export function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if ([1].includes(code)) return isDay ? "🌤️" : "🌙";
  if ([2].includes(code)) return "⛅";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([66, 67].includes(code)) return "🌧️❄️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

export function getClothingAdvice(temp: number): string {
  if (temp < -5) return "严寒，穿羽绒服 + 保暖内衣 + 围巾手套，注意防寒";
  if (temp < 5) return "寒冷，穿羽绒服或厚棉衣 + 毛衣";
  if (temp < 10) return "偏冷，穿大衣 / 厚外套 + 毛衣";
  if (temp < 15) return "凉爽，穿风衣 / 薄外套 + 长袖";
  if (temp < 20) return "舒适偏凉，穿长袖衬衫 + 薄外套";
  if (temp < 25) return "舒适，穿长袖或短袖 + 薄外套备用";
  if (temp < 30) return "温暖，穿短袖 / 薄长袖";
  if (temp < 35) return "炎热，穿短袖短裤，注意防晒补水";
  return "酷热，穿透气凉爽衣物，避免长时间户外活动";
}
