/**
 * Update Search App Main Logic
 */

import { loadAndCacheData, clearCacheAndReload } from '../../js/data.js';
import { normalizeString, debounce, formatDate } from '../../js/utils.js';
import { showMessage, renderStatusButton, updateProgress, createDropdown } from '../../js/ui.js';

let excelData = [];
let filteredResults = [];
let sortStates = {
    status: 'asc',
    productName: 'asc',
    ingredientName: 'asc'
};

// DOM Elements
const elements = {
    searchInput: null,
    updatePeriod: null,
    searchBtn: null,
    recoveryBtn: null,
    clearBtn: null,
    shareBtn: null,
    resultTableBody: null,
    tableContainer: null,
    loadingIndicator: null,
    reloadDataBtn: null,
    statusCheckboxes: {
        normal: null,
        limited: null,
        stopped: null
    },
    trendCheckboxes: {
        up: null,
        down: null
    },
    sortButtons: {
        status: null,
        productName: null,
        ingredientName: null
    },
    sortIcons: {
        status: null,
        productName: null,
        ingredientName: null
    },
    mainHeader: null,
    mainFooter: null
};

function initElements() {
    elements.searchInput = document.getElementById('searchInput');
    elements.updatePeriod = document.getElementById('updatePeriod');
    elements.searchBtn = document.getElementById('search-btn');
    elements.recoveryBtn = document.getElementById('recovery-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.shareBtn = document.getElementById('share-btn');
    elements.resultTableBody = document.getElementById('resultTableBody');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.cardContainer = document.getElementById('cardContainer');
    elements.loadingIndicator = document.getElementById('loadingIndicator');
    elements.reloadDataBtn = document.getElementById('reload-data');

    elements.statusCheckboxes.normal = document.getElementById('statusNormal');
    elements.statusCheckboxes.limited = document.getElementById('statusLimited');
    elements.statusCheckboxes.stopped = document.getElementById('statusStop');

    elements.trendCheckboxes.up = document.getElementById('trendUp');
    elements.trendCheckboxes.down = document.getElementById('trendDown');

    elements.sortButtons.status = document.getElementById('sort-status-button');
    elements.sortButtons.productName = document.getElementById('sort-productName-button');
    elements.sortButtons.ingredientName = document.getElementById('sort-ingredientName-button');

    elements.sortIcons.status = document.getElementById('sort-status-icon');
    elements.sortIcons.productName = document.getElementById('sort-productName-icon');
    elements.sortIcons.ingredientName = document.getElementById('sort-ingredientName-icon');
    elements.mainHeader = document.getElementById('mainHeader');
    elements.mainFooter = document.getElementById('mainFooter');
}

async function initApp() {
    initElements();

    try {
        const result = await loadAndCacheData(updateProgress);
        if (result && result.data) {
            excelData = result.data;
            showMessage(`データ(${result.date}) ${excelData.length} 件を読み込みました。`, "success");

            // Check URL params
            const urlParams = new URLSearchParams(window.location.search);
            const productName = urlParams.get('productName');
            const shippingStatus = urlParams.get('shippingStatus');
            const updateDate = urlParams.get('updateDate');

            // New params for share feature
            const q = urlParams.get('q');
            const period = urlParams.get('period');
            const hasShareParams = urlParams.has('q') || urlParams.has('period') || urlParams.has('normal');

            if (hasShareParams) {
                restoreFromUrlParams(urlParams);
                searchData();
            } else if (productName || shippingStatus || updateDate) {
                // Legacy/Simple params support
                if (productName) elements.searchInput.value = productName;
                if (updateDate) elements.updatePeriod.value = updateDate;
                if (shippingStatus) {
                    if (shippingStatus === 'all') {
                        elements.statusCheckboxes.normal.checked = true;
                        elements.statusCheckboxes.limited.checked = true;
                        elements.statusCheckboxes.stopped.checked = true;
                    } else {
                        elements.statusCheckboxes.normal.checked = shippingStatus === 'normal';
                        elements.statusCheckboxes.limited.checked = shippingStatus === 'limited';
                        elements.statusCheckboxes.stopped.checked = shippingStatus === 'stopped';
                    }
                }
                searchData();
            } else {
                clearAndResetSearch();
            }
        }
    } catch (e) {
        console.error(e);
        showMessage('データの読み込みに失敗しました。', 'error');
    }

    // Event Listeners
    elements.searchBtn.addEventListener('click', () => {
        if (elements.searchInput.value.trim() !== '') {
            elements.updatePeriod.value = 'all';
        }
        searchData();
    });

    if (elements.reloadDataBtn) {
        elements.reloadDataBtn.addEventListener('click', async () => {
            if (elements.reloadDataBtn.disabled) return;

            elements.reloadDataBtn.disabled = true;
            elements.reloadDataBtn.classList.add('opacity-50', 'cursor-not-allowed');

            showMessage('最新データを取得しています...', 'info');
            try {
                const result = await clearCacheAndReload(updateProgress);
                if (result && result.data) {
                    excelData = result.data;
                    showMessage(`データを更新しました: ${excelData.length}件`, 'success');
                    searchData();
                }
            } catch (err) {
                console.error('Reload failed:', err);
                showMessage(`データの更新に失敗しました: ${err.message || '不明なエラー'}`, 'error');
            } finally {
                elements.reloadDataBtn.disabled = false;
                elements.reloadDataBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }


    elements.clearBtn.addEventListener('click', clearAndResetSearch);

    // 共有ボタンのイベントリスナー
    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', () => shareSearchConditions());
    }

    elements.recoveryBtn.addEventListener('click', () => {
        // Clear inputs
        elements.searchInput.value = '';
        elements.updatePeriod.value = '30days';

        // Set Trend Up
        if (elements.trendCheckboxes.up) elements.trendCheckboxes.up.checked = true;
        if (elements.trendCheckboxes.down) elements.trendCheckboxes.down.checked = false;

        // Set Status Normal/Limited
        elements.statusCheckboxes.normal.checked = true;
        elements.statusCheckboxes.limited.checked = true;
        elements.statusCheckboxes.stopped.checked = false;

        searchData();
    });

    let isComposing = false;
    elements.searchInput.addEventListener('compositionstart', () => isComposing = true);
    elements.searchInput.addEventListener('compositionend', () => isComposing = false);

    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isComposing) {
            e.preventDefault();
            if (elements.searchInput.value.trim() !== '') {
                elements.updatePeriod.value = 'all';
            }
            searchData();
        }
    });
    elements.updatePeriod.addEventListener('change', searchData);

    Object.values(elements.statusCheckboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', searchData);
    });
    Object.values(elements.trendCheckboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', searchData);
    });

    // Sort Event Listeners
    if (elements.sortButtons.productName) elements.sortButtons.productName.addEventListener('click', () => sortResults('productName'));
    if (elements.sortButtons.ingredientName) elements.sortButtons.ingredientName.addEventListener('click', () => sortResults('ingredientName'));
    if (elements.sortButtons.status) elements.sortButtons.status.addEventListener('click', () => sortResults('status'));
}

