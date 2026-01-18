

// グラフコンテナにローディングスケルトンを表示
function showChartLoading(containerElement) {
    if (!containerElement) return;

    // 既にローディングオーバーレイが存在する場合は何もしない
    if (containerElement.querySelector('.chart-loading-overlay')) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'chart-loading-overlay';
    overlay.innerHTML = '<div class="chart-loading-skeleton"></div>';

    // コンテナのpositionがstatic以外であることを保証
    if (window.getComputedStyle(containerElement).position === 'static') {
        containerElement.classList.add('position-relative');
    }

    containerElement.appendChild(overlay);
}

// グラフコンテナのローディングスケルトンを非表示
function hideChartLoading(containerElement) {
    if (!containerElement) return;
    const overlay = containerElement.querySelector('.chart-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

console.log("infection app main.js loaded"); // 追加
const API_URL = 'https://script.google.com/macros/s/AKfycby8wh0NMuPtEOgLVHXfc0jzNqlOENuOgCwQmYYzMSZCKTvhSDiJpZkAyJxntGISTGOmbQ/exec';
let cachedData = {
    current: null, // 当年のデータ
    archives: []   // 過去数年分のデータ
};
let currentDisease = 'Influenza'; // 初期表示疾患
const ALL_DISEASES = [ // 全疾患リスト
    { key: 'Influenza', name: 'インフルエンザ' },
    { key: 'COVID-19', name: 'COVID-19' },
    { key: 'ARI', name: '急性呼吸器感染症' },
    { key: 'RSV', name: 'ＲＳウイルス感染症' },
    { key: 'PharyngoconjunctivalFever', name: '咽頭結膜熱' },
    { key: 'AGS_Pharyngitis', name: 'Ａ群溶血性レンサ球菌咽頭炎' },
    { key: 'InfectiousGastroenteritis', name: '感染性胃腸炎' },
    { key: 'Chickenpox', name: '水痘' },
    { key: 'HandFootMouthDisease', name: '手足口病' },
    { key: 'ErythemaInfectiosum', name: '伝染性紅斑' },
    { key: 'ExanthemSubitum', name: '突発性発しん' },
    { key: 'Herpangina', name: 'ヘルパンギーナ' },
    { key: 'Mumps', name: '流行性耳下腺炎' },
    { key: 'AcuteHemorrhagicConjunctivitis', name: '急性出血性結膜炎' },
    { key: 'EpidemicKeratoconjunctivitis', name: '流行性角結膜炎' },
    { key: 'BacterialMeningitis', name: '細菌性髄膜炎' },
    { key: 'AsepticMeningitis', name: '無菌性髄膜炎' },
    { key: 'MycoplasmaPneumonia', name: 'マイコプラズマ肺炎' },
    { key: 'ChlamydiaPneumonia', name: 'クラミジア肺炎' },
    { key: 'RotavirusGastroenteritis', name: '感染性胃腸炎（ロタウイルス）' }
];

let prefectureChart = null;
let currentRegionId = null;
let currentPrefecture = null;

window.setCurrentRegion = function (regionId) {
    currentRegionId = regionId;
    currentPrefecture = null; // グラフモード解除
};

// sanitization function
function sanitizeHTML(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Parsing functions removed (moved to server-side)

const CACHE_CONFIG = {
    COMBINED_DATA_KEY: 'infection_surveillance_combined_data_v4',
    MAIN_EXPIRY: 1 * 60 * 60 * 1000,
    HISTORY_EXPIRY: 30 * 60 * 1000
};

// LocalForage settings (default)

async function fetchCombinedData() {
    const now = Date.now();

    try {
        const cached = await localforage.getItem(CACHE_CONFIG.COMBINED_DATA_KEY);
        if (cached && (now - cached.timestamp < CACHE_CONFIG.HISTORY_EXPIRY)) {
            return cached.data;
        }
    } catch (e) {
        console.warn('Combined data cache check failed:', e);
    }

    try {
        const response = await fetch(`${API_URL}?type=combined`, {
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        try {
            await localforage.setItem(CACHE_CONFIG.COMBINED_DATA_KEY, {
                timestamp: now,
                data: data
            });
        } catch (e) {
            console.warn('Combined data cache save failed:', e);
        }

        return data;
    } catch (e) {
        console.error('Fetch error for combined data:', e);
        throw e;
    }
}

function renderSummary(data) {
    const container = document.getElementById('summary-cards');
    if (!container) return;

    // Clear previous content safely
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // 主要な疾患のみサマリーカードを表示
    const diseasesForSummary = ALL_DISEASES.filter(d => ['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    diseasesForSummary.forEach(diseaseObj => {
        const diseaseKey = diseaseObj.key;
        const nationalData = data.current.data.find(d => d.disease === diseaseKey && d.prefecture === '全国');
        const alert = data.current.summary.alerts.find(a => a.disease === diseaseKey);

        const card = document.createElement('div');
        card.className = `card ${currentDisease === diseaseKey ? 'active' : ''}`;
        card.dataset.disease = diseaseKey;
        card.dataset.status = alert ? alert.level : 'normal';
        card.onclick = () => switchDisease(diseaseKey);

        const h4 = document.createElement('h4');
        h4.textContent = getDiseaseName(diseaseKey);
        card.appendChild(h4);

        const pValue = document.createElement('p');
        pValue.className = 'value';
        pValue.textContent = `${nationalData ? nationalData.value.toFixed(2) : '-'}`;
        const spanUnit = document.createElement('span');
        spanUnit.className = 'unit';
        spanUnit.textContent = ' 定点当たり';
        pValue.appendChild(spanUnit);
        card.appendChild(pValue);

        const pStatus = document.createElement('p');
        pStatus.className = `status ${alert ? alert.level : 'normal'}`;
        pStatus.textContent = alert ? alert.message : 'データなし';
        card.appendChild(pStatus);

        container.appendChild(card);
    });
}

function switchDisease(disease) {
    currentDisease = disease;

    document.querySelectorAll('.summary-cards .card').forEach(card => {
        card.classList.toggle('active', card.dataset.disease === disease);
    });

    const otherDiseasesListView = document.getElementById('other-diseases-list-view');
    const isOtherDiseasesViewActive = otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden');

    if (isOtherDiseasesViewActive) {
        // 「その他の感染症」ビューがアクティブな場合、選択中の都道府県でリストを更新
        renderOtherDiseasesList(currentPrefecture || '全国');
    } else if (currentPrefecture) {
        // 都道府県別詳細チャート表示中の場合、疾患を切り替えてチャートを更新
        showPrefectureChart(currentPrefecture, disease);
    } else {
        switchView('main-view'); // メインビューを表示
    }

    // 右パネルの更新（地域詳細パネル）
    // グラフ表示中も、その都道府県の詳細データを表示し続けるのが自然
    // ただし、currentRegionId は showPrefectureChart で null にされることがあるため、
    // currentPrefecture がある場合はその ID を特定するか、
    // 既存のロジック（updateDetailPanel）が ID ベースなら ID が必要。
    // showPrefectureChart では currentRegionId = null にしているので、
    // グラフモードではここはスキップされるはず。

    if (!currentPrefecture) {
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, disease, currentPrefecture);
        } else {
            closePanel();
        }
    } else {
        // グラフモードの時も、その都道府県が含まれる地域の詳細を表示する
        if (typeof window.getRegionIdByPrefecture === 'function' && typeof window.updateDetailPanel === 'function' && cachedData) {
            const regionId = window.getRegionIdByPrefecture(currentPrefecture);
            if (regionId) {
                window.updateDetailPanel(regionId, cachedData, disease, currentPrefecture);
            } else {
                closePanel();
            }
        } else {
            closePanel();
        }
    }

    if (cachedData) {
        renderDashboard(disease, cachedData);
    }
}

function getDiseaseName(key) {
    const disease = ALL_DISEASES.find(d => d.key === key);
    return disease ? disease.name : key;
}

let currentChart = null;

// 全都道府県・全期間の最大値を取得する関数
function getGlobalMaxForDisease(disease) {
    let max = 0;
    // Current year
    if (cachedData.current && cachedData.current.history) {
        cachedData.current.history.forEach(h => {
            if (h.disease === disease) {
                h.history.forEach(item => {
                    if (item.value > max) max = item.value;
                });
            }
        });
    }
    // Archives
    if (cachedData.archives) {
        cachedData.archives.forEach(archive => {
            if (archive.data) {
                archive.data.forEach(h => {
                    if (h.disease === disease) {
                        h.history.forEach(item => {
                            if (item.value > max) max = item.value;
                        });
                    }
                });
            }
        });
    }
    return max;
}

// 比較グラフを描画する汎用関数
function renderComparisonChart(canvasId, diseaseKey, prefecture, yearDataSets, yAxisMax = null, loadingTargetElement) {
    if (loadingTargetElement) {
        showChartLoading(loadingTargetElement);
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Canvas element with ID '${canvasId}' not found.`);
        if (loadingTargetElement) {
            hideChartLoading(loadingTargetElement);
            loadingTargetElement.innerHTML = '<p class="no-data-message">グラフを描画できませんでした。</p>';
        }
        return;
    }
    const ctx = canvas.getContext('2d');

    if (canvas.chart) {
        canvas.chart.destroy();
    }

    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const isMobile = window.innerWidth <= 768;

    const labels = [];
    yearDataSets.forEach(ds => {
        ds.data.forEach(item => {
            if (!labels.includes(`${item.week}週`)) {
                labels.push(`${item.week}週`);
            }
        });
    });
    labels.sort((a, b) => parseInt(a) - parseInt(b));

    if (labels.length === 0) {
        if (loadingTargetElement) {
            hideChartLoading(loadingTargetElement);
            loadingTargetElement.innerHTML = '<p class="no-data-message">データがありません。</p>';
        }
        return;
    }

    const createDataset = (ds) => {
        const year = ds.year;
        let borderColor;
        let borderWidth;
        let pointRadius = 1;

        if (year === new Date().getFullYear()) {
            const validDataPoints = ds.data.filter(d => d && d.value !== null && d.value !== undefined);
            const lastDataPoint = validDataPoints.length > 0 ? validDataPoints[validDataPoints.length - 1] : { value: 0, week: 0 };
            borderColor = getColorForValue(lastDataPoint.value, diseaseKey);
            borderWidth = 3;
            pointRadius = 2.5;
        } else if (year === new Date().getFullYear() - 1) {
            borderColor = '#A9CCE3';
            borderWidth = 2;
        } else {
            borderColor = '#E0E0E0';
            borderWidth = 1;
        }

        if (canvasId.startsWith('chart-')) {
            pointRadius = 0;
        }
        const dataLabel = `${year}年`;

        const dataset = {
            label: dataLabel,
            data: labels.map(weekLabel => {
                const week = parseInt(weekLabel);
                const item = ds.data.find(d => d.week === week);
                return item ? item.value : null;
            }),
            borderColor: borderColor,
            borderWidth: borderWidth,
            pointRadius: pointRadius,
            fill: false,
            tension: 0.1,
            spanGaps: true,
            _originalColor: borderColor,
            _originalBorderWidth: borderWidth,
            disease: diseaseKey,
            year: year
        };

        if (year === new Date().getFullYear()) {
            dataset.segment = {
                borderColor: ctx => {
                    if (!ctx.p1 || !ctx.p1.parsed) return borderColor;
                    const val = ctx.p1.parsed.y;
                    if (typeof getColorForValue === 'function') {
                        return getColorForValue(val, diseaseKey);
                    }
                    return borderColor;
                }
            };
            dataset.pointBackgroundColor = (ctx) => {
                const val = ctx.parsed.y;
                if (typeof getColorForValue === 'function') {
                    return getColorForValue(val, diseaseKey);
                }
                return borderColor;
            };
            dataset.pointBorderColor = (ctx) => {
                const val = ctx.parsed.y;
                if (typeof getColorForValue === 'function') {
                    return getColorForValue(val, diseaseKey);
                }
                return borderColor;
            };
        }
        return dataset;
    };

    const currentYear = new Date().getFullYear();
    const sortedSets = yearDataSets.sort((a, b) => b.year - a.year);

    // Render all datasets at once
    const datasets = sortedSets.map(createDataset);

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: '定点当たり報告数' }, suggestedMax: yAxisMax } },
            interaction: { intersect: false, mode: 'index', axis: 'x' },
            elements: { point: { hitRadius: 20, hoverRadius: 4 }, line: { borderCapStyle: 'round', borderJoinStyle: 'round' } },
            plugins: {
                title: { display: false, text: `${prefecture} ${getDiseaseName(diseaseKey)} 週次推移`, font: { size: 16, family: "'Noto Sans JP', sans-serif" } },
                tooltip: { enabled: !isMobile, mode: 'index', intersect: false, position: 'nearest', bodyFont: { size: isMobile ? 14 : 13 }, titleFont: { size: isMobile ? 14 : 13 }, padding: 10, boxPadding: 4, backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#fff', bodyColor: '#fff', footerColor: '#fff' },
                legend: {
                    display: true, position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: isMobile ? 11 : 12 }, usePointStyle: true, pointStyle: 'rectRounded' },
                    onClick: function (e, legendItem, legend) {
                        if (e.native) { e.native.stopPropagation(); }
                        const index = legendItem.datasetIndex;
                        const chart = legend.chart;
                        const datasets = chart.data.datasets;
                        const clickedDataset = datasets[index];
                        const otherDatasets = datasets.filter((_, i) => i !== index);
                        const isAllOriginal = otherDatasets.every(ds => ds.borderColor === ds._originalColor);
                        if (isAllOriginal) {
                            datasets.forEach((ds, i) => {
                                if (i !== index) {
                                    ds.borderColor = 'rgba(200, 200, 200, 0.2)';
                                    ds.borderWidth = 1;
                                } else {
                                    ds.borderColor = ds._originalColor;
                                    ds.borderWidth = 3;
                                }
                            });
                        } else {
                            datasets.forEach(ds => {
                                ds.borderColor = ds._originalColor;
                                ds.borderWidth = ds._originalBorderWidth;
                            });
                        }
                        chart.update();
                    }
                }
            },
            animation: { duration: 0 } // Disable animation for instant display
        }
    };

    const initializeChart = () => {
        if (canvas.chart) {
            canvas.chart.destroy();
        }
        canvas.chart = new Chart(ctx, chartConfig);
        if (loadingTargetElement) {
            hideChartLoading(loadingTargetElement);
        }
    };

    const container = loadingTargetElement || canvas.parentElement;
    if (container && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                observer.disconnect();
                initializeChart();
            }
        });
        observer.observe(container);
    } else {
        setTimeout(initializeChart, 50);
    }
}

function renderDashboard(disease, data) {
    if (typeof renderJapanMap === 'function') {
        if (document.getElementById('japan-map')) {
            renderJapanMap('japan-map', data.current, disease); // cachedData.currentを渡す
        }
    }

    const chartView = document.getElementById('chart-view');
    if (chartView) {
        showChartLoading(chartView);
    }
    renderTrendChart(disease, data.current); // cachedData.currentを渡す
    if (chartView) {
        hideChartLoading(chartView); // renderTrendChart内で非表示にするのでここは不要だが、念のため
    }
}

function renderTrendChart(disease, data) {
    const chartView = document.getElementById('chart-view');
    if (!chartView) return;

    showChartLoading(chartView); // グラフ描画前にローディングを表示

    // Clear container and recreate canvas safely
    while (chartView.firstChild) {
        chartView.removeChild(chartView.firstChild);
    }
    const canvas = document.createElement('canvas');
    canvas.id = 'trendChart';
    chartView.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const diseaseData = data.data
        .filter(d => d.disease === disease && d.prefecture !== '全国')
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const labels = diseaseData.map(d => d.prefecture);
    const values = diseaseData.map(d => d.value);
    const backgroundColors = values.map(v => (typeof getColorForValue === 'function' ? getColorForValue(v, disease) : '#3498db'));

    if (labels.length === 0) {
        // データがない場合はメッセージを表示し、ローディングを非表示
        hideChartLoading(chartView);
        const p = document.createElement('p');
        p.className = 'no-data-message';
        p.textContent = 'データがありません。';
        chartView.appendChild(p);
        return;
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '定点当たり報告数',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${getDiseaseName(disease)} 都道府県別 報告数 Top 10`,
                    font: { size: 14, family: "'Noto Sans JP', sans-serif" }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: '定点当たり報告数' }
                },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
    hideChartLoading(chartView); // グラフ描画完了後にローディングを非表示
}

function getYearDataSets(diseaseKey, prefecture) {
    const yearDataSets = [];
    const currentYear = new Date().getFullYear();
    console.log(`DEBUG: getYearDataSets called. currentYear=${currentYear}, disease=${diseaseKey}, pref=${prefecture}`);
    const addedYears = new Set(); // 重複防止用

    if (cachedData.current && cachedData.current.history) {
        const currentHistory = cachedData.current.history.find(h => h.disease === diseaseKey && h.prefecture === prefecture);
        if (currentHistory) {
            console.log(`DEBUG: Found current year data for ${currentYear}. Length: ${currentHistory.history.length}`);
            if (currentHistory.history.length > 0) {
                console.log(`DEBUG: Current year data sample:`, JSON.stringify(currentHistory.history.slice(0, 3)));
            }
            yearDataSets.push({ year: currentYear, data: currentHistory.history });
            addedYears.add(currentYear);
        } else {
            console.log(`DEBUG: No current year data found in cachedData.current for ${diseaseKey}/${prefecture}`);
        }
    }

    if (cachedData.archives) {
        console.log(`DEBUG: Checking ${cachedData.archives.length} archives`);
        cachedData.archives.forEach(archive => {
            const archiveYear = parseInt(archive.year);
            // if (archiveYear === currentYear) {
            //     console.log(`DEBUG: Skipping archive year ${archiveYear} (matches current year)`);
            //     return;
            // }
            if (addedYears.has(archiveYear)) {
                console.log(`DEBUG: Skipping duplicate year ${archiveYear}`);
                return;
            }

            const archiveHistory = archive.data ? archive.data.find(d => d.disease === diseaseKey && d.prefecture === prefecture) : null;
            if (archiveHistory) {
                console.log(`DEBUG: Adding archive year ${archiveYear}. Length: ${archiveHistory.history.length}`);
                yearDataSets.push({ year: archive.year, data: archiveHistory.history });
                addedYears.add(archiveYear);
            }
        });
    }


    if (yearDataSets.length === 0) {
        console.warn('No data sets available for chart.');
    } else {
        const has2026 = yearDataSets.some(d => d.year === 2026);
        if (!has2026 && diseaseKey === 'Influenza' && prefecture === '神奈川県') {
            console.warn('DEBUG: 2026 data MISSING. Added years:', Array.from(addedYears));
        }
    }
    console.log('DEBUG: Final yearDataSets:', yearDataSets.map(d => ({ year: d.year, count: d.data.length })));
    return yearDataSets;
}

function openExpandedChart(diseaseKey, prefecture) {
    closeExpandedChart();

    // モーダル作成
    const modal = document.createElement('div');
    modal.className = 'disease-card expanded expanded-modal modal-expanded'; // .disease-card.expanded のスタイルを流用
    modal.dataset.disease = diseaseKey;

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'card-header';
    const h4 = document.createElement('h4');
    h4.textContent = `${prefecture} ${getDiseaseName(diseaseKey)}`;
    header.appendChild(h4);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-expanded-btn modal-close-button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.onclick = closeExpandedChart;
    // ヘッダー内ではなく、カードの直接の子として配置（CSSの配置に合わせる）
    modal.appendChild(closeBtn);
    modal.appendChild(header);

    // チャートコンテナ
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    const canvasId = `expanded-chart-${diseaseKey}`;
    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    chartContainer.appendChild(canvas);
    modal.appendChild(chartContainer);

    document.body.appendChild(modal);

    // 背景
    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        backdrop.classList.add('active');
        // 背景クリックで閉じる
        const cleanupBackdrop = () => {
            closeExpandedChart();
            backdrop.removeEventListener('click', cleanupBackdrop);
        };
        backdrop.addEventListener('click', cleanupBackdrop);
    }

    // チャート描画
    const yearDataSets = getYearDataSets(diseaseKey, prefecture);
    const globalMax = getGlobalMaxForDisease(diseaseKey);
    // モーダル表示のアニメーションを待ってから描画したほうが安全だが、Chart.jsはresponsiveなら大丈夫
    requestAnimationFrame(() => {
        renderComparisonChart(canvasId, diseaseKey, prefecture, yearDataSets, globalMax, chartContainer);
    });
}

function closeExpandedChart() {
    const modal = document.querySelector('.disease-card.expanded-modal');
    if (modal) {
        // チャート破棄
        const canvas = modal.querySelector('canvas');
        if (canvas && canvas.chart) {
            canvas.chart.destroy();
        }
        modal.remove();
    }
    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        backdrop.classList.remove('active');
    }
}

