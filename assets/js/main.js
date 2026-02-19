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