function clearAndResetSearch() {
    elements.searchInput.value = '';
    elements.updatePeriod.value = '7days'; // Default

    elements.statusCheckboxes.normal.checked = true;
    elements.statusCheckboxes.limited.checked = true;
    elements.statusCheckboxes.stopped.checked = true;

    if (elements.trendCheckboxes.up) elements.trendCheckboxes.up.checked = false;
    if (elements.trendCheckboxes.down) elements.trendCheckboxes.down.checked = false;

    searchData(true); // reset=true を渡す
}

/**
 * URLクエリパラメータから検索条件を復元
 * @param {URLSearchParams} urlParams - URLパラメータ
 */
function restoreFromUrlParams(urlParams) {
    // 検索ワード
    const q = urlParams.get('q');
    if (q !== null && elements.searchInput) elements.searchInput.value = q;

    // 期間
    const period = urlParams.get('period');
    if (period && elements.updatePeriod) elements.updatePeriod.value = period;

    // 出荷状況
    if (elements.statusCheckboxes.normal) elements.statusCheckboxes.normal.checked = urlParams.get('normal') === '1';
    if (elements.statusCheckboxes.limited) elements.statusCheckboxes.limited.checked = urlParams.get('limited') === '1';
    if (elements.statusCheckboxes.stopped) elements.statusCheckboxes.stopped.checked = urlParams.get('stopped') === '1';

    // 傾向
    if (elements.trendCheckboxes.up) elements.trendCheckboxes.up.checked = urlParams.get('up') === '1';
    if (elements.trendCheckboxes.down) elements.trendCheckboxes.down.checked = urlParams.get('down') === '1';
}

