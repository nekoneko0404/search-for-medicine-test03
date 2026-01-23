/**
 * Drug Classification Search App Main Logic
 */

import { loadAndCacheData, fetchManufacturerData, clearCacheAndReload } from '../../js/data.js';
import { normalizeString, debounce } from '../../js/utils.js';
import { showMessage, renderStatusButton, updateProgress, createDropdown } from '../../js/ui.js';

let excelData = [];
let manufacturerLinks = {};
let sortStates = {
    status: 'asc',
    productName: 'asc',
    ingredientName: 'asc',
    yjCode: 'asc'
};

// DOM Elements
const elements = {
    mainHeader: null,
    mainFooter: null,
    yjCodeInput: null,
    searchBtn: null,
    shareBtn: null,
    resultTableBody: null,
    resultCardContainer: null,
    loadingIndicator: null,
    tableContainer: null,
    cardContainer: null,
    reloadDataBtn: null,
    checkboxes: {
        class3: null,     // 薬効 (3 digits)
        class4: null,     // 薬効 (4 digits)
        ingredient: null, // 成分 (7 digits)
        form: null,       // 剤形 (8th digit)
        standard: null,   // 規格 (9th digit)
        brand: null       // 銘柄 (11 digits)
    },
    statusCheckboxes: {
        normal: null,
        limited: null,
        stopped: null
    },
    sortButtons: {
        status: null,
        productName: null,
        ingredientName: null,
        yjCode: null
    },
    sortIcons: {
        status: null,
        productName: null,
        ingredientName: null,
        yjCode: null
    }
};

function initElements() {
    elements.mainHeader = document.getElementById('mainHeader');
    elements.mainFooter = document.getElementById('mainFooter');
    elements.yjCodeInput = document.getElementById('yjCodeInput');
    elements.searchBtn = document.getElementById('search-btn');
    elements.shareBtn = document.getElementById('share-btn');
    elements.resultTableBody = document.getElementById('resultTableBody');
    elements.resultCardContainer = document.getElementById('resultCardContainer');
    elements.loadingIndicator = document.getElementById('loadingIndicator');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.cardContainer = document.getElementById('cardContainer');
    elements.resultCardContainer = elements.cardContainer; // Fix: use cardContainer
    elements.reloadDataBtn = document.getElementById('reload-data');

    elements.checkboxes.class3 = document.getElementById('filter-class3');
    elements.checkboxes.class4 = document.getElementById('filter-class4');
    elements.checkboxes.ingredient = document.getElementById('filter-ingredient');
    elements.checkboxes.form = document.getElementById('filter-form');
    elements.checkboxes.standard = document.getElementById('filter-standard');
    elements.checkboxes.brand = document.getElementById('filter-brand');

    elements.statusCheckboxes.normal = document.getElementById('statusNormal');
    elements.statusCheckboxes.limited = document.getElementById('statusLimited');
    elements.statusCheckboxes.stopped = document.getElementById('statusStop');

    elements.sortButtons.status = document.getElementById('sort-status-button');
    elements.sortButtons.productName = document.getElementById('sort-productName-button');
    elements.sortButtons.ingredientName = document.getElementById('sort-ingredientName-button');
    elements.sortButtons.yjCode = document.getElementById('sort-yjCode-button');

    elements.sortIcons.status = document.getElementById('sort-status-icon');
    elements.sortIcons.productName = document.getElementById('sort-productName-icon');
    elements.sortIcons.ingredientName = document.getElementById('sort-ingredientName-icon');
    elements.sortIcons.yjCode = document.getElementById('sort-yjCode-icon');
}

