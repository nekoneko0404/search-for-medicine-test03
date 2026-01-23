console.log("search main.js loaded");
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
    searchResultTableBody: null, // Renamed from resultTableBody
    usageGuide: null,
    sortStatusIcon: null,
    sortProductNameIcon: null,
    sortIngredientNameIcon: null,
    reloadDataBtn: null,
    shareBtn: null,

    pageFooter: null,
    infoContainer: null,
    mainHeader: null,
    mainFooter: null,
    cardContainer: null // Renamed from searchResultsGrid
};

/**
 * Initialize DOM elements
 */
function initElements() {
    elements.mainHeader = document.getElementById('mainHeader');
    elements.mainFooter = document.getElementById('mainFooter');
    elements.drugName = document.getElementById('drugName');
    elements.ingredientName = document.getElementById('ingredientName');
    elements.makerName = document.getElementById('makerName');
    elements.statusNormal = document.getElementById('statusNormal');
    elements.statusLimited = document.getElementById('statusLimited');
    elements.statusStopped = document.getElementById('statusStopped');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.searchResultTableBody = document.getElementById('searchResultTableBody'); // New table body
    elements.cardContainer = document.getElementById('cardContainer'); // New card container
    elements.sortStatusIcon = document.getElementById('sort-status-icon');
    elements.sortProductNameIcon = document.getElementById('sort-productName-icon');
    elements.sortIngredientNameIcon = document.getElementById('sort-ingredientName-icon');
    elements.reloadDataBtn = document.getElementById('reload-data');
    elements.shareBtn = document.getElementById('share-btn');

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
    console.log('--- searchData called ---');
    console.log('drugName.value:', elements.drugName.value);
    console.log('ingredientName.value:', elements.ingredientName.value);
    console.log('makerName.value:', elements.makerName.value);

    // Footer visibility is handled by CSS animation via body class
    if (excelData.length === 0) {
        console.log('excelData is empty, returning.');
        return;
    }

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

    console.log('drugKeywords:', drugKeywords);
    console.log('ingredientKeywords:', ingredientKeywords);
    console.log('inclusionMakerKeywords:', inclusionMakerKeywords);
    console.log('exclusionMakerKeywords:', exclusionMakerKeywords);


    const allCheckboxesChecked = elements.statusNormal.checked && elements.statusLimited.checked && elements.statusStopped.checked;
    const allSearchFieldsEmpty = drugKeywords.length === 0 && ingredientKeywords.length === 0 && allMakerKeywords.length === 0;

    const statusFilters = [];
    if (elements.statusNormal.checked) statusFilters.push("通常出荷");
    if (elements.statusLimited.checked) statusFilters.push("限定出荷");
    if (elements.statusStopped.checked) statusFilters.push("供給停止");
    console.log('statusFilters:', statusFilters);


    if (allSearchFieldsEmpty && allCheckboxesChecked) {
        renderResults([]);
        elements.tableContainer.classList.add('hidden');
        if (elements.infoContainer) elements.infoContainer.classList.remove('hidden');
        document.body.classList.remove('search-mode');
        console.log('All search fields empty and all checkboxes checked. Hiding table.');
        return;
    } else {
        if (elements.infoContainer) elements.infoContainer.classList.add('hidden');
        elements.tableContainer.classList.remove('hidden');
        document.body.classList.add('search-mode');
        console.log('Search criteria present. Showing table.');
    }

    filteredResults = excelData.filter(item => {
        if (!item) return false;

        const drugName = normalizeString(item.productName || "");
        const ingredientName = normalizeString(item.ingredientName || "");
        const makerName = normalizeString((item.standard || "") + (item.manufacturer || ""));

        const matchDrug = drugKeywords.every(keyword => drugName.includes(keyword));
        const matchIngredient = ingredientKeywords.every(keyword => ingredientName.includes(keyword));

        // Maker search: Check if any inclusion keyword matches productName, makerName, or ingredientName
        const matchMaker = inclusionMakerKeywords.every(keyword =>
            (item.productName && normalizeString(item.productName).includes(keyword)) ||
            makerName.includes(keyword) ||
            ingredientName.includes(keyword)
        );

        // Maker exclusion: Check if any exclusion keyword matches productName, makerName, or ingredientName
        const mismatchMaker = exclusionMakerKeywords.some(keyword =>
            (item.productName && normalizeString(item.productName).includes(keyword)) ||
            makerName.includes(keyword) ||
            ingredientName.includes(keyword)
        );


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

    console.log('filteredResults.length:', filteredResults.length);
    renderResults(filteredResults);

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
 * Render results (cards for mobile, table for desktop)
 * @param {Array} data - Data to render
 */
function renderResults(data) {
    const isMobile = window.innerWidth < 768;
    elements.searchResultTableBody.innerHTML = ""; // Clear table body
    elements.cardContainer.innerHTML = ""; // Clear card container

    if (data.length === 0) {
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.add('hidden');
        document.body.classList.remove('search-mode');
        return;
    }

    document.body.classList.add('search-mode');

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

    if (!isMobile) {
        // Desktop Table View
        elements.tableContainer.classList.remove('hidden');
        elements.cardContainer.classList.add('hidden');

        displayResults.forEach((item, index) => {
            const row = elements.searchResultTableBody.insertRow();
            const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
            row.className = `${rowBgClass} hover:bg-indigo-50 transition-colors group fade-in-up`;
            row.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // Product Name
            const cellName = row.insertCell(0);
            cellName.className = "px-4 py-3 text-sm text-gray-900 font-medium align-top";

            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'flex gap-1 mb-1'; // Add margin-bottom for spacing

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
            if (labelsContainer.hasChildNodes()) {
                cellName.appendChild(labelsContainer);
            }

            if (item.yjCode) {
                cellName.appendChild(createDropdown(item, data.indexOf(item)));
            } else {
                const productNameSpan = document.createElement('span'); // Use a span for the text
                productNameSpan.className = "text-sm"; // Add text-sm class
                productNameSpan.textContent = item.productName || '';
                cellName.appendChild(productNameSpan);
            }
            if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
                cellName.classList.add('text-red-600', 'font-bold');
            }

            // Ingredient Name
            const cellIngredient = row.insertCell(1);
            cellIngredient.className = "px-4 py-3 text-sm text-gray-600 align-top";
            const ingredientNameValue = item.ingredientName || '';
            if (ingredientNameValue) {
                const link = document.createElement('a');
                link.href = '#';
                link.className = `text-indigo-600 font-medium hover:underline hover:text-indigo-800 transition-colors ${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
                link.textContent = ingredientNameValue;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleIngredientClick(ingredientNameValue);
                });
                cellIngredient.appendChild(link);
            } else {
                const span = document.createElement('span');
                span.className = `${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
                span.textContent = ingredientNameValue;
                cellIngredient.appendChild(span);
            }

            // Status
            const cellStatus = row.insertCell(2);
            cellStatus.className = "px-4 py-3 align-top";
            const isStatusUpdated = item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus);
            const statusContainer = document.createElement('div');
            statusContainer.className = 'flex items-center gap-1';
            statusContainer.appendChild(renderStatusButton(item.shipmentStatus, isStatusUpdated));
            if (item.shippingStatusTrend) {
                const trendIcon = document.createElement('span');
                trendIcon.className = 'text-base text-red-500 font-bold';
                trendIcon.textContent = item.shippingStatusTrend;
                statusContainer.appendChild(trendIcon);
            }
            cellStatus.appendChild(statusContainer);

            // Reason for Limitation
            const cellReason = row.insertCell(3);
            cellReason.className = "px-4 py-3 text-sm text-gray-600 align-top break-words";
            cellReason.textContent = item.reasonForLimitation || '-';

            // Shipment Volume Status
            const cellVolume = row.insertCell(4);
            cellVolume.className = "px-4 py-3 text-sm text-gray-600 align-top";
            cellVolume.textContent = item.shipmentVolumeStatus || '-';


        });
    } else {
        // Mobile Card View
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.remove('hidden');

        displayResults.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `search-result-card bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all duration-150 fade-in-up relative`;
            card.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // Product Name
            const productNameDiv = document.createElement('div');
            productNameDiv.className = 'flex flex-col items-start mb-2';

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

            if (labelsContainer.hasChildNodes()) {
                productNameDiv.appendChild(labelsContainer);
            }

            const drugNameText = document.createElement('div');
            drugNameText.className = `font-semibold break-words text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}`;

            if (!item.yjCode) {
                drugNameText.textContent = item.productName || "";
                productNameDiv.appendChild(drugNameText);
            } else {
                const dropdown = createDropdown(item, index);
                productNameDiv.appendChild(dropdown);
            }
            card.appendChild(productNameDiv);


            // Ingredient Name
            const ingredientDiv = document.createElement('div');
            ingredientDiv.className = 'text-sm text-gray-700 mb-2';
            const ingredientNameLabel = document.createElement('span');
            ingredientNameLabel.className = 'font-medium mr-1 text-gray-500';
            ingredientNameLabel.textContent = '成分名: ';
            ingredientDiv.appendChild(ingredientNameLabel);

            const ingredientNameValue = item.ingredientName || "";
            if (ingredientNameValue) {
                const link = document.createElement('a');
                link.href = '#';
                link.className = `text-indigo-600 font-medium hover:underline hover:text-indigo-800 transition-colors ${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
                link.textContent = ingredientNameValue;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleIngredientClick(ingredientNameValue);
                });
                ingredientDiv.appendChild(link);
            } else {
                const span = document.createElement('span');
                span.className = `${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
                span.textContent = ingredientNameValue;
                ingredientDiv.appendChild(span);
            }
            card.appendChild(ingredientDiv);

            // Status
            const statusDiv = document.createElement('div');
            statusDiv.className = 'flex items-center gap-2 mb-2';
            const statusLabel = document.createElement('span');
            statusLabel.className = 'font-medium mr-1 text-gray-500';
            statusLabel.textContent = '状況: ';
            statusDiv.appendChild(statusLabel);

            const isStatusUpdated = item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus);
            statusDiv.appendChild(renderStatusButton((item.shipmentStatus || '').trim(), isStatusUpdated));

            if (item.shippingStatusTrend) {
                const trendIcon = document.createElement('span');
                trendIcon.className = 'text-lg text-red-500 font-bold';
                trendIcon.textContent = item.shippingStatusTrend;
                statusDiv.appendChild(trendIcon);
            }
            card.appendChild(statusDiv);

            // Reason for Limitation
            const reasonDiv = document.createElement('div');
            reasonDiv.className = 'text-sm text-gray-700 mb-2';
            const reasonLabel = document.createElement('span');
            reasonLabel.className = 'font-medium mr-1 text-gray-500';
            reasonLabel.textContent = '制限理由: ';
            reasonDiv.appendChild(reasonLabel);
            const reasonValue = document.createElement('span');
            reasonValue.className = `${item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation) ? 'text-red-600 font-bold' : ''}`;
            reasonValue.textContent = item.reasonForLimitation || "N/A";
            reasonDiv.appendChild(reasonValue);
            card.appendChild(reasonDiv);

            // Shipment Volume Status
            const volumeDiv = document.createElement('div');
            volumeDiv.className = 'text-sm text-gray-700';
            const volumeLabel = document.createElement('span');
            volumeLabel.className = 'font-medium mr-1 text-gray-500';
            volumeLabel.textContent = '出荷量: ';
            volumeDiv.appendChild(volumeLabel);
            const volumeValue = document.createElement('span');
            volumeValue.className = `${item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus) ? 'text-red-600 font-bold' : ''}`;
            volumeValue.textContent = item.shipmentVolumeStatus || "N/A";
            volumeDiv.appendChild(volumeValue);
            card.appendChild(volumeDiv);

            elements.cardContainer.appendChild(card);
        });
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

    renderResults(filteredResults);
    const sortKeyName = key === 'status' ? '出荷状況' : (key === 'productName' ? '品名' : '成分名');
    showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, "success");
}



