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

// State to store fetched data
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
        if (count >= 12) return '#9C27B0'; // Very High (Purple)
        if (count >= 7) return '#f44336'; // High (Red)
        if (count >= 4) return '#FFEB3B'; // Medium (Yellow)
        if (count >= 1) return '#2196F3'; // Low (Blue)
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
            if (isNaN(pollen) || pollen < 0) pollen = 0; // Treat negative or NaN as 0
            return {
                date: new Date(dateStr),
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
        if (zoom >= 8) targetLevels.add(2);
        if (zoom >= 10) targetLevels.add(3);

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
        let minDistCenter = 40; // Minimum distance at the center (px)
        let minDistEdge = 150;  // Minimum distance at the edge (px)

        // Adjust for national view (low zoom) to show more points
        if (zoom < 7) {
            minDistCenter = 30;
            minDistEdge = 80;
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
                    color: '#fff',
                    weight: 1.5,
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
        if (isToday) {
            // For today, use the latest non-null hourly value that is not in the future
            const now = new Date();
            const validData = data.filter(v => v.date <= now && v.pollen !== null);
            const latest = validData.length > 0 ? validData[validData.length - 1] : null;
            displayValue = latest ? latest.pollen : 0;
        } else {
            // For past data, use the daily total (sum) for the selected date only
            const [year, month, day] = state.currentDate.split('-').map(Number);
            displayValue = data
                .filter(item => {
                    const d = item.date;
                    return d.getFullYear() === year && (d.getMonth() + 1) === month && d.getDate() === day;
                })
                .reduce((sum, item) => sum + (item.pollen || 0), 0);
        }

        const marker = markers[cityCode];
        if (marker) {
            marker.isPast = !isToday;
            marker.maxPollen = displayValue;
            marker.setStyle({ fillColor: getPollenColor(displayValue, !isToday) });
            fetchedCities.add(cityCode);

            if (map.getZoom() >= CONFIG.ZOOM_THRESHOLD) {
                updateMarkerTooltip(marker);
            }
        }
    }
}

function updateMarkerTooltip(marker) {
    const height = marker.isPast ? marker.maxPollen * 0.4 : marker.maxPollen * 8; // Adjust height for past totals
    const color = getPollenColor(marker.maxPollen, marker.isPast);

    // Wrapped in graph-tooltip-inner for rotation
    const content = `
        <div class="graph-tooltip-inner" style="display: flex; flex-direction: column; align-items: center;">
            <div style="width: 10px; height: ${Math.min(height, 150)}px; background-color: ${color}; border: 1px solid #fff;"></div>
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
    const [year, month, day] = state.currentDate.split('-').map(Number);
    const dayData = data.filter(d => {
        const dt = d.date;
        return dt.getFullYear() === year && (dt.getMonth() + 1) === month && dt.getDate() === day;
    });

    const displayDate = state.currentDate.split('-').slice(1).join('/');

    const sanitizedName = sanitizeHTML(city.name);
    const sanitizedDate = sanitizeHTML(displayDate);
    const sanitizedCode = sanitizeHTML(city.code);

    container.innerHTML = `
        <div class="popup-header">
            <span>${sanitizedName} (${sanitizedDate})</span>
            <button class="btn-trend" onclick="showWeeklyTrend('${sanitizedCode}', '${sanitizedName}')">週間推移</button>
        </div>
        <div class="popup-chart-container">
            <canvas id="chart-${sanitizedCode}"></canvas>
        </div>
    `;

    const ctx = document.getElementById(`chart-${city.code}`).getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dayData.map(d => d.date.getHours() + '時'),
            datasets: [{
                label: '花粉数',
                data: dayData.map(d => d.pollen),
                backgroundColor: dayData.map(d => getPollenColor(d.pollen)),
                borderWidth: 0,
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
        const year = item.date.getFullYear();
        const month = String(item.date.getMonth() + 1).padStart(2, '0');
        const day = String(item.date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        if (!dailyMap[dateKey]) dailyMap[dateKey] = { sum: 0, count: 0 };
        dailyMap[dateKey].sum += item.pollen;
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
    const modal = document.getElementById('trend-modal');
    if (event.target == modal) {
        modal.classList.remove('show');
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

    function updateDate(newDateStr) {
        if (newDateStr > todayStr) return; // Prevent future dates
        state.currentDate = newDateStr;
        datePicker.value = newDateStr;

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

    // Initial active state
    document.querySelector('.btn-quick-date[data-days="0"]').classList.add('active');

    try {
        map = L.map('map', {
            zoomControl: false,
            minZoom: 2,
            maxZoom: 12
        }).setView([36.2048, 138.2529], 5);

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

        initMarkers();
    } catch (e) {
        console.error('Initialization error:', e);
    }

    // Panel Toggle Logic
    const panel = document.getElementById('side-panel');
    const toggleBtn = document.getElementById('panel-toggle');

    if (panel && toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            const isCollapsed = panel.classList.contains('collapsed');
            toggleBtn.title = isCollapsed ? 'パネルを開く' : 'パネルを閉じる';

            // Update markers when panel state changes to adjust visual center
            setTimeout(() => {
                updateVisibleMarkers().catch(err => console.error(err));
            }, 300); // Wait for transition
        });

        // Auto-collapse on small screens initially
        if (window.innerWidth <= 600) {
            panel.classList.add('collapsed');
            toggleBtn.title = 'パネルを開く';
        }
    }
});
