// Load rides from JSON
async function loadRides() {
    try {
        const response = await fetch('rides.json'); // Adjust the path as necessary
        const rides = await response.json();
        generateRideCards(rides);
    } catch (error) {
        console.error('Error loading rides:', error);
    }
}

// Generate ride cards dynamically
function generateRideCards(rides) {
    const ridesContainer = document.getElementById('rides-container'); // Ensure this container exists in your HTML

    rides.forEach(ride => {
        const card = document.createElement('div');
        card.className = 'ride-card';
        card.innerHTML = `
            <h3>${ride.name}</h3>
            <p>${ride.description}</p>
            <p>Location: ${ride.location}</p>
        `;
        ridesContainer.appendChild(card);
    });
}

// Theme toggle feature
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme'); // Ensure you have CSS for this class

    // Save the current theme in localStorage
    localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
}

// Load theme from localStorage
function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
    }
}

// Initialize the app
function init() {
    loadTheme();
    loadRides();
    const themeToggleBtn = document.getElementById('theme-toggle-btn'); // Ensure this button exists in your HTML
    themeToggleBtn.addEventListener('click', toggleTheme);
}

// Run the app
document.addEventListener('DOMContentLoaded', init);