async function initApp() {
    initElements();

    try {
        // Load data
        const [dataResult, links] = await Promise.all([
            loadAndCacheData(updateProgress),
            fetchManufacturerData()
        ]);

        if (dataResult && dataResult.data) {
            excelData = dataResult.data;
            console.log(`Loaded ${excelData.length} items for YJ search.`);
            showMessage(`データ(${dataResult.date}) ${excelData.length} 件を読み込みました。`, "success");
        } else {
            console.error('No data received from loadAndCacheData');
        }
        manufacturerLinks = links || {};

        // Check URL params - 新しい共有パラメータ形式を優先
        const urlParams = new URLSearchParams(window.location.search);
        const yjCodeParam = urlParams.get('yj') || urlParams.get('yjcode'); // 新旧両対応
        const modeParam = urlParams.get('mode');

        // 新しい共有パラメータがある場合は、それを使用
        if (urlParams.has('yj')) {
            restoreFromUrlParams(urlParams);
            searchYjCode();
        } else if (yjCodeParam) {
            // 旧形式のパラメータ(yjcode + mode)の処理
            elements.yjCodeInput.value = yjCodeParam;

            // Determine checkbox settings based on mode
            const isAlternativeSearch = modeParam === 'alternative';
            const isIngredientSearch = modeParam === 'ingredient';

            // Set defaults based on navigation source
            if (isIngredientSearch) {
                // Ingredient search: only check ingredient (7 digits) and all statuses
                if (elements.checkboxes.class3) elements.checkboxes.class3.checked = false;
                if (elements.checkboxes.class4) elements.checkboxes.class4.checked = false;
                if (elements.checkboxes.form) elements.checkboxes.form.checked = false;
                if (elements.checkboxes.ingredient) elements.checkboxes.ingredient.checked = true;
                if (elements.checkboxes.standard) elements.checkboxes.standard.checked = false;
                if (elements.checkboxes.brand) elements.checkboxes.brand.checked = false;

                if (elements.statusCheckboxes.normal) elements.statusCheckboxes.normal.checked = true;
                if (elements.statusCheckboxes.limited) elements.statusCheckboxes.limited.checked = true;
                if (elements.statusCheckboxes.stopped) elements.statusCheckboxes.stopped.checked = true;
            } else {
                // Alternative or default search
                if (elements.checkboxes.class3) elements.checkboxes.class3.checked = true;
                if (elements.checkboxes.class4) elements.checkboxes.class4.checked = true;
                if (elements.checkboxes.form) elements.checkboxes.form.checked = true;
                if (elements.checkboxes.ingredient) elements.checkboxes.ingredient.checked = isAlternativeSearch;
                if (elements.checkboxes.standard) elements.checkboxes.standard.checked = false;
                if (elements.checkboxes.brand) elements.checkboxes.brand.checked = false;

                if (elements.statusCheckboxes.normal) elements.statusCheckboxes.normal.checked = true;
                if (elements.statusCheckboxes.limited) elements.statusCheckboxes.limited.checked = isAlternativeSearch;
                if (elements.statusCheckboxes.stopped) elements.statusCheckboxes.stopped.checked = isAlternativeSearch;
            }

            searchYjCode();
        }

    } catch (e) {
        console.error(e);
        showMessage('データの読み込みに失敗しました。', 'error');
    }

    // Event Listeners
    elements.searchBtn.addEventListener('click', () => searchYjCode());

    // 共有ボタンのイベントリスナー
    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', () => shareSearchConditions());
    }

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
                    searchYjCode();
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

    elements.yjCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchYjCode();
    });

    // Add listeners to all checkboxes
    Object.values(elements.checkboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', () => searchYjCode());
    });
    Object.values(elements.statusCheckboxes).forEach(cb => {
        if (cb) cb.addEventListener('change', () => searchYjCode());
    });

    // Sort Event Listeners
    if (elements.sortButtons.productName) elements.sortButtons.productName.addEventListener('click', () => sortResults('productName'));
    if (elements.sortButtons.ingredientName) elements.sortButtons.ingredientName.addEventListener('click', () => sortResults('ingredientName'));
    if (elements.sortButtons.status) elements.sortButtons.status.addEventListener('click', () => sortResults('status'));
    if (elements.sortButtons.yjCode) elements.sortButtons.yjCode.addEventListener('click', () => sortResults('yjCode'));
}

/**
 * URLクエリパラメータから検索条件を復元
 * @param {URLSearchParams} urlParams - URLパラメータ
 */
