document.addEventListener("DOMContentLoaded", function () {
  loadRides();
  initTheme();
});

function loadRides() {
  fetch("data/rides.json")
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to load rides.json");
      }
      return res.json();
    })
    .then(rides => {
      const container = document.getElementById("rides-grid");
      if (!container) return;

      rides.forEach(ride => {
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

        container.appendChild(card);
      });
    })
    .catch(err => {
      console.error("Ride loading error:", err);
      const container = document.getElementById("rides-grid");
      if (container) {
        container.innerHTML = `<p class="error-message">Failed to load rides. Please try again later.</p>`;
      }
    });
}

function initTheme() {
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
}