/**
 * URLクエリパラメータから検索条件を復元
 * @param {URLSearchParams} urlParams - URLパラメータ
 */
function restoreFromUrlParams(urlParams) {
    // テキスト入力の復元
    const drug = urlParams.get('drug');
    if (drug && elements.drugName) elements.drugName.value = drug;

    const ingredient = urlParams.get('ingredient');
    if (ingredient && elements.ingredientName) elements.ingredientName.value = ingredient;

    const maker = urlParams.get('maker');
    if (maker && elements.makerName) elements.makerName.value = maker;

    // 出荷状況チェックボックスを復元
    if (elements.statusNormal) elements.statusNormal.checked = urlParams.get('normal') === '1';
    if (elements.statusLimited) elements.statusLimited.checked = urlParams.get('limited') === '1';
    if (elements.statusStopped) elements.statusStopped.checked = urlParams.get('stop') === '1';
}

/**
 * 現在の検索条件を共有URLとしてクリップボードにコピー
 */
async function shareSearchConditions() {
    const drug = elements.drugName?.value?.trim() || '';
    const ingredient = elements.ingredientName?.value?.trim() || '';
    const maker = elements.makerName?.value?.trim() || '';

    // パラメータを構築
    const params = new URLSearchParams();

    if (drug) params.set('drug', drug);
    if (ingredient) params.set('ingredient', ingredient);
    if (maker) params.set('maker', maker);

    // 出荷状況を追加
    params.set('normal', elements.statusNormal?.checked ? '1' : '0');
    params.set('limited', elements.statusLimited?.checked ? '1' : '0');
    params.set('stop', elements.statusStopped?.checked ? '1' : '0');

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
 * Initialize application
 */
async function initApp() {
    initElements();

    // 共有ボタンのイベントリスナー
    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', () => shareSearchConditions());
    }

    // Check URL params
    const urlParams = new URLSearchParams(window.location.search);
    let shouldSearch = false;
    if (urlParams.has('drug') || urlParams.has('ingredient') || urlParams.has('maker') || urlParams.has('normal')) {
        restoreFromUrlParams(urlParams);
        shouldSearch = true;
    }


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


    // Initial Data Load
    try {
        const result = await loadAndCacheData(updateProgress);
        if (result && result.data) {
            excelData = result.data;
            renderResults([]);
            elements.tableContainer.classList.add('hidden');
            showMessage(`データ(${result.date}) ${excelData.length} 件を読み込みました。`, "success");

            if (shouldSearch) {
                searchData();
            }
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