function restoreFromUrlParams(urlParams) {
    // YJコードを復元
    const yjCode = urlParams.get('yj');
    if (yjCode && elements.yjCodeInput) {
        elements.yjCodeInput.value = yjCode;
    }

    // 検索条件チェックボックスを復元
    if (elements.checkboxes.class3) elements.checkboxes.class3.checked = urlParams.get('class3') === '1';
    if (elements.checkboxes.class4) elements.checkboxes.class4.checked = urlParams.get('class4') === '1';
    if (elements.checkboxes.ingredient) elements.checkboxes.ingredient.checked = urlParams.get('ingredient') === '1';
    if (elements.checkboxes.form) elements.checkboxes.form.checked = urlParams.get('form') === '1';
    if (elements.checkboxes.standard) elements.checkboxes.standard.checked = urlParams.get('standard') === '1';
    if (elements.checkboxes.brand) elements.checkboxes.brand.checked = urlParams.get('brand') === '1';

    // 出荷状況チェックボックスを復元
    if (elements.statusCheckboxes.normal) elements.statusCheckboxes.normal.checked = urlParams.get('normal') === '1';
    if (elements.statusCheckboxes.limited) elements.statusCheckboxes.limited.checked = urlParams.get('limited') === '1';
    if (elements.statusCheckboxes.stopped) elements.statusCheckboxes.stopped.checked = urlParams.get('stop') === '1';
}

/**
 * 現在の検索条件を共有URLとしてクリップボードにコピー
 */
async function shareSearchConditions() {
    const yjCode = elements.yjCodeInput?.value?.trim() || '';

    // パラメータを構築
    const params = new URLSearchParams();

    // YJコードを追加
    if (yjCode) {
        params.set('yj', yjCode);
    }

    // 検索条件を追加
    params.set('class3', elements.checkboxes.class3?.checked ? '1' : '0');
    params.set('class4', elements.checkboxes.class4?.checked ? '1' : '0');
    params.set('ingredient', elements.checkboxes.ingredient?.checked ? '1' : '0');
    params.set('form', elements.checkboxes.form?.checked ? '1' : '0');
    params.set('standard', elements.checkboxes.standard?.checked ? '1' : '0');
    params.set('brand', elements.checkboxes.brand?.checked ? '1' : '0');

    // 出荷状況を追加
    params.set('normal', elements.statusCheckboxes.normal?.checked ? '1' : '0');
    params.set('limited', elements.statusCheckboxes.limited?.checked ? '1' : '0');
    params.set('stop', elements.statusCheckboxes.stopped?.checked ? '1' : '0');

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

let filteredResults = [];

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
        } else if (key === 'yjCode') {
            aValue = (a.yjCode || '').trim();
            bValue = (b.yjCode || '').trim();
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
        case 'yjCode': sortKeyName = 'YJコード'; break;
    }
    showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, "success");
}

