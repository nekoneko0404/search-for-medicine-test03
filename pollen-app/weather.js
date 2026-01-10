
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

// Wind Animation Logic
class WindAnimation {
    constructor(map) {
        this.map = map;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'wind-canvas';
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.windData = []; // Array of {lat, lng, u, v}
        this.isActive = false;
        this.animationFrameId = null;

        // Particle settings
        this.particleCount = 1500;
        this.maxAge = 60;
        this.velocityScale = 0.01;
        this.opacity = 0.7;

        this.initCanvas();
        this.map.on('move', () => this.resetCanvas());
        this.map.on('resize', () => this.resetCanvas());
    }

    initCanvas() {
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '400'; // Above tiles, below markers
        this.map.getPanes().overlayPane.appendChild(this.canvas);
        this.resetCanvas();
    }

    resetCanvas() {
        const size = this.map.getSize();
        this.canvas.width = size.x;
        this.canvas.height = size.y;
        const origin = this.map.getPixelOrigin();
        const topLeft = this.map.getPixelBounds().getTopLeft();
        this.canvas.style.transform = `translate(${topLeft.x - origin.x}px, ${topLeft.y - origin.y}px)`;

        // Re-initialize particles on view change
        if (this.isActive) this.initParticles();
    }

    setWindData(data) {
        // Convert wind speed/direction to u/v components
        this.windData = data.map(d => {
            const speed = d.wind_speed_10m;
            const dir = (d.wind_direction_10m * Math.PI) / 180;
            return {
                lat: d.lat,
                lng: d.lng,
                u: -speed * Math.sin(dir),
                v: -speed * Math.cos(dir)
            };
        });
        if (this.isActive && this.particles.length === 0) this.initParticles();
    }

