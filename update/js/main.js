/**
 * Update Search App Main Logic
 */

import { loadAndCacheData, clearCacheAndReload } from '../../js/data.js';
import { normalizeString, debounce, formatDate } from '../../js/utils.js';
import { showMessage, renderStatusButton, updateProgress, createDropdown } from '../../js/ui.js';

let excelData = [];
let filteredResults = [];

// DOM Elements
const elements = {
    searchInput: null,
    updatePeriod: null,
    searchBtn: null,
    recoveryBtn: null,
    clearBtn: null,
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
    }
};

function initElements() {
    elements.searchInput = document.getElementById('searchInput');
    elements.updatePeriod = document.getElementById('updatePeriod');
    elements.searchBtn = document.getElementById('search-btn');
    elements.recoveryBtn = document.getElementById('recovery-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.resultTableBody = document.getElementById('resultTableBody');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.loadingIndicator = document.getElementById('loadingIndicator');
    elements.reloadDataBtn = document.getElementById('reload-data');

    elements.statusCheckboxes.normal = document.getElementById('statusNormal');
    elements.statusCheckboxes.limited = document.getElementById('statusLimited');
    elements.statusCheckboxes.stopped = document.getElementById('statusStop');

    elements.trendCheckboxes.up = document.getElementById('trendUp');
    elements.trendCheckboxes.down = document.getElementById('trendDown');
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

            if (productName) elements.searchInput.value = productName;
            if (updateDate) elements.updatePeriod.value = updateDate;

            // Handle status param if present
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

            if (productName || shippingStatus || updateDate) {
                searchData();
            } else {
                setTimeout(searchData, 500);
            }
        }
    } catch (e) {
        console.error(e);
        showMessage('データの読み込みに失敗しました。', 'error');
    }

    // Event Listeners
    elements.searchBtn.addEventListener('click', searchData);

    if (elements.reloadDataBtn) {
        elements.reloadDataBtn.addEventListener('click', async () => {
            showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
            try {
                const result = await clearCacheAndReload(updateProgress);
                if (result && result.data) {
                    excelData = result.data;
                    showMessage(`データを再読み込みしました: ${excelData.length}件`, 'success');
                    searchData();
                }
            } catch (err) {
                showMessage('キャッシュのクリアに失敗しました。', 'error');
            }
        });
    }

    elements.clearBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.updatePeriod.value = '7days'; // Default

        elements.statusCheckboxes.normal.checked = true;
        elements.statusCheckboxes.limited.checked = true;
        elements.statusCheckboxes.stopped.checked = true;

        if (elements.trendCheckboxes.up) elements.trendCheckboxes.up.checked = false;
        if (elements.trendCheckboxes.down) elements.trendCheckboxes.down.checked = false;

        searchData();
    });

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

    const debouncedSearch = debounce(searchData, 300);
    elements.searchInput.addEventListener('input', debouncedSearch);
    elements.updatePeriod.addEventListener('change', searchData);

    Object.values(elements.statusCheckboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', searchData);
    });
    Object.values(elements.trendCheckboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', searchData);
    });
}

function searchData() {
    if (excelData.length === 0) return;

    const searchKeywords = elements.searchInput.value.split(/\s+/).filter(k => k).map(normalizeString);
    const period = elements.updatePeriod.value;

    const statusChecks = {
        normal: elements.statusCheckboxes.normal.checked,
        limited: elements.statusCheckboxes.limited.checked,
        stopped: elements.statusCheckboxes.stopped.checked
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

    // Sort by update date desc
    filteredResults.sort((a, b) => {
        const dateA = a.updateDateObj ? a.updateDateObj.getTime() : 0;
        const dateB = b.updateDateObj ? b.updateDateObj.getTime() : 0;
        return dateB - dateA;
    });

    renderTable(filteredResults);

    if (filteredResults.length === 0) {
        showMessage('条件に一致する更新情報はありません。', 'info');
    } else {
        showMessage(`${filteredResults.length} 件の更新情報が見つかりました。`, 'success');
    }
}

function renderTable(data) {
    elements.resultTableBody.innerHTML = '';

    if (data.length === 0) {
        elements.tableContainer.classList.add('hidden');
        return;
    }
    elements.tableContainer.classList.remove('hidden');

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

    displayData.forEach((item, index) => {
        const row = elements.resultTableBody.insertRow();
        row.className = "hover:bg-indigo-50 transition-colors group";

        // 1. Product Name
        const cellName = row.insertCell(0);
        cellName.className = "px-2 py-3 text-sm text-gray-900 font-medium align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) cellName.classList.add('text-red-600', 'font-bold');

        if (item.yjCode) {
            cellName.appendChild(createDropdown(item, index));
        } else {
            cellName.textContent = item.productName || '';
        }

        // 2. Ingredient Name
        const cellIngredient = row.insertCell(1);
        cellIngredient.className = "px-2 py-3 text-sm text-gray-600 align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) cellIngredient.classList.add('text-red-600', 'font-bold');
        cellIngredient.textContent = item.ingredientName || '';

        // 3. Shipment Status
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

        // 4. Reason
        const cellReason = row.insertCell(3);
        cellReason.className = "px-2 py-3 text-xs text-gray-600 align-top break-words";
        if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) cellReason.classList.add('text-red-600', 'font-bold');
        cellReason.textContent = item.reasonForLimitation || '-';

        // 5. Resolution Prospect
        const cellResolution = row.insertCell(4);
        cellResolution.className = "px-2 py-3 text-xs text-gray-600 align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect)) cellResolution.classList.add('text-red-600', 'font-bold');
        cellResolution.textContent = item.resolutionProspect || '-';

        // 6. Expected Date
        const cellExpected = row.insertCell(5);
        cellExpected.className = "px-2 py-3 text-xs text-gray-600 align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.expectedDate)) cellExpected.classList.add('text-red-600', 'font-bold');

        if (item.expectedDateObj) {
            const dateStr = formatDate(item.expectedDateObj);
            cellExpected.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : (item.expectedDate || '-');
        } else {
            cellExpected.textContent = item.expectedDate || '-';
        }

        // 7. Shipment Volume
        const cellVolume = row.insertCell(6);
        cellVolume.className = "px-2 py-3 text-xs text-gray-600 align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) cellVolume.classList.add('text-red-600', 'font-bold');
        cellVolume.textContent = item.shipmentVolumeStatus || '-';

        // 8. Update Date
        const cellDate = row.insertCell(7);
        cellDate.className = "px-2 py-3 text-xs text-gray-600 whitespace-nowrap align-top";
        // Only highlight if the update date column itself was updated
        if (item.updatedCells && item.updatedCells.includes(columnMap.updateDate)) {
            cellDate.classList.add('text-red-600', 'font-bold');
        }

        const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
        cellDate.textContent = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : ''; // YY-MM-DD format
    });
}

document.addEventListener('DOMContentLoaded', initApp);
