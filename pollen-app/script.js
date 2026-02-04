document.addEventListener('DOMContentLoaded', function () {
    // Notification Banner Logic
    const noticeBanner = document.getElementById('update-notice');
    if (noticeBanner) {
        const noticeId = noticeBanner.getAttribute('data-notice-id');
        const hiddenNotices = JSON.parse(localStorage.getItem('pollen_hidden_notices') || '[]');

        // Check if this notice is hidden
        if (hiddenNotices.includes(noticeId)) {
            noticeBanner.remove();
        } else {
            // Setup close button functionality
            const closeBtn = document.getElementById('notice-close-btn');
            const hideCheckbox = document.getElementById('notice-hide-checkbox');

            if (closeBtn) {
                closeBtn.addEventListener('click', function () {
                    if (hideCheckbox && hideCheckbox.checked) {
                        hiddenNotices.push(noticeId);
                        localStorage.setItem('pollen_hidden_notices', JSON.stringify(hiddenNotices));
                    }
                    // Animation handle
                    noticeBanner.style.transition = 'opacity 0.3s, transform 0.3s';
                    noticeBanner.style.opacity = '0';
                    noticeBanner.style.transform = 'translateX(100%)';

                    setTimeout(() => noticeBanner.remove(), 300);
                });
            }
        }
    }
});

// Helper: Get Japan Standard Time date string (YYYY-MM-DD)
function getJSTDateString(date = new Date()) {
    // Convert to JST (UTC+9)
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return jstDate.toISOString().split('T')[0];
}

const CONFIG = {
    API_ENDPOINT: 'https://wxtech.weathernews.com/opendata/v1/pollen',
    ZOOM_THRESHOLD: 11,
    CACHE_DURATION: 10 * 60 * 1000 // 10 minutes in milliseconds
};

// Cloudflare Worker URL
const WORKER_URL = 'https://pollen-worker.neko-neko-0404.workers.dev';

// Global State
const state = {
    cache: {}, // { key: { data: [...], timestamp: Date } }
    currentDate: '', // YYYY-MM-DD
    currentMode: 'hourly' // 'hourly' or 'daily'
};

let currentOpenCity = null; // Track the city whose popup is currently open

// Map variable (initialized later)
let map;

// Markers storage
const markers = {};
const fetchedCities = new Set();
let currentVisibleCityCodes = new Set();

// Helper: Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Helper: Get Color based on Pollen Count
function getPollenColor(count, isPast = false) {
    if (isPast) {
        // Daily Total Thresholds (based on Pollen Robo)
        if (count >= 300) return '#9C27B0'; // Very High (Purple)
        if (count >= 150) return '#f44336'; // High (Red)
        if (count >= 90) return '#FFEB3B'; // Medium (Yellow)
        if (count >= 30) return '#2196F3'; // Low (Blue)
        return '#FFFFFF'; // None (White)
    } else {
        // Latest Hourly Thresholds
        if (count >= 30) return '#9C27B0'; // Very High (Purple)
        if (count >= 15) return '#f44336'; // High (Red)
        if (count >= 9) return '#FFEB3B'; // Medium (Yellow)
        if (count >= 3) return '#2196F3'; // Low (Blue)
        return '#FFFFFF'; // None (White)
    }
}