function showPrefectureChart(prefecture, disease) {
    currentPrefecture = prefecture;
    currentRegionId = null;

    document.getElementById('map-view').classList.add('hidden');
    const prefChartContainer = document.getElementById('pref-chart-container');
    prefChartContainer.classList.remove('hidden');

    // コンテナ初期化
    prefChartContainer.innerHTML = '';

    // ヘッダー作成
    const headerDiv = document.createElement('div');
    headerDiv.classList.add('pref-chart-header');

    const titleH3 = document.createElement('h3');
    titleH3.textContent = `${prefecture} ${getDiseaseName(disease)}`;
    titleH3.classList.add('pref-chart-title');
    headerDiv.appendChild(titleH3);

    // 戻るボタン作成
    const backButton = document.createElement('button');
    backButton.id = 'back-to-map-btn';
    backButton.textContent = '戻る';
    headerDiv.appendChild(backButton);

    prefChartContainer.appendChild(headerDiv);

    // 共通の戻る処理
    backButton.addEventListener('click', () => {
        document.getElementById('map-view').classList.remove('hidden');
        document.getElementById('pref-chart-container').classList.add('hidden');
        currentPrefecture = null;

        // 右パネルのハイライトを解除
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, currentDisease, null);
        }
    });

    // 右パネルのハイライトを更新
    if (typeof window.getRegionIdByPrefecture === 'function' && typeof window.updateDetailPanel === 'function' && cachedData) {
        const regionId = window.getRegionIdByPrefecture(prefecture);
        if (regionId) {
            window.updateDetailPanel(regionId, cachedData, disease, prefecture);
        }
    }

    // ARIの場合はグラフを表示せずメッセージを表示
    if (disease === 'ARI') {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'pref-chart-wrapper pref-chart-message-wrapper';
        prefChartContainer.appendChild(messageWrapper);

        const messageP = document.createElement('p');
        messageP.className = 'pref-chart-message';
        messageP.textContent = '急性呼吸器感染症 (ARI) の週次推移データはありません。';
        messageWrapper.appendChild(messageP);
        return;
    }

    // グラフ描画エリアの作成
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'pref-chart-wrapper';
    prefChartContainer.appendChild(chartWrapper);

    showChartLoading(chartWrapper);

    // ARIの場合はここで処理終了
    if (disease === 'ARI') {
        hideChartLoading(chartWrapper);
        const messageP = document.createElement('p');
        messageP.className = 'pref-chart-message';
        messageP.textContent = '急性呼吸器感染症 (ARI) の週次推移データはありません。';
        chartWrapper.appendChild(messageP);
    } else {
        const canvas = document.createElement('canvas');
        canvas.id = 'prefectureHistoryChart';
        chartWrapper.appendChild(canvas);

        const yearDataSets = [];
        const currentYear = new Date().getFullYear();

        // 当年のデータ
        const currentYearHistory = cachedData.current.history.find(h => h.disease === disease && h.prefecture === prefecture);
        if (currentYearHistory) {
            yearDataSets.push({ year: currentYear, data: currentYearHistory.history });
        }

        // 過去のアーカイブデータ
        cachedData.archives.forEach(archive => {
            // 当年のデータは、すでに currentYearHistory で追加されているので重複しないようにする
            if (parseInt(archive.year) === currentYear) return;

            const history = archive.data.find(d => d.disease === disease && d.prefecture === prefecture);
            if (history) {
                // Tougai CSVから抽出されたデータはすでにhistoryプロパティを持っている
                yearDataSets.push({ year: archive.year, data: history.history });
            }
        });

        if (yearDataSets.length === 0) {
            console.warn(`No history data for ${prefecture} (${disease}) across all years.`);
            hideChartLoading(chartWrapper);
            const p = document.createElement('p');
            p.classList.add('no-data-message-inline');
            p.textContent = 'データがありません。';
            chartWrapper.innerHTML = ''; // Clear previous content
            chartWrapper.appendChild(p);
        } else {
            const globalMax = getGlobalMaxForDisease(disease);
            renderComparisonChart('prefectureHistoryChart', disease, prefecture, yearDataSets, globalMax, chartWrapper);
        }
    }
}
window.showPrefectureChart = showPrefectureChart;