function searchYjCode() {
    const code = elements.yjCodeInput.value;
    let normalizedCode = normalizeString(code);

    const checks = {
        class3: elements.checkboxes.class3?.checked || false,
        class4: elements.checkboxes.class4?.checked || false,
        ingredient: elements.checkboxes.ingredient?.checked || false,
        form: elements.checkboxes.form?.checked || false,
        standard: elements.checkboxes.standard?.checked || false,
        brand: elements.checkboxes.brand?.checked || false
    };

    const statusChecks = {
        normal: elements.statusCheckboxes.normal?.checked || false,
        limited: elements.statusCheckboxes.limited?.checked || false,
        stopped: elements.statusCheckboxes.stopped?.checked || false
    };

    const isAnyFilterChecked = Object.values(checks).some(c => c);
    const isAnyStatusChecked = Object.values(statusChecks).some(c => c);

    if (isAnyFilterChecked) {
        if (!normalizedCode || !/^[0-9a-zA-Z]+$/.test(normalizedCode)) {
            showMessage('検索条件をチェックした際は、正しいYJコードを入力してください。', 'error');
            renderResults([]);
            return;
        }
        // If code is less than 12 digits, pad with leading zeros if it's purely numeric
        let searchCode = normalizedCode;
        if (searchCode.length < 12 && /^\d+$/.test(searchCode)) {
            searchCode = searchCode.padStart(12, '0');
            console.log(`Padded YJ code to: ${searchCode}`);
        }
        normalizedCode = searchCode; // Update normalizedCode with padded version
    }

    if (!isAnyFilterChecked && !isAnyStatusChecked) {
        showMessage('検索条件と出荷状況のチェックを全て外したため、検索結果は表示されません。', 'info');
        renderResults([]);
        return;
    }

    filteredResults = excelData.filter(item => {
        const itemYjCode = normalizeString(item.yjCode || '');
        if (!itemYjCode) return false;

        // YJ Code Logic Filtering
        if (isAnyFilterChecked) {
            let match = true;

            // 1. Brand (11 digits)
            if (checks.brand) {
                if (!itemYjCode.startsWith(normalizedCode.substring(0, 11))) match = false;
            }

            // 2. Ingredient (7 digits)
            if (match && checks.ingredient) {
                if (!itemYjCode.startsWith(normalizedCode.substring(0, 7))) match = false;
            }

            // 3. Class (4 digits)
            if (match && checks.class4) {
                if (!itemYjCode.startsWith(normalizedCode.substring(0, 4))) match = false;
            }

            // 4. Class (3 digits)
            if (match && checks.class3) {
                if (!itemYjCode.startsWith(normalizedCode.substring(0, 3))) match = false;
            }

            // 5. Form (8th digit / index 7)
            if (match && checks.form) {
                if (itemYjCode.charAt(7) !== normalizedCode.charAt(7)) match = false;
            }

            // 6. Standard (9th digit / index 8)
            if (match && checks.standard) {
                if (itemYjCode.charAt(8) !== normalizedCode.charAt(8)) match = false;
            }

            if (!match) return false;
        }

        // Status Filtering
        if (isAnyStatusChecked) {
            const status = normalizeString(item.shipmentStatus || '');
            let statusMatch = false;
            if (statusChecks.normal && (status.includes('通常出荷') || status.includes('通'))) statusMatch = true;
            if (statusChecks.limited && (status.includes('限定出荷') || status.includes('出荷制限') || status.includes('限') || status.includes('制'))) statusMatch = true;
            if (statusChecks.stopped && (status.includes('供給停止') || status.includes('停止') || status.includes('停'))) statusMatch = true;

            if (!statusMatch) return false;
        }

        return true;
    });

    // Reset sort icons
    sortStates.status = 'asc';
    sortStates.productName = 'asc';
    sortStates.ingredientName = 'asc';
    sortStates.yjCode = 'asc';
    if (elements.sortIcons.status) elements.sortIcons.status.textContent = '↕';
    if (elements.sortIcons.productName) elements.sortIcons.productName.textContent = '↕';
    if (elements.sortIcons.ingredientName) elements.sortIcons.ingredientName.textContent = '↕';
    if (elements.sortIcons.yjCode) elements.sortIcons.yjCode.textContent = '↕';

    renderResults(filteredResults);

    if (filteredResults.length === 0) {
        showMessage('条件に一致するデータが見つかりませんでした。', 'info');
    } else {
        showMessage(`${filteredResults.length} 件見つかりました。`, 'success');
    }
}

