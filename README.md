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