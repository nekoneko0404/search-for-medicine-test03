/**
 * Main application logic for Kusuri Compass
 */

import { loadAndCacheData, clearCacheAndReload } from './data.js';
import { normalizeString, debounce } from './utils.js';
import { showMessage, updateProgress, renderStatusButton, createDropdown, openHiyariPage } from './ui.js';

let excelData = [];
let filteredResults = [];
let sortStates = {
    status: 'asc',
    productName: 'asc',
    ingredientName: 'asc'
};
let isComposing = false;

// DOM Elements
const elements = {
    drugName: null,
    ingredientName: null,
    makerName: null,
    statusNormal: null,
    statusLimited: null,
    statusStopped: null,
    tableContainer: null,
    resultTableBody: null,
    usageGuide: null,
    sortStatusIcon: null,
    sortProductNameIcon: null,
    sortIngredientNameIcon: null,
    reloadDataBtn: null,
    notificationArea: null,
    reloadDataBtn: null,
    notificationArea: null,
    pageFooter: null,
    infoContainer: null
};

/**
 * Initialize DOM elements
 */
function initElements() {
    elements.drugName = document.getElementById('drugName');
    elements.ingredientName = document.getElementById('ingredientName');
    elements.makerName = document.getElementById('makerName');
    elements.statusNormal = document.getElementById('statusNormal');
    elements.statusLimited = document.getElementById('statusLimited');
    elements.statusStopped = document.getElementById('statusStopped');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.resultTableBody = document.getElementById('resultTableBody');
    elements.sortStatusIcon = document.getElementById('sort-status-icon');
    elements.sortProductNameIcon = document.getElementById('sort-productName-icon');
    elements.sortIngredientNameIcon = document.getElementById('sort-ingredientName-icon');
    elements.reloadDataBtn = document.getElementById('reload-data');
    elements.notificationArea = document.getElementById('notificationArea');
    elements.infoContainer = document.getElementById('infoContainer');
}

/**
 * Get search keywords from input
 * @param {string} input - Input string
 * @returns {Array<string>} Array of normalized keywords
 */
function getSearchKeywords(input) {
    return input.split(/\s+|　+/).filter(keyword => keyword !== '').map(keyword => normalizeString(keyword));
}

/**
 * Search and filter data
 */
function searchData() {
    // Footer visibility is handled by CSS animation via body class
    if (excelData.length === 0) return;

    const drugKeywords = getSearchKeywords(elements.drugName.value);
    const ingredientKeywords = getSearchKeywords(elements.ingredientName.value);

    const makerInput = elements.makerName.value;
    const allMakerKeywords = makerInput.split(/\s+|　+/).filter(keyword => keyword !== '');
    const inclusionMakerKeywords = allMakerKeywords
        .filter(keyword => !keyword.startsWith('ー') && !keyword.startsWith('-'))
        .map(keyword => normalizeString(keyword));
    const exclusionMakerKeywords = allMakerKeywords
        .filter(keyword => keyword.startsWith('ー') || keyword.startsWith('-'))
        .map(keyword => normalizeString(keyword.substring(1)).trim())
        .filter(Boolean);

    const allCheckboxesChecked = elements.statusNormal.checked && elements.statusLimited.checked && elements.statusStopped.checked;
    const allSearchFieldsEmpty = drugKeywords.length === 0 && ingredientKeywords.length === 0 && allMakerKeywords.length === 0;

    if (allSearchFieldsEmpty && allCheckboxesChecked) {
        renderTable([]);
        elements.tableContainer.classList.add('hidden');
        if (elements.infoContainer) elements.infoContainer.classList.remove('hidden');
        document.body.classList.remove('search-mode');
        return;
    } else {
        if (elements.infoContainer) elements.infoContainer.classList.add('hidden');
        elements.tableContainer.classList.remove('hidden');
        document.body.classList.add('search-mode');
    }

    const statusFilters = [];
    if (elements.statusNormal.checked) statusFilters.push("通常出荷");
    if (elements.statusLimited.checked) statusFilters.push("限定出荷");
    if (elements.statusStopped.checked) statusFilters.push("供給停止");

    filteredResults = excelData.filter(item => {
        if (!item) return false;

        const drugName = normalizeString(item.productName || "");
        const ingredientName = normalizeString(item.ingredientName || "");
        const makerName = normalizeString((item.standard || "") + (item.manufacturer || ""));

        const matchDrug = drugKeywords.every(keyword => drugName.includes(keyword));
        const matchIngredient = ingredientKeywords.every(keyword => ingredientName.includes(keyword));

        const matchMaker = inclusionMakerKeywords.every(keyword => drugName.includes(keyword) || makerName.includes(keyword) || ingredientName.includes(keyword));
        const mismatchMaker = exclusionMakerKeywords.length > 0 && exclusionMakerKeywords.some(keyword => drugName.includes(keyword) || makerName.includes(keyword) || ingredientName.includes(keyword));

        if (statusFilters.length === 0) return false;

        const currentStatus = (item.shipmentStatus || '').trim();
        let matchStatus = false;

        if (statusFilters.includes("通常出荷") && (currentStatus.includes("通常出荷") || currentStatus.includes("通"))) {
            matchStatus = true;
        }
        if (statusFilters.includes("限定出荷") && (currentStatus.includes("限定出荷") || currentStatus.includes("出荷制限") || currentStatus.includes("限") || currentStatus.includes("制"))) {
            matchStatus = true;
        }
        if (statusFilters.includes("供給停止") && (currentStatus.includes("供給停止") || currentStatus.includes("停止") || currentStatus.includes("停"))) {
            matchStatus = true;
        }

        return matchDrug && matchIngredient && matchMaker && !mismatchMaker && matchStatus;
    });

    renderTable(filteredResults);

    if (filteredResults.length === 0) {
        showMessage("検索結果が見つかりませんでした。", "info");
    } else if (filteredResults.length > 500) {
        showMessage(`${filteredResults.length} 件のデータが見つかりました。\n表示は上位 500 件に制限されています。`, "success");
    } else {
        showMessage(`${filteredResults.length} 件のデータが見つかりました。`, "success");
    }

    // Reset sort icons
    sortStates.status = 'asc';
    sortStates.productName = 'asc';
    if (elements.sortStatusIcon) elements.sortStatusIcon.textContent = '↕';
    if (elements.sortProductNameIcon) elements.sortProductNameIcon.textContent = '↕';
    if (elements.sortIngredientNameIcon) elements.sortIngredientNameIcon.textContent = '↕';
}

