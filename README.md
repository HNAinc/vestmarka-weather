# Vestmarka skianlegg – weather vs yr.no

Live comparison of the Ecowitt weather station at Vestmarka skianlegg (read from
[webkamera.jardar.no](https://webkamera.jardar.no/)) against the
[yr.no forecast for Vestmarksetra](https://www.yr.no/nb/detaljer/tabell/1-73018/),
with a bias-corrected local forecast and psychrometric wet-bulb temperatures
(snowmaking-relevant).

The station exposes no history, so a collector samples it periodically and the
history accumulates in [`data/`](data/):

- `data/station.jsonl` – one JSON line per station sample
- `data/yr_hourly.json` – latest yr.no forecast per hour (kept 60 days)
- `data/yr_latest.json` – most recent full forecast + daily outlook

The dashboard ([`index.html`](index.html)) is fully static: it fetches those files
and computes all statistics and corrections in the browser.

## Hosted on GitHub (free)

1. Create a **public** GitHub repository and push this folder to it.
2. **Actions** tab → enable workflows, then run **Collect weather data** manually
   once (it also runs on a schedule, roughly every 10–15 minutes).
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)`.
4. The dashboard is then live at `https://<user>.github.io/<repo>/`.

## Run locally

```
npm start
```

Serves the dashboard on <http://localhost:3000> and samples the station every
5 minutes while running. (`--use-system-ca` is used so Node trusts the
corporate/system certificate store on Windows.)

## Data sources and attribution

- Station: Ecowitt weather station at Vestmarka skianlegg, via webkamera.jardar.no (Jardar IL)
- Forecast: [MET Norway](https://www.met.no/) / [yr.no](https://www.yr.no/) (CC BY 4.0)