// Helper: Fetch Data with Cache
async function fetchData(cityCode, start, end) {
    const cacheKey = `${cityCode}-${start}-${end}`;
    const now = Date.now();

    // Check cache
    if (state.cache[cacheKey]) {
        const cached = state.cache[cacheKey];
        if (now - cached.timestamp < CONFIG.CACHE_DURATION) {
            return cached.data;
        }
    }

    try {
        const response = await fetch(`${CONFIG.API_ENDPOINT}?citycode=${cityCode}&start=${start}&end=${end}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();

        // Parse CSV
        const rows = text.trim().split('\n').slice(1); // Skip header
        const data = rows.map(row => {
            const [code, dateStr, pollenStr] = row.split(',');
            let pollen = parseInt(pollenStr, 10);
            if (isNaN(pollen) || pollen < 0) pollen = -1; // Treat negative or NaN as -1 (missing)

            // Parse date and create JST-based date key
            const date = new Date(dateStr);
            // Extract date in JST by using the date string directly (already in JST format)
            // Format: YYYY-MM-DDTHH:MM:SS+09:00
            const dateKey = dateStr.split('T')[0]; // Extract YYYY-MM-DD part

            return {
                date: date,
                dateKey: dateKey, // JST date key for filtering
                pollen: pollen
            };
        });

        // Store in cache
        state.cache[cacheKey] = {
            data: data,
            timestamp: now
        };

        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        return [];
    }
}

// Initialize Markers
function initMarkers() {
    updateVisibleMarkers().catch(err => console.error('Error in updateVisibleMarkers:', err));
}

// Helper: Debounce function
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const pendingPollenRequests = new Set();

// Fetch data for visible markers and handle LOD
async function updateVisibleMarkers() {
    if (!map) return;
    try {
        const zoom = map.getZoom();
        const bounds = map.getBounds();
        const center = map.getCenter();

        // 1. Determine Target Levels based on Zoom
        let targetLevels = new Set([1]);
        if (zoom >= 6) targetLevels.add(2);
        if (zoom >= 8) targetLevels.add(3);

        // 2. Filter Candidates by Level and Bounds
        // We get all cities within bounds that match the target level
        let candidates = CITIES.filter(city => {
            if (!targetLevels.has(city.level)) return false;
            return bounds.contains(L.latLng(city.lat, city.lng));
        });

        // 3. Calculate Distance from Center for Sorting
        // We want to prioritize cities closer to the center
        candidates.forEach(c => {
            c._dist = Math.pow(c.lat - center.lat, 2) + Math.pow(c.lng - center.lng, 2);
        });
        candidates.sort((a, b) => a._dist - b._dist);

        // 4. Define Density Parameters
        // Max markers allowed - Increased significantly to allow coverage of the whole screen
        // The density control will be the primary limiting factor
        let maxMarkers = 1000;

        // Minimum distance parameters (in pixels)
        // Center: closer spacing allowed. Edge: wider spacing required.
        let minDistCenter = 12; // Minimum distance at the center (px) - Further reduced for higher density
        let minDistEdge = 180;  // Minimum distance at the edge (px) - Slightly increased to balance total count

        // Adjust for national view (low zoom) to show more points
        if (zoom < 7) {
            minDistCenter = 10;
            minDistEdge = 100;
        }

        // Fine-tune for zoom 7-9 to keep total markers around 100
        if (zoom >= 7 && zoom <= 9) {
            // Gradually increase distance as more detailed points (Level 2, 3) are added
            // Adjusted to start from a higher density
            minDistCenter = 15 + (zoom - 7) * 5; // 15, 20, 25
            minDistEdge = 200 + (zoom - 7) * 50; // 200, 250, 300
        }

        // If zoom is high (max zoom), show all points
        if (zoom >= 12) {
            maxMarkers = 10000; // Allow all
            minDistCenter = 0;
            minDistEdge = 0;
        }

        // Helper to calculate pixel distance
        const getPixelDist = (c1, c2) => {
            const p1 = map.latLngToContainerPoint([c1.lat, c1.lng]);
            const p2 = map.latLngToContainerPoint([c2.lat, c2.lng]);
            return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        };

        // Helper to get dynamic minimum distance based on distance from center
        const mapSize = map.getSize();
        const maxScreenDist = Math.sqrt(Math.pow(mapSize.x / 2, 2) + Math.pow(mapSize.y / 2, 2));

        const getDynamicMinDist = (city) => {
            const p = map.latLngToContainerPoint([city.lat, city.lng]);
            const centerP = map.latLngToContainerPoint(center);
            const distFromCenter = Math.sqrt(Math.pow(p.x - centerP.x, 2) + Math.pow(p.y - centerP.y, 2));

            // Normalize distance (0 at center, 1 at corner)
            const ratio = Math.min(1, distFromCenter / maxScreenDist);

            // Linear interpolation between center and edge min distances
            return minDistCenter + (minDistEdge - minDistCenter) * ratio;
        };

        // 5. Select Markers with Dynamic Density
        const selected = [];
        const selectedCodes = new Set();

        // Iterate through ALL candidates (sorted by distance from center)
        for (const city of candidates) {
            // Safety break just in case, though density check should handle it
            if (selected.length >= maxMarkers) break;

            // Check distance against all already selected cities
            let tooClose = false;
            const requiredDist = getDynamicMinDist(city);

            for (const existing of selected) {
                const dist = getPixelDist(city, existing);
                // We use the larger of the two required distances (or just the current one's requirement)
                // Using the current one's requirement ensures that as we move out, we respect the wider spacing
                if (dist < requiredDist) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                selected.push(city);
                selectedCodes.add(city.code);
            }
        }

        const visibleCandidates = selected;
        const visibleCityCodes = new Set(visibleCandidates.map(c => c.code));
        currentVisibleCityCodes = visibleCityCodes;

        const fetchQueue = [];

        for (const city of visibleCandidates) {
            if (!markers[city.code]) {
                const marker = L.circleMarker([city.lat, city.lng], {
                    radius: 8,
                    fillColor: '#ccc',
                    color: 'rgba(0, 0, 0, 0.3)',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                marker.cityCode = city.code;
                marker.cityName = city.name;
                marker.maxPollen = 0;

                const sanitizedCode = sanitizeHTML(city.code);
                marker.bindPopup(`<div id="popup-${sanitizedCode}">読み込み中...</div>`, {
                    maxWidth: 350
                });
                marker.on('popupopen', () => {
                    currentOpenCity = city;
                    handlePopupOpen(city, marker);
                });
                marker.on('popupclose', () => {
                    currentOpenCity = null;
                });

                markers[city.code] = marker;
                marker.addTo(map);
            } else {
                if (!map.hasLayer(markers[city.code])) {
                    markers[city.code].addTo(map);
                }
            }

            if (!fetchedCities.has(city.code) && !pendingPollenRequests.has(city.code)) {
                fetchQueue.push(city.code);
            }
        }

        Object.keys(markers).forEach(code => {
            if (!visibleCityCodes.has(code)) {
                if (map.hasLayer(markers[code])) {
                    map.removeLayer(markers[code]);
                }
            }
        });

        // 5. Fetch Data in Batches (Optimized for speed)
        const BATCH_SIZE = 20;
        for (let i = 0; i < fetchQueue.length; i += BATCH_SIZE) {
            const batch = fetchQueue.slice(i, i + BATCH_SIZE)
                .filter(code => currentVisibleCityCodes.has(code) && !fetchedCities.has(code) && !pendingPollenRequests.has(code));

            if (batch.length > 0) {
                batch.forEach(code => pendingPollenRequests.add(code));
                try {
                    await Promise.all(batch.map(code => fetchCityDailyData(code)));
                } finally {
                    batch.forEach(code => pendingPollenRequests.delete(code));
                }
            }
        }
    } catch (err) {
        console.error('Error in updateVisibleMarkers logic:', err);
    }
}

async function fetchCityDailyData(cityCode) {
    if (fetchedCities.has(cityCode)) return;

    const start = state.currentDate.replace(/-/g, '');
    const end = new Date(state.currentDate);
    end.setDate(end.getDate() + 1);
    let endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    // Clamp end date to today to avoid API errors
    const todayStr = getJSTDateString().replace(/-/g, '');
    if (endStr > todayStr) {
        endStr = todayStr;
    }

    const data = await fetchData(cityCode, start, endStr);

    if (data.length > 0) {
        const todayJST = getJSTDateString();
        const isToday = state.currentDate === todayJST;

        let displayValue = 0;
        if (isToday && state.currentMode === 'hourly') {
            // For today (Hourly Mode), use the latest non-null hourly value
            const now = new Date();
            const validData = data.filter(v => v.date <= now && v.pollen !== null && v.pollen >= 0);
            const latest = validData.length > 0 ? validData[validData.length - 1] : null;
            displayValue = latest ? latest.pollen : 0;
        } else {
            // For past data OR today (Daily Mode), use the daily total (sum)
            displayValue = data
                .filter(item => item.dateKey === state.currentDate)
                .reduce((sum, item) => sum + (item.pollen > 0 ? item.pollen : 0), 0);
        }

        const marker = markers[cityCode];
        if (marker) {
            // Treat as "Past" (Daily Cumulative) if it is NOT today OR if mode is explicitly 'daily'
            // Effectively: isPastVisually = !isToday || state.currentMode === 'daily'
            // Simplified: We only show "Hourly" style if (isToday && mode === 'hourly')
            const useHourlyStyle = isToday && state.currentMode === 'hourly';

            marker.isPast = !useHourlyStyle;
            marker.maxPollen = displayValue;
            marker.setStyle({ fillColor: getPollenColor(displayValue, !useHourlyStyle) });
            fetchedCities.add(cityCode);

            if (map.getZoom() >= CONFIG.ZOOM_THRESHOLD) {
                updateMarkerTooltip(marker);
            }

            // Update registered location UI if this is the registered city
            const settings = NotificationManager.getSettings();
            if (settings && settings.cityCode === cityCode) {
                NotificationManager.updateRegisteredLocationUI();
            }
        }
    }
}

function updateMarkerTooltip(marker) {
    const height = marker.isPast ? marker.maxPollen * 0.4 : marker.maxPollen * 8; // Adjust height for past totals
    const color = getPollenColor(marker.maxPollen, marker.isPast);

    const borderColor = color === '#FFFFFF' ? '#999999' : '#FFFFFF';
    // Wrapped in graph-tooltip-inner for rotation
    const content = `
        <div class="graph-tooltip-inner" style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 10px; height: ${Math.min(height, 150)}px; background-color: ${color}; border: 1px solid ${borderColor};"></div>
            <span style="font-size: 10px;">${marker.maxPollen}</span>
        </div>
    `;
    if (marker.getTooltip()) {
        marker.setTooltipContent(content);
    } else {
        marker.bindTooltip(content, {
            permanent: true,
            direction: 'top',
            className: 'graph-tooltip',
            offset: [0, -10]
        });
    }
}

async function handlePopupOpen(city, marker) {
    const containerId = `popup-${city.code}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const start = state.currentDate.replace(/-/g, '');
    const end = new Date(state.currentDate);
    end.setDate(end.getDate() + 1);
    let endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    // Clamp end date to today to avoid API errors
    const todayStr = getJSTDateString().replace(/-/g, '');
    if (endStr > todayStr) {
        endStr = todayStr;
    }

    const data = await fetchData(city.code, start, endStr);

    // Filter data for the selected date using JST-based dateKey
    const dayData = data.filter(d => d.dateKey === state.currentDate);

    const displayDate = state.currentDate.split('-').slice(1).join('/');

    const sanitizedName = sanitizeHTML(city.name);
    const sanitizedDate = sanitizeHTML(displayDate);
    const sanitizedCode = sanitizeHTML(city.code);

    container.innerHTML = `
        <div class="popup-header">
            <span>${sanitizedName} (${sanitizedDate})</span>
            <div>
                <button class="btn-trend">週間推移</button>
                <button class="btn-notification" title="通知設定"><i class="fas fa-bell"></i></button>
            </div>
        </div>
        <div class="popup-chart-container">
            <canvas id="chart-${sanitizedCode}"></canvas>
        </div>
    `;

    // Attach event listeners safely
    const trendBtn = container.querySelector('.btn-trend');
    if (trendBtn) {
        trendBtn.addEventListener('click', () => showWeeklyTrend(city.code, city.name));
    }

    const notifBtn = container.querySelector('.btn-notification');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => NotificationManager.openSettings(city.code, city.name));
    }

    const ctx = document.getElementById(`chart-${city.code}`).getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dayData.map(d => d.date.getHours() + '時'),
            datasets: [{
                label: '花粉数',
                data: dayData.map(d => d.pollen >= 0 ? d.pollen : 0),
                backgroundColor: dayData.map(d => getPollenColor(d.pollen >= 0 ? d.pollen : 0)),
                borderColor: dayData.map(d => {
                    const color = getPollenColor(d.pollen >= 0 ? d.pollen : 0);
                    // 白色の場合は濃いグレーの枠線、それ以外は同色の濃い枠線
                    return color === '#FFFFFF' ? '#999999' : color;
                }),
                borderWidth: 1.5,
                barPercentage: 0.9,
                categoryPercentage: 1.0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `花粉数: ${context.raw}個`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { size: 10 }
                    }
                },
                x: {
                    ticks: {
                        font: { size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });

    // Fetch and display weather data
    try {
        const weather = await fetchWeatherData(city.lat, city.lng, state.currentDate);
        if (weather) {
            const weatherDiv = document.createElement('div');
            weatherDiv.className = 'weather-info';
            weatherDiv.innerHTML = `
                <div class="weather-item">
                    <i class="fas fa-thermometer-half"></i>
                    <span>${weather.temperature}°C</span>
                </div>
                <div class="weather-item">
                    <i class="fas fa-tint"></i>
                    <span>${weather.precipitation}mm</span>
                </div>
                <div class="weather-item">
                    <i class="fas fa-wind"></i>
                    <span style="display: inline-block; transform: rotate(${weather.windDirection}deg)">↓</span>
                    <span>${weather.windSpeed}m/s</span>
                </div>
            `;
            container.insertBefore(weatherDiv, container.children[1]);
        }
    } catch (e) {
        console.error('Weather fetch error:', e);
    }
}

// Fetch Weather Data from Open-Meteo
// Fetch Weather Data from Open-Meteo
async function fetchWeatherData(lat, lng, dateStr) {
    const todayJST = getJSTDateString();
    const isToday = dateStr === todayJST;

    try {
        let url;
        if (isToday) {
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo&windspeed_unit=ms`;
        } else {
            url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Asia%2FTokyo&start_date=${dateStr}&end_date=${dateStr}&windspeed_unit=ms`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather API error');
        const data = await response.json();

        if (isToday) {
            const current = data.current;
            return {
                temperature: current.temperature_2m,
                precipitation: current.precipitation,
                windSpeed: current.wind_speed_10m,
                windDirection: current.wind_direction_10m
            };
        } else {
            const daily = data.daily;
            return {
                temperature: daily.temperature_2m_max[0],
                precipitation: daily.precipitation_sum[0],
                windSpeed: daily.wind_speed_10m_max[0],
                windDirection: daily.wind_direction_10m_dominant[0]
            };
        }
    } catch (e) {
        console.error(e);
        return null;
    }
}

window.showWeeklyTrend = async function (cityCode, cityName) {
    const modal = document.getElementById('trend-modal');
    const modalTitle = document.getElementById('modal-city-name');
    const canvas = document.getElementById('trendChart');
    const loading = document.getElementById('trend-loading');

    const sanitizedCityName = sanitizeHTML(cityName);
    modalTitle.textContent = `${sanitizedCityName}の28日間推移 (花粉・気温・降水量)`;
    modal.classList.add('show');

    loading.classList.remove('hidden');
    canvas.style.opacity = '0';

    const endDate = new Date(state.currentDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 27); // 28 days total

    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');

    // Set endStr to the day after the selected date to include the selected date's data
    const apiEndDate = new Date(endDate);
    apiEndDate.setDate(apiEndDate.getDate() + 1);
    let endStr = apiEndDate.toISOString().split('T')[0].replace(/-/g, '');

    // Clamp end date to today to avoid API errors
    const todayStr = getJSTDateString().replace(/-/g, '');
    if (endStr > todayStr) {
        endStr = todayStr;
    }

    const startDateISO = startDate.toISOString().split('T')[0];
    const endDateISO = state.currentDate;

    const city = CITIES.find(c => c.code === cityCode);

    const pollenPromise = fetchData(cityCode, startStr, endStr);

    let weatherPromise = Promise.resolve(null);
    if (city) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const isRecent = endDate > ninetyDaysAgo;

        let weatherUrl;
        if (isRecent) {
            weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&past_days=92&forecast_days=14`;
        } else {
            weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lng}&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${startDateISO}&end_date=${endDateISO}`;
        }

        weatherPromise = fetch(weatherUrl)
            .then(r => {
                if (!r.ok) throw new Error('Weather fetch failed');
                return r.json();
            })
            .catch(e => {
                console.error('Weather data fetch error:', e);
                return null;
            });
    }

    const [pollenData, weatherData] = await Promise.all([pollenPromise, weatherPromise]);

    const dailyMap = {};
    pollenData.forEach(item => {
        const dateKey = item.dateKey; // Use JST-based date key

        if (!dailyMap[dateKey]) dailyMap[dateKey] = { sum: 0, count: 0 };
        if (item.pollen >= 0) {
            dailyMap[dateKey].sum += item.pollen;
        }
        dailyMap[dateKey].count++;
    });

    // Generate labels for all 28 days regardless of data existence
    const labels = [];
    const loopDate = new Date(startDate);
    while (loopDate <= endDate) {
        labels.push(loopDate.toISOString().split('T')[0]);
        loopDate.setDate(loopDate.getDate() + 1);
    }

    const pollenValues = labels.map(date => {
        // If no data for this date, return null so it doesn't plot 0
        return dailyMap[date] ? dailyMap[date].sum : null;
    });

    let tempValues = [];
    let precipValues = [];

    if (weatherData && weatherData.daily) {
        const wDates = weatherData.daily.time;
        const wTemps = weatherData.daily.temperature_2m_max;
        const wPrecips = weatherData.daily.precipitation_sum;

        const wMap = {};
        wDates.forEach((d, i) => {
            wMap[d] = { temp: wTemps[i], precip: wPrecips[i] };
        });

        labels.forEach(date => {
            if (wMap[date]) {
                tempValues.push(wMap[date].temp);
                precipValues.push(wMap[date].precip);
            } else {
                tempValues.push(null);
                precipValues.push(null);
            }
        });
    }

    if (window.trendChartInstance) {
        window.trendChartInstance.destroy();
    }

    window.trendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.map(d => d.slice(5)),
            datasets: [
                {
                    label: '1日積算花粉数',
                    data: pollenValues,
                    type: 'line',
                    borderColor: '#2196F3',
                    backgroundColor: '#2196F3',
                    yAxisID: 'y',
                    tension: 0.1,
                    fill: false,
                    order: 1
                },
                {
                    label: '最高気温 (°C)',
                    data: tempValues,
                    type: 'line',
                    borderColor: '#ff9800',
                    backgroundColor: '#ff9800',
                    yAxisID: 'y1',
                    tension: 0.3,
                    borderDash: [5, 5],
                    pointStyle: 'circle',
                    pointRadius: 3,
                    fill: false,
                    order: 0
                },
                {
                    label: '降水量 (mm)',
                    data: precipValues,
                    type: 'bar',
                    backgroundColor: 'rgba(52, 152, 219, 0.3)',
                    borderColor: 'rgba(52, 152, 219, 0.8)',
                    borderWidth: 1,
                    yAxisID: 'y2',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: '積算花粉数' },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: '気温 (°C)' },
                    grid: { drawOnChartArea: false }
                },
                y2: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: '降水量 (mm)' },
                    grid: { drawOnChartArea: false },
                    beginAtZero: true
                }
            }
        }
    });

    loading.classList.add('hidden');
    canvas.style.opacity = '1';
};