/**
 * 現在の検索条件を共有URLとしてクリップボードにコピー
 */
async function shareSearchConditions() {
    const q = elements.searchInput?.value?.trim() || '';
    const period = elements.updatePeriod?.value || '7days';

    // パラメータを構築
    const params = new URLSearchParams();

    if (q) params.set('q', q);
    if (period !== '7days') params.set('period', period);

    // 出荷状況
    params.set('normal', elements.statusCheckboxes.normal?.checked ? '1' : '0');
    params.set('limited', elements.statusCheckboxes.limited?.checked ? '1' : '0');
    params.set('stopped', elements.statusCheckboxes.stopped?.checked ? '1' : '0');

    // 傾向
    params.set('up', elements.trendCheckboxes.up?.checked ? '1' : '0');
    params.set('down', elements.trendCheckboxes.down?.checked ? '1' : '0');

    // 完全なURLを生成
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?${params.toString()}`;

    // クリップボードにコピー
    try {
        await navigator.clipboard.writeText(shareUrl);
        showMessage('検索条件のURLをクリップボードにコピーしました', 'success');
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        showMessage('URLのコピーに失敗しました', 'error');
    }
}

/**
 * Sort results
 * @param {string} key - Sort key
 */
function sortResults(key) {
    if (filteredResults.length === 0) {
        showMessage("ソートするデータがありません。", "info");
        return;
    }
    const newDirection = sortStates[key] === 'asc' ? 'desc' : 'asc';
    sortStates[key] = newDirection;

    // Reset other sort icons
    for (const otherKey in sortStates) {
        if (otherKey !== key) {
            sortStates[otherKey] = 'asc';
            const icon = elements.sortIcons[otherKey];
            if (icon) icon.textContent = '↕';
        }
    }

    const icon = elements.sortIcons[key];
    if (icon) icon.textContent = newDirection === 'asc' ? '↑' : '↓';

    filteredResults.sort((a, b) => {
        let aValue, bValue;
        if (key === 'status') {
            aValue = (a.shipmentStatus || '').trim();
            bValue = (b.shipmentStatus || '').trim();
        } else if (key === 'productName') {
            aValue = (a.productName || '').trim();
            bValue = (b.productName || '').trim();
        } else if (key === 'ingredientName') {
            aValue = (a.ingredientName || '').trim();
            bValue = (b.ingredientName || '').trim();
        }

        const compare = aValue.localeCompare(bValue, 'ja', { sensitivity: 'base' });
        return newDirection === 'asc' ? compare : -compare;
    });

    renderResults(filteredResults);
    let sortKeyName = '';
    switch (key) {
        case 'status': sortKeyName = '出荷状況'; break;
        case 'productName': sortKeyName = '品名'; break;
        case 'ingredientName': sortKeyName = '成分名'; break;
    }
    showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, "success");
}

function searchData(reset = false) {
    if (reset) {
        document.body.classList.remove('search-mode');
    } else {
        document.body.classList.add('search-mode');
    }

    if (excelData.length === 0) return;

    const searchKeywords = elements.searchInput.value.split(/\s+/).filter(k => k).map(normalizeString);
    const period = elements.updatePeriod.value;

    const statusChecks = {
        normal: elements.statusCheckboxes.normal?.checked || false,
        limited: elements.statusCheckboxes.limited?.checked || false,
        stopped: elements.statusCheckboxes.stopped?.checked || false
    };

    const trendChecks = {
        up: elements.trendCheckboxes.up ? elements.trendCheckboxes.up.checked : false,
        down: elements.trendCheckboxes.down ? elements.trendCheckboxes.down.checked : false
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filteredResults = excelData.filter(item => {
        // Keyword Filter (AND logic for keywords, OR logic for fields)
        const drugName = normalizeString(item.productName || "");
        const makerName = normalizeString((item.standard || "") + (item.manufacturer || ""));
        const ingredientName = normalizeString(item.ingredientName || "");

        const matchKeywords = searchKeywords.length === 0 || searchKeywords.every(k => {
            if (k.startsWith('-')) {
                const negK = k.substring(1);
                return !drugName.includes(negK) && !makerName.includes(negK) && !ingredientName.includes(negK);
            }
            return drugName.includes(k) || makerName.includes(k) || ingredientName.includes(k);
        });

        if (!matchKeywords) return false;

        // Status Filter
        const currentStatus = (item.shipmentStatus || '').trim();
        let statusMatch = false;
        if (statusChecks.normal && (currentStatus.includes('通常') || currentStatus.includes('通'))) statusMatch = true;
        if (statusChecks.limited && (currentStatus.includes('限定') || currentStatus.includes('制限') || currentStatus.includes('限') || currentStatus.includes('制'))) statusMatch = true;
        if (statusChecks.stopped && (currentStatus.includes('停止') || currentStatus.includes('停'))) statusMatch = true;

        if (!statusMatch) return false;

        // Trend Filter
        const isAnyTrendChecked = trendChecks.up || trendChecks.down;
        if (isAnyTrendChecked) {
            const itemTrend = item.shippingStatusTrend || '';
            let trendMatch = false;
            if (trendChecks.up && itemTrend === '⤴️') trendMatch = true;
            if (trendChecks.down && itemTrend === '⤵️') trendMatch = true;

            if (!trendMatch) return false;
        }

        // Date Filter
        if (period !== 'all') {
            if (!item.updateDateObj) return false;
            const diffTime = Math.abs(today - item.updateDateObj);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (period === '3days' && diffDays > 3) return false;
            if (period === '7days' && diffDays > 7) return false;
            if (period === '14days' && diffDays > 14) return false;
            if (period === '30days' && diffDays > 30) return false;
        }

        return true;
    });

    // Sort by update date desc initially
    filteredResults.sort((a, b) => {
        const dateA = a.updateDateObj ? a.updateDateObj.getTime() : 0;
        const dateB = b.updateDateObj ? b.updateDateObj.getTime() : 0;
        return dateB - dateA;
    });

    // Reset sort icons
    sortStates.status = 'asc';
    sortStates.productName = 'asc';
    sortStates.ingredientName = 'asc';
    if (elements.sortIcons.status) elements.sortIcons.status.textContent = '↕';
    if (elements.sortIcons.productName) elements.sortIcons.productName.textContent = '↕';
    if (elements.sortIcons.ingredientName) elements.sortIcons.ingredientName.textContent = '↕';

    // Add or remove search-mode class before rendering
    if (filteredResults.length > 0) {
        document.body.classList.add('search-mode');
    } else {
        document.body.classList.remove('search-mode');
    }

    // A small delay to allow the CSS transition to start before the DOM is heavily manipulated.
    // This prevents a visual glitch where the table content starts moving up before the header has finished animating out.
    setTimeout(() => {
        renderResults(filteredResults);

        if (filteredResults.length === 0) {
            showMessage('条件に一致する更新情報はありません。', 'info');
        } else {
            showMessage(`${filteredResults.length} 件の更新情報が見つかりました。`, 'success');
        }
    }, 100);
}

function renderResults(data) { // Renamed from renderTable
    const isMobile = window.innerWidth < 768;
    elements.resultTableBody.innerHTML = '';
    elements.cardContainer.innerHTML = ''; // Clear card container

    if (data.length === 0) {
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.add('hidden');
        elements.tableContainer.classList.remove('fade-in');
        return;
    }

    // Set search mode before displaying results
    document.body.classList.add('search-mode');


    const displayData = data.slice(0, 200); // Limit display

    // Column Mapping for Red Text Logic
    const columnMap = {
        'productName': 5,
        'ingredientName': 2,
        'shipmentStatus': 11,
        'reasonForLimitation': 13,
        'resolutionProspect': 14,
        'expectedDate': 15,
        'shipmentVolumeStatus': 16,
        'updateDate': 24
    };

    if (!isMobile) {
        // Desktop Table View
        elements.tableContainer.classList.remove('hidden');
        elements.cardContainer.classList.add('hidden');
        requestAnimationFrame(() => {
            elements.tableContainer.classList.add('fade-in');
        });

        displayData.forEach((item, index) => {
            const row = elements.resultTableBody.insertRow();
            const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
            row.className = `${rowBgClass} hover:bg-indigo-50 transition-colors group fade-in-up`;
            row.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // 0. Product Name
            const cellName = row.insertCell(0);
            cellName.className = "px-2 py-3 text-sm text-gray-900 font-medium align-top";

            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'flex gap-1 mb-1';

            const isGeneric = item.productCategory && (item.productCategory.includes('後発品') || normalizeString(item.productCategory).includes('後発品'));
            const isBasic = item.isBasicDrug && (item.isBasicDrug.includes('基礎的医薬品') || normalizeString(item.isBasicDrug).includes('基礎的医薬品'));

            if (isGeneric) {
                const span = document.createElement('span');
                span.className = "bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap border border-green-200";
                span.textContent = '後発';
                labelsContainer.appendChild(span);
            }
            if (isBasic) {
                const span = document.createElement('span');
                span.className = "bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap border border-purple-200";
                span.textContent = '基礎';
                labelsContainer.appendChild(span);
            }
            if (labelsContainer.hasChildNodes()) {
                cellName.appendChild(labelsContainer);
            }

            if (item.yjCode) {
                cellName.appendChild(createDropdown(item, index));
            } else {
                const productNameSpan = document.createElement('span'); // Use a span for the text
                productNameSpan.textContent = item.productName || '';
                cellName.appendChild(productNameSpan);
            }
            if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
                cellName.classList.add('text-red-600', 'font-bold');
            }

            // 1. Ingredient Name
            const cellIngredient = row.insertCell(1);
            cellIngredient.className = "px-2 py-3 text-sm align-top";
            if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) cellIngredient.classList.add('text-red-600', 'font-bold');

            if (item.ingredientName) {
                const span = document.createElement('span');
                span.className = "text-indigo-600 font-semibold hover:underline cursor-pointer";
                span.textContent = item.ingredientName;
                span.addEventListener('click', () => {
                    elements.searchInput.value = item.ingredientName;
                    elements.updatePeriod.value = 'all';

                    elements.statusCheckboxes.normal.checked = true;
                    elements.statusCheckboxes.limited.checked = true;
                    elements.statusCheckboxes.stopped.checked = true;

                    if (elements.trendCheckboxes.up) elements.trendCheckboxes.up.checked = false;
                    if (elements.trendCheckboxes.down) elements.trendCheckboxes.down.checked = false;

                    searchData();
                });
                cellIngredient.appendChild(span);
            } else {
                cellIngredient.className += " text-gray-600";
                cellIngredient.textContent = '';
            }

            // 2. Shipment Status
            const cellStatus = row.insertCell(2);
            cellStatus.className = "px-2 py-3 align-top";

            const statusContainer = document.createElement('div');
            statusContainer.className = 'flex items-center gap-1';
            statusContainer.appendChild(renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus)));

            if (item.shippingStatusTrend) {
                const trendIcon = document.createElement('span');
                trendIcon.className = 'text-base text-red-500 font-bold';
                trendIcon.textContent = item.shippingStatusTrend;
                statusContainer.appendChild(trendIcon);
            }
            cellStatus.appendChild(statusContainer);

            // 3. Reason
            const cellReason = row.insertCell(3);
            cellReason.className = "px-2 py-3 text-xs text-gray-600 align-top break-words";
            if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) cellReason.classList.add('text-red-600', 'font-bold');
            cellReason.textContent = item.reasonForLimitation || '-';

            // 4. Resolution Prospect
            const cellResolution = row.insertCell(4);
            cellResolution.className = "px-2 py-3 text-xs text-gray-600 align-top";
            if (item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect)) cellResolution.classList.add('text-red-600', 'font-bold');
            cellResolution.textContent = item.resolutionProspect || '-';

            // 5. Expected Date
            const cellExpected = row.insertCell(5);
            cellExpected.className = "px-2 py-3 text-xs text-gray-600 align-top";
            if (item.updatedCells && item.updatedCells.includes(columnMap.expectedDate)) cellExpected.classList.add('text-red-600', 'font-bold');

            if (item.expectedDateObj) {
                const dateStr = formatDate(item.expectedDateObj);
                cellExpected.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : (item.expectedDate || '-');
            } else {
                cellExpected.textContent = item.expectedDate || '-';
            }

            // 6. Shipment Volume
            const cellVolume = row.insertCell(6);
            cellVolume.className = "px-2 py-3 text-xs text-gray-600 align-top";
            if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) cellVolume.classList.add('text-red-600', 'font-bold');
            cellVolume.textContent = item.shipmentVolumeStatus || '-';

            // 7. Update Date
            const cellDate = row.insertCell(7);
            cellDate.className = "px-2 py-3 text-xs text-gray-600 whitespace-nowrap align-top";
            if (item.updatedCells && item.updatedCells.includes(columnMap.updateDate)) {
                cellDate.classList.add('text-red-600', 'font-bold');
            }

            const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
            cellDate.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : ''; // YY-MM-DD format
        });
    } else {
        // Mobile Card View
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.remove('hidden');

        // Apply grid class for mobile card container
        elements.cardContainer.classList.add('search-results-grid');


        displayData.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `search-result-card bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all duration-150 fade-in-up`;
            card.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // Product Name
            const productNameDiv = document.createElement('div');
            productNameDiv.className = 'flex flex-col items-start mb-2'; // Changed to flex-col for label stacking

            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'flex gap-1 mb-1'; // Add margin-bottom for spacing

            const isGeneric = item.productCategory && (item.productCategory.includes('後発品') || normalizeString(item.productCategory).includes('後発品'));
            const isBasic = item.isBasicDrug && (item.isBasicDrug.includes('基礎的医薬品') || normalizeString(item.isBasicDrug).includes('基礎的医薬品'));

            if (isGeneric) {
                const span = document.createElement('span');
                span.className = "bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap border border-green-200";
                span.textContent = '後発';
                labelsContainer.appendChild(span);
            }
            if (isBasic) {
                const span = document.createElement('span');
                span.className = "bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap border border-purple-200";
                span.textContent = '基礎';
                labelsContainer.appendChild(span);
            }
            if (labelsContainer.hasChildNodes()) {
                productNameDiv.appendChild(labelsContainer);
            }

            const productNameContentDiv = document.createElement('div'); // New div to hold product name and dropdown
            productNameContentDiv.className = 'flex items-center'; // Aligns dropdown/text nicely

            if (item.yjCode) {
                const dropdown = createDropdown(item, index);
                productNameContentDiv.appendChild(dropdown);
            } else {
                const span = document.createElement('span');
                span.textContent = item.productName || '';
                span.className = `${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}`;
                productNameContentDiv.appendChild(span);
            }
            productNameDiv.appendChild(productNameContentDiv); // Append this new div to productNameDiv
            card.appendChild(productNameDiv);


            // Ingredient Name
            const ingredientDiv = document.createElement('div');
            ingredientDiv.className = 'text-sm text-gray-700 mb-2';
            const ingredientLabel = document.createElement('span');
            ingredientLabel.className = 'font-semibold text-gray-500 mr-2';
            ingredientLabel.textContent = '成分名:';
            ingredientDiv.appendChild(ingredientLabel);
            const ingredientSpan = document.createElement('span');
            ingredientSpan.textContent = item.ingredientName || '';
            ingredientSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
            ingredientDiv.appendChild(ingredientSpan);
            card.appendChild(ingredientDiv);

            // Shipment Status
            const statusDiv = document.createElement('div');
            statusDiv.className = 'flex items-center gap-2 mb-2';
            const statusLabel = document.createElement('span');
            statusLabel.className = 'font-semibold text-gray-500 mr-2';
            statusLabel.textContent = '出荷状況:';
            statusDiv.appendChild(statusLabel);
            const isStatusUpdated = item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus);
            statusDiv.appendChild(renderStatusButton(item.shipmentStatus, isStatusUpdated));
            if (item.shippingStatusTrend) {
                const trendIcon = document.createElement('span');
                trendIcon.className = 'text-base text-red-500 font-bold';
                trendIcon.textContent = item.shippingStatusTrend;
                statusDiv.appendChild(trendIcon);
            }
            card.appendChild(statusDiv);

            // Reason
            const reasonDiv = document.createElement('div');
            reasonDiv.className = 'text-sm text-gray-700 mb-2';
            const reasonLabel = document.createElement('span');
            reasonLabel.className = 'font-semibold text-gray-500 mr-2';
            reasonLabel.textContent = '制限理由:';
            reasonDiv.appendChild(reasonLabel);
            const reasonSpan = document.createElement('span');
            reasonSpan.textContent = item.reasonForLimitation || '-';
            reasonSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation) ? 'text-red-600 font-bold' : ''}`;
            reasonDiv.appendChild(reasonSpan);
            card.appendChild(reasonDiv);

            // Resolution Prospect
            const resolutionDiv = document.createElement('div');
            resolutionDiv.className = 'text-sm text-gray-700 mb-2';
            const resolutionLabel = document.createElement('span');
            resolutionLabel.className = 'font-semibold text-gray-500 mr-2';
            resolutionLabel.textContent = '解消見込み:';
            resolutionDiv.appendChild(resolutionLabel);
            const resolutionSpan = document.createElement('span');
            resolutionSpan.textContent = item.resolutionProspect || '-';
            resolutionSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect) ? 'text-red-600 font-bold' : ''}`;
            resolutionDiv.appendChild(resolutionSpan);
            card.appendChild(resolutionDiv);

            // Expected Date
            const expectedDiv = document.createElement('div');
            expectedDiv.className = 'text-sm text-gray-700 mb-2';
            const expectedLabel = document.createElement('span');
            expectedLabel.className = 'font-semibold text-gray-500 mr-2';
            expectedLabel.textContent = '見込み時期:';
            expectedDiv.appendChild(expectedLabel);
            const expectedSpan = document.createElement('span');
            if (item.expectedDateObj) {
                const dateStr = formatDate(item.expectedDateObj);
                expectedSpan.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : (item.expectedDate || '-');
            } else {
                expectedSpan.textContent = item.expectedDate || '-';
            }
            expectedSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.expectedDate) ? 'text-red-600 font-bold' : ''}`;
            expectedDiv.appendChild(expectedSpan);
            card.appendChild(expectedDiv);

            // Shipment Volume
            const volumeDiv = document.createElement('div');
            volumeDiv.className = 'text-sm text-gray-700 mb-2';
            const volumeLabel = document.createElement('span');
            volumeLabel.className = 'font-semibold text-gray-500 mr-2';
            volumeLabel.textContent = '出荷量:';
            volumeDiv.appendChild(volumeLabel);
            const volumeSpan = document.createElement('span');
            volumeSpan.textContent = item.shipmentVolumeStatus || '-';
            volumeSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus) ? 'text-red-600 font-bold' : ''}`;
            volumeDiv.appendChild(volumeSpan);
            card.appendChild(volumeDiv);

            // Update Date
            const updateDateDiv = document.createElement('div');
            updateDateDiv.className = 'text-sm text-gray-700';
            const updateDateLabel = document.createElement('span');
            updateDateLabel.className = 'font-semibold text-gray-500 mr-2';
            updateDateLabel.textContent = '更新日:';
            updateDateDiv.appendChild(updateDateLabel);
            const updateDateSpan = document.createElement('span');
            const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
            updateDateSpan.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : '';
            updateDateSpan.className = `${item.updatedCells && item.updatedCells.includes(columnMap.updateDate) ? 'text-red-600 font-bold' : ''}`;
            updateDateDiv.appendChild(updateDateSpan);
            card.appendChild(updateDateDiv);

            elements.cardContainer.appendChild(card);
        });
    }
}

document.addEventListener('DOMContentLoaded', initApp);