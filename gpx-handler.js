// gpx-handler.js

// Function to parse GPX files
function parseGPX(gpxData) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxData, "application/xml");

    const tracks = [];
    const trackSegments = xmlDoc.getElementsByTagName("trkseg");

    for (let i = 0; i < trackSegments.length; i++) {
        const points = trackSegments[i].getElementsByTagName("trkpt");
        const trackPoints = [];

        for (let j = 0; j < points.length; j++) {
            const lat = points[j].getAttribute("lat");
            const lon = points[j].getAttribute("lon");
            trackPoints.push([parseFloat(lat), parseFloat(lon)]);
        }

        tracks.push(trackPoints);
    }

    return tracks;
}

// Function to display routes on a Leaflet map
function displayRoutesOnMap(routes, map) {
    routes.forEach(track => {
        const polyline = L.polyline(track, {color: 'blue'});
        polyline.addTo(map);
    });
}

// Example usage:
// const gpxData = '<your GPX data here>'; // Load your GPX data
// const routes = parseGPX(gpxData);
// const map = L.map('map').setView([0, 0], 2); // Initialize the Leaflet map
// displayRoutesOnMap(routes, map);