document.querySelector('.close-btn').addEventListener('click', () => {
    document.getElementById('trend-modal').classList.remove('show');
});

window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
};

function updateVis() {
    if (!map) return;
    const zoom = map.getZoom();
    const showGraph = zoom >= CONFIG.ZOOM_THRESHOLD;

    Object.values(markers).forEach(marker => {
        if (showGraph) {
            updateMarkerTooltip(marker);
            marker.openTooltip();
        } else {
            marker.closeTooltip();
            marker.unbindTooltip();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined' || typeof CITIES === 'undefined') {
        return;
    }

    const todayStr = getJSTDateString();
    state.currentDate = todayStr;

    const datePicker = document.getElementById('date-picker');
    datePicker.value = todayStr;
    datePicker.max = todayStr; // Restrict future dates

    function updateModeUI() {
        const todayStr = getJSTDateString();
        const isToday = state.currentDate === todayStr;
        const toggleGroup = document.querySelector('.toggle-group');

        if (toggleGroup) {
            if (isToday) {
                toggleGroup.classList.remove('disabled');
                // Restore user selection
                const savedMode = state.currentMode;
                const radio = document.querySelector(`input[name="display-mode"][value="${savedMode}"]`);
                if (radio) radio.checked = true;
            } else {
                toggleGroup.classList.add('disabled');
                // Visually switch to daily for past dates
                const dailyRadio = document.getElementById('mode-daily');
                if (dailyRadio) dailyRadio.checked = true;
            }
        }
    }

    function updateDate(newDateStr) {
        if (newDateStr > todayStr) return; // Prevent future dates
        state.currentDate = newDateStr;
        datePicker.value = newDateStr;

        updateModeUI();

        // Update active state of quick buttons
        document.querySelectorAll('.btn-quick-date').forEach(btn => {
            const days = btn.dataset.days;
            const years = btn.dataset.years;
            let d = new Date();
            if (days !== undefined) {
                d.setDate(d.getDate() - parseInt(days));
            } else if (years !== undefined) {
                d.setFullYear(d.getFullYear() - parseInt(years));
            }
            const dStr = getJSTDateString(d);
            btn.classList.toggle('active', dStr === newDateStr);
        });

        fetchedCities.clear();
        Object.values(markers).forEach(marker => {
            marker.setStyle({ fillColor: '#ccc' });
            marker.maxPollen = 0;
            if (marker.getTooltip()) {
                marker.unbindTooltip();
            }
        });
        updateVisibleMarkers().catch(err => console.error(err));
        NotificationManager.updateRegisteredLocationUI();
        if (typeof window.updateWeatherMarkers === 'function') {
            window.updateWeatherMarkers().catch(err => console.error(err));
        }

        // Refresh open popup if any
        if (currentOpenCity) {
            const marker = markers[currentOpenCity.code];
            if (marker && marker.isPopupOpen()) {
                handlePopupOpen(currentOpenCity, marker).catch(err => console.error(err));
            }
        }
    }

    datePicker.addEventListener('change', (e) => {
        updateDate(e.target.value);
    });

    // Prev/Next Day Buttons
    document.getElementById('prev-day').addEventListener('click', () => {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() - 1);
        updateDate(getJSTDateString(d));
    });

    document.getElementById('next-day').addEventListener('click', () => {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() + 1);
        const nextStr = getJSTDateString(d);
        if (nextStr <= todayStr) {
            updateDate(nextStr);
        }
    });

    // Quick Select Buttons
    document.querySelectorAll('.btn-quick-date').forEach(btn => {
        btn.addEventListener('click', () => {
            const days = btn.dataset.days;
            const years = btn.dataset.years;
            let d = new Date();
            if (days !== undefined) {
                d.setDate(d.getDate() - parseInt(days));
            } else if (years !== undefined) {
                d.setFullYear(d.getFullYear() - parseInt(years));
            }
            updateDate(getJSTDateString(d));
        });
    });

    // Display Mode Toggle Logic
    const modeRadios = document.getElementsByName('display-mode');
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.currentMode = e.target.value;

            // Force refresh markers
            fetchedCities.clear();
            Object.values(markers).forEach(marker => {
                marker.setStyle({ fillColor: '#ccc' });
                marker.maxPollen = 0;
                if (marker.getTooltip()) {
                    marker.unbindTooltip();
                }
            });
            updateVisibleMarkers().catch(err => console.error(err));
        });
    });

    // Initial active state
    document.querySelector('.btn-quick-date[data-days="0"]').classList.add('active');

    try {
        // Load saved state
        let initialCenter = [36.2048, 138.2529];
        let initialZoom = 5;
        try {
            const savedState = localStorage.getItem('pollenMapState');
            if (savedState) {
                const state = JSON.parse(savedState);
                if (state.lat && state.lng && state.zoom) {
                    initialCenter = [state.lat, state.lng];
                    initialZoom = state.zoom;
                }
            }
        } catch (e) {
            console.error('Failed to load map state:', e);
        }

        map = L.map('map', {
            zoomControl: false,
            minZoom: 2,
            maxZoom: 12
        }).setView(initialCenter, initialZoom);

        // Save state on moveend
        map.on('moveend', () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const state = {
                lat: center.lat,
                lng: center.lng,
                zoom: zoom
            };
            localStorage.setItem('pollenMapState', JSON.stringify(state));
        });

        L.control.zoom({
            position: 'bottomright'
        }).addTo(map);

        const baseLayers = {
            std: L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
                opacity: 0.6
            }),
            relief: L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
                opacity: 0.5
            })
        };

        // Default: Standard map
        baseLayers.std.addTo(map);

        // Map Type Toggle Logic
        document.querySelectorAll('.btn-map-type').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;

                // Update buttons
                document.querySelectorAll('.btn-map-type').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Switch layers
                Object.values(baseLayers).forEach(layer => map.removeLayer(layer));
                baseLayers[type].addTo(map);
            });
        });

        const debouncedUpdate = debounce(() => {
            updateVisibleMarkers().catch(err => console.error(err));
            updateVis();
        }, 500);

        map.on('zoomend', debouncedUpdate);
        map.on('moveend', debouncedUpdate);

        // Toggle crosshair visibility on popup open/close
        map.on('popupopen', () => {
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.opacity = '0';
        });
        map.on('popupclose', () => {
            const crosshair = document.getElementById('crosshair');
            if (crosshair) crosshair.style.opacity = '1';
        });

        initMarkers();
    } catch (e) {
        console.error('Initialization error:', e);
    }

    // Panel Toggle Logic
    const toggleBtn = document.getElementById('panel-toggle');
    const sidePanel = document.querySelector('.side-panel');
    const appHeader = document.querySelector('.app-header');

    if (toggleBtn && sidePanel) {
        toggleBtn.addEventListener('click', () => {
            sidePanel.classList.toggle('collapsed');
            const isCollapsed = sidePanel.classList.contains('collapsed');
            toggleBtn.title = isCollapsed ? 'パネルを開く' : 'パネルを閉じる';

            // On mobile, also toggle app-header visibility
            if (window.innerWidth <= 600 && appHeader) {
                if (isCollapsed) {
                    appHeader.style.transform = 'translateX(-100%)';
                    appHeader.style.opacity = '0';
                    appHeader.style.pointerEvents = 'none';
                } else {
                    appHeader.style.transform = '';
                    appHeader.style.opacity = '';
                    appHeader.style.pointerEvents = '';
                }
            }

            // Update markers when panel state changes to adjust visual center
            setTimeout(() => {
                updateVisibleMarkers().catch(err => console.error(err));
            }, 300); // Wait for transition
        });

        // Auto-collapse on small screens initially
        if (window.innerWidth <= 600) {
            sidePanel.classList.add('collapsed');
            toggleBtn.title = 'パネルを開く';

            // Also hide header on mobile initially
            if (appHeader) {
                appHeader.style.transform = 'translateX(-100%)';
                appHeader.style.opacity = '0';
                appHeader.style.pointerEvents = 'none';
            }
        }
    }

    // Initialize Notification Manager
    NotificationManager.init();
});