/**
 * Handle ingredient click
 * @param {string} ingredient - Ingredient name
 */
function handleIngredientClick(ingredient) {
    elements.drugName.value = '';
    elements.makerName.value = '';
    const searchIngredient = ingredient;
    elements.ingredientName.value = searchIngredient;
    searchData();
    showMessage(`「${searchIngredient}」で再検索を実行しました。`, 'info');
}

/**
 * Render table with data
 * @param {Array} data - Data to render
 */
function renderTable(data) {
    elements.resultTableBody.innerHTML = "";

    if (data.length === 0) {
        const row = elements.resultTableBody.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 5;
        cell.textContent = "該当データがありません";
        cell.className = "px-4 py-8 text-sm text-gray-500 text-center italic";
        return;
    }

    const displayResults = data.slice(0, 500);
    const columnMap = {
        'productName': 5,
        'ingredientName': 2,
        'manufacturer': 6,
        'shipmentStatus': 11,
        'reasonForLimitation': 13,
        'resolutionProspect': 14,
        'expectedDate': 15,
        'shipmentVolumeStatus': 16,
        'yjCode': 4,
        'standard': 3,
        'isGeneric': 7,
        'isBasicDrug': 8,
        'updateDateSerial': 12
    };

    displayResults.forEach((item, index) => {
        const newRow = elements.resultTableBody.insertRow();
        const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
        newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-50 group fade-in-up`;
        // First row appears instantly, others staggered slower
        newRow.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

        // 1. Drug Name Cell
        const drugNameCell = newRow.insertCell(0);
        drugNameCell.setAttribute('data-label', '品名');
        drugNameCell.className = "px-4 py-3 text-sm text-gray-900 relative align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
            drugNameCell.classList.add('text-red-600', 'font-bold');
        }

        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'flex gap-1 mb-1';

        const isGeneric = item.productCategory && normalizeString(item.productCategory).includes('後発品');
        const isBasic = item.isBasicDrug && normalizeString(item.isBasicDrug).includes('基礎的医薬品');

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

        const drugName = item.productName || "";
        const flexContainer = document.createElement('div');
        flexContainer.className = 'flex flex-col items-start';
        if (labelsContainer.hasChildNodes()) {
            flexContainer.appendChild(labelsContainer);
        }

        if (!item.yjCode) {
            const span = document.createElement('span');
            span.className = "font-semibold break-words";
            span.textContent = drugName;
            flexContainer.appendChild(span);
            drugNameCell.appendChild(flexContainer);
        } else {
            const dropdown = createDropdown(item, index);
            flexContainer.appendChild(dropdown);
            drugNameCell.appendChild(flexContainer);
        }

        // 2. Ingredient Name Cell
        const ingredientNameCell = newRow.insertCell(1);
        ingredientNameCell.setAttribute('data-label', '成分名');
        ingredientNameCell.className = "px-4 py-3 text-sm text-gray-900 break-words align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) {
            ingredientNameCell.classList.add('text-red-600', 'font-bold');
        }
        const ingredientName = item.ingredientName || "";

        if (ingredientName) {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-indigo-600 font-medium hover:underline hover:text-indigo-800 transition-colors';
            link.textContent = ingredientName;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                handleIngredientClick(ingredientName);
            });
            ingredientNameCell.appendChild(link);
        } else {
            ingredientNameCell.textContent = ingredientName;
        }

        // 3. Status Cell
        const statusCell = newRow.insertCell(2);
        statusCell.setAttribute('data-label', '出荷状況');
        statusCell.className = "px-4 py-3 text-gray-900 text-left align-top whitespace-nowrap";

        const statusContainer = document.createElement('div');
        statusContainer.className = 'flex items-center gap-2';

        const isStatusUpdated = item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus);
        if (isStatusUpdated) {
            statusCell.classList.add('text-red-600', 'font-bold');
        }

        const statusValue = (item.shipmentStatus || '').trim();
        statusContainer.appendChild(renderStatusButton(statusValue, isStatusUpdated));

        if (item.shippingStatusTrend) {
            const trendIcon = document.createElement('span');
            trendIcon.className = 'text-lg text-red-500 font-bold';
            trendIcon.textContent = item.shippingStatusTrend;
            statusContainer.appendChild(trendIcon);
        }
        statusCell.appendChild(statusContainer);

        // 4. Reason Cell
        const reasonCell = newRow.insertCell(3);
        reasonCell.textContent = item.reasonForLimitation || "";
        reasonCell.setAttribute('data-label', '制限理由');
        reasonCell.className = "px-4 py-3 text-xs text-gray-600 break-words align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) {
            reasonCell.classList.add('text-red-600', 'font-bold');
        }

        // 5. Volume Cell
        const volumeCell = newRow.insertCell(4);
        volumeCell.textContent = item.shipmentVolumeStatus || "";
        volumeCell.setAttribute('data-label', '出荷量状況');
        volumeCell.className = "px-4 py-3 text-xs text-gray-600 align-top";
        if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) {
            volumeCell.classList.add('text-red-600', 'font-bold');
        }
    });
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
            const icon = document.getElementById(`sort-${otherKey}-icon`);
            if (icon) icon.textContent = '↕';
        }
    }

    document.getElementById(`sort-${key}-icon`).textContent = newDirection === 'asc' ? '↑' : '↓';

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

    renderTable(filteredResults);
    const sortKeyName = key === 'status' ? '出荷状況' : (key === 'productName' ? '品名' : '成分名');
    showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, "success");
}

/**
 * Load notification content
 */
async function loadNotification() {
    try {
        const response = await fetch('notification.md');
        if (response.ok) {
            const markdownContent = await response.text();
            // Filter out content enclosed in <!-- -->
            const filteredContent = markdownContent.replace(/<!--[\s\S]*?-->/g, '').trim();

            if (filteredContent === '') {
                if (elements.notificationArea) {
                    elements.notificationArea.style.display = 'none';
                }
                return;
            }

            const htmlContent = marked.parse(filteredContent);
            if (elements.notificationArea) {
                elements.notificationArea.innerHTML = `
                    <div class="flex items-start gap-3">
                        <svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <div class="text-amber-900 text-sm space-y-1 leading-relaxed">
                            ${htmlContent}
                        </div>
                    </div>
                `;
            }
        } else {
            console.error('Failed to load notification:', response.statusText);
            if (elements.notificationArea) {
                elements.notificationArea.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error fetching notification:', error);
        if (elements.notificationArea) {
            elements.notificationArea.style.display = 'none';
        }
    }
}

/**
 * Initialize application
 */
async function initApp() {
    initElements();
    loadNotification();

    // Attach Event Listeners
    const inputIds = ['drugName', 'ingredientName', 'makerName'];
    const debouncedSearch = debounce(searchData, 300);

    inputIds.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;

        element.addEventListener('compositionstart', () => { isComposing = true; });
        element.addEventListener('compositionend', () => {
            isComposing = false;
            debouncedSearch();
        });
        element.addEventListener('input', () => {
            if (!isComposing) debouncedSearch();
        });
    });

    elements.statusNormal.addEventListener('change', searchData);
    elements.statusLimited.addEventListener('change', searchData);
    elements.statusStopped.addEventListener('change', searchData);

    document.getElementById('sort-productName-button').addEventListener('click', () => sortResults('productName'));
    document.getElementById('sort-ingredientName-button').addEventListener('click', () => sortResults('ingredientName'));
    document.getElementById('sort-status-button').addEventListener('click', () => sortResults('status'));

    elements.reloadDataBtn.addEventListener('click', async () => {
        showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
        try {
            const result = await clearCacheAndReload(updateProgress);
            if (result && result.data) {
                excelData = result.data;
                showMessage(`データを再読み込みしました: ${excelData.length}件`, 'success');
                // Re-run search if there are inputs
                searchData();
            }
        } catch (err) {
            showMessage('キャッシュのクリアに失敗しました。', 'error');
        }
    });

    // Initial Data Load
    try {
        const result = await loadAndCacheData(updateProgress);
        if (result && result.data) {
            excelData = result.data;
            renderTable([]);
            elements.tableContainer.classList.add('hidden');
            showMessage(`データ(${result.date}) ${excelData.length} 件を読み込みました。`, "success");
        } else {
            showMessage('データの読み込みに失敗しました。リロードボタンで再試行してください。', "error");
        }
    } catch (e) {
        console.error(e);
        showMessage('初期化中にエラーが発生しました。', 'error');
    }
}

// Start App
document.addEventListener('DOMContentLoaded', initApp);