    initParticles() {
        this.particles = [];
        const size = this.map.getSize();
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(this.createParticle(size));
        }
    }

    createParticle(size) {
        return {
            x: Math.random() * size.x,
            y: Math.random() * size.y,
            age: Math.floor(Math.random() * this.maxAge)
        };
    }

    getWindAt(x, y) {
        if (this.windData.length === 0) return { u: 0, v: 0 };

        // Simple inverse distance weighting for interpolation
        const latLng = this.map.containerPointToLatLng([x, y]);
        let totalWeight = 0;
        let u = 0;
        let v = 0;

        // Optimization: only check nearby points if data is large
        for (const d of this.windData) {
            const dx = latLng.lng - d.lng;
            const dy = latLng.lat - d.lat;
            const distSq = dx * dx + dy * dy;
            const weight = 1 / (distSq + 0.01);
            u += d.u * weight;
            v += d.v * weight;
            totalWeight += weight;
        }

        return { u: u / totalWeight, v: v / totalWeight };
    }

    animate() {
        if (!this.isActive) return;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; // Trail effect
        this.ctx.globalCompositeOperation = 'destination-in';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = 'source-over';

        this.ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity})`;
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();

        const size = this.map.getSize();
        const zoom = this.map.getZoom();
        const scale = this.velocityScale * Math.pow(2, zoom - 5);

        for (const p of this.particles) {
            if (p.age > this.maxAge) {
                Object.assign(p, this.createParticle(size));
                p.age = 0;
            }

            const wind = this.getWindAt(p.x, p.y);
            const nextX = p.x + wind.u * scale;
            const nextY = p.y - wind.v * scale; // Canvas Y is inverted

            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(nextX, nextY);

            p.x = nextX;
            p.y = nextY;
            p.age++;

            // Wrap around or reset if out of bounds
            if (p.x < 0 || p.x > size.x || p.y < 0 || p.y > size.y) {
                Object.assign(p, this.createParticle(size));
            }
        }

        this.ctx.stroke();
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    start() {
        this.isActive = true;
        this.initParticles();
        this.animate();
    }

    stop() {
        this.isActive = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

let windAnim;

// Helper: Debounce function
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Helper: Show Toast Notification
function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

async function toggleWeather() {
    isWeatherVisible = !isWeatherVisible;
    const btn = document.getElementById('toggle-weather');

    if (isWeatherVisible) {
        if (btn) btn.classList.add('active');
        if (windAnim) windAnim.start();
        await updateWeatherMarkers();
    } else {
        if (btn) btn.classList.remove('active');
        if (windAnim) windAnim.stop();
        if (weatherLayerGroup) {
            weatherLayerGroup.clearLayers();
        }
    }
}

const weatherCache = {};
const pendingRequests = new Set(); // Track cities currently being fetched
const WEATHER_CACHE_DURATION = 10 * 60 * 1000;

async function updateWeatherMarkers() {
    if (!isWeatherVisible) return;
    if (typeof map === 'undefined' || !map) return;

    if (!weatherLayerGroup) {
        weatherLayerGroup = L.layerGroup().addTo(map);
    }

    const zoom = map.getZoom();
    const bounds = map.getBounds();

    if (typeof CITIES === 'undefined' || !CITIES) return;

    let targetLevels = new Set();
    if (zoom < 9) targetLevels.add(1);
    else if (zoom < 12) { targetLevels.add(1); targetLevels.add(2); }
    else { targetLevels.add(1); targetLevels.add(2); targetLevels.add(3); }

    let visibleCities = CITIES.filter(c => bounds.contains([c.lat, c.lng]) && targetLevels.has(c.level));

    let maxWeatherMarkers;
    if (zoom < 7) maxWeatherMarkers = 6;
    else if (zoom < 9) maxWeatherMarkers = 12;
    else if (zoom < 10) maxWeatherMarkers = 20;
    else if (zoom < 11) maxWeatherMarkers = 35;
    else maxWeatherMarkers = 50;

    const citiesToProcess = visibleCities.slice(0, maxWeatherMarkers);
    if (weatherLayerGroup) weatherLayerGroup.clearLayers();

    const cachedCities = [];
    const uncachedCities = [];
    const now = Date.now();

    for (const city of citiesToProcess) {
        if (weatherCache[city.code] && (now - weatherCache[city.code].timestamp < WEATHER_CACHE_DURATION)) {
            cachedCities.push({ city, weather: weatherCache[city.code].data });
        } else if (!pendingRequests.has(city.code)) {
            uncachedCities.push(city);
        }
    }

    const createMarker = (city, weather) => {
        if (!isWeatherVisible) return;
        const iconHtml = `
            <div class="weather-marker">
                <div class="weather-icon">${getWeatherIcon(weather.weathercode)}</div>
                <div class="weather-temp">${Math.round(weather.temperature_2m)}°</div>
            </div>
        `;
        const icon = L.divIcon({
            className: 'custom-weather-icon',
            html: iconHtml,
            iconSize: [60, 30],
            iconAnchor: [-10, 15]
        });
        const marker = L.marker([city.lat, city.lng], {
            icon: icon,
            zIndexOffset: -100,
            interactive: false
        });
        weatherLayerGroup.addLayer(marker);
    };

    cachedCities.forEach(item => createMarker(item.city, item.weather));

    if (windAnim) {
        const allWeatherData = Object.values(weatherCache).map(c => c.data).filter(d => d && d.wind_speed_10m !== undefined);
        if (allWeatherData.length > 0) windAnim.setWindData(allWeatherData);
    }

    if (uncachedCities.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < uncachedCities.length; i += BATCH_SIZE) {
            if (!isWeatherVisible) break;

            const batch = uncachedCities.slice(i, i + BATCH_SIZE);
            batch.forEach(c => pendingRequests.add(c.code));

            const lats = batch.map(c => c.lat).join(',');
            const lngs = batch.map(c => c.lng).join(',');

            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,weathercode,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    const results = Array.isArray(data) ? data : [data];

                    results.forEach((result, index) => {
                        const city = batch[index];
                        const weather = result.current;
                        weather.lat = city.lat;
                        weather.lng = city.lng;
                        weatherCache[city.code] = { data: weather, timestamp: Date.now() };
                        createMarker(city, weather);
                    });

                    if (windAnim) {
                        const allWeatherData = Object.values(weatherCache).map(c => c.data).filter(d => d && d.wind_speed_10m !== undefined);
                        windAnim.setWindData(allWeatherData);
                    }
                } else if (response.status === 429) {
                    showToast('現在リクエストが混み合っています。しばらくお待ちください。');
                    break;
                }
            } catch (e) {
                console.error('Weather fetch error:', e);
            } finally {
                batch.forEach(c => pendingRequests.delete(c.code));
            }

            if (i + BATCH_SIZE < uncachedCities.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
}

// Initialize weather button
function initWeatherFeature() {
    const weatherBtn = document.getElementById('toggle-weather');
    if (weatherBtn) {
        weatherBtn.addEventListener('click', toggleWeather);
    }

    const debouncedUpdate = debounce(() => {
        if (isWeatherVisible) updateWeatherMarkers();
    }, 500);

    const checkMap = setInterval(() => {
        if (typeof map !== 'undefined' && map) {
            clearInterval(checkMap);
            windAnim = new WindAnimation(map);

            map.on('zoomend', debouncedUpdate);
            map.on('moveend', debouncedUpdate);
        }
    }, 100);

    setTimeout(() => clearInterval(checkMap), 10000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeatherFeature);
} else {
    initWeatherFeature();
}