function renderResults(data) {
    const isMobile = window.innerWidth <= 640;
    elements.resultTableBody.innerHTML = '';
    elements.cardContainer.innerHTML = ''; // Clear card container

    if (data.length === 0) {
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.add('hidden');
        document.body.classList.remove('search-mode');
        return;
    }

    document.body.classList.add('search-mode');

    // Limit results for performance
    const displayData = data.slice(0, 500);

    // Column Mapping for Red Text Logic (same as main page)
    const columnMap = {
        'productName': 5,
        'ingredientName': 2,
        'manufacturer': 6,
        'shipmentStatus': 11
    };

    if (!isMobile) {
        // Desktop Table View
        elements.tableContainer.classList.remove('hidden');
        elements.cardContainer.classList.add('hidden');

        displayData.forEach((item, index) => {
            const row = elements.resultTableBody.insertRow();
            const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
            row.className = `${rowBgClass} hover:bg-indigo-50 transition-colors group fade-in-up`;
            row.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // YJ Code
            const cellYj = row.insertCell(0);
            cellYj.className = "px-4 py-3 text-sm font-mono align-top";
            cellYj.setAttribute('data-label', 'YJコード');

            if (item.yjCode) {
                const link = document.createElement('a');
                link.href = `index.html?yjcode=${item.yjCode}&mode=alternative`;
                link.className = "text-indigo-600 font-semibold hover:underline";
                link.textContent = item.yjCode;
                cellYj.appendChild(link);
            } else {
                cellYj.textContent = '';
            }

            // Name
            const cellName = row.insertCell(1);
            cellName.className = "px-4 py-3 text-sm text-gray-900 font-medium align-top";
            cellName.setAttribute('data-label', '品名');

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
                productNameSpan.textContent = item.productName || '';
                cellName.appendChild(productNameSpan);
            }
            if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
                cellName.classList.add('text-red-600', 'font-bold');
            }

            // Ingredient Name
            const cellIngredient = row.insertCell(2);
            cellIngredient.className = "px-4 py-3 text-sm text-gray-600 align-top";
            cellIngredient.setAttribute('data-label', '成分名');
            cellIngredient.textContent = item.ingredientName || '';
            if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) {
                cellIngredient.classList.add('text-red-600', 'font-bold');
            }

            // Manufacturer
            const cellMaker = row.insertCell(3);
            cellMaker.className = "px-4 py-3 text-sm text-gray-600 align-top";
            cellMaker.setAttribute('data-label', 'メーカー');

            const makerName = item.manufacturer || '';
            if (manufacturerLinks[makerName]) {
                const link = document.createElement('a');
                link.href = manufacturerLinks[makerName];
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = "text-indigo-600 hover:underline";
                link.textContent = makerName;
                cellMaker.appendChild(link);
            } else {
                cellMaker.textContent = makerName;
            }
            if (item.updatedCells && item.updatedCells.includes(columnMap.manufacturer)) {
                cellMaker.classList.add('text-red-600', 'font-bold');
            }

            // Status
            const cellStatus = row.insertCell(4);
            cellStatus.className = "px-4 py-3 align-top";
            cellStatus.setAttribute('data-label', '出荷状況');
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

            if (isStatusUpdated) {
                cellStatus.classList.add('text-red-600', 'font-bold');
            }
        });
    } else {
        // Mobile Card View
        elements.tableContainer.classList.add('hidden');
        elements.cardContainer.classList.remove('hidden');
        elements.cardContainer.classList.add('search-results-grid'); // Add grid class

        displayData.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `search-result-card bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all duration-150 fade-in-up`;
            card.style.animationDelay = index === 0 ? '0s' : `${index * 0.05}s`;

            // YJ Code
            const yjCodeDiv = document.createElement('div');
            yjCodeDiv.className = 'text-sm font-mono text-gray-800 mb-1';
            const yjCodeLabel = document.createElement('span');
            yjCodeLabel.className = 'font-semibold text-gray-500 mr-2';
            yjCodeLabel.textContent = 'YJコード:';
            yjCodeDiv.appendChild(yjCodeLabel);
            if (item.yjCode) {
                const link = document.createElement('a');
                link.href = `index.html?yjcode=${item.yjCode}&mode=alternative`;
                link.className = "text-indigo-600 font-semibold hover:underline";
                link.textContent = item.yjCode;
                yjCodeDiv.appendChild(link);
            } else {
                yjCodeDiv.textContent += '';
            }
            card.appendChild(yjCodeDiv);

            // Product Name
            const productNameDiv = document.createElement('div');
            productNameDiv.className = 'flex flex-col items-start mb-2'; // Changed to flex-col for label stacking

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
                productNameDiv.appendChild(labelsContainer);
            }

            const productNameContentDiv = document.createElement('div'); // New div to hold product name and dropdown
            productNameContentDiv.className = 'flex items-center'; // Aligns dropdown/text nicely

            if (item.yjCode) {
                const dropdown = createDropdown(item, data.indexOf(item));
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

            // Manufacturer
            const manufacturerDiv = document.createElement('div');
            manufacturerDiv.className = 'text-sm text-gray-700 mb-2';
            const manufacturerLabel = document.createElement('span');
            manufacturerLabel.className = 'font-semibold text-gray-500 mr-2';
            manufacturerLabel.textContent = 'メーカー:';
            manufacturerDiv.appendChild(manufacturerLabel);
            const manufacturerSpan = document.createElement('span');
            const makerName = item.manufacturer || '';
            if (manufacturerLinks[makerName]) {
                const link = document.createElement('a');
                link.href = manufacturerLinks[makerName];
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = "text-indigo-600 hover:underline";
                link.textContent = makerName;
                manufacturerSpan.appendChild(link);
            } else {
                manufacturerSpan.textContent = makerName;
            }
            manufacturerSpan.className = `${manufacturerSpan.className} ${item.updatedCells && item.updatedCells.includes(columnMap.manufacturer) ? 'text-red-600 font-bold' : ''}`;
            manufacturerDiv.appendChild(manufacturerSpan);
            card.appendChild(manufacturerDiv);


            // Status
            const statusDiv = document.createElement('div');
            statusDiv.className = 'flex items-center gap-2';
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

            elements.cardContainer.appendChild(card);
        });
    }
}


document.addEventListener('DOMContentLoaded', initApp);
