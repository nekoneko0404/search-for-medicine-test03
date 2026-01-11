
// Weather Display Logic
let isWeatherVisible = false;
let weatherLayerGroup;
const weatherMarkers = {}; // Cache for marker objects: { cityCode: marker }

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

// Helper: Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
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
    const sanitizedMessage = sanitizeHTML(message);
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${sanitizedMessage}`;
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
        // Clear marker cache
        Object.keys(weatherMarkers).forEach(code => delete weatherMarkers[code]);
    }
}

const weatherCache = {};
const pendingRequests = new Set(); // Track cities currently being fetched
const WEATHER_CACHE_DURATION = 10 * 60 * 1000;

// Helper: Get cache key for a city and date
function getWeatherCacheKey(cityCode, date) {
    return `${cityCode}-${date}`;
}

async function updateWeatherMarkers() {
    if (!isWeatherVisible) return;
    if (typeof map === 'undefined' || !map) return;

    if (!weatherLayerGroup) {
        weatherLayerGroup = L.layerGroup().addTo(map);
    }

    const zoom = map.getZoom();
    const bounds = map.getBounds();

    if (typeof CITIES === 'undefined' || !CITIES) return;

    let targetLevels = new Set([1]);
    if (zoom >= 8) targetLevels.add(2);
    if (zoom >= 10) targetLevels.add(3);

    // 1. Filter by level and bounds
    let candidates = CITIES.filter(city => {
        if (!targetLevels.has(city.level)) return false;
        return bounds.contains(L.latLng(city.lat, city.lng));
    });

    // 2. Set max weather markers (significantly fewer than pollen markers)
    let maxWeatherMarkers = 14; // National level: 10 or more, less than 15
    if (zoom >= 7) maxWeatherMarkers = 20;
    if (zoom >= 9) maxWeatherMarkers = 35;
    if (zoom >= 11) maxWeatherMarkers = 50;
    if (zoom >= 12) maxWeatherMarkers = 80;

    // 3. Selection & Overlap Prevention
    const isNationalView = zoom < 7;
    const minDistancePx = 120; // Minimum distance between weather markers in pixels
    const selectedCodes = new Set();
    const result = [];

    // Key major cities to prioritize when overlaps occur (e.g. Tokyo over Saitama)
    const SUPER_MAJOR_CITY_CODES = new Set([
        '13101', // Tokyo (Chiyoda)
        '27127', // Osaka (Kita)
        '23101', // Nagoya (Chigusa)
        '01101', // Sapporo
        '40131', // Fukuoka (Higashi)
        '04101', // Sendai
        '34101'  // Hiroshima
    ]);

    const isTooClose = (city, selectedList) => {
        const p1 = map.latLngToContainerPoint([city.lat, city.lng]);
        for (const s of selectedList) {
            const p2 = map.latLngToContainerPoint([s.lat, s.lng]);
            const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            if (dist < minDistancePx) return true;
        }
        return false;
    };

    // Sort candidates by priority: Super Major > Level 1 > Level 2 > Level 3
    candidates.sort((a, b) => {
        const aSuper = SUPER_MAJOR_CITY_CODES.has(a.code) ? 0 : 1;
        const bSuper = SUPER_MAJOR_CITY_CODES.has(b.code) ? 0 : 1;
        if (aSuper !== bSuper) return aSuper - bSuper;
        return a.level - b.level;
    });

    // Always prioritize Level 1 cities (major cities) regardless of zoom level
    const prioritized = candidates.filter(c => c.level === 1);
    const others = candidates.filter(c => c.level !== 1);

    // First, try to add prioritized (Level 1) cities if they are not too close
    for (const city of prioritized) {
        if (result.length < maxWeatherMarkers && !isTooClose(city, result)) {
            result.push(city);
            selectedCodes.add(city.code);
        }
    }

    if (result.length < maxWeatherMarkers) {
        let gridCount = isNationalView ? 5 : 6; // Coarser grid for better scattering
        if (zoom >= 7) gridCount = 8;
        if (zoom >= 10) gridCount = 10;

        const latMin = bounds.getSouth();
        const latMax = bounds.getNorth();
        const lngMin = bounds.getWest();
        const lngMax = bounds.getEast();

        const latStep = (latMax - latMin) / gridCount;
        const lngStep = (lngMax - lngMin) / gridCount;

        const grid = Array.from({ length: gridCount }, () => Array.from({ length: gridCount }, () => []));

        others.forEach(c => {
            const latIdx = Math.min(gridCount - 1, Math.floor((c.lat - latMin) / latStep));
            const lngIdx = Math.min(gridCount - 1, Math.floor((c.lng - lngMin) / lngStep));
            if (latIdx >= 0 && lngIdx >= 0 && latIdx < gridCount && lngIdx < gridCount) {
                grid[latIdx][lngIdx].push(c);
            }
        });

        // Pick from each grid cell until maxWeatherMarkers is reached, respecting min distance
        for (let i = 0; i < gridCount && result.length < maxWeatherMarkers; i++) {
            for (let j = 0; j < gridCount && result.length < maxWeatherMarkers; j++) {
                const cellCities = grid[i][j];
                if (cellCities.length > 0) {
                    const pick = cellCities.find(c => !selectedCodes.has(c.code) && !isTooClose(c, result));
                    if (pick) {
                        result.push(pick);
                        selectedCodes.add(pick.code);
                    }
                }
            }
        }

        // Final pass: if still have space, fill with remaining candidates if not too close
        if (result.length < maxWeatherMarkers) {
            for (let i = 0; i < candidates.length && result.length < maxWeatherMarkers; i++) {
                if (!selectedCodes.has(candidates[i].code) && !isTooClose(candidates[i], result)) {
                    result.push(candidates[i]);
                    selectedCodes.add(candidates[i].code);
                }
            }
        }
    }
    candidates = result.slice(0, maxWeatherMarkers);

    const visibleCityCodes = new Set(candidates.map(c => c.code));
    const now = Date.now();
    const fetchQueue = [];
    const today = new Date().toISOString().split('T')[0];
    const isToday = typeof state !== 'undefined' && state.currentDate === today;
    const currentDate = typeof state !== 'undefined' ? state.currentDate : today;

    const createOrUpdateMarker = (city, weather) => {
        if (!isWeatherVisible) return;

        // Use temperature_2m for current, temperature_2m_max for past
        const temp = weather.temperature_2m !== undefined ? weather.temperature_2m : weather.temperature_2m_max;
        const weathercode = weather.weathercode;

        const iconHtml = `
            <div class="weather-marker">
                <div class="weather-icon">${getWeatherIcon(weathercode)}</div>
                <div class="weather-temp">${Math.round(temp)}°</div>
            </div>
        `;
        const icon = L.divIcon({
            className: 'custom-weather-icon',
            html: iconHtml,
            iconSize: [60, 30],
            iconAnchor: [30, 15]
        });

        if (weatherMarkers[city.code]) {
            const marker = weatherMarkers[city.code];
            marker.setIcon(icon);
            if (!weatherLayerGroup.hasLayer(marker)) {
                weatherLayerGroup.addLayer(marker);
            }
        } else {
            const marker = L.marker([city.lat, city.lng], {
                icon: icon,
                zIndexOffset: -100,
                interactive: false
            });
            weatherMarkers[city.code] = marker;
            weatherLayerGroup.addLayer(marker);
        }
    };

    // Remove markers that are no longer visible
    Object.keys(weatherMarkers).forEach(code => {
        if (!visibleCityCodes.has(code)) {
            if (weatherLayerGroup.hasLayer(weatherMarkers[code])) {
                weatherLayerGroup.removeLayer(weatherMarkers[code]);
            }
        }
    });

    for (const city of candidates) {
        const cacheKey = getWeatherCacheKey(city.code, currentDate);
        if (weatherCache[cacheKey] && (now - weatherCache[cacheKey].timestamp < WEATHER_CACHE_DURATION)) {
            createOrUpdateMarker(city, weatherCache[cacheKey].data);
        } else if (!pendingRequests.has(city.code)) {
            fetchQueue.push(city);
        }
    }

    if (windAnim) {
        const allWeatherData = Object.values(weatherCache).map(c => c.data).filter(d => d && d.wind_speed_10m !== undefined);
        if (allWeatherData.length > 0) windAnim.setWindData(allWeatherData);
    }

    if (fetchQueue.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < fetchQueue.length; i += BATCH_SIZE) {
            if (!isWeatherVisible) break;

            const batch = fetchQueue.slice(i, i + BATCH_SIZE);
            batch.forEach(c => pendingRequests.add(c.code));

            const lats = batch.map(c => c.lat).join(',');
            const lngs = batch.map(c => c.lng).join(',');

            try {
                let url;
                if (isToday) {
                    url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,weathercode,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`;
                } else {
                    url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lngs}&daily=temperature_2m_max,weathercode&timezone=Asia%2FTokyo&start_date=${currentDate}&end_date=${currentDate}`;
                }
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    const results = Array.isArray(data) ? data : [data];

                    results.forEach((result, index) => {
                        const city = batch[index];
                        const weather = isToday ? result.current : {
                            temperature_2m_max: result.daily.temperature_2m_max[0],
                            weathercode: result.daily.weathercode[0]
                        };
                        weather.lat = city.lat;
                        weather.lng = city.lng;
                        const cacheKey = getWeatherCacheKey(city.code, currentDate);
                        weatherCache[cacheKey] = { data: weather, timestamp: Date.now() };
                        if (visibleCityCodes.has(city.code)) {
                            createOrUpdateMarker(city, weather);
                        }
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

            if (i + BATCH_SIZE < fetchQueue.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
}

// Expose to window
window.updateWeatherMarkers = updateWeatherMarkers;

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