// --- Notification Manager ---
const NotificationManager = {
    settingsKey: 'pollen_notification_settings',
    checkInterval: 15 * 60 * 1000, // 15 minutes
    timerId: null,

    init() {
        this.registerServiceWorker(); // Register SW
        this.setupEventListeners();
        this.startMonitoring();
        this.updateRegisteredLocationUI();
        this.unlockAudio(); // Initialize audio unlocking
    },

    // Unlock audio for iOS/Safari
    unlockAudio() {
        const unlock = () => {
            this.playNotificationSound(true); // Play silent sound
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            console.log('Audio unlocked');
        };
        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
    },

    setupEventListeners() {
        // Modal controls
        const modal = document.getElementById('notification-modal');
        const closeBtn = document.getElementById('notification-close-btn');
        const saveBtn = document.getElementById('btn-save-notification');
        const testBtn = document.getElementById('btn-test-notification');
        const clearBtn = document.getElementById('btn-clear-notification');

        const guideModal = document.getElementById('guide-modal');
        const guideCloseBtn = document.getElementById('guide-close-btn');
        const guideOpenBtn = document.getElementById('btn-open-guide');

        closeBtn.onclick = () => modal.classList.remove('show');
        if (guideCloseBtn) {
            guideCloseBtn.onclick = () => guideModal.classList.remove('show');
        }
        if (guideOpenBtn) {
            guideOpenBtn.onclick = () => guideModal.classList.add('show');
        }

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
            if (e.target === guideModal) guideModal.classList.remove('show');
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this.testNotification();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearSettings());
        }

        // Registered location section controls
        const jumpBtn = document.getElementById('btn-jump-to-registered');
        const editBtn = document.getElementById('btn-edit-registered');

        if (jumpBtn) {
            jumpBtn.addEventListener('click', () => this.jumpToRegisteredLocation());
        }

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                const settings = NotificationManager.getSettings();
                if (settings) {
                    NotificationManager.openSettings(settings.cityCode, settings.cityName);
                }
            });
        }
    },

    openSettings(cityCode, cityName) {
        console.log('Opening settings for:', cityName, cityCode);
        const modal = document.getElementById('notification-modal');
        const targetCitySpan = document.getElementById('notification-target-city');
        const hourlyInput = document.getElementById('threshold-hourly');
        const dailyInput = document.getElementById('threshold-daily');
        const soundCheckbox = document.getElementById('enable-sound');
        const voiceCheckbox = document.getElementById('enable-voice');
        const clearBtn = document.getElementById('btn-clear-notification');

        // Load existing settings
        const settings = this.getSettings();

        // Check if user is trying to register a different location
        // Only show confirmation if there's an existing registration AND it's a different city
        if (settings && settings.cityCode && settings.cityCode !== cityCode) {
            const confirmChange = confirm(
                `現在「${settings.cityName}」が登録されています。\n` +
                `「${cityName}」に変更しますか？\n\n` +
                `※1ユーザーにつき1か所のみ登録できます。`
            );
            if (!confirmChange) {
                return; // User cancelled, don't open modal
            }
        }

        // Set current target
        targetCitySpan.textContent = cityName;
        targetCitySpan.dataset.code = cityCode;

        // Populate inputs if this city is already registered
        if (settings && settings.cityCode === cityCode) {
            hourlyInput.value = settings.thresholdHourly;
            dailyInput.value = settings.thresholdDaily;
            soundCheckbox.checked = settings.enableSound !== false; // Default true
            voiceCheckbox.checked = settings.enableVoice !== false; // Default true
            clearBtn.classList.remove('hidden');
        } else {
            // Defaults: 1時間30個、累積150個
            hourlyInput.value = 30;
            dailyInput.value = 150;
            soundCheckbox.checked = true;
            voiceCheckbox.checked = true;
            clearBtn.classList.add('hidden');
        }

        // iOS/Safari compatibility check
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);
        const notificationSupported = typeof Notification !== 'undefined';

        let warningMsg = '';
        if (isIOS) {
            if (!isStandalone) {
                warningMsg = '【重要】iPhoneでは、ブラウザを閉じている状態で通知を受け取るには「ホーム画面に追加」してアプリとして起動する必要があります。';
            } else {
                warningMsg = '※iPhone（ホーム画面起動中）: 通知が届かない場合は、本体の「設定 > 通知 > 花粉Radar」を確認してください。';
            }
        } else if (!notificationSupported) {
            warningMsg = '※お使いのブラウザはシステム通知に対応していません。アプリを開いている間のみアラートが表示されます。';
        }

        const warningElem = document.getElementById('notification-compatibility-warning');
        if (warningElem) {
            warningElem.textContent = warningMsg;
            warningElem.classList.toggle('hidden', !warningMsg);
            if (isIOS && !isStandalone) {
                warningElem.style.color = '#e11d48'; // Red for critical warning
                warningElem.style.backgroundColor = '#fff1f2';
                warningElem.style.borderColor = '#fda4af';
            } else {
                warningElem.style.color = '';
                warningElem.style.backgroundColor = '';
                warningElem.style.borderColor = '';
            }
        }

        modal.classList.add('show');
    },

    getSettings() {
        const json = localStorage.getItem(this.settingsKey);
        return json ? JSON.parse(json) : null;
    },

    async saveSettings() {
        const targetCitySpan = document.getElementById('notification-target-city');
        const hourlyInput = document.getElementById('threshold-hourly');
        const dailyInput = document.getElementById('threshold-daily');
        const soundCheckbox = document.getElementById('enable-sound');
        const voiceCheckbox = document.getElementById('enable-voice');

        const cityCode = targetCitySpan.dataset.code;
        const cityName = targetCitySpan.textContent;
        const thresholdHourly = parseInt(hourlyInput.value, 10);
        const thresholdDaily = parseInt(dailyInput.value, 10);
        const enableSound = soundCheckbox.checked;
        const enableVoice = voiceCheckbox.checked;

        if (!cityCode) return;

        // Request permission only if supported and not already granted
        if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'default') {
                try {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        console.log('Notification permission denied');
                    }
                } catch (e) {
                    console.error('Error requesting notification permission:', e);
                }
            } else if (Notification.permission === 'denied') {
                alert('通知がブロックされています。ブラウザの設定から通知を許可してください。システム通知以外の機能は利用可能です。');
            }
        }

        const settings = {
            cityCode,
            cityName,
            thresholdHourly,
            thresholdDaily,
            enableSound,
            enableVoice,
            enableVibration: false, // Always disabled
            lastNotified: 0
        };

        localStorage.setItem(this.settingsKey, JSON.stringify(settings));

        // Subscribe to Web Push
        const subscribed = await this.subscribeUser(settings);
        if (subscribed) {
            this.showToast(`通知設定を保存しました\n(アプリを閉じても通知が届きます)`);
        } else {
            this.showToast(`設定は保存されましたが、\nバックグラウンド通知の登録に失敗しました`, 'warning', 10000);
            alert('【注意】\n設定は保存されましたが、プッシュ通知の登録に失敗しました。\n・アプリを開いている間のみ通知されます。\n・ブラウザの通知設定やプライベートモードでないか確認してください。');
        }

        document.getElementById('notification-modal').classList.remove('show');

        // Update UI
        this.updateRegisteredLocationUI();

        // Restart monitoring with new settings
        this.startMonitoring();

        // Check immediately
        this.checkPollenLevels();
    },

    async clearSettings() {
        if (confirm('通知設定を解除しますか？')) {
            await this.unsubscribeUser(); // Unsubscribe first

            localStorage.removeItem(this.settingsKey);
            document.getElementById('notification-modal').classList.remove('show');
            this.showToast('通知設定を解除しました');
            this.updateRegisteredLocationUI();
            this.stopMonitoring();
        }
    },

    async testNotification() {
        console.log('Testing notification...');

        let permission = 'granted';
        if (typeof Notification !== 'undefined') {
            console.log('Current permission:', Notification.permission);
            permission = await Notification.requestPermission();
            console.log('Permission after request:', permission);
        } else {
            console.log('Notification API not supported');
        }

        if (permission === 'granted') {
            console.log('Creating notification...');

            const settings = this.getSettings();
            const testCityName = settings ? settings.cityName : 'テスト地点';

            // Play sound and vibrate first (these work even if notification fails)
            const soundCheckbox = document.getElementById('enable-sound');
            const voiceCheckbox = document.getElementById('enable-voice');
            const enableSound = soundCheckbox ? soundCheckbox.checked : true;
            const enableVoice = voiceCheckbox ? voiceCheckbox.checked : true;

            this.playNotificationSound(false, enableSound, enableVoice);
            this.vibrate();

            // Show toast notification (always works)
            this.showToast(`${testCityName}の花粉の量が1時間あたり35個を観測しました。`, 'warning', 10000);

            if (typeof Notification !== 'undefined' && permission === 'granted') {
                try {
                    // Trigger Backend Push Test
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) {
                        console.log('Pushing test to backend worker:', WORKER_URL);

                        // Show immediate feedback to the user
                        this.showToast('10秒後にバックグラウンド通知を送信します。その間にブラウザを閉じたりしてテストしてください。', 'info', 10000);

                        const response = await fetch(`${WORKER_URL}/api/test-push`, {
                            method: 'POST',
                            body: JSON.stringify({ subscription }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const resData = await response.json();

                        if (response.ok && resData.success) {
                            console.log('Backend test push request accepted');
                        } else {
                            console.error('Backend test push failed:', resData.error || response.statusText);
                            alert('クラウド通知の送信予約に失敗しました。');
                        }
                    } else {
                        console.warn('No active push subscription found for backend test');
                        alert('通知の登録が見つかりません。「保存」ボタンを押して登録を完了させてください。');
                    }

                } catch (error) {
                    console.error('Notification error:', error);
                    console.log('Note: Backend test push failed');
                }
            }
        } else {
            console.log('Permission denied');
            alert('通知の許可が得られませんでした。');
        }
    },

    playNotificationSound(silent = false) {
        // Check if custom audio file exists, if so use it instead of beep
        const customAudioPath = 'notification.mp3';

        // Try to play custom audio first
        const audio = new Audio(customAudioPath);
        audio.volume = silent ? 0 : 1.0;

        audio.play().catch(() => {
            // If custom audio fails, fall back to beep sound
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Configure sound (pleasant notification tone)
                oscillator.frequency.value = 800; // Hz
                oscillator.type = 'sine';

                // Fade in and out
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
                gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.4);

                console.log('Notification beep played');
            } catch (error) {
                console.error('Error playing sound:', error);
            }
        });
    },

    speakMessage(message) {
        try {
            if ('speechSynthesis' in window) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();

                const utterance = new SpeechSynthesisUtterance(message);
                utterance.lang = 'ja-JP'; // Japanese
                utterance.rate = 1.0; // Normal speed
                utterance.pitch = 1.0; // Normal pitch
                utterance.volume = 1.0; // Full volume

                // Try to select a Japanese voice
                const voices = window.speechSynthesis.getVoices();
                const japaneseVoice = voices.find(voice => voice.lang.startsWith('ja'));
                if (japaneseVoice) {
                    utterance.voice = japaneseVoice;
                    console.log('Using voice:', japaneseVoice.name);
                }

                console.log('Speaking:', message);
                window.speechSynthesis.speak(utterance);
            } else {
                console.log('Speech synthesis not supported');
            }
        } catch (error) {
            console.error('Error speaking message:', error);
        }
    },

    vibrate() {
        const pattern = [300, 100, 300]; // vibrate 300ms, pause 100ms, vibrate 300ms
        if (navigator.vibrate) {
            const result = navigator.vibrate(pattern);
            console.log('Vibration triggered, result:', result);
            console.log('Vibration pattern:', pattern);
        } else {
            console.log('Vibration API not supported');
        }
    },

    playNotificationSound(silent = false, enableSound = null, enableVoice = null) {
        if (silent) {
            // Silent mode for audio unlocking
            return;
        }

        // If not provided, get from settings
        if (enableSound === null || enableVoice === null) {
            const settings = this.getSettings();
            if (!settings) return;

            if (enableSound === null) {
                enableSound = settings.enableSound !== false; // Default true
            }
            if (enableVoice === null) {
                enableVoice = settings.enableVoice !== false; // Default true
            }
        }

        // Play alert sound (ping-pong)
        if (enableSound) {
            this.playAlertSound();
        }

        // Play voice notification (notification.mp3) after 0.8 second delay
        if (enableVoice) {
            setTimeout(() => {
                this.playVoiceNotification();
            }, 800);
        }
    },

    playAlertSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const now = audioContext.currentTime;

            // 1音目: 880Hz (高いラ)
            const osc1 = audioContext.createOscillator();
            const gain1 = audioContext.createGain();
            osc1.connect(gain1);
            gain1.connect(audioContext.destination);

            osc1.frequency.value = 880;
            osc1.type = 'sine';
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

            osc1.start(now);
            osc1.stop(now + 0.2);

            // 2音目: 660Hz (ミ)
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);

            osc2.frequency.value = 660;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0, now + 0.15);
            gain2.gain.setValueAtTime(0.3, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
        } catch (error) {
            console.error('Error playing alert sound:', error);
        }
    },

    async registerServiceWorker() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('Service Worker registered:', registration);
                return registration;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                return null;
            }
        } else {
            console.warn('Push notifications not supported');
            return null;
        }
    },

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },

    async getVapidKey() {
        try {
            const res = await fetch(`${WORKER_URL}/api/vapid-key`);
            if (!res.ok) throw new Error('Failed to get VAPID key');
            const data = await res.json();
            return data.publicKey ? data.publicKey.trim() : null;
        } catch (e) {
            console.error('Error fetching VAPID key:', e);
            return null;
        }
    },

    async subscribeUser(settings) {
        const registration = await navigator.serviceWorker.ready;
        if (!registration) return false;

        try {
            const publicKey = await this.getVapidKey();
            if (!publicKey) {
                console.error('No VAPID key available');
                return false;
            }

            const convertedVapidKey = this.urlBase64ToUint8Array(publicKey);

            // Check for existing subscription
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                console.log('Unsubscribing existing subscription first...');
                await existingSubscription.unsubscribe();
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            console.log('User is subscribed:', subscription);

            // Send subscription to server
            await fetch(`${WORKER_URL}/api/subscribe`, {
                method: 'POST',
                body: JSON.stringify({
                    subscription: subscription,
                    settings: settings
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return true;
        } catch (err) {
            console.error('Failed to subscribe the user: ', err);
            return false;
        }
    },

    async unsubscribeUser() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                // Unsubscribe from backend first
                await fetch(`${WORKER_URL}/api/unsubscribe`, {
                    method: 'POST',
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                    headers: { 'Content-Type': 'application/json' }
                });

                // Unsubscribe from browser
                await subscription.unsubscribe();
                console.log('User is unsubscribed.');
            }
        } catch (e) {
            console.error('Error unsubscribing', e);
        }
    },

    playVoiceNotification() {
        try {
            const audio = new Audio('notification.mp3');
            audio.volume = 0.7;
            audio.play().catch(error => {
                console.error('Error playing voice notification:', error);
            });
        } catch (error) {
            console.error('Error creating audio:', error);
        }
    },

    startMonitoring() {
        this.stopMonitoring();

        const settings = this.getSettings();
        if (!settings) return;

        console.log(`Monitoring started for ${settings.cityName}`);

        // Note: Initial check will be performed by AutoUpdate after data refresh
        // This ensures we use fresh data for the first notification check

        // DISABLED: Independent notification scheduler
        // AutoUpdate now handles both data refresh AND notification checks
        // This prevents duplicate checks and ensures notifications always use fresh data

        /*
        // Schedule to run at 10 minutes past every hour
        const scheduleNextCheck = () => {
            const now = new Date();
            const nextCheck = new Date(now);

            // Set to next hour at 10 minutes
            nextCheck.setHours(now.getHours() + 1);
            nextCheck.setMinutes(10);
            nextCheck.setSeconds(0);
            nextCheck.setMilliseconds(0);

            // If current time is before 10 minutes past current hour, check this hour instead
            if (now.getMinutes() < 10) {
                nextCheck.setHours(now.getHours());
            }

            const timeUntilCheck = nextCheck - now;
            console.log(`Next check scheduled at ${nextCheck.toLocaleTimeString('ja-JP')} (in ${Math.round(timeUntilCheck / 1000 / 60)} minutes)`);

            this.timerId = setTimeout(() => {
                this.checkPollenLevels();
                scheduleNextCheck(); // Schedule the next check
            }, timeUntilCheck);
        };

        scheduleNextCheck();
        */
    },

    stopMonitoring() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    },

    async checkPollenLevels() {
        const settings = this.getSettings();
        if (!settings) return;

        const now = new Date();

        // Fetch data using JST dates - use same date for start and end
        const todayStr = getJSTDateString();
        const start = todayStr.replace(/-/g, '');
        const end = start; // Use same date for both start and end

        console.log('Checking pollen levels:', { start, end, cityCode: settings.cityCode });

        const data = await fetchData(settings.cityCode, start, end);
        if (!data || data.length === 0) {
            console.log('No data returned from API');
            return;
        }

        // Filter for today's data
        const validData = data.filter(v => {
            const dStr = v.date.toISOString().split('T')[0];
            return dStr === todayStr && v.pollen >= 0;
        });

        if (validData.length === 0) return;

        // Calculate metrics
        const latestHourly = validData[validData.length - 1].pollen;
        const dailyTotal = validData.reduce((sum, item) => sum + item.pollen, 0);

        let trigger = false;
        let messages = [];

        const hourlyExceeded = latestHourly >= settings.thresholdHourly;
        const dailyExceeded = dailyTotal >= settings.thresholdDaily;

        // Check hourly threshold (always alert when exceeded)
        if (hourlyExceeded) {
            trigger = true;
            messages.push(`${settings.cityName}の花粉の量が1時間あたり${latestHourly}個を観測しました。`);
        }

        // Check daily threshold
        if (dailyExceeded) {
            const lastDailyAlert = settings.lastDailyAlert || '';

            // Show daily alert if:
            // 1. First time exceeding today (lastDailyAlert !== todayStr), OR
            // 2. Hourly threshold is also exceeded (show both messages)
            if (lastDailyAlert !== todayStr || hourlyExceeded) {
                trigger = true;
                messages.push(`${settings.cityName}の花粉の量が累積値${dailyTotal}個になりました。`);

                // Mark that we've alerted for daily threshold today (only if not already marked)
                if (lastDailyAlert !== todayStr) {
                    settings.lastDailyAlert = todayStr;
                    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
                }
            }
        }

        if (trigger) {
            // Play sound and vibrate based on user settings
            if (settings.enableSound !== false) {
                this.playNotificationSound();
            }
            if (settings.enableVibration !== false) {
                this.vibrate();
            }

            const notificationBody = messages.join('\n');

            // Show toast notification at the bottom of the screen
            this.showToast(notificationBody, 'warning', 10000);

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    // Create system notification with minimal options for compatibility
                    new Notification(`【花粉注意】${settings.cityName}`, {
                        body: notificationBody,
                        silent: true
                    });
                } catch (error) {
                    console.error('System notification failed:', error);
                    // Continue anyway - sound and toast were already shown
                }
            }

            // Update last notified
            settings.lastNotified = now.getTime();
            localStorage.setItem(this.settingsKey, JSON.stringify(settings));
        }
    },

    showToast(msg, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = document.createElement('i');
        icon.className = `fas ${type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}`;

        toast.appendChild(icon);
        // Add a space before the message
        toast.appendChild(document.createTextNode(' '));
        // Safely add the message as text
        toast.appendChild(document.createTextNode(msg));

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    },

    async updateRegisteredLocationUI() {
        const section = document.getElementById('registered-location-section');
        const cityNameSpan = document.getElementById('registered-city-name');
        const dot = document.getElementById('registered-pollen-dot');
        const countSpan = document.getElementById('registered-pollen-count');
        const settings = this.getSettings();

        if (settings && settings.cityCode) {
            cityNameSpan.textContent = settings.cityName;
            section.classList.remove('hidden');

            // Check if we have data in markers first (most efficient)
            const marker = markers[settings.cityCode];
            if (marker && marker.maxPollen !== undefined) {
                const color = getPollenColor(marker.maxPollen, marker.isPast);
                dot.style.backgroundColor = color;
                dot.classList.remove('hidden');
                countSpan.textContent = marker.maxPollen;
                countSpan.classList.remove('hidden');
            } else {
                // If not in markers, try to fetch it specifically for the current date
                try {
                    const todayJST = getJSTDateString();
                    const isToday = state.currentDate === todayJST;
                    const start = state.currentDate.replace(/-/g, '');
                    const end = new Date(state.currentDate);
                    end.setDate(end.getDate() + 1);
                    let endStr = end.toISOString().split('T')[0].replace(/-/g, '');
                    const todayStr = todayJST.replace(/-/g, '');
                    if (endStr > todayStr) endStr = todayStr;

                    const data = await fetchData(settings.cityCode, start, endStr);
                    if (data && data.length > 0) {
                        let displayValue = 0;
                        if (isToday) {
                            const now = new Date();
                            const validData = data.filter(v => v.date <= now && v.pollen !== null && v.pollen >= 0);
                            const latest = validData.length > 0 ? validData[validData.length - 1] : null;
                            displayValue = latest ? latest.pollen : 0;
                        } else {
                            displayValue = data
                                .filter(item => item.dateKey === state.currentDate)
                                .reduce((sum, item) => sum + (item.pollen > 0 ? item.pollen : 0), 0);
                        }
                        const color = getPollenColor(displayValue, !isToday);
                        dot.style.backgroundColor = color;
                        dot.classList.remove('hidden');
                        countSpan.textContent = displayValue;
                        countSpan.classList.remove('hidden');
                    } else {
                        dot.classList.add('hidden');
                        countSpan.classList.add('hidden');
                    }
                } catch (e) {
                    console.error('Error updating registered location UI:', e);
                    dot.classList.add('hidden');
                    countSpan.classList.add('hidden');
                }
            }
        } else {
            section.classList.add('hidden');
        }
    },

    jumpToRegisteredLocation() {
        const settings = this.getSettings();
        if (!settings || !settings.cityCode) return;

        const city = CITIES.find(c => c.code === settings.cityCode);
        if (city && map) {
            map.setView([city.lat, city.lng], 10);

            // Open popup for the city if it's visible or can be made visible
            setTimeout(() => {
                const marker = markers[city.code];
                if (marker) {
                    marker.openPopup();
                }
            }, 500);
        }
    }
};

