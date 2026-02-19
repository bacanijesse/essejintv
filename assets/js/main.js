document.addEventListener("DOMContentLoaded", function () {
  let allRides = [];
  let selectedCountry = "all";

  const container = document.getElementById("rides-grid");
  const menuButtons = document.querySelectorAll(".menu-btn");

  function createRideCard(ride) {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <a href="rides/ride.html?id=${ride.id || ''}">
        ${ride.cover ? `<img src="${ride.cover}" loading="lazy" alt="${ride.title}">` : ''}
      </a>
      <div class="card-content">
        <h2>${ride.title}</h2>
        <div class="stats">
          ${ride.distance} km • ${ride.elevation} m<br>
          ${ride.date}
        </div>
      </div>
    `;

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
