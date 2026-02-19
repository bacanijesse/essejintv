document.addEventListener("DOMContentLoaded", function () {
  let allRides = [];
  let selectedCountry = "all";
  const gpxMetricsCache = new Map();
  let metricsModal = null;

  const container = document.getElementById("rides-grid");
  const menuButtons = document.querySelectorAll(".menu-btn");

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
    };
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

  function drawSeries(ctx, normalizedValues, color, width, height, padding) {
    const validCount = normalizedValues.filter(value => value !== null).length;

    if (validCount < 2) {
      return;
    }

    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const xStep = normalizedValues.length > 1 ? innerWidth / (normalizedValues.length - 1) : innerWidth;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    let started = false;

    normalizedValues.forEach((value, index) => {
      if (value === null) {
        started = false;
        return;
      }

      const x = padding + index * xStep;
      const y = padding + (1 - value) * innerHeight;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  function drawCombinedGraph(canvas, metrics) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(120,120,120,0.35)";
    ctx.lineWidth = 1;

    for (let line = 0; line <= 4; line += 1) {
      const y = padding + ((height - padding * 2) / 4) * line;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    drawSeries(ctx, normalizeValues(metrics.elevation), "#e53935", width, height, padding);
    drawSeries(ctx, normalizeValues(metrics.speed), "#2e7d32", width, height, padding);
    drawSeries(ctx, normalizeValues(metrics.heartRate), "#1e88e5", width, height, padding);
  }

  function updateStatLegend(panel, metrics) {
    const elevationRange = getMinMax(metrics.elevation);
    const speedRange = getMinMax(metrics.speed);
    const heartRateRange = getMinMax(metrics.heartRate);

    const elevationText = elevationRange
      ? `${Math.round(elevationRange.min)}-${Math.round(elevationRange.max)} m`
      : "No data";

    const speedText = speedRange
      ? `${speedRange.min.toFixed(1)}-${speedRange.max.toFixed(1)} km/h`
      : "No data";

    const heartRateText = heartRateRange
      ? `${Math.round(heartRateRange.min)}-${Math.round(heartRateRange.max)} bpm`
      : "No data";

    const elevationInfo = panel.querySelector("[data-metric='elevation']");
    const speedInfo = panel.querySelector("[data-metric='speed']");
    const heartRateInfo = panel.querySelector("[data-metric='heart-rate']");

    if (elevationInfo) elevationInfo.textContent = `Elevation: ${elevationText}`;
    if (speedInfo) speedInfo.textContent = `Speed: ${speedText}`;
    if (heartRateInfo) heartRateInfo.textContent = `Heart Rate: ${heartRateText}`;
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
        <div class="metrics-legend">
          <span class="legend-item legend-elevation" data-metric="elevation">Elevation: --</span>
          <span class="legend-item legend-speed" data-metric="speed">Speed: --</span>
          <span class="legend-item legend-heart-rate" data-metric="heart-rate">Heart Rate: --</span>
        </div>
        <p class="metrics-status" aria-live="polite"></p>
      </div>
    `;

    const closeButton = backdrop.querySelector(".metrics-close-btn");

    function closeModal() {
      backdrop.hidden = true;
      document.body.classList.remove("modal-open");
    }

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) {
        closeModal();
      }
    });

    if (closeButton) {
      closeButton.addEventListener("click", closeModal);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !backdrop.hidden) {
        closeModal();
      }
    });

    document.body.appendChild(backdrop);

    metricsModal = {
      backdrop,
      closeModal,
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
      titleNode.textContent = `${ride.title} Metrics`;
    }

    const statusNode = panel.querySelector(".metrics-status");
    if (statusNode) {
      statusNode.textContent = "Loading GPX metrics...";
    }

    modal.backdrop.hidden = false;
    document.body.classList.add("modal-open");
    await loadAndRenderMetrics(panel, ride);
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

      drawCombinedGraph(canvas, metrics);
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

  function createRideCard(ride) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    card.innerHTML = `
      ${ride.cover ? `<img src="${ride.cover}" loading="lazy" alt="${ride.title}">` : ''}
      <div class="card-content">
        <h2>${ride.title} <span class="card-metrics-icon" aria-hidden="true">📈</span></h2>
        <div class="stats">
          ${ride.distance} km • ${ride.elevation} m<br>
          ${ride.date}
        </div>
      </div>
    `;

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
      return;
    }

    filteredRides.forEach(ride => {
      container.appendChild(createRideCard(ride));
    });
  }

  menuButtons.forEach(button => {
    button.addEventListener("click", function () {
      selectedCountry = this.dataset.country || "all";

      menuButtons.forEach(btn => btn.classList.remove("active"));
      this.classList.add("active");

      renderRides();
    });
  });

  /* ===== LOAD RIDES ===== */
  fetch("data/rides.json")
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to load rides.json");
      }
      return res.json();
    })
    .then(rides => {
      allRides = Array.isArray(rides) ? rides : [];
      renderRides();
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
