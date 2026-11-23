# Vestmarka skianlegg – weather vs yr.no

Live comparison of the Ecowitt weather station at Vestmarka skianlegg (read from
[webkamera.jardar.no](https://webkamera.jardar.no/)) against the
[yr.no forecast for Vestmarksetra](https://www.yr.no/nb/detaljer/tabell/1-73018/),
with a bias-corrected local forecast and psychrometric wet-bulb temperatures
(snowmaking-relevant).

The station exposes no history, so a collector samples it periodically and the
history accumulates in [`data/`](data/):

- `data/station.jsonl` – raw station samples for the last 30 days (older samples are dropped)
- `data/yr_hourly.json` – latest yr.no forecast per hour (kept 30 days)
- `data/learned.json` – fixed-size (~5 KB) long-term memory of the bias model: hours older than
  a week are folded in once a day as exponentially decayed statistics (180-day half-life), so
  the correction keeps converging without storing history
- `data/yr_latest.json` – most recent full forecast + daily outlook

The dashboard ([`index.html`](index.html)) is fully static: it fetches those files
and computes all statistics and corrections in the browser. It also has a **snowmaking
panel**: classifies each forecast hour by wet bulb (marginal / good / excellent), shows the
best production windows for the next 72 h and the relative gun capacity. These are
rule-of-thumb estimates; tune the `SNOW` constants in `index.html` (wet bulb limits, capacity
curve) to your own guns.

## JSON API (for other dashboards)

Static JSON, updated by the collector, served with CORS enabled on GitHub Pages
(`https://<user>.github.io/<repo>/api/v1/...`):

- [`api/v1/latest.json`](api/v1/latest.json) – latest station observation (`observed_at` in ISO UTC,
  metric units, wet bulb included) plus yr.no's current-hour values
- [`api/v1/observations.json`](api/v1/observations.json) – hourly means for the last 7 days

Units are listed in each file under `units`. Please credit the sources listed under `sources`
and poll no more often than every 5–10 minutes. The raw files in `data/` are also public
but their format may change; `api/v1` is the stable contract.

## Hosted on GitHub (free)

1. Create a **public** GitHub repository and push this folder to it.
2. **Actions** tab → enable workflows, then run **Collect weather data** manually
   once (it also runs on a schedule, about every 15 minutes).
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)`.
4. The dashboard is then live at `https://<user>.github.io/<repo>/`.

## Run locally

```
git pull
npm start
```

Serves the dashboard on <http://localhost:3000> from the local `data/` files, read-only.
The data is collected by the GitHub workflow, so `git pull` first to get the latest, and
never commit `data/` or `api/` from a local machine. To collect locally instead (for
example without GitHub), start with `COLLECT=1 npm start`. (`--use-system-ca` is used so
Node trusts the corporate/system certificate store on Windows.)

## Data sources and attribution

- Station: Ecowitt weather station at Vestmarka skianlegg, via webkamera.jardar.no (Jardar IL)
- Forecast: [MET Norway](https://www.met.no/) / [yr.no](https://www.yr.no/) (CC BY 4.0)
