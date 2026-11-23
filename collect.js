'use strict';
// One-shot collector: samples the Jardar station and refreshes the yr.no forecast,
// persisting everything under data/. Used by GitHub Actions (run directly) and by
// server.js (imported, run on an interval).
const fs = require('fs');
const path = require('path');

const UA = 'WetbulbDashboard/1.0 (github; personal weather comparison)';
const STATION_URL = 'https://webkamera.jardar.no/weather.php';
const YR_BASE = 'https://www.yr.no/api/v0/locations/1-73018';
const YR_REFRESH_MS = 14 * 60 * 1000;
const KEEP_DAYS = 60;
const HOUR = 3600e3;

const DATA_DIR = path.join(__dirname, 'data');
const STATION_FILE = path.join(DATA_DIR, 'station.jsonl');
const YR_HOURLY_FILE = path.join(DATA_DIR, 'yr_hourly.json');
const YR_LATEST_FILE = path.join(DATA_DIR, 'yr_latest.json');

const f2c = f => (f - 32) * 5 / 9;
const mph2ms = m => m * 0.44704;
const inhg2hpa = i => i * 33.8639;
const in2mm = i => i * 25.4;
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// Psychrometric wet bulb (water basis), Arden Buck es, bisection. See index.html for the
// identical client-side implementation used for display.
const ELEVATION_M = 234;
const DEFAULT_P = 1013.25 * Math.pow(1 - 0.0065 * ELEVATION_M / 288.15, 5.255);
const buckEs = T => 6.1121 * Math.exp((18.678 - T / 234.5) * T / (257.14 + T));
function wetBulb(T, RH, pHpa) {
  if (T == null || RH == null || !Number.isFinite(T) || !Number.isFinite(RH)) return null;
  RH = Math.min(100, Math.max(1, RH));
  const p = Number.isFinite(pHpa) && pHpa > 500 ? pHpa : DEFAULT_P;
  const e = (RH / 100) * buckEs(T);
  const g = Tw => buckEs(Tw) - 6.60e-4 * (1 + 0.00115 * Tw) * p * (T - Tw) - e;
  let lo = T - 60, hi = T;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (g(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
function wetBulbStull(T, RH) {
  if (T == null || RH == null || !Number.isFinite(T) || !Number.isFinite(RH)) return null;
  RH = Math.min(100, Math.max(1, RH));
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}
function stationPressure(slpHpa, T) {
  if (slpHpa == null || !Number.isFinite(slpHpa)) return null;
  const TK = (Number.isFinite(T) ? T : 0) + 273.15;
  return slpHpa * Math.pow(1 - 0.0065 * ELEVATION_M / (TK + 0.0065 * ELEVATION_M), 5.257);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function lastStationTime() {
  try {
    const txt = fs.readFileSync(STATION_FILE, 'utf8').trimEnd();
    const nl = txt.lastIndexOf('\n');
    return JSON.parse(txt.slice(nl + 1)).t;
  } catch { return 0; }
}

async function sampleStation() {
  const json = await getJson(STATION_URL);
  const d = json.data;
  const num = x => parseFloat(x.value);
  const t = Number(d.outdoor.temperature.time) * 1000;
  if (t === lastStationTime()) { console.log('station: no new reading'); return null; }
  const temp = f2c(num(d.outdoor.temperature));
  const hum = num(d.outdoor.humidity);
  const pressAbs = inhg2hpa(num(d.pressure.absolute));
  const s = {
    t,
    temp: round(temp, 2),
    hum,
    dew: round(f2c(num(d.outdoor.dew_point)), 2),
    feels: round(f2c(num(d.outdoor.feels_like)), 2),
    wb: round(wetBulb(temp, hum, pressAbs), 2),
    wbStull: round(wetBulbStull(temp, hum), 2),
    wind: round(mph2ms(num(d.wind.wind_speed)), 2),
    gust: round(mph2ms(num(d.wind.wind_gust)), 2),
    dir: num(d.wind.wind_direction),
    press: round(inhg2hpa(num(d.pressure.relative)), 1),
    pressAbs: round(pressAbs, 1),
    rain: round(in2mm(num(d.rainfall.daily)), 1),
    rainRate: round(in2mm(num(d.rainfall.rain_rate)), 1),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(STATION_FILE, JSON.stringify(s) + '\n');
  console.log('station:', s.temp + '°C', 'RH', s.hum, 'wb', s.wb);
  return s;
}

function normYr(iv) {
  const T = iv.temperature && iv.temperature.value;
  const RH = iv.humidity && iv.humidity.value;
  const slp = iv.pressure && iv.pressure.value;
  return {
    temp: T, hum: RH, dew: iv.dewPoint && iv.dewPoint.value,
    wind: iv.wind && iv.wind.speed, gust: iv.wind && iv.wind.gust, dir: iv.wind && iv.wind.direction,
    press: slp, precip: iv.precipitation && iv.precipitation.value,
    cloud: iv.cloudCover && iv.cloudCover.value, feels: iv.feelsLike && iv.feelsLike.value,
    wb: round(wetBulb(T, RH, stationPressure(slp, T)), 2),
    symbol: iv.symbolCode && (iv.symbolCode.next1Hour || iv.symbolCode.next6Hours),
  };
}

async function refreshYr(force) {
  const prevLatest = readJson(YR_LATEST_FILE, null);
  if (!force && prevLatest && Date.now() - prevLatest.fetchedAt < YR_REFRESH_MS) { console.log('yr: still fresh'); return null; }
  const yrHourly = readJson(YR_HOURLY_FILE, {});
  const [fc, ch] = await Promise.all([getJson(YR_BASE + '/forecast'), getJson(YR_BASE + '/forecast/currenthour')]);
  const issued = Date.parse(fc.created);
  const short = fc.shortIntervals || [];
  const lastShortStart = short.length ? Date.parse(short[short.length - 1].start) : 0;

  for (const iv of short) yrHourly[Date.parse(iv.start)] = { ...normYr(iv), issued };
  for (const iv of fc.longIntervals || []) {
    const s = Date.parse(iv.start);
    if (s > lastShortStart) yrHourly[s] = { ...normYr(iv), issued, coarse: true };
  }
  // The current hour is no longer part of shortIntervals; keep yr's own value for it.
  const curHour = Math.floor(Date.now() / HOUR) * HOUR;
  const prev = yrHourly[curHour];
  if (!prev || prev.issued < issued) {
    const base = prev || (short.length ? normYr(short[0]) : {});
    yrHourly[curHour] = {
      ...base, issued, temp: ch.temperature.value, feels: ch.temperature.feelsLike,
      wind: ch.wind.speed, gust: ch.wind.gust, dir: ch.wind.direction, precip: ch.precipitation.value,
      wb: round(wetBulb(ch.temperature.value, base.hum == null ? null : base.hum, stationPressure(base.press, ch.temperature.value)), 2),
      symbol: ch.symbolCode && ch.symbolCode.next1Hour,
    };
  }
  const cutoff = Date.now() - KEEP_DAYS * 24 * HOUR;
  for (const k of Object.keys(yrHourly)) if (Number(k) < cutoff) delete yrHourly[k];

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(YR_HOURLY_FILE, JSON.stringify(yrHourly));
  fs.writeFileSync(YR_LATEST_FILE, JSON.stringify({ fetchedAt: Date.now(), created: issued, days: fc.dayIntervals || [], current: ch }));
  console.log('yr: forecast issued', fc.created, 'now', ch.temperature.value + '°C');
  return issued;
}

async function tick() {
  const results = await Promise.allSettled([sampleStation(), refreshYr(false)]);
  let failed = false;
  for (const r of results) if (r.status === 'rejected') { failed = true; console.error(r.reason.message); }
  return !failed;
}

module.exports = { tick, sampleStation, refreshYr, DATA_DIR };

if (require.main === module) {
  tick().then(ok => process.exit(ok ? 0 : 1));
}
