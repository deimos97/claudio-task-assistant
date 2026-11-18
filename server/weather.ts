// Tiempo con Open-Meteo (gratis, sin clave ni cuenta). Se pide como mucho cada 15 min.
// Lugar: CLAUDIO_LAT / CLAUDIO_LON / CLAUDIO_PLACE (por defecto, Madrid).
import { TZ } from './config.ts';

const LAT = Number(process.env.CLAUDIO_LAT ?? 40.4168);
const LON = Number(process.env.CLAUDIO_LON ?? -3.7038);
export const PLACE = process.env.CLAUDIO_PLACE ?? 'Madrid';
const TTL = 15 * 60_000;

// Códigos WMO → icono y texto
function describe(code: number, day = true): { icon: string; text: string } {
  if (code === 0) return { icon: day ? '☀️' : '🌙', text: 'despejado' };
  if (code <= 2) return { icon: day ? '🌤️' : '🌙', text: 'poco nuboso' };
  if (code === 3) return { icon: '☁️', text: 'nublado' };
  if (code <= 48) return { icon: '🌫️', text: 'niebla' };
  if (code <= 57) return { icon: '🌦️', text: 'llovizna' };
  if (code <= 67) return { icon: '🌧️', text: 'lluvia' };
  if (code <= 77) return { icon: '❄️', text: 'nieve' };
  if (code <= 82) return { icon: '🌧️', text: 'chubascos' };
  if (code <= 86) return { icon: '🌨️', text: 'chubascos de nieve' };
  return { icon: '⛈️', text: 'tormenta' };
}

type Day = { date: string; min: number; max: number; rain: number; icon: string; text: string };
export type Weather = { place: string; temp: number; icon: string; text: string; today: Day; tomorrow: Day; fetched: string };

let cache: { at: number; data: Weather } | null = null;
let inflight: Promise<Weather> | null = null;

async function fetchWeather(): Promise<Weather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(LAT), longitude: String(LON), timezone: TZ, forecast_days: '2',
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  const j = await res.json() as {
    current: { temperature_2m: number; weather_code: number; is_day: number };
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
  };
  const day = (i: number): Day => ({
    date: j.daily.time[i],
    min: Math.round(j.daily.temperature_2m_min[i]),
    max: Math.round(j.daily.temperature_2m_max[i]),
    rain: j.daily.precipitation_probability_max[i] ?? 0,
    ...describe(j.daily.weather_code[i]),
  });
  return {
    place: PLACE,
    temp: Math.round(j.current.temperature_2m),
    ...describe(j.current.weather_code, j.current.is_day === 1),
    today: day(0),
    tomorrow: day(1),
    fetched: new Date().toISOString(),
  };
}

/** El tiempo de ahora y de hoy/mañana; null si no hay red (se queda lo último que hubo). */
export async function weather(): Promise<Weather | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  inflight ??= fetchWeather().finally(() => { inflight = null; });
  try {
    const data = await inflight;
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error('tiempo:', e instanceof Error ? e.message : e);
    return cache?.data ?? null;
  }
}

/** Una línea para la agenda de Claudio. */
export function weatherText(w: Weather | null): string {
  if (!w) return 'Tiempo: no disponible.';
  const d = (x: Day) => `${x.text}, ${x.min}–${x.max} °C${x.rain >= 20 ? `, ${x.rain}% de lluvia` : ''}`;
  return `Tiempo en ${w.place}: ahora ${w.temp} °C y ${w.text}. Hoy ${d(w.today)}. Mañana ${d(w.tomorrow)}.`;
}
