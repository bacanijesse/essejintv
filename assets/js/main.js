document.addEventListener("DOMContentLoaded", function () {
  let allRides = [];
  let selectedCountry = "all";
  const activityMetricsCache = new Map();
  const mergedRideMetricsCache = new Map();
  let fitParserModulePromise = null;
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
    contact: document.getElementById("contact-section"),
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
  let selectedSummaryPeriod = "weekly";
  const summaryVisibleSeries = {
    elevation: true,
    speed: true,
    heartRate: true,
    temperature: true,
    distance: true,
    calories: true,
  };
  let latestSummaryMetrics = null;

  function metricDataKey(metric) {
    return metric === "heart-rate" ? "heartRate" : metric;
  }

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

  function getRideDisplayName(ride) {
    const filePath = getPrimaryRideFilePath(ride);

    if (!filePath) {
      return ride && ride.title ? ride.title : "Ride";
    }

    const parts = filePath.split("/");
    const fileName = parts[parts.length - 1] || "";

    if (fileName) {
      return fileName.replace(/\.(gpx|tcx|kml|fit|csv)$/i, "");
    }

    return ride.title || "Ride";
  }

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

    return Array.from(new Set(values));
  }

  function getPrimaryRideFilePath(ride) {
    const paths = getRideFilePaths(ride);
    return paths.length > 0 ? paths[0] : null;
  }

  function getFileFormat(filePath) {
    if (typeof filePath !== "string") {
      return "";
    }

    const normalizedPath = filePath.split("?")[0].split("#")[0];
    const extensionMatch = normalizedPath.match(/\.([a-z0-9]+)$/i);
    return extensionMatch ? extensionMatch[1].toLowerCase() : "";
  }

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

  function isMobileView() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

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

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) {
        closeVideoModal();
      }
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

  function parseXmlDocument(xmlText, formatLabel) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const parseError = xml.querySelector("parsererror");

    if (parseError) {
      throw new Error(`Invalid ${formatLabel} file format.`);
    }

    return xml;
  }

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

  function buildMetricsFromSummaryValues(summaryValues) {
    const elevationValue = Number.parseFloat(summaryValues.elevation);
    const speedValue = Number.parseFloat(summaryValues.speed);
    const heartRateValue = Number.parseFloat(summaryValues.heartRate);
    const temperatureValue = Number.parseFloat(summaryValues.temperature);
    const distanceValue = Number.parseFloat(summaryValues.distance);
    const caloriesValue = Number.parseFloat(summaryValues.calories);

    const hasAnyMetric = [elevationValue, speedValue, heartRateValue, temperatureValue, distanceValue, caloriesValue]
      .some(value => Number.isFinite(value));

    if (!hasAnyMetric) {
      throw new Error("CSV does not contain supported graph metrics.");
    }

    return {
      elevation: [Number.isFinite(elevationValue) ? elevationValue : null],
      speed: [Number.isFinite(speedValue) ? speedValue : null],
      heartRate: [Number.isFinite(heartRateValue) ? heartRateValue : null],
      temperature: [Number.isFinite(temperatureValue) ? temperatureValue : null],
      distance: [Number.isFinite(distanceValue) ? distanceValue : null],
      calories: [Number.isFinite(caloriesValue) ? caloriesValue : null],
      firstLatitude: null,
      firstLongitude: null,
      averageLatitude: null,
      averageLongitude: null,
      route: [],
    };
  }

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

  function parseTcxMetrics(tcxText) {
    const xml = parseXmlDocument(tcxText, "TCX");
    const trackPoints = Array.from(xml.getElementsByTagName("Trackpoint"));
    const points = trackPoints.map(trackPoint => {
      const latitude = getFirstTagValueByLocalName(trackPoint, "LatitudeDegrees");
      const longitude = getFirstTagValueByLocalName(trackPoint, "LongitudeDegrees");
      const speedMs = getFirstTagValueByLocalName(trackPoint, "Speed");

      return {
        latitude,
        longitude,
        elevation: getFirstTagValueByLocalName(trackPoint, "AltitudeMeters"),
        timeValue: Date.parse(trackPoint.getElementsByTagName("Time")[0]?.textContent || ""),
        speedKmh: Number.isFinite(speedMs) ? speedMs * 3.6 : null,
        heartRate: getFirstTagValueByLocalName(trackPoint, "Value"),
        temperature: getFirstTagValueByLocalName(trackPoint, "Temperature"),
      };
    });

    return buildMetricsFromTrackPoints(points, "TCX");
  }

  function parseKmlMetrics(kmlText) {
    const xml = parseXmlDocument(kmlText, "KML");
    const trackPoints = [];
    const gxTrack = xml.getElementsByTagName("gx:Track")[0] || xml.getElementsByTagName("Track")[0];

    if (gxTrack) {
      const whenNodes = Array.from(gxTrack.getElementsByTagName("when"));
      const coordNodes = Array.from(gxTrack.getElementsByTagName("gx:coord"));

      for (let index = 0; index < coordNodes.length; index += 1) {
        const coordText = coordNodes[index]?.textContent?.trim() || "";
        const [longitudeValue, latitudeValue, altitudeValue] = coordText.split(/\s+/).map(Number.parseFloat);

        trackPoints.push({
          latitude: latitudeValue,
          longitude: longitudeValue,
          elevation: altitudeValue,
          timeValue: Date.parse(whenNodes[index]?.textContent || ""),
          speedKmh: null,
          heartRate: null,
          temperature: null,
        });
      }
    } else {
      const coordinatesNode = xml.getElementsByTagName("coordinates")[0];
      const rows = coordinatesNode?.textContent?.trim().split(/\s+/) || [];

      rows.forEach(row => {
        const [longitudeValue, latitudeValue, altitudeValue] = row.split(",").map(Number.parseFloat);

        trackPoints.push({
          latitude: latitudeValue,
          longitude: longitudeValue,
          elevation: altitudeValue,
          timeValue: NaN,
          speedKmh: null,
          heartRate: null,
          temperature: null,
        });
      });
    }

    return buildMetricsFromTrackPoints(trackPoints, "KML");
  }

  function parseCsvMetrics(csvText) {
    const rows = csvText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (rows.length < 2) {
      throw new Error("CSV has too few rows.");
    }

    const delimiter = rows[0].split(";").length > rows[0].split(",").length ? ";" : ",";
    const headers = rows[0].split(delimiter).map(value => value.trim());
    const normalizeHeader = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedHeaders = headers.map(normalizeHeader);

    const findIndex = candidates => normalizedHeaders.findIndex(header => candidates.includes(header));

    const latitudeIndex = findIndex(["lat", "latitude", "latdeg", "latitudedegrees"]);
    const longitudeIndex = findIndex(["lon", "lng", "long", "longitude", "longitudedegrees"]);
    const elevationIndex = findIndex(["ele", "elevation", "alt", "altitude", "altitudemeters"]);
    const timeIndex = findIndex(["time", "timestamp", "datetime", "date"]);
    const speedIndex = findIndex(["speed", "speedkmh", "speedkph", "enhancedspeed"]);
    const distanceIndex = findIndex(["distance", "distancekm", "distkm", "dist"]);
    const caloriesIndex = findIndex(["calories", "kcal"]);
    const heartRateIndex = findIndex(["hr", "heartrate", "heartratebpm", "heartratevalue", "heart_rate"]);
    const temperatureIndex = findIndex(["temp", "temperature", "atemp", "airtemp", "airtemperature"]);
    const avgSpeedIndex = findIndex(["avgspeed", "avgmovingspeed"]);
    const avgHeartRateIndex = findIndex(["avghr", "avgheartrate", "avgheartratebpm"]);
    const avgTemperatureIndex = findIndex(["avgtemperature", "avgtemp", "avgairtemperature"]);
    const totalAscentIndex = findIndex(["totalascent", "elevationgain", "ascent"]);
    const totalCaloriesIndex = findIndex(["calories", "kcal", "totalcalories"]);
    const totalDistanceIndex = findIndex(["distance", "distancekm", "distkm", "totaldistance"]);

    const speedHeader = speedIndex >= 0 ? headers[speedIndex].toLowerCase() : "";
    const speedInMetersPerSecond = speedHeader.includes("m/s") || speedHeader.includes(" mps ");

    const points = rows.slice(1).map(row => {
      const columns = row.split(delimiter).map(value => value.trim());
      const rawSpeed = speedIndex >= 0 ? Number.parseFloat(columns[speedIndex]) : null;
      const rawDistance = distanceIndex >= 0 ? Number.parseFloat(columns[distanceIndex]) : null;

      return {
        latitude: latitudeIndex >= 0 ? Number.parseFloat(columns[latitudeIndex]) : null,
        longitude: longitudeIndex >= 0 ? Number.parseFloat(columns[longitudeIndex]) : null,
        elevation: elevationIndex >= 0 ? Number.parseFloat(columns[elevationIndex]) : null,
        timeValue: timeIndex >= 0 ? Date.parse(columns[timeIndex]) : NaN,
        distanceKm: Number.isFinite(rawDistance) ? rawDistance : null,
        speedKmh: Number.isFinite(rawSpeed) ? (speedInMetersPerSecond ? rawSpeed * 3.6 : rawSpeed) : null,
        calories: caloriesIndex >= 0 ? Number.parseFloat(columns[caloriesIndex]) : null,
        heartRate: heartRateIndex >= 0 ? Number.parseFloat(columns[heartRateIndex]) : null,
        temperature: temperatureIndex >= 0 ? Number.parseFloat(columns[temperatureIndex]) : null,
      };
    });

    const hasCoordinateColumns = latitudeIndex >= 0 && longitudeIndex >= 0;

    if (!hasCoordinateColumns) {
      const summaryRow = rows.slice(1)
        .map(row => row.split(delimiter).map(value => value.trim()))
        .find(columns => (columns[0] || "").toLowerCase().includes("summary"))
        || rows.slice(1).map(row => row.split(delimiter).map(value => value.trim()))[0];

      return buildMetricsFromSummaryValues({
        elevation: totalAscentIndex >= 0 ? summaryRow?.[totalAscentIndex] : null,
        speed: avgSpeedIndex >= 0 ? summaryRow?.[avgSpeedIndex] : null,
        heartRate: avgHeartRateIndex >= 0 ? summaryRow?.[avgHeartRateIndex] : null,
        temperature: avgTemperatureIndex >= 0 ? summaryRow?.[avgTemperatureIndex] : null,
        distance: totalDistanceIndex >= 0 ? summaryRow?.[totalDistanceIndex] : null,
        calories: totalCaloriesIndex >= 0 ? summaryRow?.[totalCaloriesIndex] : null,
      });
    }

    return buildMetricsFromTrackPoints(points, "CSV");
  }

  async function loadFitParserClass() {
    if (!fitParserModulePromise) {
      fitParserModulePromise = import("https://unpkg.com/fit-file-parser@2.3.3/dist/fit-parser.js")
        .then(moduleValue => moduleValue.default || moduleValue.FitParser)
        .catch(error => {
          fitParserModulePromise = null;
          throw error;
        });
    }

    return fitParserModulePromise;
  }

  async function parseFitMetrics(arrayBuffer) {
    const FitParser = await loadFitParserClass();
    const fitParser = new FitParser({
      force: true,
      speedUnit: "km/h",
      temperatureUnit: "celsius",
      mode: "list",
    });

    const fitData = await fitParser.parseAsync(arrayBuffer);
    const records = Array.isArray(fitData?.records) ? fitData.records : [];
    const sessions = Array.isArray(fitData?.sessions) ? fitData.sessions : [];
    const totalCalories = Number.parseFloat(sessions[0]?.total_calories);
    const points = records.map(record => {
      const latitude = Number.parseFloat(record.position_lat ?? record.positionLat);
      const longitude = Number.parseFloat(record.position_long ?? record.positionLong ?? record.position_lng);
      const speedKmh = Number.parseFloat(record.speed ?? record.enhanced_speed);

      return {
        latitude,
        longitude,
        elevation: Number.parseFloat(record.enhanced_altitude ?? record.altitude),
        timeValue: Date.parse(record.timestamp),
        distanceKm: Number.parseFloat(record.distance) / 1000,
        speedKmh,
        calories: Number.parseFloat(record.calories),
        heartRate: Number.parseFloat(record.heart_rate),
        temperature: Number.parseFloat(record.temperature),
      };
    });

    const metrics = buildMetricsFromTrackPoints(points, "FIT");

    if (Number.isFinite(totalCalories)) {
      const hasCalories = Array.isArray(metrics.calories) && metrics.calories.some(value => Number.isFinite(value));
      if (!hasCalories) {
        metrics.calories = [totalCalories];
      }
    }

    return metrics;
  }

  async function parseMetricsFromFile(filePath) {
    const format = getFileFormat(filePath);

    if (!["gpx", "tcx", "kml", "fit", "csv"].includes(format)) {
      throw new Error("Unsupported activity file format.");
    }

    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error("Unable to load activity file.");
    }

    if (format === "fit") {
      const fitBuffer = await response.arrayBuffer();
      return parseFitMetrics(fitBuffer);
    }

    const fileText = await response.text();

    if (format === "gpx") {
      return parseGpxMetrics(fileText);
    }

    if (format === "tcx") {
      return parseTcxMetrics(fileText);
    }

    if (format === "kml") {
      return parseKmlMetrics(fileText);
    }

    return parseCsvMetrics(fileText);
  }

  function countFiniteValues(values) {
    if (!Array.isArray(values)) {
      return 0;
    }

    return values.reduce((count, value) => (Number.isFinite(value) ? count + 1 : count), 0);
  }

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

  async function getMetricsForFilePath(filePath) {
    let metrics = activityMetricsCache.get(filePath);

    if (!metrics) {
      metrics = await parseMetricsFromFile(filePath);
      activityMetricsCache.set(filePath, metrics);
    }

    return metrics;
  }

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

  function detectCountryFromMetrics(metrics) {
    if (!metrics) {
      return null;
    }

    return detectCountryFromCoordinates(metrics.averageLatitude, metrics.averageLongitude)
      || detectCountryFromCoordinates(metrics.firstLatitude, metrics.firstLongitude)
      || null;
  }

  function getMinMax(values) {
    const valid = values.filter(value => Number.isFinite(value));

    if (valid.length === 0) {
      return null;
    }

    return {
      min: Math.min(...valid),
      max: Math.max(...valid),
    };
  }

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

  function drawCombinedGraph(canvas, metrics, visibleSeries = { elevation: true, speed: true, heartRate: true, temperature: true, distance: true, calories: true }) {
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

    const visibleMetricKeys = ["elevation", "speed", "heartRate", "temperature", "distance", "calories"].filter(key => Boolean(visibleSeries[key]));
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
      } else if (singleKey === "calories") {
        yAxisTitle = "Calories (kcal)";
        yLabelFormatter = value => String(Math.round(value));
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

    if (visibleSeries.calories) {
      const caloriesSeries = mapValuesToCurrentScale(metrics.calories);
      drawSeries(ctx, caloriesSeries, "#ff9800", leftPadding, topPadding, plotWidth, plotHeight);
    }
  }

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
        <canvas class="metrics-canvas" width="860" height="340" aria-label="Ride metrics chart"></canvas>
        <div class="metrics-map" aria-label="Ride route map"></div>
        <div class="metrics-legend">
          <button class="legend-item legend-elevation" data-metric="elevation" type="button">Elevation: --</button>
          <button class="legend-item legend-speed" data-metric="speed" type="button">Speed: --</button>
          <button class="legend-item legend-heart-rate" data-metric="heart-rate" type="button">Heart Rate: --</button>
          <button class="legend-item legend-temperature" data-metric="temperature" type="button">Air Temp: --</button>
          <button class="legend-item legend-distance" data-metric="distance" type="button">Distance: --</button>
          <button class="legend-item legend-calories" data-metric="calories" type="button">Calories: --</button>
        </div>
        <p class="metrics-status" aria-live="polite"></p>
      </div>
    `;

    const modalPanel = backdrop.querySelector(".metrics-modal");
    const closeButton = backdrop.querySelector(".metrics-close-btn");

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

      if (closeButton || event.target === backdrop) {
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
      calories: true,
    };

    const legendButtons = Array.from(backdrop.querySelectorAll(".legend-item"));

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
      mapLayer: null,
      resetVisibleSeries() {
        this.visibleSeries.elevation = true;
        this.visibleSeries.speed = true;
        this.visibleSeries.heartRate = true;
        this.visibleSeries.temperature = true;
        this.visibleSeries.distance = true;
        this.visibleSeries.calories = true;
        updateLegendVisualState();
      },
    };

    return metricsModal;
  }

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
    if (statusNode) {
      statusNode.textContent = "Loading ride metrics...";
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
      }, 0);
    }
  }

  function renderMetricsMap(panel, metrics) {
    if (!metricsModal || !panel || !metrics || !Array.isArray(metrics.route) || metrics.route.length === 0) {
      return;
    }

    const mapContainer = panel.querySelector(".metrics-map");

    if (!mapContainer || !window.L) {
      return;
    }

    if (!metricsModal.map) {
      metricsModal.map = window.L.map(mapContainer, {
        zoomControl: true,
      });

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(metricsModal.map);
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
  }

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

  function averageFinite(values) {
    const valid = values.filter(value => Number.isFinite(value));

    if (valid.length === 0) {
      return null;
    }

    const sum = valid.reduce((total, value) => total + value, 0);
    return sum / valid.length;
  }

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

    const sourceMetrics = [];

    for (const filePath of rideFilePaths) {
      try {
        const metrics = await getMetricsForFilePath(filePath);
        if (metrics) {
          sourceMetrics.push(metrics);
        }
      } catch (error) {
        console.warn("Skipped activity source:", filePath, error);
      }
    }

    mergedMetrics = mergeMetricsFromSources(sourceMetrics);

    if (mergedMetrics) {
      mergedRideMetricsCache.set(mergeCacheKey, mergedMetrics);
    }

    return mergedMetrics;
  }

  async function enrichRideCountries(rides) {
    const metricPromises = rides.map(async ride => {
      if (!ride || getRideFilePaths(ride).length === 0) {
        return { ride, metrics: null, error: null };
      }

      try {
        const metrics = await getRideMetrics(ride);
        return { ride, metrics, error: null };
      } catch (error) {
        return { ride, metrics: null, error };
      }
    });

    const results = await Promise.all(metricPromises);

    results.forEach(({ ride, metrics, error }) => {
      if (error) {
        console.warn("Country detection skipped for ride:", ride?.title, error);
        return;
      }

      if (!ride || !metrics) {
        return;
      }

      const detectedCountry = detectCountryFromMetrics(metrics);

      if (detectedCountry) {
        ride.country = detectedCountry;
      }

      const avgTemperature = averageFinite(metrics.temperature);
      if (Number.isFinite(avgTemperature)) {
        ride.airTemperature = Number(avgTemperature.toFixed(1));
      }
    });
  }

  async function renderUploadedGraph() {
    if (!uploadedGraphSection || !uploadedGraphCanvas) {
      return;
    }

    if (uploadedGraphStatus) {
      uploadedGraphStatus.textContent = "Loading cycling summary...";
    }

    const rides = (Array.isArray(allRides) ? allRides : []).filter(ride => {
      if (selectedCountry === "all") {
        return true;
      }

      return (ride.country || "").toLowerCase() === selectedCountry;
    });
    const now = new Date();

    const toLocalDate = value => {
      if (typeof value !== "string") {
        return null;
      }

      const parsed = new Date(`${value}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const formatDayLabel = date => `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    const formatMonthLabel = date => date.toLocaleString("en-US", { month: "short" });

    const createDayBuckets = (totalDays, bucketDays) => {
      const bucketCount = Math.ceil(totalDays / bucketDays);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const buckets = [];

      for (let bucketIndex = bucketCount - 1; bucketIndex >= 0; bucketIndex -= 1) {
        const endDate = new Date(today);
        endDate.setDate(today.getDate() - bucketDays * (bucketCount - 1 - bucketIndex));
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - (bucketDays - 1));

        buckets.push({
          startDate,
          endDate,
          elevation: 0,
          speedSum: 0,
          speedCount: 0,
          heartRateSum: 0,
          heartRateCount: 0,
          temperatureSum: 0,
          temperatureCount: 0,
          distance: 0,
          calories: 0,
          label: bucketDays === 1
            ? formatDayLabel(endDate)
            : `${formatDayLabel(startDate)}-${formatDayLabel(endDate)}`,
        });
      }

      return buckets;
    };

    const createMonthBuckets = monthCount => {
      const buckets = [];

      for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        buckets.push({
          startDate,
          endDate,
          elevation: 0,
          speedSum: 0,
          speedCount: 0,
          heartRateSum: 0,
          heartRateCount: 0,
          temperatureSum: 0,
          temperatureCount: 0,
          distance: 0,
          calories: 0,
          label: formatMonthLabel(startDate),
        });
      }

      return buckets;
    };

    let buckets = [];

    if (selectedSummaryPeriod === "weekly") {
      buckets = createDayBuckets(7, 1);
    } else if (selectedSummaryPeriod === "monthly") {
      buckets = createDayBuckets(28, 7);
    } else if (selectedSummaryPeriod === "half") {
      buckets = createMonthBuckets(6);
    } else {
      buckets = createMonthBuckets(12);
    }

    const rideMetricResults = await Promise.all(rides.map(async ride => {
      const rideDate = toLocalDate(ride.date);
      const rideDistance = Number.parseFloat(ride.distance);
      const rideElevation = Number.parseFloat(ride.elevation);

      if (!rideDate) {
        return null;
      }

      let metrics = null;

      try {
        metrics = await getRideMetrics(ride);
      } catch (error) {
        console.warn("Summary activity load skipped for ride:", ride.title, error);
      }

      return {
        ride,
        rideDate,
        rideDistance,
        rideElevation,
        metrics,
      };
    }));

    for (const result of rideMetricResults) {
      if (!result) {
        continue;
      }

      const {
        rideDate,
        rideDistance,
        rideElevation,
        metrics,
      } = result;

      const bucket = buckets.find(item => rideDate >= item.startDate && rideDate <= item.endDate);

      if (!bucket) {
        continue;
      }

      if (Number.isFinite(rideDistance)) {
        bucket.distance += rideDistance;
      }

      if (Number.isFinite(rideElevation)) {
        bucket.elevation += rideElevation;
      }

      if (metrics) {
        const avgSpeed = averageFinite(metrics.speed);
        const avgHeartRate = averageFinite(metrics.heartRate);
        const avgTemperature = averageFinite(metrics.temperature);
        const avgDistance = averageFinite(metrics.distance);
        const avgCalories = averageFinite(metrics.calories);

        if (Number.isFinite(avgSpeed)) {
          bucket.speedSum += avgSpeed;
          bucket.speedCount += 1;
        }

        if (Number.isFinite(avgHeartRate)) {
          bucket.heartRateSum += avgHeartRate;
          bucket.heartRateCount += 1;
        }

        if (Number.isFinite(avgTemperature)) {
          bucket.temperatureSum += avgTemperature;
          bucket.temperatureCount += 1;
        }

        if (!Number.isFinite(rideDistance) && Number.isFinite(avgDistance)) {
          bucket.distance += avgDistance;
        }

        if (Number.isFinite(avgCalories)) {
          bucket.calories += avgCalories;
        }
      }
    }

    const summaryMetrics = {
      elevation: buckets.map(bucket => Number(bucket.elevation.toFixed(2))),
      speed: buckets.map(bucket => (bucket.speedCount > 0 ? Number((bucket.speedSum / bucket.speedCount).toFixed(2)) : null)),
      heartRate: buckets.map(bucket => (bucket.heartRateCount > 0 ? Number((bucket.heartRateSum / bucket.heartRateCount).toFixed(2)) : null)),
      temperature: buckets.map(bucket => (bucket.temperatureCount > 0 ? Number((bucket.temperatureSum / bucket.temperatureCount).toFixed(2)) : null)),
      distance: buckets.map(bucket => Number(bucket.distance.toFixed(2))),
      calories: buckets.map(bucket => Number(bucket.calories.toFixed(2))),
    };
    const totalDistance = buckets.reduce((sum, bucket) => sum + bucket.distance, 0);

    latestSummaryMetrics = summaryMetrics;

    drawCombinedGraph(uploadedGraphCanvas, summaryMetrics, summaryVisibleSeries);
    updateStatLegend(uploadedGraphSection, summaryMetrics);

    if (uploadedGraphStatus) {
      const countryLabel = selectedCountry === "all"
        ? "all countries"
        : selectedCountry;
      uploadedGraphStatus.textContent = `Total distance: ${totalDistance.toFixed(2)} km (${selectedSummaryPeriod}, ${countryLabel})`;
    }
  }

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



  function createRideCard(ride) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    const youtubeUrl = typeof ride.youtubeUrl === "string" && ride.youtubeUrl.trim()
      ? ride.youtubeUrl.trim()
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ride.title || "ride"} cycling`)}`;

    card.innerHTML = `
      ${(ride.thumbnail || ride.cover) ? `<img class="card-thumbnail" src="${ride.thumbnail || ride.cover}" loading="lazy" alt="${ride.title}">` : ''}
      <div class="card-content">
        <h2>${getCountryFlag(ride.country)} ${getRideDisplayName(ride)} <span class="card-metrics-icon" aria-hidden="true">📈</span></h2>
        <div class="card-meta">
          <div class="stats">
            ${ride.distance} km • ${ride.elevation} m • ${Number.isFinite(Number(ride.airTemperature)) ? Number(ride.airTemperature).toFixed(1) : "--"} °C<br>
            ${ride.date}
          </div>
          <a class="youtube-link" href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" aria-label="Watch ride video on YouTube">▶ YouTube</a>
        </div>
      </div>
    `;

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

      if (container) {
        container.scrollIntoView({ behavior: "auto", block: "start" });
      }
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
  fetch("data/rides.json")
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to load rides.json");
      }
      return res.json();
    })
    .then(async rides => {
      allRides = Array.isArray(rides) ? rides : [];
      await enrichRideCountries(allRides);
      renderRides();
      renderUploadedGraph();
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
