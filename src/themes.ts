export interface ThemePalette {
  key: string;
  name: string;
  swatch: string;
  brandRgb: Record<number, string>;
}

export const THEMES: ThemePalette[] = [
  {
    key: "teal",
    name: "薄荷青",
    swatch: "#0d9488",
    brandRgb: {
      50: "240 253 250",
      100: "204 251 241",
      200: "153 246 228",
      300: "94 234 212",
      400: "45 212 191",
      500: "20 184 166",
      600: "13 148 136",
      700: "15 118 110",
      800: "17 94 89",
      900: "19 78 74",
    },
  },
  {
    key: "ocean",
    name: "深海蓝",
    swatch: "#0369a1",
    brandRgb: {
      50: "240 249 255",
      100: "224 242 254",
      200: "186 230 253",
      300: "125 211 252",
      400: "56 189 248",
      500: "14 165 233",
      600: "2 132 207",
      700: "3 105 161",
      800: "7 89 133",
      900: "12 74 110",
    },
  },
  {
    key: "forest",
    name: "森林绿",
    swatch: "#15803d",
    brandRgb: {
      50: "240 253 244",
      100: "220 252 231",
      200: "187 247 208",
      300: "134 239 172",
      400: "74 222 128",
      500: "34 197 94",
      600: "22 163 74",
      700: "21 128 61",
      800: "22 101 52",
      900: "20 83 45",
    },
  },
  {
    key: "sunset",
    name: "暖橙",
    swatch: "#ea580c",
    brandRgb: {
      50: "255 247 237",
      100: "255 237 213",
      200: "254 215 170",
      300: "253 186 116",
      400: "251 146 60",
      500: "249 115 22",
      600: "234 88 12",
      700: "194 65 12",
      800: "154 52 18",
      900: "124 45 18",
    },
  },
];

export const DEFAULT_THEME_KEY = "teal";

export function getTheme(key: string): ThemePalette {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}
