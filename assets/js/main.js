document.addEventListener("DOMContentLoaded", function () {
  let allRides = [];
  let selectedCountry = "all";
  const activityMetricsCache = new Map();
  const activityMetricsPromiseCache = new Map();
  const mergedRideMetricsCache = new Map();
  const mergedRideMetricsPromiseCache = new Map();
  const summaryRenderCache = new Map();
  let metricsModal = null;
  let videoModal = null;

  const container = document.getElementById("rides-grid");
  const paginationContainer = document.getElementById("rides-pagination");
  const ridesPerPage = 9;
  let currentPage = 1;
  const menuButtons = document.querySelectorAll(".menu-btn");
  const countryMenu = document.querySelector(".country-menu");
  let countryMenuCloseTimer = null;
  const sectionLinks = document.querySelectorAll(".menu-link[data-section]");
  const sectionMap = {
    summary: document.getElementById("summary-section"),
    cards: document.getElementById("cards-section"),
    testimonials: document.getElementById("testimonials-section"),
    donation: document.getElementById("donation-section"),
    contact: document.getElementById("contact-section"),
    privacy: document.getElementById("privacy-section"),
    about: document.getElementById("about-section"),
  };
  const uploadedGraphSection = document.getElementById("uploaded-graph-section");
  const uploadedGraphCanvas = document.getElementById("uploadedGraphCanvas");
  const uploadedGraphStatus = document.getElementById("uploadedGraphStatus");
  const backToTopBtn = document.getElementById("backToTopBtn");
  const summaryLegendButtons = uploadedGraphSection
    ? Array.from(uploadedGraphSection.querySelectorAll(".legend-item"))
    : [];
  const summaryButtons = document.querySelectorAll(".summary-btn");
  const GPX_AUTO_REFRESH_INTERVAL_MS = 12000;
  let gpxAutoRefreshTimer = null;
  let lastDiscoveredRideSignature = "";
  let selectedSummaryPeriod = "weekly";
  const summaryVisibleSeries = {
    elevation: true,
    speed: true,
    heartRate: true,
    temperature: true,
    distance: true,
  };
  let latestSummaryMetrics = null;

  // Maps legend metric names to the internal metric key format used in data objects.
  function metricDataKey(metric) {
    return metric === "heart-rate" ? "heartRate" : metric;
  }

  // Computes great-circle distance between two latitude/longitude points in meters.
  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const earthRadiusMeters = 6371000;
    const toRadians = value => (value * Math.PI) / 180;
    const latitudeDelta = toRadians(lat2 - lat1);
    const longitudeDelta = toRadians(lon2 - lon1);
    const latitude1Rad = toRadians(lat1);
    const latitude2Rad = toRadians(lat2);

    const a =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(latitude1Rad) * Math.cos(latitude2Rad) *
      Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Finds the first numeric XML descendant value that matches a local tag name.
  function getFirstTagValueByLocalName(element, localName) {
    const descendants = element.getElementsByTagName("*");

    for (let index = 0; index < descendants.length; index += 1) {
      const node = descendants[index];

      if (node.localName === localName && node.textContent) {
        const parsed = Number.parseFloat(node.textContent);

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  // Returns an emoji flag for supported countries used in card titles.
  function getCountryFlag(country) {
    const normalized = (country || "").toLowerCase();

    if (normalized === "taiwan") {
      return "🇹🇼";
    }

    if (normalized === "philippines") {
      return "🇵🇭";
    }

    return "🌍";
  }

  // Builds a display-friendly ride name from file path or ride title fallback.
  function getRideDisplayName(ride) {
    const filePath = getPrimaryRideFilePath(ride);

    if (!filePath) {
      return ride && ride.title ? ride.title : "Ride";
    }

    const parts = filePath.split("/");
    const fileName = parts[parts.length - 1] || "";

    if (fileName) {
      return fileName.replace(/\.gpx$/i, "");
    }

    return ride.title || "Ride";
  }

  // Collects and normalizes all GPX file path fields attached to a ride object.
  function getRideFilePaths(ride) {
    if (!ride || typeof ride !== "object") {
      return [];
    }

    const values = [];

    if (Array.isArray(ride.dataFiles)) {
      ride.dataFiles.forEach(value => {
        if (typeof value === "string" && value.trim().length > 0) {
          values.push(value.trim());
        }
      });
    }

    [ride.dataFile, ride.activityFile, ride.file, ride.gpxFile].forEach(value => {
      if (typeof value === "string" && value.trim().length > 0) {
        values.push(value.trim());
      }
    });

    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.filter(path => /\.gpx$/i.test(path));
  }

  // Chooses the primary GPX path for a ride (first discovered file path).
  function getPrimaryRideFilePath(ride) {
    const paths = getRideFilePaths(ride);
    return paths.length > 0 ? paths[0] : null;
  }

  // Extracts file extension/format from a path while ignoring query/hash suffixes.
  function getFileFormat(filePath) {
    if (typeof filePath !== "string") {
      return "";
    }

    const normalizedPath = filePath.split("?")[0].split("#")[0];
    const extensionMatch = normalizedPath.match(/\.([a-z0-9]+)$/i);
    return extensionMatch ? extensionMatch[1].toLowerCase() : "";
  }

  // Parses folder names like MM_DD_YYYY... into an ISO date string.
  function parseFolderDate(folderName) {
    const folderMatch = typeof folderName === "string"
      ? folderName.match(/^(\d{2})_(\d{2})_(\d{4})/)
      : null;

    if (!folderMatch) {
      return null;
    }

    const [, month, day, year] = folderMatch;
    return `${year}-${month}-${day}`;
  }

  // Parses directory listing HTML and returns raw href entries.
  function extractDirectoryLinksFromHtml(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    return anchors
      .map(anchor => (anchor.getAttribute("href") || "").trim())
      .filter(href => href && href !== "../");
  }

  // Fetches and parses a server directory listing for a given path.
  async function fetchDirectoryListing(pathPrefix) {
    const response = await fetch(pathPrefix, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to list directory: ${pathPrefix}`);
    }

    const htmlText = await response.text();
    return extractDirectoryLinksFromHtml(htmlText);
  }

  // Creates a normalized ride object from an auto-discovered GPX folder/file.
  function createAutoDiscoveredRide(folderName, filePath, idValue) {
    const discoveredDate = parseFolderDate(folderName) || "2026-02-18";

    return {
      id: idValue,
      country: "",
      cover: "https://placehold.co/600x220?text=Auto+Discovered+Ride",
      thumbnail: "https://placehold.co/600x220?text=Auto+Discovered+Ride",
      title: `Ride ${folderName}`,
      date: discoveredDate,
      distance: 0,
      elevation: 0,
      description: `Auto-discovered ride from folder ${folderName}`,
      gpxFile: filePath,
      youtubeUrl: idValue === 1 ? "https://www.youtube.com/watch?v=vO_iSUUSiB0" : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${folderName} cycling`)}`,
      photos: [],
      tags: ["auto", "imported"],
    };
  }

  // Builds a stable identity string for discovered rides to detect folder changes.
  function buildDiscoveredRideSignature(rides) {
    return (Array.isArray(rides) ? rides : [])
      .map(ride => [
        getPrimaryRideFilePath(ride) || "",
        ride.date || "",
        ride.title || "",
      ].join("|"))
      .sort()
      .join(";");
  }

  // Discovers GPX subfolders and generates one auto-ride entry per folder.
  async function discoverRidesFromGpxFolders() {
    const folderLinks = await fetchDirectoryListing("gpx/");
    const folderNames = folderLinks
      .filter(href => href.endsWith("/"))
      .map(href => href.replace(/\/+$/, ""))
      .filter(name => name && name !== "." && name !== "..")
      .filter(name => /^\d{2}_\d{2}_\d{4}_\d{2}_\d{2}$/.test(name));

    const folderEntries = await Promise.all(folderNames.map(async folderName => {
      try {
        const entryLinks = await fetchDirectoryListing(`gpx/${folderName}/`);
        return { folderName, entryLinks };
      } catch (error) {
        console.warn("Skipping folder discovery due to listing error:", folderName, error);
        return null;
      }
    }));

    const discoveredRides = [];
    let generatedId = 1;

    for (const folderEntry of folderEntries) {
      if (!folderEntry) {
        continue;
      }

      const { folderName, entryLinks } = folderEntry;

      const activityFiles = entryLinks
        .filter(name => /\.gpx$/i.test(name))
        .map(name => `gpx/${folderName}/${name.replace(/^\/+/, "")}`);

      if (activityFiles.length === 0) {
        continue;
      }

      const sortedFiles = activityFiles.slice().sort();
      discoveredRides.push(createAutoDiscoveredRide(folderName, sortedFiles[0], generatedId));
      generatedId += 1;
    }

    return discoveredRides;
  }

  // Polls GPX folders and updates cards automatically when new folders/files appear.
  async function refreshDiscoveredRidesIfChanged() {
    try {
      const discoveredRides = await discoverRidesFromGpxFolders();

      if (!Array.isArray(discoveredRides) || discoveredRides.length === 0) {
        return;
      }

      const signature = buildDiscoveredRideSignature(discoveredRides);
      if (signature === lastDiscoveredRideSignature) {
        return;
      }

      lastDiscoveredRideSignature = signature;
      allRides = discoveredRides;
      currentPage = 1;
      summaryRenderCache.clear();
      renderRides();
      renderUploadedGraph();
      prewarmRideMetricsCache(allRides);

      enrichRideCountries(allRides)
        .then(hasUpdates => {
          if (hasUpdates) {
            summaryRenderCache.clear();
            renderRides();
            renderUploadedGraph();
          }
        })
        .catch(error => {
          console.warn("Background enrichment skipped:", error);
        });
    } catch (error) {
      console.warn("Auto-refresh discovery skipped:", error);
    }
  }

  // Toggles section visibility when the contact-only focus mode is enabled.
  function setContactFocusMode(isContactMode) {
    Object.entries(sectionMap).forEach(([sectionKey, sectionNode]) => {
      if (!sectionNode) {
        return;
      }

      if (isContactMode) {
        sectionNode.hidden = sectionKey !== "contact";
      } else {
        sectionNode.hidden = false;
      }
    });
  }

  // Extracts a YouTube video ID from supported URL formats.
  function extractYouTubeVideoId(urlValue) {
    if (typeof urlValue !== "string" || !urlValue.trim()) {
      return null;
    }

    try {
      const parsedUrl = new URL(urlValue);
      const host = parsedUrl.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        return parsedUrl.pathname.split("/").filter(Boolean)[0] || null;
      }

      if (host.endsWith("youtube.com")) {
        const watchId = parsedUrl.searchParams.get("v");
        if (watchId) {
          return watchId;
        }

        const parts = parsedUrl.pathname.split("/").filter(Boolean);
        if (parts.length >= 2 && ["embed", "shorts", "live"].includes(parts[0])) {
          return parts[1];
        }
      }
    } catch (error) {
      const fallbackMatch = urlValue.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
      return fallbackMatch ? fallbackMatch[1] : null;
    }

    return null;
  }

  // Detects whether the viewport is in mobile layout range.
  function isMobileView() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  // Lazily creates and returns the reusable ride video modal structure.
  function ensureVideoModal() {
    if (videoModal) {
      return videoModal;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "video-modal-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="video-modal" role="dialog" aria-modal="true" aria-labelledby="videoModalTitle">
        <div class="video-modal-header">
          <h2 id="videoModalTitle">Ride Video</h2>
          <button type="button" class="video-close-btn" aria-label="Close video">✕</button>
        </div>
        <div class="video-frame-wrap">
          <iframe class="video-frame" title="Ride video player" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const frame = backdrop.querySelector(".video-frame");
    const titleNode = backdrop.querySelector("#videoModalTitle");
    const closeButton = backdrop.querySelector(".video-close-btn");

    const closeVideoModal = function () {
      backdrop.hidden = true;
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");

      if (frame) {
        frame.src = "";
      }
    };

    if (closeButton) {
      closeButton.addEventListener("click", closeVideoModal);
    }

    backdrop.addEventListener("click", function () {
      return;
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !backdrop.hidden) {
        closeVideoModal();
      }
    });

    videoModal = {
      backdrop,
      frame,
      titleNode,
      closeVideoModal,
    };

    return videoModal;
  }

  // Opens the video modal and loads the selected ride's YouTube embed.
  function openRideVideo(ride, youtubeUrl) {
    if (isMobileView()) {
      window.open(youtubeUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);

    if (!videoId) {
      window.open(youtubeUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const modal = ensureVideoModal();
    const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;

    if (modal.titleNode) {
      modal.titleNode.textContent = `${getRideDisplayName(ride)} Video`;
    }

    if (modal.frame) {
      modal.frame.src = embedUrl;
    }

    modal.backdrop.hidden = false;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }

  // Parses XML text and throws a labeled error when parsing fails.
  function parseXmlDocument(xmlText, formatLabel) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const parseError = xml.querySelector("parsererror");

    if (parseError) {
      throw new Error(`Invalid ${formatLabel} file format.`);
    }

    return xml;
  }

  // Converts raw trackpoint objects into normalized metric series and route data.
  function buildMetricsFromTrackPoints(points, formatLabel) {
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error(`${formatLabel} has too few track points.`);
    }

    const elevation = [];
    const speed = [];
    const heartRate = [];
    const temperature = [];
    const distance = [];
    const calories = [];
    const route = [];
    let latitudeSum = 0;
    let longitudeSum = 0;
    let coordinateCount = 0;
    let firstLatitude = null;
    let firstLongitude = null;
    let previousPoint = null;
    let cumulativeDistanceKm = 0;

    points.forEach(point => {
      const latitude = Number.parseFloat(point.latitude);
      const longitude = Number.parseFloat(point.longitude);
      const elevationValue = Number.parseFloat(point.elevation);
      const heartRateValue = Number.parseFloat(point.heartRate);
      const temperatureValue = Number.parseFloat(point.temperature);
      const distanceFromPoint = Number.parseFloat(point.distanceKm);
      const caloriesValue = Number.parseFloat(point.calories);
      const timeValue = Number.isFinite(point.timeValue)
        ? point.timeValue
        : Date.parse(point.timeValue || point.time || "");

      let speedValue = Number.parseFloat(point.speedKmh);

      if (!Number.isFinite(speedValue)
        && previousPoint
        && Number.isFinite(timeValue)
        && Number.isFinite(previousPoint.timeValue)
        && Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && Number.isFinite(previousPoint.latitude)
        && Number.isFinite(previousPoint.longitude)) {
        const timeSeconds = (timeValue - previousPoint.timeValue) / 1000;

        if (timeSeconds > 0) {
          const distanceMeters = haversineDistanceMeters(previousPoint.latitude, previousPoint.longitude, latitude, longitude);
          speedValue = (distanceMeters / timeSeconds) * 3.6;
        }
      }

      let distanceValue = distanceFromPoint;

      if (!Number.isFinite(distanceValue)
        && previousPoint
        && Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && Number.isFinite(previousPoint.latitude)
        && Number.isFinite(previousPoint.longitude)) {
        const stepDistanceKm = haversineDistanceMeters(previousPoint.latitude, previousPoint.longitude, latitude, longitude) / 1000;
        cumulativeDistanceKm += stepDistanceKm;
        distanceValue = cumulativeDistanceKm;
      } else if (Number.isFinite(distanceValue)) {
        cumulativeDistanceKm = distanceValue;
      } else if (!previousPoint && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        distanceValue = 0;
      }

      elevation.push(Number.isFinite(elevationValue) ? elevationValue : null);
      speed.push(Number.isFinite(speedValue) ? speedValue : null);
      heartRate.push(Number.isFinite(heartRateValue) ? heartRateValue : null);
      temperature.push(Number.isFinite(temperatureValue) ? temperatureValue : null);
      distance.push(Number.isFinite(distanceValue) ? distanceValue : null);
      calories.push(Number.isFinite(caloriesValue) ? caloriesValue : null);

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        if (firstLatitude === null || firstLongitude === null) {
          firstLatitude = latitude;
          firstLongitude = longitude;
        }

        latitudeSum += latitude;
        longitudeSum += longitude;
        coordinateCount += 1;
        route.push([latitude, longitude]);
      }

      previousPoint = {
        latitude,
        longitude,
        timeValue,
      };
    });

    return {
      elevation,
      speed,
      heartRate,
      temperature,
      distance,
      calories,
      firstLatitude,
      firstLongitude,
      averageLatitude: coordinateCount > 0 ? latitudeSum / coordinateCount : null,
      averageLongitude: coordinateCount > 0 ? longitudeSum / coordinateCount : null,
      route,
    };
  }

  // Parses GPX XML content and builds graph-ready ride metrics.
  function parseGpxMetrics(gpxText) {
    const xml = parseXmlDocument(gpxText, "GPX");
    const trackPoints = Array.from(xml.getElementsByTagName("trkpt"));
    const points = trackPoints.map(trackPoint => {
      const latitude = Number.parseFloat(trackPoint.getAttribute("lat"));
      const longitude = Number.parseFloat(trackPoint.getAttribute("lon"));
      const elevationNode = trackPoint.getElementsByTagName("ele")[0];
      const timeNode = trackPoint.getElementsByTagName("time")[0];
      const speedFromGpx = getFirstTagValueByLocalName(trackPoint, "speed");
      const speedKmh = Number.isFinite(speedFromGpx) ? speedFromGpx * 3.6 : null;

      return {
        latitude,
        longitude,
        elevation: elevationNode ? Number.parseFloat(elevationNode.textContent) : null,
        timeValue: timeNode ? Date.parse(timeNode.textContent) : NaN,
        speedKmh,
        heartRate: getFirstTagValueByLocalName(trackPoint, "hr"),
        temperature: getFirstTagValueByLocalName(trackPoint, "atemp"),
      };
    });

    return buildMetricsFromTrackPoints(points, "GPX");
  }

  // Loads a file by path and dispatches to the supported parser by file format.
  async function parseMetricsFromFile(filePath) {
    const format = getFileFormat(filePath);

    if (format !== "gpx") {
      throw new Error("Only GPX files are supported.");
    }

    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error("Unable to load activity file.");
    }

    const fileText = await response.text();
    return parseGpxMetrics(fileText);
  }

  // Counts valid numeric entries in a metric series.
  function countFiniteValues(values) {
    if (!Array.isArray(values)) {
      return 0;
    }

    return values.reduce((count, value) => (Number.isFinite(value) ? count + 1 : count), 0);
  }

  // Chooses the strongest metric series across multiple sources for one key.
  function selectBestSeries(metricsList, key) {
    const candidates = metricsList
      .map(metrics => ({
        values: Array.isArray(metrics?.[key]) ? metrics[key] : [],
      }))
      .filter(candidate => candidate.values.length > 0);

    if (candidates.length === 0) {
      return [];
    }

    candidates.sort((a, b) => {
      const finiteDelta = countFiniteValues(b.values) - countFiniteValues(a.values);

      if (finiteDelta !== 0) {
        return finiteDelta;
      }

      return b.values.length - a.values.length;
    });

    return candidates[0].values;
  }

  // Merges multiple parsed metric sources into one consolidated metrics object.
  function mergeMetricsFromSources(metricsList) {
    if (!Array.isArray(metricsList) || metricsList.length === 0) {
      return null;
    }

    const routeCandidate = metricsList
      .map(metrics => ({ route: Array.isArray(metrics?.route) ? metrics.route : [] }))
      .sort((a, b) => b.route.length - a.route.length)[0];

    const route = routeCandidate?.route || [];
    const elevation = selectBestSeries(metricsList, "elevation");
    const speed = selectBestSeries(metricsList, "speed");
    const heartRate = selectBestSeries(metricsList, "heartRate");
    const temperature = selectBestSeries(metricsList, "temperature");
    const distance = selectBestSeries(metricsList, "distance");
    const calories = selectBestSeries(metricsList, "calories");

    const coordinateSources = metricsList.filter(metrics => Number.isFinite(metrics?.averageLatitude) && Number.isFinite(metrics?.averageLongitude));
    const averageLatitude = coordinateSources.length > 0
      ? coordinateSources.reduce((sum, metrics) => sum + metrics.averageLatitude, 0) / coordinateSources.length
      : null;
    const averageLongitude = coordinateSources.length > 0
      ? coordinateSources.reduce((sum, metrics) => sum + metrics.averageLongitude, 0) / coordinateSources.length
      : null;

    let firstLatitude = null;
    let firstLongitude = null;

    if (route.length > 0) {
      firstLatitude = route[0][0];
      firstLongitude = route[0][1];
    } else {
      const firstCoordinateSource = metricsList.find(metrics => Number.isFinite(metrics?.firstLatitude) && Number.isFinite(metrics?.firstLongitude));
      firstLatitude = firstCoordinateSource?.firstLatitude ?? null;
      firstLongitude = firstCoordinateSource?.firstLongitude ?? null;
    }

    return {
      elevation,
      speed,
      heartRate,
      temperature,
      distance,
      calories,
      firstLatitude,
      firstLongitude,
      averageLatitude,
      averageLongitude,
      route,
    };
  }

  // Returns parsed metrics for one file path using cache and in-flight dedupe.
  async function getMetricsForFilePath(filePath) {
    let metrics = activityMetricsCache.get(filePath);

    if (!metrics) {
      let pendingMetricsPromise = activityMetricsPromiseCache.get(filePath);

      if (!pendingMetricsPromise) {
        pendingMetricsPromise = parseMetricsFromFile(filePath)
          .then(parsedMetrics => {
            activityMetricsCache.set(filePath, parsedMetrics);
            activityMetricsPromiseCache.delete(filePath);
            return parsedMetrics;
          })
          .catch(error => {
            activityMetricsPromiseCache.delete(filePath);
            throw error;
          });

        activityMetricsPromiseCache.set(filePath, pendingMetricsPromise);
      }

      metrics = await pendingMetricsPromise;
    }

    return metrics;
  }

  // Maps coarse coordinates to a supported country label.
  function detectCountryFromCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const inTaiwan = latitude >= 21.5 && latitude <= 25.5 && longitude >= 119.0 && longitude <= 122.5;
    const inPhilippines = latitude >= 4.0 && latitude <= 21.5 && longitude >= 116.0 && longitude <= 127.5;

    if (inTaiwan) {
      return "Taiwan";
    }

    if (inPhilippines) {
      return "Philippines";
    }

    return null;
  }

  // Derives ride country from route/location metrics.
  function detectCountryFromMetrics(metrics) {
    if (!metrics) {
      return null;
    }

    return detectCountryFromCoordinates(metrics.averageLatitude, metrics.averageLongitude)
      || detectCountryFromCoordinates(metrics.firstLatitude, metrics.firstLongitude)
      || null;
  }

  // Computes min/max from a metric array while ignoring invalid entries.
  function getMinMax(values) {
    if (!Array.isArray(values)) {
      return null;
    }

    const valid = values.filter(value => Number.isFinite(value));

    if (valid.length === 0) {
      return null;
    }

    return {
      min: Math.min(...valid),
      max: Math.max(...valid),
    };
  }

  // Normalizes a metric array to the 0..1 range using its own min/max.
  function normalizeValues(values) {
    const minMax = getMinMax(values);

    if (!minMax) {
      return values.map(() => null);
    }

    const range = minMax.max - minMax.min;

    if (range === 0) {
      return values.map(value => (Number.isFinite(value) ? 0.5 : null));
    }

    return values.map(value => (Number.isFinite(value) ? (value - minMax.min) / range : null));
  }

  // Normalizes values to 0..1 using a zero-based lower bound.
  function normalizeValuesFromZero(values) {
    const valid = values.filter(value => Number.isFinite(value));

    if (valid.length === 0) {
      return values.map(() => null);
    }

    const maxValue = Math.max(...valid);

    if (maxValue <= 0) {
      return values.map(value => (Number.isFinite(value) ? 0 : null));
    }

    return values.map(value => (Number.isFinite(value) ? value / maxValue : null));
  }

  // Draws one polyline series on the chart canvas from normalized values.
  function drawSeries(ctx, normalizedValues, color, plotX, plotY, plotWidth, plotHeight) {
    const validCount = normalizedValues.filter(value => value !== null).length;

    if (validCount === 0) {
      return;
    }

    if (validCount === 1) {
      const pointIndex = normalizedValues.findIndex(value => value !== null);
      const pointValue = normalizedValues[pointIndex];
      const xStepSingle = normalizedValues.length > 1 ? plotWidth / (normalizedValues.length - 1) : 0;
      const x = plotX + pointIndex * xStepSingle;
      const y = plotY + (1 - pointValue) * plotHeight;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotWidth, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const xStep = normalizedValues.length > 1 ? plotWidth / (normalizedValues.length - 1) : plotWidth;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    let started = false;

    normalizedValues.forEach((value, index) => {
      if (value === null) {
        started = false;
        return;
      }

      const x = plotX + index * xStep;
      const y = plotY + (1 - value) * plotHeight;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  // Renders the combined multi-metric chart including axes, grid, and series.
  function drawCombinedGraph(canvas, metrics, visibleSeries = { elevation: true, speed: true, heartRate: true, temperature: true, distance: true }) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;
    const leftPadding = 48;
    const rightPadding = padding;
    const topPadding = padding;
    const bottomPadding = 34;
    const plotWidth = width - leftPadding - rightPadding;
    const plotHeight = height - topPadding - bottomPadding;
    const xTickCount = 4;
    const yTickCount = 4;

    const visibleMetricKeys = ["elevation", "speed", "heartRate", "temperature", "distance"].filter(key => Boolean(visibleSeries[key]));
    const singleMetricMode = visibleMetricKeys.length === 1;

    let yAxisTitle = "Value Scale (0-200)";
    let yLabelFormatter = value => String(Math.round(value));
    let yScaleMin = 0;
    let yScaleMax = 200;

    if (singleMetricMode) {
      const singleKey = visibleMetricKeys[0];
      const range = getMinMax(metrics[singleKey]);

      if (singleKey === "elevation") {
        yAxisTitle = "Elevation (m)";
        yLabelFormatter = value => String(Math.round(value));
      } else if (singleKey === "speed") {
        yAxisTitle = "Speed (km/h)";
        yLabelFormatter = value => value.toFixed(1);
      } else if (singleKey === "temperature") {
        yAxisTitle = "Air Temp (°C)";
        yLabelFormatter = value => value.toFixed(1);
      } else if (singleKey === "distance") {
        yAxisTitle = "Distance (km)";
        yLabelFormatter = value => value.toFixed(2);
      } else {
        yAxisTitle = "Heart Rate (bpm)";
        yLabelFormatter = value => String(Math.round(value));
      }

      if (range) {
        yScaleMin = Math.min(0, range.min);
        yScaleMax = range.max;
      }

      if (yScaleMax <= yScaleMin) {
        yScaleMax = yScaleMin + 1;
      }
    }

    ctx.clearRect(0, 0, width, height);

    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(110,110,110,0.95)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let tick = 0; tick <= yTickCount; tick += 1) {
      const ratio = tick / yTickCount;
      const y = topPadding + plotHeight * ratio;
      const yValue = yScaleMin + (1 - ratio) * (yScaleMax - yScaleMin);
      const label = yLabelFormatter(yValue);

      ctx.fillText(label, leftPadding - 8, y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let tick = 0; tick <= xTickCount; tick += 1) {
      const ratio = tick / xTickCount;
      const x = leftPadding + plotWidth * ratio;
      const label = String(Math.round(ratio * 100));

      ctx.fillText(label, x, topPadding + plotHeight + 8);
    }

    ctx.save();
    ctx.fillStyle = "rgba(100,100,100,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(16, topPadding + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisTitle, 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(100,100,100,0.95)";
    ctx.fillText("Ride Progress %", leftPadding + plotWidth / 2, height - 6);

    ctx.strokeStyle = "rgba(120,120,120,0.35)";
    ctx.lineWidth = 1;

    for (let line = 0; line <= yTickCount; line += 1) {
      const y = topPadding + (plotHeight / yTickCount) * line;
      ctx.beginPath();
      ctx.moveTo(leftPadding, y);
      ctx.lineTo(width - rightPadding, y);
      ctx.stroke();
    }

    for (let line = 0; line <= xTickCount; line += 1) {
      const x = leftPadding + (plotWidth / xTickCount) * line;
      ctx.beginPath();
      ctx.moveTo(x, topPadding);
      ctx.lineTo(x, height - bottomPadding);
      ctx.stroke();
    }

    const mapValuesToCurrentScale = values => {
      const range = yScaleMax - yScaleMin;
      return values.map(value => {
        if (!Number.isFinite(value)) {
          return null;
        }

        const scaled = (value - yScaleMin) / range;
        return Math.max(0, Math.min(1, scaled));
      });
    };

    if (visibleSeries.elevation) {
      const elevationSeries = mapValuesToCurrentScale(metrics.elevation);
      drawSeries(ctx, elevationSeries, "#e53935", leftPadding, topPadding, plotWidth, plotHeight);
    }

    if (visibleSeries.speed) {
      const speedSeries = mapValuesToCurrentScale(metrics.speed);
      drawSeries(ctx, speedSeries, "#2e7d32", leftPadding, topPadding, plotWidth, plotHeight);
    }

    if (visibleSeries.heartRate) {
      const heartRateSeries = mapValuesToCurrentScale(metrics.heartRate);
      drawSeries(ctx, heartRateSeries, "#1e88e5", leftPadding, topPadding, plotWidth, plotHeight);
    }

    if (visibleSeries.temperature) {
      const temperatureSeries = mapValuesToCurrentScale(metrics.temperature);
      drawSeries(ctx, temperatureSeries, "#f1c40f", leftPadding, topPadding, plotWidth, plotHeight);
    }

    if (visibleSeries.distance) {
      const distanceSeries = mapValuesToCurrentScale(metrics.distance);
      drawSeries(ctx, distanceSeries, "#8e44ad", leftPadding, topPadding, plotWidth, plotHeight);
    }

  }

  // Updates legend labels with the current min-max ranges for each metric.
  function updateStatLegend(panel, metrics) {
    const elevationRange = getMinMax(metrics.elevation);
    const speedRange = getMinMax(metrics.speed);
    const heartRateRange = getMinMax(metrics.heartRate);
    const temperatureRange = getMinMax(metrics.temperature);
    const distanceRange = getMinMax(metrics.distance);
    const caloriesRange = getMinMax(metrics.calories);

    const elevationText = elevationRange
      ? `${Math.round(elevationRange.min)}-${Math.round(elevationRange.max)} m`
      : "No data";

    const speedText = speedRange
      ? `${speedRange.min.toFixed(1)}-${speedRange.max.toFixed(1)} km/h`
      : "No data";

    const heartRateText = heartRateRange
      ? `${Math.round(heartRateRange.min)}-${Math.round(heartRateRange.max)} bpm`
      : "No data";

    const temperatureText = temperatureRange
      ? `${temperatureRange.min.toFixed(1)}-${temperatureRange.max.toFixed(1)} °C`
      : "No data";

    const distanceText = distanceRange
      ? `${distanceRange.min.toFixed(2)}-${distanceRange.max.toFixed(2)} km`
      : "No data";

    const caloriesText = caloriesRange
      ? `${Math.round(caloriesRange.min)}-${Math.round(caloriesRange.max)} kcal`
      : "No data";

    const elevationInfo = panel.querySelector("[data-metric='elevation']");
    const speedInfo = panel.querySelector("[data-metric='speed']");
    const heartRateInfo = panel.querySelector("[data-metric='heart-rate']");
    const temperatureInfo = panel.querySelector("[data-metric='temperature']");
    const distanceInfo = panel.querySelector("[data-metric='distance']");
    const caloriesInfo = panel.querySelector("[data-metric='calories']");

    if (elevationInfo) elevationInfo.textContent = `Elevation: ${elevationText}`;
    if (speedInfo) speedInfo.textContent = `Speed: ${speedText}`;
    if (heartRateInfo) heartRateInfo.textContent = `Heart Rate: ${heartRateText}`;
    if (temperatureInfo) temperatureInfo.textContent = `Air Temp: ${temperatureText}`;
    if (distanceInfo) distanceInfo.textContent = `Distance: ${distanceText}`;
    if (caloriesInfo) caloriesInfo.textContent = `Calories: ${caloriesText}`;
  }

  // Lazily creates and returns the reusable metrics modal and event wiring.
  function ensureMetricsModal() {
    if (metricsModal) {
      return metricsModal;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "metrics-modal-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="metrics-modal" role="dialog" aria-modal="true" aria-labelledby="metricsModalTitle">
        <div class="metrics-modal-header">
          <h2 id="metricsModalTitle">Ride Metrics</h2>
          <button class="metrics-close-btn" type="button" aria-label="Close metrics modal">✕</button>
        </div>
        <div class="metrics-map" aria-label="Ride route map"></div>
        <canvas class="metrics-canvas" width="860" height="340" aria-label="Ride metrics chart"></canvas>
        <div class="metrics-legend">
          <button class="legend-item legend-elevation" data-metric="elevation" type="button">Elevation: --</button>
          <button class="legend-item legend-speed" data-metric="speed" type="button">Speed: --</button>
          <button class="legend-item legend-heart-rate" data-metric="heart-rate" type="button">Heart Rate: --</button>
          <button class="legend-item legend-temperature" data-metric="temperature" type="button">Air Temp: --</button>
          <button class="legend-item legend-distance" data-metric="distance" type="button">Distance: --</button>
        </div>
        <p class="metrics-status" aria-live="polite"></p>
      </div>
    `;

    const modalPanel = backdrop.querySelector(".metrics-modal");
    const closeButton = backdrop.querySelector(".metrics-close-btn");

    // Hides the metrics modal and restores document scroll behavior.
    function closeModal() {
      backdrop.hidden = true;
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
    }

    if (modalPanel) {
      modalPanel.addEventListener("click", function (event) {
        event.stopPropagation();
      });
    }

    if (closeButton) {
      closeButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
      });
    }

    backdrop.addEventListener("click", function (event) {
      const closeButton = event.target.closest(".metrics-close-btn");

      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
      }
    });

    const visibleSeries = {
      elevation: true,
      speed: true,
      heartRate: true,
      temperature: true,
      distance: true,
    };

    const legendButtons = Array.from(backdrop.querySelectorAll(".legend-item"));

    // Syncs legend button visual state with enabled/disabled metric toggles.
    function updateLegendVisualState() {
      legendButtons.forEach(button => {
        const metric = button.dataset.metric;
        const metricKey = metricDataKey(metric);
        const isOn = Boolean(visibleSeries[metricKey]);
        button.classList.toggle("legend-off", !isOn);
      });
    }

    legendButtons.forEach(button => {
      button.addEventListener("click", function () {
        const metric = button.dataset.metric;
        const metricKey = metricDataKey(metric);

        visibleSeries[metricKey] = !visibleSeries[metricKey];
        updateLegendVisualState();

        if (metricsModal && metricsModal.currentMetrics) {
          const canvas = backdrop.querySelector(".metrics-canvas");
          if (canvas) {
            drawCombinedGraph(canvas, metricsModal.currentMetrics, visibleSeries);
          }
        }
      });
    });

    updateLegendVisualState();

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !backdrop.hidden) {
        closeModal();
      }
    });

    document.body.appendChild(backdrop);

    metricsModal = {
      backdrop,
      closeModal,
      visibleSeries,
      currentMetrics: null,
      map: null,
      mapTileLayer: null,
      mapLayer: null,
      resetVisibleSeries() {
        this.visibleSeries.elevation = true;
        this.visibleSeries.speed = true;
        this.visibleSeries.heartRate = true;
        this.visibleSeries.temperature = true;
        this.visibleSeries.distance = true;
        updateLegendVisualState();
      },
    };

    return metricsModal;
  }

  // Opens the metrics modal for a ride and loads its chart/map content.
  async function openMetricsModal(ride) {
    const modal = ensureMetricsModal();
    const panel = modal.backdrop.querySelector(".metrics-modal");
    const titleNode = modal.backdrop.querySelector("#metricsModalTitle");

    if (!panel) {
      return;
    }

    if (titleNode) {
      titleNode.textContent = `${getRideDisplayName(ride)} Metrics`;
    }

    const statusNode = panel.querySelector(".metrics-status");
    const mapContainer = panel.querySelector(".metrics-map");
    if (statusNode) {
      statusNode.textContent = "Loading ride metrics...";
    }

    if (mapContainer) {
      mapContainer.classList.add("loading");
    }

    modal.currentMetrics = null;
    modal.resetVisibleSeries();

    modal.backdrop.hidden = false;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
    await loadAndRenderMetrics(panel, ride);

    if (metricsModal && metricsModal.map) {
      setTimeout(() => {
        if (metricsModal && metricsModal.map) {
          metricsModal.map.invalidateSize();
        }
      }, 200);
    }
  }

  // Renders the ride route on a Leaflet map inside the metrics modal.
  function renderMetricsMap(panel, metrics) {
    if (!metricsModal || !panel || !metrics || !Array.isArray(metrics.route) || metrics.route.length === 0) {
      return;
    }

    const mapContainer = panel.querySelector(".metrics-map");

    if (!mapContainer || !window.L) {
      return;
    }

    mapContainer.classList.add("loading");

    if (!metricsModal.map) {
      metricsModal.map = window.L.map(mapContainer, {
        zoomControl: true,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });

      metricsModal.mapTileLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(metricsModal.map);

      metricsModal.mapTileLayer.on("load", function () {
        mapContainer.classList.remove("loading");
      });
    }

    if (metricsModal.mapLayer) {
      metricsModal.map.removeLayer(metricsModal.mapLayer);
      metricsModal.mapLayer = null;
    }

    metricsModal.mapLayer = window.L.polyline(metrics.route, {
      color: "#4361ee",
      weight: 3,
      opacity: 0.9,
    }).addTo(metricsModal.map);

    metricsModal.map.fitBounds(metricsModal.mapLayer.getBounds(), {
      padding: [16, 16],
    });

    setTimeout(() => {
      mapContainer.classList.remove("loading");
    }, 900);
  }

  // Loads ride metrics then renders chart, map, and legend into the modal.
  async function loadAndRenderMetrics(panel, ride) {
    const statusNode = panel.querySelector(".metrics-status");
    const canvas = panel.querySelector("canvas");

    const rideFilePaths = getRideFilePaths(ride);

    if (!canvas || rideFilePaths.length === 0) {
      if (statusNode) {
        statusNode.textContent = "No activity file available for this ride.";
      }
      return;
    }

    if (statusNode) {
      statusNode.textContent = "Loading ride metrics...";
    }

    try {
      const metrics = await getRideMetrics(ride);

      if (!metrics) {
        throw new Error("No metrics available");
      }

      if (metricsModal) {
        metricsModal.currentMetrics = metrics;
      }

      const visibleSeries = metricsModal ? metricsModal.visibleSeries : undefined;
      drawCombinedGraph(canvas, metrics, visibleSeries);
      renderMetricsMap(panel, metrics);
      updateStatLegend(panel, metrics);

      if (statusNode) {
        statusNode.textContent = "";
      }
    } catch (error) {
      console.error("Activity metrics error:", error);
      if (statusNode) {
        statusNode.textContent = "Unable to load metrics for this ride.";
      }
    }
  }

  // Returns the arithmetic mean of valid numbers in a series.
  function averageFinite(values) {
    const valid = values.filter(value => Number.isFinite(value));

    if (valid.length === 0) {
      return null;
    }

    const sum = valid.reduce((total, value) => total + value, 0);
    return sum / valid.length;
  }

  // Preloads metrics for a few rides during idle time to speed first modal open.
  function prewarmRideMetricsCache(rides, maxRides = 6) {
    const candidates = (Array.isArray(rides) ? rides : [])
      .filter(ride => getRideFilePaths(ride).length > 0)
      .slice(0, maxRides);

    if (candidates.length === 0) {
      return;
    }

    const runPrewarm = async function () {
      for (const ride of candidates) {
        try {
          await getRideMetrics(ride);
        } catch (error) {
          console.warn("Prewarm skipped for ride:", ride && ride.title ? ride.title : "Ride", error);
        }
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => {
        runPrewarm();
      }, { timeout: 2200 });
      return;
    }

    setTimeout(() => {
      runPrewarm();
    }, 120);
  }

  // Returns merged metrics for a ride with multi-file caching and dedupe.
  async function getRideMetrics(ride) {
    const rideFilePaths = getRideFilePaths(ride);

    if (rideFilePaths.length === 0) {
      return null;
    }

    const mergeCacheKey = rideFilePaths.slice().sort().join("|");
    let mergedMetrics = mergedRideMetricsCache.get(mergeCacheKey);

    if (mergedMetrics) {
      return mergedMetrics;
    }

    let pendingMergedPromise = mergedRideMetricsPromiseCache.get(mergeCacheKey);

    if (!pendingMergedPromise) {
      pendingMergedPromise = Promise.all(rideFilePaths.map(async filePath => {
        try {
          return await getMetricsForFilePath(filePath);
        } catch (error) {
          console.warn("Skipped activity source:", filePath, error);
          return null;
        }
      }))
        .then(sourceMetrics => {
          const validMetrics = sourceMetrics.filter(metrics => Boolean(metrics));
          const merged = mergeMetricsFromSources(validMetrics);

          if (merged) {
            mergedRideMetricsCache.set(mergeCacheKey, merged);
          }

          mergedRideMetricsPromiseCache.delete(mergeCacheKey);
          return merged;
        })
        .catch(error => {
          mergedRideMetricsPromiseCache.delete(mergeCacheKey);
          throw error;
        });

      mergedRideMetricsPromiseCache.set(mergeCacheKey, pendingMergedPromise);
    }

    mergedMetrics = await pendingMergedPromise;

    return mergedMetrics;
  }

  // Checks whether a ride still needs background enrichment fields.
  function shouldEnrichRideMetrics(ride) {
    if (!ride || typeof ride !== "object") {
      return false;
    }

    const missingCountry = !ride.country || String(ride.country).trim().length === 0;
    const missingTemperature = !Number.isFinite(Number.parseFloat(ride.airTemperature));
    const missingDistance = !Number.isFinite(Number.parseFloat(ride.distance)) || Number.parseFloat(ride.distance) <= 0;
    const missingElevation = !Number.isFinite(Number.parseFloat(ride.elevation)) || Number.parseFloat(ride.elevation) <= 0;

    return missingCountry || missingTemperature || missingDistance || missingElevation;
  }

  // Background-enriches rides with detected country and missing summary fields.
  async function enrichRideCountries(rides) {
    let hasUpdates = false;

    const metricPromises = rides.map(async ride => {
      if (!ride || getRideFilePaths(ride).length === 0) {
        return { ride, metrics: null, error: null };
      }

      if (!shouldEnrichRideMetrics(ride)) {
        return { ride, metrics: null, error: null, skipped: true };
      }

      try {
        const metrics = await getRideMetrics(ride);
        return { ride, metrics, error: null };
      } catch (error) {
        return { ride, metrics: null, error };
      }
    });

    const results = await Promise.all(metricPromises);

    results.forEach(({ ride, metrics, error, skipped }) => {
      if (skipped) {
        return;
      }

      if (error) {
        console.warn("Country detection skipped for ride:", ride?.title, error);
        return;
      }

      if (!ride || !metrics) {
        return;
      }

      const detectedCountry = detectCountryFromMetrics(metrics);

      if (detectedCountry) {
        if (ride.country !== detectedCountry) {
          hasUpdates = true;
        }
        ride.country = detectedCountry;
      }

      const avgTemperature = averageFinite(metrics.temperature);
      if (Number.isFinite(avgTemperature)) {
        const updatedTemp = Number(avgTemperature.toFixed(1));
        if (!Number.isFinite(Number.parseFloat(ride.airTemperature)) || Number.parseFloat(ride.airTemperature) !== updatedTemp) {
          hasUpdates = true;
        }
        ride.airTemperature = updatedTemp;
      }

      const distanceRange = getMinMax(metrics.distance);
      if (distanceRange && Number.isFinite(distanceRange.max) && (!Number.isFinite(Number.parseFloat(ride.distance)) || Number.parseFloat(ride.distance) <= 0)) {
        hasUpdates = true;
        ride.distance = Number(distanceRange.max.toFixed(2));
      }

      const elevationRange = getMinMax(metrics.elevation);
      if (elevationRange && Number.isFinite(elevationRange.min) && Number.isFinite(elevationRange.max) && (!Number.isFinite(Number.parseFloat(ride.elevation)) || Number.parseFloat(ride.elevation) <= 0)) {
        const elevationGain = Math.max(0, elevationRange.max - elevationRange.min);
        hasUpdates = true;
        ride.elevation = Math.round(elevationGain);
      }
    });

    return hasUpdates;
  }

  // Builds and renders the large summary graph for selected country/period.
  async function renderUploadedGraph() {
    if (!uploadedGraphSection || !uploadedGraphCanvas) {
      return;
    }

    if (uploadedGraphStatus) {
      uploadedGraphStatus.textContent = "Loading cycling summary...";
    }

    try {

    const rides = (Array.isArray(allRides) ? allRides : []).filter(ride => {
      if (selectedCountry === "all") {
        return true;
      }

      return (ride.country || "").toLowerCase() === selectedCountry;
    });
    const rideSignature = rides
      .map(ride => [
        ride.date || "",
        ride.country || "",
        ride.title || "",
        Number.parseFloat(ride.distance) || 0,
        Number.parseFloat(ride.elevation) || 0,
        getPrimaryRideFilePath(ride) || "",
      ].join("|"))
      .join(";");
    const summaryCacheKey = `${selectedCountry}::${selectedSummaryPeriod}::${rideSignature}`;
    const cachedSummary = summaryRenderCache.get(summaryCacheKey);

    if (cachedSummary) {
      latestSummaryMetrics = cachedSummary.summaryMetrics;
      drawCombinedGraph(uploadedGraphCanvas, cachedSummary.summaryMetrics, summaryVisibleSeries);
      updateStatLegend(uploadedGraphSection, cachedSummary.summaryMetrics);

      if (uploadedGraphStatus) {
        uploadedGraphStatus.textContent = cachedSummary.statusText;
      }

      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStart = (() => {
      if (selectedSummaryPeriod === "weekly") {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return start;
      }

      if (selectedSummaryPeriod === "monthly") {
        const start = new Date(today);
        start.setDate(today.getDate() - 27);
        return start;
      }

      if (selectedSummaryPeriod === "half") {
        return new Date(today.getFullYear(), today.getMonth() - 5, 1);
      }

      return new Date(today.getFullYear(), today.getMonth() - 11, 1);
    })();

    const toLocalDate = value => {
      if (typeof value !== "string") {
        return null;
      }

      const parsed = new Date(`${value}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const ridesInPeriod = rides
      .map((ride, index) => ({ ride, index, rideDate: toLocalDate(ride.date) }))
      .filter(item => item.rideDate && item.rideDate >= periodStart && item.rideDate <= today)
      .sort((a, b) => {
        const dateDelta = a.rideDate.getTime() - b.rideDate.getTime();
        return dateDelta !== 0 ? dateDelta : a.index - b.index;
      });

    const elevationTrendSeries = [];
    const speedTrendSeries = [];
    const heartRateTrendSeries = [];
    const temperatureTrendSeries = [];
    const distanceTrendSeries = [];

    const appendRangePair = (targetSeries, rangeValue) => {
      if (!rangeValue || !Number.isFinite(rangeValue.min) || !Number.isFinite(rangeValue.max)) {
        return;
      }

      targetSeries.push(Number(rangeValue.min.toFixed(2)), Number(rangeValue.max.toFixed(2)));
    };

    let totalDistance = 0;

    for (const item of ridesInPeriod) {
      const { ride } = item;
      const rideDistance = Number.parseFloat(ride.distance);
      const rideElevation = Number.parseFloat(ride.elevation);
      let metrics = null;

      try {
        metrics = await getRideMetrics(ride);
      } catch (error) {
        console.warn("Summary activity load skipped for ride:", ride.title, error);
      }

      if (metrics) {
        appendRangePair(elevationTrendSeries, getMinMax(metrics.elevation));
        appendRangePair(speedTrendSeries, getMinMax(metrics.speed));
        appendRangePair(heartRateTrendSeries, getMinMax(metrics.heartRate));
        appendRangePair(temperatureTrendSeries, getMinMax(metrics.temperature));
        appendRangePair(distanceTrendSeries, getMinMax(metrics.distance));

        if (Number.isFinite(rideDistance)) {
          totalDistance += rideDistance;
        } else {
          const distanceRange = getMinMax(metrics.distance);
          if (distanceRange && Number.isFinite(distanceRange.max)) {
            totalDistance += distanceRange.max;
          }
        }
      } else {
        if (Number.isFinite(rideElevation)) {
          elevationTrendSeries.push(Number(rideElevation.toFixed(2)), Number(rideElevation.toFixed(2)));
        }

        if (Number.isFinite(rideDistance)) {
          distanceTrendSeries.push(Number(rideDistance.toFixed(2)), Number(rideDistance.toFixed(2)));
          totalDistance += rideDistance;
        }
      }
    }

    const summaryMetrics = {
      elevation: elevationTrendSeries,
      speed: speedTrendSeries,
      heartRate: heartRateTrendSeries,
      temperature: temperatureTrendSeries,
      distance: distanceTrendSeries,
    };

    latestSummaryMetrics = summaryMetrics;

    drawCombinedGraph(uploadedGraphCanvas, summaryMetrics, summaryVisibleSeries);
    updateStatLegend(uploadedGraphSection, summaryMetrics);

    if (uploadedGraphStatus) {
      const countryLabel = selectedCountry === "all"
        ? "all countries"
        : selectedCountry;
      uploadedGraphStatus.textContent = `Total distance: ${totalDistance.toFixed(2)} km (${selectedSummaryPeriod}, ${countryLabel})`;
    }

    const countryLabel = selectedCountry === "all"
      ? "all countries"
      : selectedCountry;
    summaryRenderCache.set(summaryCacheKey, {
      summaryMetrics,
      statusText: `Total distance: ${totalDistance.toFixed(2)} km (${selectedSummaryPeriod}, ${countryLabel})`,
    });

    } catch (error) {
      console.error("Summary render error:", error);
      if (uploadedGraphStatus) {
        uploadedGraphStatus.textContent = "Unable to render cycling summary.";
      }
    }
  }

  // Refreshes active/inactive appearance of summary legend toggle buttons.
  function updateSummaryLegendVisualState() {
    summaryLegendButtons.forEach(button => {
      const metric = button.dataset.metric;
      const metricKey = metricDataKey(metric);
      const isOn = Boolean(summaryVisibleSeries[metricKey]);
      button.classList.toggle("legend-off", !isOn);
    });
  }

  summaryLegendButtons.forEach(button => {
    button.addEventListener("click", function () {
      const metric = button.dataset.metric;
      const metricKey = metricDataKey(metric);

      summaryVisibleSeries[metricKey] = !summaryVisibleSeries[metricKey];
      updateSummaryLegendVisualState();

      if (latestSummaryMetrics && uploadedGraphCanvas) {
        drawCombinedGraph(uploadedGraphCanvas, latestSummaryMetrics, summaryVisibleSeries);
      }
    });
  });

  updateSummaryLegendVisualState();



  // Creates one interactive ride card element for the grid.
  function createRideCard(ride) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    const youtubeUrl = typeof ride.youtubeUrl === "string" && ride.youtubeUrl.trim()
      ? ride.youtubeUrl.trim()
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ride.title || "ride"} cycling`)}`;

    let mapPreviewHtml = '';
    if (ride.gpxFile && ride.tags && ride.tags.includes('auto')) {
      // Only for auto-discovered rides, show a mini map preview container
      mapPreviewHtml = `<div class="mini-map-preview" id="mini-map-${ride.id}" style="width:100%;height:120px;border-radius:8px;overflow:hidden;margin-bottom:8px;"></div>`;
    }
    card.innerHTML = `
      ${(ride.thumbnail || ride.cover) ? `<img class="card-thumbnail" src="${ride.thumbnail || ride.cover}" loading="lazy" decoding="async" fetchpriority="low" alt="${ride.title}">` : ''}
      <div class="card-content">
        <h2>${getCountryFlag(ride.country)} ${getRideDisplayName(ride)} <span class="card-metrics-icon" aria-hidden="true">📈</span></h2>
        <div class="card-meta">
          ${mapPreviewHtml}
          <a class="youtube-link" href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" aria-label="Watch ride video on YouTube">▶ YouTube</a>
        </div>
      </div>
    `;

    // If this is an auto-discovered ride, render the mini map after DOM insertion
    if (ride.gpxFile && ride.tags && ride.tags.includes('auto')) {
      setTimeout(() => {
        const mapContainer = document.getElementById(`mini-map-${ride.id}`);
        if (mapContainer && window.L) {
          // Fetch and parse the GPX file, then render the path
          fetch(ride.gpxFile)
            .then(resp => resp.text())
            .then(gpxText => {
              const parser = new DOMParser();
              const xml = parser.parseFromString(gpxText, "application/xml");
              const trkpts = Array.from(xml.querySelectorAll('trkpt'));
              if (trkpts.length === 0) return;
              const latlngs = trkpts.map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))]);
              const map = L.map(mapContainer, {
                attributionControl: false,
                zoomControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                tap: false,
                touchZoom: false,
                inertia: false,
                interactive: false,
              });
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                minZoom: 1,
                maxZoom: 16,
                attribution: ''
              }).addTo(map);
              const polyline = L.polyline(latlngs, {color: '#1976d2', weight: 3, opacity: 0.8}).addTo(map);
              map.fitBounds(polyline.getBounds(), {padding: [8,8]});
            });
        }
      }, 0);
    }

    const youtubeLink = card.querySelector(".youtube-link");

    if (youtubeLink) {
      youtubeLink.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openRideVideo(ride, youtubeUrl);
      });

      youtubeLink.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRideVideo(ride, youtubeUrl);
        }
        event.stopPropagation();
      });
    }

    card.addEventListener("click", function () {
      openMetricsModal(ride);
    });

    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMetricsModal(ride);
      }
    });

    return card;
  }

  // Renders the paginated ride card grid for the current country filter.
  function renderRides() {
    if (!container) return;

    container.innerHTML = "";

    const filteredRides = selectedCountry === "all"
      ? allRides
      : allRides.filter(ride => (ride.country || "").toLowerCase() === selectedCountry);

    if (filteredRides.length === 0) {
      container.innerHTML = `<p class="error-message">No rides found for this location yet.</p>`;
      if (paginationContainer) {
        paginationContainer.innerHTML = "";
      }
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredRides.length / ridesPerPage));

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    const startIndex = (currentPage - 1) * ridesPerPage;
    const ridesOnPage = filteredRides.slice(startIndex, startIndex + ridesPerPage);

    ridesOnPage.forEach(ride => {
      container.appendChild(createRideCard(ride));
    });

    if (paginationContainer) {
      if (totalPages <= 1) {
        paginationContainer.innerHTML = "";
      } else {
        paginationContainer.innerHTML = "";

        const prevButton = document.createElement("button");
        prevButton.className = "page-btn";
        prevButton.type = "button";
        prevButton.textContent = "Prev";
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener("click", function () {
          if (currentPage > 1) {
            currentPage -= 1;
            renderRides();
          }
        });
        paginationContainer.appendChild(prevButton);

        for (let page = 1; page <= totalPages; page += 1) {
          const pageButton = document.createElement("button");
          pageButton.className = "page-btn";
          pageButton.type = "button";
          pageButton.textContent = String(page);

          if (page === currentPage) {
            pageButton.classList.add("active");
          }

          pageButton.addEventListener("click", function () {
            currentPage = page;
            renderRides();
          });

          paginationContainer.appendChild(pageButton);
        }

        const nextButton = document.createElement("button");
        nextButton.className = "page-btn";
        nextButton.type = "button";
        nextButton.textContent = "Next";
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener("click", function () {
          if (currentPage < totalPages) {
            currentPage += 1;
            renderRides();
          }
        });
        paginationContainer.appendChild(nextButton);
      }
    }
  }

  menuButtons.forEach(button => {
    button.addEventListener("click", function () {
      setContactFocusMode(false);
      selectedCountry = this.dataset.country || "all";
      currentPage = 1;

      menuButtons.forEach(btn => btn.classList.remove("active"));
      this.classList.add("active");

      renderRides();
      renderUploadedGraph();
      // Do NOT scroll to the cards section on country change
    });
  });

  if (countryMenu) {
    countryMenu.addEventListener("mouseenter", function () {
      if (countryMenuCloseTimer) {
        clearTimeout(countryMenuCloseTimer);
        countryMenuCloseTimer = null;
      }
    });

    countryMenu.addEventListener("mouseleave", function () {
      countryMenuCloseTimer = setTimeout(function () {
        countryMenu.removeAttribute("open");
        countryMenuCloseTimer = null;
      }, 180);
    });
  }

  summaryButtons.forEach(button => {
    button.addEventListener("click", function () {
      setContactFocusMode(false);
      selectedSummaryPeriod = this.dataset.period || "weekly";
      summaryButtons.forEach(btn => btn.classList.remove("active"));
      this.classList.add("active");
      renderUploadedGraph();
    });
  });

  sectionLinks.forEach(link => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      const targetSection = this.dataset.section;
      const targetNode = targetSection ? sectionMap[targetSection] : null;

      if (!targetNode) {
        return;
      }

      if (targetSection === "contact") {
        setContactFocusMode(true);
      } else {
        setContactFocusMode(false);
      }

      targetNode.scrollIntoView({ behavior: "auto", block: "start" });
    });
  });

  if (backToTopBtn) {
    const toggleBackToTopButton = function () {
      if (window.scrollY > 220) {
        backToTopBtn.classList.add("show");
      } else {
        backToTopBtn.classList.remove("show");
      }
    };

    window.addEventListener("scroll", toggleBackToTopButton, { passive: true });
    toggleBackToTopButton();

    backToTopBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ===== LOAD RIDES ===== */
  // Loads rides from auto-discovery first, then falls back to rides.json.
  async function loadRidesData() {
    let discoveredRides = [];

    try {
      discoveredRides = await discoverRidesFromGpxFolders();
    } catch (error) {
      console.warn("Auto-discovery skipped:", error);
    }

    if (discoveredRides.length > 0) {
      return discoveredRides;
    }

    const response = await fetch(`data/rides.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load rides.json");
    }

    const rides = await response.json();
    return Array.isArray(rides) ? rides : [];
  }

  loadRidesData()
    .then(async rides => {
      allRides = Array.isArray(rides) ? rides : [];
      lastDiscoveredRideSignature = buildDiscoveredRideSignature(allRides);
      summaryRenderCache.clear();
      renderRides();
      prewarmRideMetricsCache(allRides);

      requestAnimationFrame(() => {
        renderUploadedGraph();
      });

      enrichRideCountries(allRides)
        .then(hasUpdates => {
          if (hasUpdates) {
            summaryRenderCache.clear();
            renderRides();
            renderUploadedGraph();
            prewarmRideMetricsCache(allRides);
          }
        })
        .catch(error => {
          console.warn("Background enrichment skipped:", error);
        });

      if (!gpxAutoRefreshTimer) {
        gpxAutoRefreshTimer = setInterval(() => {
          refreshDiscoveredRidesIfChanged();
        }, GPX_AUTO_REFRESH_INTERVAL_MS);
      }
    })
    .catch(err => {
      console.error("Ride loading error:", err);
      if (container) {
        container.innerHTML = `<p class="error-message">Failed to load rides. Please try again later.</p>`;
      }
    });

  /* ===== THEME SYSTEM ===== */
  const toggleBtn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");

  if (!toggleBtn || !icon) {
    console.warn("Theme toggle elements not found.");
    return;
  }

  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }

  toggleBtn.addEventListener("click", function () {
    const current = document.documentElement.getAttribute("data-theme");

    if (current === "dark") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
      icon.textContent = "🌙";
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
      icon.textContent = "☀️";
    }
  });

});
