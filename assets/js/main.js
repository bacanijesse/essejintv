document.addEventListener("DOMContentLoaded", function () {
  let allRides = [];
  let selectedCountry = "all";
  const gpxMetricsCache = new Map();
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
  };
  let latestSummaryMetrics = null;

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
    if (!ride || typeof ride.gpxFile !== "string") {
      return ride && ride.title ? ride.title : "Ride";
    }

    const parts = ride.gpxFile.split("/");
    const fileName = parts[parts.length - 1] || "";

    if (fileName) {
      return fileName.replace(/\.gpx$/i, "");
    }

    return ride.title || "Ride";
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

        const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
        if (pathParts[0] === "shorts" && pathParts[1]) {
          return pathParts[1];
        }

        if (pathParts[0] === "embed" && pathParts[1]) {
          return pathParts[1];
        }
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function isMobileView() {
    return window.matchMedia("(max-width: 900px)").matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
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
          <button class="video-close-btn" type="button" aria-label="Close video modal">✕</button>
        </div>
        <div class="video-frame-wrap">
          <iframe class="video-frame" src="" title="Ride video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>
      </div>
    `;

    const closeButton = backdrop.querySelector(".video-close-btn");
    const modalPanel = backdrop.querySelector(".video-modal");
    const frame = backdrop.querySelector(".video-frame");
    const titleNode = backdrop.querySelector("#videoModalTitle");

    function closeVideoModal() {
      backdrop.hidden = true;
      if (frame) {
        frame.src = "";
      }
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
        closeVideoModal();
      });
    }

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) {
        closeVideoModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !backdrop.hidden) {
        closeVideoModal();
      }
    });

    document.body.appendChild(backdrop);

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

  function parseGpxMetrics(gpxText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(gpxText, "application/xml");
    const parseError = xml.querySelector("parsererror");

    if (parseError) {
      throw new Error("Invalid GPX file format.");
    }

    const trackPoints = Array.from(xml.getElementsByTagName("trkpt"));

    if (trackPoints.length < 2) {
      throw new Error("GPX has too few track points.");
    }

    const elevation = [];
    const speed = [];
    const heartRate = [];
    const temperature = [];
    const route = [];
    let latitudeSum = 0;
    let longitudeSum = 0;
    let coordinateCount = 0;
    let firstLatitude = null;
    let firstLongitude = null;

    let previousPoint = null;

    trackPoints.forEach((trackPoint, index) => {
      const latitude = Number.parseFloat(trackPoint.getAttribute("lat"));
      const longitude = Number.parseFloat(trackPoint.getAttribute("lon"));
      const elevationNode = trackPoint.getElementsByTagName("ele")[0];
      const timeNode = trackPoint.getElementsByTagName("time")[0];
      const elevationValue = elevationNode ? Number.parseFloat(elevationNode.textContent) : null;
      const timeValue = timeNode ? Date.parse(timeNode.textContent) : NaN;
      const speedFromGpx = getFirstTagValueByLocalName(trackPoint, "speed");
      const heartRateValue = getFirstTagValueByLocalName(trackPoint, "hr");
      const temperatureValue = getFirstTagValueByLocalName(trackPoint, "atemp");

      let speedValue = speedFromGpx;

      if (!Number.isFinite(speedValue) && previousPoint && Number.isFinite(timeValue) && Number.isFinite(previousPoint.timeValue)) {
        const timeSeconds = (timeValue - previousPoint.timeValue) / 1000;

        if (timeSeconds > 0) {
          const distanceMeters = haversineDistanceMeters(previousPoint.latitude, previousPoint.longitude, latitude, longitude);
          speedValue = (distanceMeters / timeSeconds) * 3.6;
        }
      } else if (Number.isFinite(speedValue)) {
        speedValue = speedValue * 3.6;
      }

      elevation.push(Number.isFinite(elevationValue) ? elevationValue : null);
      speed.push(Number.isFinite(speedValue) ? speedValue : null);
      heartRate.push(Number.isFinite(heartRateValue) ? heartRateValue : null);
      temperature.push(Number.isFinite(temperatureValue) ? temperatureValue : null);

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
      firstLatitude,
      firstLongitude,
      averageLatitude: coordinateCount > 0 ? latitudeSum / coordinateCount : null,
      averageLongitude: coordinateCount > 0 ? longitudeSum / coordinateCount : null,
      route,
    };
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

  function drawCombinedGraph(canvas, metrics, visibleSeries = { elevation: true, speed: true, heartRate: true, temperature: true }) {
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

    const visibleMetricKeys = ["elevation", "speed", "heartRate", "temperature"].filter(key => Boolean(visibleSeries[key]));
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
  }

  function updateStatLegend(panel, metrics) {
    const elevationRange = getMinMax(metrics.elevation);
    const speedRange = getMinMax(metrics.speed);
    const heartRateRange = getMinMax(metrics.heartRate);
    const temperatureRange = getMinMax(metrics.temperature);

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

    const elevationInfo = panel.querySelector("[data-metric='elevation']");
    const speedInfo = panel.querySelector("[data-metric='speed']");
    const heartRateInfo = panel.querySelector("[data-metric='heart-rate']");
    const temperatureInfo = panel.querySelector("[data-metric='temperature']");

    if (elevationInfo) elevationInfo.textContent = `Elevation: ${elevationText}`;
    if (speedInfo) speedInfo.textContent = `Speed: ${speedText}`;
    if (heartRateInfo) heartRateInfo.textContent = `Heart Rate: ${heartRateText}`;
    if (temperatureInfo) temperatureInfo.textContent = `Air Temp: ${temperatureText}`;
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
    };

    const legendButtons = Array.from(backdrop.querySelectorAll(".legend-item"));

    function updateLegendVisualState() {
      legendButtons.forEach(button => {
        const metric = button.dataset.metric;
        const metricKey = metric === "heart-rate" ? "heartRate" : metric;
        const isOn = Boolean(visibleSeries[metricKey]);
        button.classList.toggle("legend-off", !isOn);
      });
    }

    legendButtons.forEach(button => {
      button.addEventListener("click", function () {
        const metric = button.dataset.metric;
        const metricKey = metric === "heart-rate" ? "heartRate" : metric;

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
      statusNode.textContent = "Loading GPX metrics...";
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

    if (!canvas || !ride.gpxFile) {
      if (statusNode) {
        statusNode.textContent = "No GPX file available for this ride.";
      }
      return;
    }

    if (statusNode) {
      statusNode.textContent = "Loading GPX metrics...";
    }

    try {
      let metrics = gpxMetricsCache.get(ride.gpxFile);

      if (!metrics) {
        const response = await fetch(ride.gpxFile);

        if (!response.ok) {
          throw new Error("Unable to load GPX file.");
        }

        const gpxText = await response.text();
        metrics = parseGpxMetrics(gpxText);
        gpxMetricsCache.set(ride.gpxFile, metrics);
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
      console.error("GPX metrics error:", error);
      if (statusNode) {
        statusNode.textContent = "Unable to load GPX metrics for this ride.";
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
    if (!ride || !ride.gpxFile) {
      return null;
    }

    let metrics = gpxMetricsCache.get(ride.gpxFile);

    if (!metrics) {
      const response = await fetch(ride.gpxFile);

      if (!response.ok) {
        throw new Error("Unable to load GPX file.");
      }

      const gpxText = await response.text();
      metrics = parseGpxMetrics(gpxText);
      gpxMetricsCache.set(ride.gpxFile, metrics);
    }

    return metrics;
  }

  async function enrichRideCountries(rides) {
    for (const ride of rides) {
      if (!ride || !ride.gpxFile) {
        continue;
      }

      try {
        const metrics = await getRideMetrics(ride);
        const detectedCountry = detectCountryFromMetrics(metrics);

        if (detectedCountry) {
          ride.country = detectedCountry;
        }

        const avgTemperature = averageFinite(metrics.temperature);
        if (Number.isFinite(avgTemperature)) {
          ride.airTemperature = Number(avgTemperature.toFixed(1));
        }
      } catch (error) {
        console.warn("Country detection skipped for ride:", ride.title, error);
      }
    }
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

    for (const ride of rides) {
      const rideDate = toLocalDate(ride.date);
      const rideDistance = Number.parseFloat(ride.distance);
      const rideElevation = Number.parseFloat(ride.elevation);

      if (!rideDate) {
        continue;
      }

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

      try {
        const metrics = await getRideMetrics(ride);

        if (metrics) {
          const avgSpeed = averageFinite(metrics.speed);
          const avgHeartRate = averageFinite(metrics.heartRate);
          const avgTemperature = averageFinite(metrics.temperature);

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
        }
      } catch (error) {
        console.warn("Summary GPX load skipped for ride:", ride.title, error);
      }
    }

    const summaryMetrics = {
      elevation: buckets.map(bucket => Number(bucket.elevation.toFixed(2))),
      speed: buckets.map(bucket => (bucket.speedCount > 0 ? Number((bucket.speedSum / bucket.speedCount).toFixed(2)) : null)),
      heartRate: buckets.map(bucket => (bucket.heartRateCount > 0 ? Number((bucket.heartRateSum / bucket.heartRateCount).toFixed(2)) : null)),
      temperature: buckets.map(bucket => (bucket.temperatureCount > 0 ? Number((bucket.temperatureSum / bucket.temperatureCount).toFixed(2)) : null)),
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
      const metricKey = metric === "heart-rate" ? "heartRate" : metric;
      const isOn = Boolean(summaryVisibleSeries[metricKey]);
      button.classList.toggle("legend-off", !isOn);
    });
  }

  summaryLegendButtons.forEach(button => {
    button.addEventListener("click", function () {
      const metric = button.dataset.metric;
      const metricKey = metric === "heart-rate" ? "heartRate" : metric;

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
