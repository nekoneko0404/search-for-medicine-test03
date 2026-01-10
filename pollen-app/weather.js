
// Weather Display Logic
let isWeatherVisible = false;
let weatherLayerGroup;

function getWeatherIcon(code) {
    if (code === 0) return '<i class="fas fa-sun" style="color: #f39c12;"></i>';
    if (code >= 1 && code <= 3) return '<i class="fas fa-cloud-sun" style="color: #f1c40f;"></i>';
    if (code === 45 || code === 48) return '<i class="fas fa-smog" style="color: #95a5a6;"></i>';
    if (code >= 51 && code <= 57) return '<i class="fas fa-cloud-rain" style="color: #3498db;"></i>';
    if (code >= 61 && code <= 67) return '<i class="fas fa-umbrella" style="color: #2980b9;"></i>';
    if (code >= 71 && code <= 77) return '<i class="fas fa-snowflake" style="color: #ecf0f1;"></i>';
    if (code >= 80 && code <= 82) return '<i class="fas fa-cloud-showers-heavy" style="color: #2980b9;"></i>';
    if (code >= 85 && code <= 86) return '<i class="fas fa-snowflake" style="color: #bdc3c7;"></i>';
    if (code >= 95 && code <= 99) return '<i class="fas fa-bolt" style="color: #f1c40f;"></i>';
    return '<i class="fas fa-question"></i>';
}

async function toggleWeather() {
    console.log('toggleWeather called, current state:', isWeatherVisible);
    isWeatherVisible = !isWeatherVisible;
    const btn = document.getElementById('toggle-weather');

    if (isWeatherVisible) {
        console.log('Turning weather ON');
        if (btn) btn.classList.add('active');
        await updateWeatherMarkers();
    } else {
        console.log('Turning weather OFF');
        if (btn) btn.classList.remove('active');
        if (weatherLayerGroup) {
            weatherLayerGroup.clearLayers();
        }
    }
}

const weatherCache = {};
const WEATHER_CACHE_DURATION = 10 * 60 * 1000;

async function updateWeatherMarkers() {
    console.log('updateWeatherMarkers called');

    if (!isWeatherVisible) {
        console.log('Weather not visible, returning');
        return;
    }

    if (typeof map === 'undefined' || !map) {
        console.error('Map is not defined!');
        return;
    }

    if (!weatherLayerGroup) {
        console.log('Creating weather layer group');
        weatherLayerGroup = L.layerGroup().addTo(map);
    }

    const zoom = map.getZoom();
    const bounds = map.getBounds();
    console.log('Zoom:', zoom);

    if (typeof CITIES === 'undefined' || !CITIES) {
        console.error('CITIES data is missing!');
        return;
    }

    let targetLevels = new Set();
    if (zoom < 9) {
        targetLevels.add(1);
    } else if (zoom >= 9 && zoom < 12) {
        targetLevels.add(1);
        targetLevels.add(2);
    } else if (zoom >= 12) {
        targetLevels.add(1);
        targetLevels.add(2);
        targetLevels.add(3);
    }

    let visibleCities = CITIES.filter(c => {
        if (!bounds.contains([c.lat, c.lng])) return false;
        return targetLevels.has(c.level);
    });

    console.log('Visible cities:', visibleCities.length);

    let maxWeatherMarkers;
    if (zoom < 9) maxWeatherMarkers = 8;
    else if (zoom < 10) maxWeatherMarkers = 12;
    else if (zoom < 11) maxWeatherMarkers = 20;
    else maxWeatherMarkers = 30;

    const citiesToFetch = visibleCities.slice(0, maxWeatherMarkers);
    console.log('Cities to fetch:', citiesToFetch.length);

    if (weatherLayerGroup) weatherLayerGroup.clearLayers();

    const cachedCities = [];
    const uncachedCities = [];
    const now = Date.now();

    for (const city of citiesToFetch) {
        if (weatherCache[city.code] && (now - weatherCache[city.code].timestamp < WEATHER_CACHE_DURATION)) {
            cachedCities.push({ city, weather: weatherCache[city.code].data });
        } else {
            uncachedCities.push(city);
        }
    }

    console.log('Cached:', cachedCities.length, 'Uncached:', uncachedCities.length);

    const createMarker = (city, weather) => {
        if (!isWeatherVisible) return;
        console.log('Creating marker for:', city.name);
        const precipText = weather.precipitation > 0 ? `${weather.precipitation}mm` : '';
        const iconHtml = `
            <div class="weather-marker">
                <div class="weather-icon">${getWeatherIcon(weather.weathercode)}</div>
                <div class="weather-temp">${Math.round(weather.temperature_2m)}°</div>
                ${precipText ? `<div class="weather-precip">${precipText}</div>` : ''}
            </div>
        `;
        const icon = L.divIcon({
            className: 'custom-weather-icon',
            html: iconHtml,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
        const marker = L.marker([city.lat, city.lng], { icon: icon });
        weatherLayerGroup.addLayer(marker);
    };

    cachedCities.forEach(item => createMarker(item.city, item.weather));

    // Fetch uncached cities one by one with delay to avoid rate limiting
    for (let i = 0; i < uncachedCities.length; i++) {
        if (!isWeatherVisible) break;

        const city = uncachedCities[i];
        console.log(`Fetching weather for: ${city.name} (${i + 1}/${uncachedCities.length})`);

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}&current=temperature_2m,precipitation,weathercode&timezone=Asia%2FTokyo`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                const weather = data.current;
                weatherCache[city.code] = { data: weather, timestamp: Date.now() };
                createMarker(city, weather);
            } else if (response.status === 429) {
                console.warn('Rate limit hit, stopping weather fetch');
                break;
            } else {
                console.error('Weather API error:', response.status);
            }
        } catch (e) {
            console.error('Weather fetch error:', e);
        }


        // Wait 1000ms (1 second) between each request to avoid rate limiting
        if (i < uncachedCities.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log('Weather markers update complete');
}

// Initialize weather button - use a check interval to wait for map
function initWeatherFeature() {
    const weatherBtn = document.getElementById('toggle-weather');
    if (weatherBtn) {
        console.log('Weather button found, adding click listener');
        weatherBtn.addEventListener('click', toggleWeather);
    } else {
        console.error('Weather button not found!');
    }

    // Wait for map to be initialized
    const checkMap = setInterval(() => {
        if (typeof map !== 'undefined' && map) {
            console.log('Map found, adding event listeners');
            clearInterval(checkMap);

            map.on('zoomend', () => {
                if (isWeatherVisible) {
                    console.log('Zoom changed, updating weather markers');
                    updateWeatherMarkers();
                }
            });

            map.on('moveend', () => {
                if (isWeatherVisible) {
                    console.log('Map moved, updating weather markers');
                    updateWeatherMarkers();
                }
            });
        }
    }, 100);

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkMap), 10000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeatherFeature);
} else {
    initWeatherFeature();
}
