document.addEventListener("DOMContentLoaded", function () {

  /* =========================
     LOAD RIDES
  ========================== */

  fetch("./data/rides.json")
    .then(response => response.json())
    .then(rides => {
      const container = document.getElementById("rides-grid");
      if (!container) return;

      rides.forEach(ride => {
        const card = document.createElement("div");
        card.className = "card";

        const link = document.createElement("a");
        link.href = `rides/ride.html?id=${ride.id}`;

        const img = document.createElement("img");
        img.src = ride.cover;
        img.loading = "lazy";

        link.appendChild(img);

        const content = document.createElement("div");
        content.className = "card-content";

        content.innerHTML = `
          <h2>${ride.title}</h2>
          <div class="stats">
            ${ride.distance} km • ${ride.elevation} m<br>
            ${ride.date}
          </div>
        `;

        card.appendChild(link);
        card.appendChild(content);
        container.appendChild(card);
      });
    });

  /* =========================
     THEME SYSTEM
  ========================== */

  const toggleBtn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");

  if (!toggleBtn || !icon) {
    console.error("Theme toggle elements not found.");
    return;
  }

  // Load saved theme
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    icon.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
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
