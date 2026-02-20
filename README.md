# essejintv Cycling Site

Static cycling showcase site with GPX-driven ride cards, summary charts, and map/graph ride modal.

## Run Locally
1. Clone this repository.
2. Open the project folder.
3. Serve it with a static server, for example:

```bash
python3 -m http.server 5500
```

4. Open `http://localhost:5500`.

## How Ride Cards Are Created

### Primary Source: `gpx/` Auto-Discovery
- The app auto-discovers rides from folders inside `gpx/`.
- Folder name format must match:

`MM_DD_YYYY_HH_MM`

Example:

`gpx/02_20_2026_14_30/activity_123456789.gpx`

- One folder becomes one ride card.
- The page auto-refreshes discovery every ~12 seconds, so newly added folders appear automatically without manual reload.

### Fallback Source: `data/rides.json`
- If folder listing is unavailable in your host/browser environment, the app falls back to `data/rides.json`.

## Country Separation
- Country is detected from GPX route coordinates.
- Cards are automatically grouped by country filters (`All`, `Taiwan`, `Philippines`).
- Summary graph also follows the selected country.

## Main Features
- Cycling summary graph with periods: `Weekly`, `Monthly`, `Half-Yearly`, `Yearly`.
- Summary chart lines use continuous per-ride min/max trend behavior.
- Ride modal layout order: `Map -> Graph -> Metric Buttons`.
- Ride map uses Leaflet and OpenStreetMap tiles.
- Donation and Privacy sections included in top navigation.
- Testimonials support message + name + social icon links.

## Performance Notes
- Summary rendering uses cache for faster repeated views.
- Ride metrics are cached and pre-warmed in idle time for quicker card modal open.
- Map container shows loading skeleton while tiles/route initialize.
- Parallax background image is local (`assets/images/bg.webp`) and preloaded.

## Current Data Format Notes
- Runtime parsing is GPX-focused for speed and consistency.
- For custom fallback cards in `data/rides.json`, use `gpxFile` for each ride.

## Project Structure
```
index.html
assets/
  css/styles.css
  js/main.js
  images/
data/
  rides.json
gpx/
  MM_DD_YYYY_HH_MM/
    *.gpx
```

## Release Note
- Version: `1.0.0`
- Last documented update: `2026-02-20`