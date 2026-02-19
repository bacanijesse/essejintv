document.addEventListener("DOMContentLoaded", function () {

  // LOAD RIDES
  fetch("./data/rides.json")
    .then(response => response.json())
    .then(rides => {
      const container = document.getElementById("rides-grid");

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

  // THEME TOGGLE
  const toggleBtn = document.getElementById("themeToggle");

  toggleBtn.addEventListener("click", function () {
    const current = document.documentElement.getAttribute("data-theme");

    if (current === "dark") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
      toggleBtn.textContent = "Dark";
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
      toggleBtn.textContent = "Light";
    }
  });

});