// Auto Update Manager - Updates data every hour at 10 minutes past
const AutoUpdateManager = {
    updateTimer: null,
    nextUpdateTime: null,
    lastUpdateTime: null, // Track last update time for cooldown
    COOLDOWN_PERIOD: 5 * 60 * 1000, // 5 minutes in milliseconds

    init() {
        this.scheduleNextUpdate();
    },

    // Calculate next update time (randomly between 10 to 13 minutes past the hour)
    calculateNextUpdateTime() {
        const now = new Date();
        const next = new Date(now);

        // Random delay between 10 and 13 minutes (10m 0s to 13m 59s)
        const randomMinutes = 10 + Math.floor(Math.random() * 4); // 10, 11, 12, or 13
        const randomSeconds = Math.floor(Math.random() * 60);

        next.setMinutes(randomMinutes, randomSeconds, 0);

        // If we're already past this random time in the current hour, move to next hour
        if (now >= next) {
            next.setHours(next.getHours() + 1);
        }

        return next;
    },

    scheduleNextUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        this.nextUpdateTime = this.calculateNextUpdateTime();
        const now = new Date();
        const timeUntilUpdate = this.nextUpdateTime - now;

        console.log(`[AutoUpdate] Next update scheduled at ${this.nextUpdateTime.toLocaleTimeString('ja-JP')} (in ${Math.round(timeUntilUpdate / 1000 / 60)} minutes)`);

        this.updateTimer = setTimeout(() => {
            this.performUpdate();
            this.scheduleNextUpdate();
        }, timeUntilUpdate);
    },

    async performUpdate() {
        console.log('[AutoUpdate] Starting automatic update...', { currentDate: state.currentDate });

        // Check cooldown period (5 minutes)
        const now = new Date();
        if (this.lastUpdateTime) {
            const timeSinceLastUpdate = now - this.lastUpdateTime;
            if (timeSinceLastUpdate < this.COOLDOWN_PERIOD) {
                const remainingCooldown = Math.ceil((this.COOLDOWN_PERIOD - timeSinceLastUpdate) / 1000 / 60);
                console.log(`[AutoUpdate] Skipping update - cooldown period active (${remainingCooldown} minutes remaining)`);
                return;
            }
        }

        // Record update time
        this.lastUpdateTime = now;

        try {
            // Clear all caches
            state.cache = {};
            fetchedCities.clear();

            // Reset all markers to default state (gray) and clear fetched status
            Object.values(markers).forEach(marker => {
                marker.setStyle({ fillColor: '#ccc' });
                marker.maxPollen = 0;
                marker.isPast = false;
                if (marker.getTooltip()) {
                    marker.unbindTooltip();
                }
            });

            // If viewing today's data, update to ensure we're showing the latest
            const todayStr = getJSTDateString();
            if (state.currentDate === todayStr) {
                // Refresh all visible markers - this will now fetch fresh data
                await updateVisibleMarkers();

                // Update tooltips if zoom level is high enough
                updateVis();

                // Update weather data if visible
                if (typeof window.updateWeatherMarkers === 'function') {
                    await window.updateWeatherMarkers();
                }

                // Refresh open popup if any
                if (currentOpenCity) {
                    const marker = markers[currentOpenCity.code];
                    if (marker && marker.isPopupOpen()) {
                        await handlePopupOpen(currentOpenCity, marker);
                    }
                }
                console.log('[AutoUpdate] Automatic update completed successfully');

                // Check pollen levels and send notifications if needed (using fresh data)
                if (typeof NotificationManager !== 'undefined' && NotificationManager.checkPollenLevels) {
                    await NotificationManager.checkPollenLevels();
                }
            } else {
                console.log('[AutoUpdate] Not today, skipping data refresh');
            }
        } catch (error) {
            console.error('[AutoUpdate] Automatic update failed:', error);
        }
    },

    destroy() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
    }
};

// Initialize auto-update when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait a bit for other initializations to complete
        setTimeout(() => {
            AutoUpdateManager.init();
        }, 1000);
    });
} else {
    setTimeout(() => {
        AutoUpdateManager.init();
    }, 1000);
}