// ビューを切り替える汎用関数
function switchView(viewId) {
    console.log('DEBUG: switchView called with viewId:', viewId);
    const views = ['main-view', 'other-diseases-list-view']; // すべてのビューのID
    views.forEach(id => {
        const viewElement = document.getElementById(id);
        if (viewElement) {
            if (id === viewId) {
                viewElement.classList.remove('hidden');
                console.log(`DEBUG: Removed hidden from ${id}`);
            } else {
                viewElement.classList.add('hidden');
                console.log(`DEBUG: Added hidden to ${id}`);
            }
        }
    });
}

// その他感染症リストのレンダリング関数
function renderOtherDiseasesList(prefecture = '全国') {
    const gridContainer = document.getElementById('other-diseases-grid');
    if (!gridContainer) return;

    while (gridContainer.firstChild) {
        gridContainer.removeChild(gridContainer.firstChild);
    }

    // タイトルの更新
    const titleElement = document.getElementById('other-diseases-title');
    if (titleElement) {
        titleElement.textContent = `その他の感染症（${prefecture}）`;
    }

    // ドロップダウンの選択値を更新
    const prefSelect = document.getElementById('prefecture-select');
    if (prefSelect) {
        prefSelect.value = prefecture; // ドロップダウンの値を設定
    }

    // 主要3疾患以外をフィルタリング
    const otherDiseases = ALL_DISEASES.filter(d => !['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    otherDiseases.forEach(disease => {
        const card = document.createElement('div');
        card.className = 'disease-card';
        card.dataset.disease = disease.key;

        // card.onclick を削除し、ボタンでの拡大に変更

        // card-header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';

        const h4 = document.createElement('h4');
        h4.textContent = disease.name; // Use textContent for safety

        const expandButton = document.createElement('button');
        expandButton.className = 'expand-action-btn';
        expandButton.setAttribute('aria-label', '拡大表示');
        // SVGをクリア
        expandButton.innerHTML = '';

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M12 5v14M5 12h14");

        svg.appendChild(path);
        expandButton.appendChild(svg);

        cardHeader.appendChild(h4);
        cardHeader.appendChild(expandButton);
        card.appendChild(cardHeader);

        // chart-container
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${disease.key}`;
        chartContainer.appendChild(canvas);
        card.appendChild(chartContainer);

        // close-expanded-btn
        const closeButton = document.createElement('button');
        closeButton.className = 'close-expanded-btn';
        closeButton.setAttribute('aria-label', '閉じる');
        closeButton.textContent = '×'; // Use textContent for safety
        card.appendChild(closeButton);
        gridContainer.appendChild(card);

        // イベントリスナー設定
        const expandBtn = card.querySelector('.expand-action-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 新しいモーダル方式で開く
                openExpandedChart(disease.key, prefecture);
            });
        }

        // 小さいカードには閉じるボタン不要 (モーダル側にのみ存在)
        const closeBtn = card.querySelector('.close-expanded-btn');
        if (closeBtn) {
            closeBtn.remove();
        }

        // 各疾患のデータと過去データを取得 (ヘルパー関数を使用)
        const yearDataSets = getYearDataSets(disease.key, prefecture);

        if (yearDataSets.length > 0) {
            const globalMax = getGlobalMaxForDisease(disease.key);
            renderComparisonChart(`chart-${disease.key}`, disease.key, prefecture, yearDataSets, globalMax, chartContainer);
        } else {
            // console.warn(`No history data for ${disease.name} in ${prefecture}`);
            // ローディングを非表示にし、メッセージを表示
            hideChartLoading(chartContainer);
            const p = document.createElement('p');
            p.textContent = 'データがありません';

            while (chartContainer.firstChild) {
                chartContainer.removeChild(chartContainer.firstChild);
            }
            chartContainer.appendChild(p);

            chartContainer.classList.add('chart-container-no-data');
        }
    });
}

function closePanel() {
    const content = document.getElementById('region-content');
    if (content) {
        const p = document.createElement('p');
        p.className = 'placeholder-text';
        p.textContent = '地図上のエリアをクリックすると詳細が表示されます。';
        content.replaceChildren(p);
    }
    const title = document.getElementById('region-title');
    if (title) {
        title.textContent = '地域詳細';
    }
}

function updateLoadingState(isLoading) {
    const container = document.body;
    if (isLoading) {
        container.classList.add('loading');
    } else {
        container.classList.remove('loading');
    }
}

async function reloadData() {
    try {
        updateLoadingState(true);

        // 1. 既存のチャートインスタンスを破棄
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        const prefectureHistoryChartCanvas = document.getElementById('prefectureHistoryChart');
        if (prefectureHistoryChartCanvas && prefectureHistoryChartCanvas.chart) {
            prefectureHistoryChartCanvas.chart.destroy();
        }

        // 2. 表示をスケルトンに置き換え (またはローディングオーバーレイ表示)
        // サマリーカードのスケルトン
        const summaryCardsContainer = document.getElementById('summary-cards');
        if (summaryCardsContainer) {
            summaryCardsContainer.innerHTML = '';
            const skeletonWrapper = document.createElement('div');
            skeletonWrapper.className = 'skeleton-card-wrapper';
            for (let i = 0; i < 5; i++) {
                const skeletonCard = document.createElement('div');
                skeletonCard.className = 'skeleton-card';
                skeletonCard.innerHTML = '<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div><div class="skeleton skeleton-status"></div>';
                skeletonWrapper.appendChild(skeletonCard);
            }
            summaryCardsContainer.appendChild(skeletonWrapper);
        }

        // 日本地図のスケルトン
        const japanMapContainer = document.getElementById('japan-map');
        if (japanMapContainer) {
            japanMapContainer.innerHTML = '';
            const skeletonMap = document.createElement('div');
            skeletonMap.className = 'skeleton skeleton-map';
            japanMapContainer.appendChild(skeletonMap);
        }

        // メインチャートビューのローディングオーバーレイ
        const chartView = document.getElementById('chart-view');
        if (chartView) {
            chartView.innerHTML = ''; // 既存のチャートをクリア
            showChartLoading(chartView);
        }

        // その他の感染症グリッドのクリア
        const otherDiseasesGrid = document.getElementById('other-diseases-grid');
        if (otherDiseasesGrid) {
            otherDiseasesGrid.innerHTML = '';
            // 「その他の感染症」ビューがアクティブな場合、各カードにローディング表示
            const otherDiseasesListView = document.getElementById('other-diseases-list-view');
            if (otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden')) {
                const otherDiseases = ALL_DISEASES.filter(d => !['Influenza', 'COVID-19', 'ARI'].includes(d.key));
                otherDiseases.forEach(disease => {
                    const card = document.createElement('div');
                    card.className = 'disease-card';
                    card.dataset.disease = disease.key;
                    card.innerHTML = `<div class="card-header"><h4>${disease.name}</h4></div><div class="chart-container"></div>`;
                    otherDiseasesGrid.appendChild(card);
                    const chartContainer = card.querySelector('.chart-container');
                    if (chartContainer) {
                        showChartLoading(chartContainer);
                    }
                });
            }
        }

        // 都道府県チャートがアクティブな場合はローディングオーバーレイを追加
        const prefChartContainer = document.getElementById('pref-chart-container');
        if (prefChartContainer && !prefChartContainer.classList.contains('hidden')) {
            prefChartContainer.innerHTML = ''; // 既存のチャートやメッセージをクリア
            // 戻るボタンを再生成
            const backButton = document.createElement('button');
            backButton.id = 'back-to-map-btn';
            backButton.textContent = '戻る';
            prefChartContainer.appendChild(backButton);
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'pref-chart-wrapper';
            prefChartContainer.appendChild(chartWrapper);
            showChartLoading(chartWrapper);
            // 戻るボタンのイベントリスナー再設定
            const newBackBtn = document.getElementById('back-to-map-btn');
            if (newBackBtn) {
                newBackBtn.addEventListener('click', () => {
                    document.getElementById('map-view').classList.remove('hidden');
                    document.getElementById('pref-chart-container').classList.add('hidden');
                    currentPrefecture = null;
                });
            }
        }

        // 地域詳細パネルがアクティブな場合はスケルトンを追加
        const regionContent = document.getElementById('region-content');
        if (regionContent && currentRegionId) { // currentRegionId が null でない、つまり地域が選択されている場合のみ処理
            regionContent.innerHTML = ''; // 既存の内容をクリア
            const skeletonRegionDetail = document.createElement('div');
            skeletonRegionDetail.className = 'skeleton skeleton-chart large'; // 棒グラフなので 'skeleton-chart' を流用
            regionContent.appendChild(skeletonRegionDetail);
        }

        // キャッシュをクリア
        await localforage.removeItem(CACHE_CONFIG.COMBINED_DATA_KEY);
        console.log('Cache cleared for combined data reload.');

        // データ取得とレンダリングのコア処理を再実行
        await loadAndRenderData();

        // グラフローディングオーバーレイを全て非表示
        if (chartView) hideChartLoading(chartView);
        if (prefChartContainer && !prefChartContainer.classList.contains('hidden')) {
            const chartWrapper = prefChartContainer.querySelector('.pref-chart-wrapper');
            if (chartWrapper) hideChartLoading(chartWrapper);
        }
        const otherDiseasesListView = document.getElementById('other-diseases-list-view');
        if (otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden')) {
            const diseaseCards = otherDiseasesGrid.querySelectorAll('.disease-card');
            diseaseCards.forEach(card => {
                const chartContainer = card.querySelector('.chart-container');
                if (chartContainer) hideChartLoading(chartContainer);
            });
        }


        // 地域が選択されていた場合は地域詳細パネルを再描画
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, currentDisease, currentPrefecture);
        }

        // 「その他の感染症」リストビューが表示中であれば、リロード後に再度レンダリングしてグラフを表示
        if (otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden')) {
            const prefSelect = document.getElementById('prefecture-select');
            renderOtherDiseasesList(prefSelect ? prefSelect.value : '全国');
        }

    } catch (error) {
        console.error('Error reloading data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            while (summaryCards.firstChild) {
                summaryCards.removeChild(summaryCards.firstChild);
            }
            const errorPara = document.createElement('p');
            errorPara.className = 'error';
            errorPara.textContent = `データの再取得に失敗しました。詳細: ${error.message}`;
            summaryCards.appendChild(errorPara);
        }
    } finally {
        // 少し待ってからローディング表示を消す
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);
    }
}

function initEventListeners() {
    const accordionToggle = document.getElementById('accordion-toggle');
    const accordionContent = document.getElementById('accordion-content');
    if (accordionToggle && accordionContent) {
        accordionToggle.addEventListener('click', () => {
            accordionContent.classList.toggle('open');
            accordionToggle.classList.toggle('open');
        });
    }

    const reloadBtn = document.getElementById('reload-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadData);
    }

    const closeBtn = document.getElementById('detail-panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePanel);
    }

    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        // openExpandedChart内でイベントリスナーを設定するため、初期化時は何もしないか、
        // もしくは既存の閉じる処理を一貫させるなら以下のようにする
        backdrop.addEventListener('click', () => {
            // モーダルが表示されている場合のみ閉じる
            if (document.querySelector('.disease-card.expanded-modal')) {
                closeExpandedChart();
            }
            // 旧方式のexpandedカードが残っている場合のケア（念のため）
            const oldExpandedCard = document.querySelector('.disease-card.expanded:not(.expanded-modal)');
            if (oldExpandedCard) {
                // 旧方式のクリーンアップが必要だが、関数削除済みのため、class除去だけ行う
                oldExpandedCard.classList.remove('expanded');
                backdrop.classList.remove('active');
            }
        });
    }

    const backBtn = document.getElementById('back-to-map-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('map-view').classList.remove('hidden');
            document.getElementById('pref-chart-container').classList.add('hidden');
            currentPrefecture = null;
        });
    }

    const otherDiseasesBtn = document.getElementById('other-diseases-btn');
    if (otherDiseasesBtn) {
        otherDiseasesBtn.addEventListener('click', () => {
            const currentView = document.getElementById('other-diseases-list-view');
            const isOtherDiseasesView = currentView && !currentView.classList.contains('hidden');

            if (isOtherDiseasesView) {
                // メインビューに戻る処理
                otherDiseasesBtn.textContent = 'その他の感染症';
                document.getElementById('summary-cards').classList.remove('hidden');
                switchView('main-view');
            } else {
                // 「その他の感染症」ビューに切り替える処理
                otherDiseasesBtn.textContent = 'インフルエンザ・COVID-19';
                document.getElementById('summary-cards').classList.add('hidden');
                switchView('other-diseases-list-view');
                renderOtherDiseasesList(currentPrefecture || '全国'); // 現在の都道府県を渡す
            }

            // 都道府県リストの生成（初回のみ）
            const prefSelect = document.getElementById('prefecture-select');
            if (prefSelect && prefSelect.options.length <= 1) {
                const prefectures = [
                    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
                    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
                    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
                    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
                    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
                    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
                    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
                ];
                prefectures.forEach(pref => {
                    const option = document.createElement('option');
                    option.value = pref;
                    option.textContent = pref;
                    prefSelect.appendChild(option);
                });

                // currentPrefecture が設定されていれば、それを初期選択する
                if (currentPrefecture) {
                    prefSelect.value = currentPrefecture;
                }

                prefSelect.addEventListener('change', (e) => {
                    renderOtherDiseasesList(e.target.value);
                });
            }
        });
    }
}
async function loadAndRenderData() {
    try {
        const now = Date.now();
        let combinedData = null;

        // 1. キャッシュ確認
        try {
            const cached = await localforage.getItem(CACHE_CONFIG.COMBINED_DATA_KEY);
            if (cached && (now - cached.timestamp < CACHE_CONFIG.HISTORY_EXPIRY)) {
                combinedData = cached.data;
            }
        } catch (e) {
            console.warn('Cache check failed:', e);
        }

        // 2. キャッシュがない場合はAPIから取得
        if (!combinedData) {
            combinedData = await fetchCombinedData();
        }

        cachedData = combinedData;

        // 日付表示更新
        if (cachedData.current && cachedData.current.meta && cachedData.current.meta.dateInfo) {
            updateDateDisplay(cachedData.current.meta.dateInfo);
        } else {
            updateDateDisplay('');
        }

        // 描画
        renderSummary(cachedData);
        renderDashboard(currentDisease, cachedData);
        updateLoadingState(false);

    } catch (e) {
        console.error('Error in loadAndRenderData:', e);
        throw e;
    }
}

function updateDateDisplay(dateString) {
    const dateElement = document.getElementById('update-date');
    if (!dateElement) return;

    const dateMatch = dateString.match(/(\d{4})年(\d{1,2})週(?:\((.*?)\))?/);
    if (dateMatch) {
        const year = dateMatch[1];
        const week = dateMatch[2];
        let dateRange = dateMatch[3];

        if (dateRange) {
            // Convert 11月17日〜11月23日 to 11/17～11/23
            dateRange = dateRange.replace(/月/g, '/').replace(/日/g, '').replace(/[〜~]/g, '～');
            dateElement.textContent = `${year}年 第${week}週 （${dateRange}）`;
        } else {
            dateElement.textContent = `${year}年 第${week}週`;
        }
    } else {
        dateElement.textContent = new Date().toLocaleDateString('ja-JP');
    }
}

async function init() {
    try {
        updateLoadingState(true);

        initEventListeners();
        console.log("DEBUG: initEventListeners called");

        await loadAndRenderData();

        // データの取得・処理が終わってから少し待つ（アニメーションを見せるため）
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);

    } catch (error) {
        console.error('Error fetching data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            while (summaryCards.firstChild) {
                summaryCards.removeChild(summaryCards.firstChild);
            }
            const errorPara = document.createElement('p');
            errorPara.className = 'error';
            errorPara.textContent = `データの取得に失敗しました。詳細: ${error.message}`;
            summaryCards.appendChild(errorPara);
        }
        updateLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', init);
