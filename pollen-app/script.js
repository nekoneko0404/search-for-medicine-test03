const CONFIG = {
    API_ENDPOINT: 'https://wxtech.weathernews.com/opendata/v1/pollen',
    ZOOM_THRESHOLD: 11,
    CACHE_DURATION: 10 * 60 * 1000 // 10 minutes in milliseconds
};

// State to store fetched data
const state = {
    cache: {}, // { key: { data: [...], timestamp: Date } }
    currentDate: '' // YYYY-MM-DD
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
            return {
                date: new Date(dateStr),
                pollen: parseInt(pollenStr, 10)
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

// Fetch data for visible markers and handle LOD
async function updateVisibleMarkers() {
    if (!map) return;
    try {
        const zoom = map.getZoom();
        const bounds = map.getBounds();

        let targetLevels = new Set([1]);
        if (zoom >= 8) targetLevels.add(2);
        if (zoom >= 10) targetLevels.add(3);

        let visibleCandidates = [];
        for (const city of CITIES) {
            if (targetLevels.has(city.level)) {
                const latLng = L.latLng(city.lat, city.lng);
                if (bounds.contains(latLng)) {
                    visibleCandidates.push(city);
                }
            }
        }

        let maxMarkers = 40;
        if (zoom >= 8) maxMarkers = 80;
        if (zoom >= 10) maxMarkers = 150;
        if (zoom >= 12) maxMarkers = 400;

        if (visibleCandidates.length > maxMarkers) {
            const level1 = visibleCandidates.filter(c => c.level === 1);
            const level2 = visibleCandidates.filter(c => c.level === 2);
            const level3 = visibleCandidates.filter(c => c.level === 3);

            let result = [...level1];

            if (result.length < maxMarkers && level2.length > 0) {
                const remaining = maxMarkers - result.length;
                const step = Math.max(1, Math.floor(level2.length / remaining));
                for (let i = 0; i < level2.length && result.length < maxMarkers; i += step) {
                    result.push(level2[i]);
                }
            }

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

                marker.bindPopup(`<div id="popup-${city.code}">読み込み中...</div>`, {
                    maxWidth: 350 // Slightly wider
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
                .filter(code => currentVisibleCityCodes.has(code) && !fetchedCities.has(code));

            if (batch.length > 0) {
                await Promise.all(batch.map(code => fetchCityDailyData(code)));
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
    const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    const data = await fetchData(cityCode, start, endStr);

    if (data.length > 0) {
        const maxPollen = data.reduce((max, item) => Math.max(max, item.pollen), 0);
        const marker = markers[cityCode];
        if (marker) {
            marker.setStyle({ fillColor: getPollenColor(maxPollen) });
            marker.maxPollen = maxPollen;
            fetchedCities.add(cityCode);

            if (map.getZoom() >= CONFIG.ZOOM_THRESHOLD) {
                updateMarkerTooltip(marker);
            }
        }
    }
}

function updateMarkerTooltip(marker) {
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
    const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

    const data = await fetchData(city.code, start, endStr);
    const dayData = data.filter(d => d.date.toISOString().startsWith(state.currentDate));

    const displayDate = state.currentDate.split('-').slice(1).join('/');

    container.innerHTML = `
        <div class="popup-header">
            <span>${city.name} (${displayDate})</span>
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
                borderWidth: 0,
                barPercentage: 0.9, // Fuller bars
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
}

window.showWeeklyTrend = async function (cityCode, cityName) {
    const modal = document.getElementById('trend-modal');
    const modalTitle = document.getElementById('modal-city-name');
    const canvas = document.getElementById('trendChart');
    const loading = document.getElementById('trend-loading');

    modalTitle.textContent = `${cityName}の21日間推移`;
    modal.classList.add('show');

    // Show loading, hide canvas
    loading.classList.remove('hidden');
    canvas.style.opacity = '0';

    const endDate = new Date(state.currentDate);
    // endDate is today, we want 21 days including today
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 20); // 21 days total

    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = state.currentDate.replace(/-/g, '');

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
        return Math.max(0, average);
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
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

    // Hide loading, show canvas
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

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
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
            const days = parseInt(btn.dataset.days);
            const d = new Date();
            d.setDate(d.getDate() - days);
            const dStr = d.toISOString().split('T')[0];
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
    }

    datePicker.addEventListener('change', (e) => {
        updateDate(e.target.value);
    });

    // Prev/Next Day Buttons
    document.getElementById('prev-day').addEventListener('click', () => {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() - 1);
        updateDate(d.toISOString().split('T')[0]);
    });

    document.getElementById('next-day').addEventListener('click', () => {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() + 1);
        const nextStr = d.toISOString().split('T')[0];
        if (nextStr <= todayStr) {
            updateDate(nextStr);
        }
    });

    // Quick Select Buttons
    document.querySelectorAll('.btn-quick-date').forEach(btn => {
        btn.addEventListener('click', () => {
            const days = parseInt(btn.dataset.days);
            const d = new Date();
            d.setDate(d.getDate() - days);
            updateDate(d.toISOString().split('T')[0]);
        });
    });

    // Initial active state
    document.querySelector('.btn-quick-date[data-days="0"]').classList.add('active');

    try {
        map = L.map('map', {
            zoomControl: false
        }).setView([36.2048, 138.2529], 5);

        L.control.zoom({
            position: 'bottomright'
        }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        map.on('zoomend', updateVis);
        map.on('moveend', () => {
            updateVisibleMarkers().catch(err => console.error(err));
            updateVis();
        });

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
        });

        // Auto-collapse on small screens initially
        if (window.innerWidth <= 600) {
            panel.classList.add('collapsed');
            toggleBtn.title = 'パネルを開く';
        }
    }
});
