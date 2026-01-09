const CONFIG = {
    CURRENT_DATE: '2025-02-15',
    API_ENDPOINT: 'https://wxtech.weathernews.com/opendata/v1/pollen',
    ZOOM_THRESHOLD: 11
};

// State to store fetched data
const state = {
    dailyData: {},
    weeklyData: {}
};

// Map variable (initialized later)
let map;

// Markers storage
const markers = {};
const fetchedCities = new Set();
let currentVisibleCityCodes = new Set();

// Helper: Get Color based on Pollen Count
function getPollenColor(count) {
    if (count >= 5) return '#f44336'; // High (Red)
    if (count >= 2) return '#ff9800'; // Medium (Orange)
    return '#2196F3'; // Low (Blue)
}

// Helper: Fetch Data
async function fetchData(cityCode, start, end) {
    const cacheKey = `${cityCode}-${start}-${end}`;
    if (state[cacheKey]) return state[cacheKey];

    try {
        const response = await fetch(`${CONFIG.API_ENDPOINT}?citycode=${cityCode}&start=${start}&end=${end}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();

        // Parse CSV
        const rows = text.trim().split('\n').slice(1); // Skip header
        const data = rows.map(row => {
            const [code, dateStr, pollenStr] = row.split(',');
            return {
                date: new Date(dateStr),
                pollen: parseInt(pollenStr, 10)
            };
        });

        state[cacheKey] = data;
        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        return [];
    }
}

// Initialize Markers
function initMarkers() {
    // Initial render
    updateVisibleMarkers().catch(err => console.error('Error in updateVisibleMarkers:', err));
}

// Fetch data for visible markers and handle LOD
async function updateVisibleMarkers() {
    if (!map) return;
    try {
        const zoom = map.getZoom();
        const bounds = map.getBounds();

        // 1. Filter by Zoom Level (More restrictive for better performance)
        // Zoom < 8: Level 1 (Major Cities)
        // Zoom 8-9: Level 1 + 2 (Cities/Wards)
        // Zoom >= 10: All (Towns/Villages)
        let targetLevels = new Set([1]);
        if (zoom >= 8) targetLevels.add(2);
        if (zoom >= 10) targetLevels.add(3);

        // 2. Get Spatially Visible Cities matching Level
        let visibleCandidates = [];
        for (const city of CITIES) {
            if (targetLevels.has(city.level)) {
                const latLng = L.latLng(city.lat, city.lng);
                if (bounds.contains(latLng)) {
                    visibleCandidates.push(city);
                }
            }
        }

        // 3. Apply Max Limit (Dynamic based on zoom)
        let maxMarkers = 40;
        if (zoom >= 8) maxMarkers = 80;
        if (zoom >= 10) maxMarkers = 150;
        if (zoom >= 12) maxMarkers = 400;

        if (visibleCandidates.length > maxMarkers) {
            // Prioritize Level 1, then distribute Level 2 and 3
            const level1 = visibleCandidates.filter(c => c.level === 1);
            const level2 = visibleCandidates.filter(c => c.level === 2);
            const level3 = visibleCandidates.filter(c => c.level === 3);

            let result = [...level1];

            // Fill remaining slots with Level 2 (distributed)
            if (result.length < maxMarkers && level2.length > 0) {
                const remaining = maxMarkers - result.length;
                const step = Math.max(1, Math.floor(level2.length / remaining));
                for (let i = 0; i < level2.length && result.length < maxMarkers; i += step) {
                    result.push(level2[i]);
                }
            }

            // Fill remaining slots with Level 3 (distributed)
            if (result.length < maxMarkers && level3.length > 0) {
                const remaining = maxMarkers - result.length;
                const step = Math.max(1, Math.floor(level3.length / remaining));
                for (let i = 0; i < level3.length && result.length < maxMarkers; i += step) {
                    result.push(level3[i]);
                }
            }
            visibleCandidates = result;
        }

        const visibleCityCodes = new Set(visibleCandidates.map(c => c.code));
        currentVisibleCityCodes = visibleCityCodes; // Update global visibility state

        const fetchQueue = [];

        // 4. Update Markers on Map
        // Add new ones
        for (const city of visibleCandidates) {
            if (!markers[city.code]) {
                const marker = L.circleMarker([city.lat, city.lng], {
                    radius: 8, // Slightly smaller markers
                    fillColor: '#ccc',
                    color: '#fff',
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                marker.cityCode = city.code;
                marker.cityName = city.name;
                marker.maxPollen = 0;

                marker.bindPopup(`<div id="popup-${city.code}">読み込み中...</div>`, {
                    maxWidth: 300
                });
                marker.on('popupopen', () => handlePopupOpen(city, marker));

                markers[city.code] = marker;
                marker.addTo(map);
            } else {
                if (!map.hasLayer(markers[city.code])) {
                    markers[city.code].addTo(map);
                }
            }

            if (!fetchedCities.has(city.code)) {
                fetchQueue.push(city.code);
            }
        }

        // Remove hidden ones
        Object.keys(markers).forEach(code => {
            if (!visibleCityCodes.has(code)) {
                if (map.hasLayer(markers[code])) {
                    map.removeLayer(markers[code]);
                }
            }
        });

        // 5. Fetch Data in Batches (Reduced delay for better speed)
        const BATCH_SIZE = 8;
        for (let i = 0; i < fetchQueue.length; i += BATCH_SIZE) {
            // Check if markers are still visible before fetching
            const batch = fetchQueue.slice(i, i + BATCH_SIZE)
                .filter(code => currentVisibleCityCodes.has(code));

            if (batch.length > 0) {
                await Promise.all(batch.map(code => fetchCityDailyData(code)));
                // Reduced delay from 500ms to 200ms
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    } catch (err) {
        console.error('Error in updateVisibleMarkers logic:', err);
    }
}

async function fetchCityDailyData(cityCode) {
    if (fetchedCities.has(cityCode)) return;

    const start = CONFIG.CURRENT_DATE.replace(/-/g, '');
    const end = new Date(CONFIG.CURRENT_DATE);
    end.setDate(end.getDate() + 1);
    const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    const data = await fetchData(cityCode, start, endStr);

    if (data.length > 0) {
        const maxPollen = data.reduce((max, item) => Math.max(max, item.pollen), 0);
        const marker = markers[cityCode];
        if (marker) {
            marker.setStyle({ fillColor: getPollenColor(maxPollen) });
            marker.maxPollen = maxPollen;
            fetchedCities.add(cityCode);

            // Update tooltip if needed
            if (map.getZoom() >= CONFIG.ZOOM_THRESHOLD) {
                const height = Math.min(marker.maxPollen * 10, 50);
                const color = getPollenColor(marker.maxPollen);
                const content = `
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div style="width: 10px; height: ${height}px; background-color: ${color};"></div>
                        <span style="font-size: 10px;">${marker.maxPollen}</span>
                    </div>
                `;
                if (marker.getTooltip()) {
                    marker.setTooltipContent(content);
                }
            }
        }
    }
}

// Handle Popup Open (Show Daily Graph)
async function handlePopupOpen(city, marker) {
    const containerId = `popup-${city.code}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const start = CONFIG.CURRENT_DATE.replace(/-/g, '');
    const end = new Date(CONFIG.CURRENT_DATE);
    end.setDate(end.getDate() + 1);
    const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    const data = await fetchData(city.code, start, endStr);
    const dayData = data.filter(d => d.date.toISOString().startsWith(CONFIG.CURRENT_DATE));

    container.innerHTML = `
        <div class="popup-header">
            <span>${city.name} (2/15)</span>
            <button class="btn-trend" onclick="showWeeklyTrend('${city.code}', '${city.name}')">週間推移</button>
        </div>
        <div class="popup-chart-container">
            <canvas id="chart-${city.code}"></canvas>
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
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// Show Weekly Trend Modal
window.showWeeklyTrend = async function (cityCode, cityName) {
    const modal = document.getElementById('trend-modal');
    const modalTitle = document.getElementById('modal-city-name');
    const canvas = document.getElementById('trendChart');

    modalTitle.textContent = `${cityName}の週間推移`;
    modal.classList.add('show');

    const endDate = new Date(CONFIG.CURRENT_DATE);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = CONFIG.CURRENT_DATE.replace(/-/g, '');

    const data = await fetchData(cityCode, startStr, endStr);

    const dailyMap = {};
    data.forEach(item => {
        const dateKey = item.date.toISOString().split('T')[0];
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { sum: 0, count: 0 };
        dailyMap[dateKey].sum += item.pollen;
        dailyMap[dateKey].count++;
    });

    const labels = Object.keys(dailyMap).sort();
    const values = labels.map(date => {
        const average = dailyMap[date].sum / dailyMap[date].count;
        return Math.max(0, average); // Treat negative values as zero
    });

    if (window.trendChartInstance) {
        window.trendChartInstance.destroy();
    }

    window.trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels.map(d => d.slice(5)),
            datasets: [{
                label: '平均花粉数',
                data: values,
                borderColor: '#2196F3',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
};

// Close Modal
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
            if (!marker.getTooltip()) {
                const height = Math.min(marker.maxPollen * 10, 50);
                const color = getPollenColor(marker.maxPollen);
                const content = `
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div style="width: 10px; height: ${height}px; background-color: ${color};"></div>
                        <span style="font-size: 10px;">${marker.maxPollen}</span>
                    </div>
                `;
                marker.bindTooltip(content, {
                    permanent: true,
                    direction: 'top',
                    className: 'graph-tooltip',
                    offset: [0, -10]
                });
            }
            marker.openTooltip();
        } else {
            marker.closeTooltip();
            marker.unbindTooltip();
        }
    });
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined') {
        alert('Leaflet (地図ライブラリ) が読み込まれていません。インターネット接続を確認してください。');
        return;
    }
    if (typeof CITIES === 'undefined') {
        alert('都市データ (cities.js) が読み込まれていません。');
        return;
    }

    try {
        // Initialize Map
        map = L.map('map').setView([36.2048, 138.2529], 5); // Center on Japan

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Zoom/Move Event Listener
        map.on('zoomend', updateVis);
        map.on('moveend', () => {
            updateVisibleMarkers().catch(err => console.error('Error in moveend handler:', err));
            updateVis();
        });

        initMarkers();
    } catch (e) {
        console.error('Initialization error:', e);
        alert('アプリの初期化中にエラーが発生しました: ' + e.message);
    }
});
