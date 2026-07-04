export interface WeatherLookupArgs {
  location: string;
  date?: string;
}

export interface WeatherLookupResult {
  location: string;
  date: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
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
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    weather_code?: number[];
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

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(geo.latitude));
  weatherUrl.searchParams.set("longitude", String(geo.longitude));
  weatherUrl.searchParams.set("timezone", "auto");

  const date = args.date?.trim();
  if (date) {
    weatherUrl.searchParams.set("daily", "weather_code,temperature_2m_max");
    weatherUrl.searchParams.set("start_date", date);
    weatherUrl.searchParams.set("end_date", date);
  } else {
    weatherUrl.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code"
    );
  }

  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) throw new Error("天气查询失败");
  const weather = (await weatherRes.json()) as WeatherApiResult;
  const name = [geo.name, geo.country].filter(Boolean).join("，");

  if (date) {
    return {
      location: name,
      date,
      temperature: weather.daily?.temperature_2m_max?.[0] ?? 0,
      condition: describeWeather(weather.daily?.weather_code?.[0]),
      humidity: 0,
      windSpeed: 0,
    };
  }

  return {
    location: name,
    date: new Date().toISOString().slice(0, 10),
    temperature: weather.current?.temperature_2m ?? 0,
    condition: describeWeather(weather.current?.weather_code),
    humidity: weather.current?.relative_humidity_2m ?? 0,
    windSpeed: weather.current?.wind_speed_10m ?? 0,
  };
}

function describeWeather(code?: number): string {
  if (code == null) return "未知";
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷暴";
  return "未知";
}
