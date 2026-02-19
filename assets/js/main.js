fetch('data/rides.json')
  .then(response => response.json())
  .then(rides => {
    const container = document.getElementById('rides-grid');

    rides.forEach(ride => {
      const card = document.createElement('div');
      card.className = 'card';

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

