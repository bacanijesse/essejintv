# Project Documentation

## Setup Instructions
1. Clone the repository using `git clone https://github.com/bacanijesse/essejintv.git`
2. Navigate to the project directory: `cd essejintv`
3. Install the required dependencies: `npm install`
4. Run the application: `npm start`

## How to Add Rides
1. Open the application.
2. Navigate to the 'Add Ride' section.
3. Fill in the details such as ride name, type, duration, and other necessary fields.
4. Click on the 'Submit' button to save the ride.

## Customization Guide
- To customize the ride details or settings, access the configuration files located in the `config/` directory.
- Modify the parameters in the `settings.json` or equivalent configuration file as needed.

## Future Roadmap
- Implement user authentication system.
- Add a feature for ride reviews and ratings.
- Create an improved UI/UX design based on user feedback.
- Explore integration with external ride management services.

## Latest Updates
- Added a cycling summary graph with selectable periods: Weekly, Monthly, Half-Yearly, and Yearly.
- Linked top country filters (All, Taiwan, Philippines) to both cards and summary graph output.
- Added interactive metric legend toggles (Elevation, Speed, Heart Rate) for the summary graph and ride modal.
- Added ride details modal with combined metrics chart and embedded Leaflet map route preview.
- Added automatic country detection (Taiwan/Philippines) from GPX coordinates during ride load.
- Updated ride naming to display GPX filename (without `.gpx`) in cards and modal titles.

## Supported Activity Formats
The app now supports these ride file formats:
- GPX (`.gpx`)
- TCX (`.tcx`)
- KML (`.kml`)
- FIT (`.fit`)
- CSV (`.csv`)

You can point a ride to an activity file using any of these fields (first non-empty value is used):
- `dataFile`
- `activityFile`
- `file`
- `gpxFile` (backward compatible)

### Example Ride Entries
```json
[
	{
		"id": 101,
		"title": "Taipei River Loop",
		"date": "2026-02-19",
		"distance": 42.7,
		"elevation": 220,
		"country": "Taiwan",
		"dataFile": "rides/taipei_loop.tcx"
	},
	{
		"id": 102,
		"title": "City Endurance",
		"date": "2026-02-20",
		"distance": 65.1,
		"elevation": 410,
		"country": "Philippines",
		"file": "rides/city_endurance.fit"
	},
	{
		"id": 103,
		"title": "Weekend Recovery",
		"date": "2026-02-21",
		"distance": 30.4,
		"elevation": 95,
		"activityFile": "rides/weekend_recovery.csv"
	}
]
```

### CSV Header Guide
Use a header row and at least latitude + longitude. These are recognized:
- Latitude: `lat`, `latitude`
- Longitude: `lon`, `lng`, `longitude`
- Elevation: `ele`, `elevation`, `altitude`
- Time: `time`, `timestamp`, `datetime`
- Speed: `speed`, `speedKmh`, `speedKph` (or meters/sec if header includes `m/s`)
- Heart rate: `hr`, `heartRate`
- Temperature: `temp`, `temperature`, `atemp`

Minimum CSV example:
```csv
time,lat,lon,elevation,speed,hr,temp
2026-02-19T06:00:00Z,25.0478,121.5319,12,18.5,142,29.3
2026-02-19T06:00:05Z,25.0480,121.5322,12.4,19.1,145,29.2
```