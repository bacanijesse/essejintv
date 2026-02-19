// LOAD RIDES
fetch("data/rides.json")
  .then(res => res.json())
  .then(rides => {
    const container = document.getElementById("rides-grid");
    if (!container) return;

    rides.forEach(ride => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <a href="rides/ride.html?id=${ride.id}">
          <img src="${ride.cover}" loading="lazy">
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
  });

// THEME SYSTEM
const toggleBtn = document.getElementById("themeToggle");
const icon = document.getElementById("themeIcon");

if (toggleBtn && icon) {

  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    icon.textContent = "☀️";
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
