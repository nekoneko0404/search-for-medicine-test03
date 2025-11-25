/**
 * YJ Code Search App Main Logic
 */

import { loadAndCacheData, fetchManufacturerData, clearCacheAndReload } from '../../js/data.js';
import { normalizeString, debounce } from '../../js/utils.js';
import { showMessage, renderStatusButton, updateProgress, createDropdown } from '../../js/ui.js';

let excelData = [];
let manufacturerLinks = {};
let sortState = { key: 'yjCode', direction: 'asc' };

// DOM Elements
const elements = {
    yjCodeInput: null,
    searchBtn: null,
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
    }
};

function initElements() {
    elements.yjCodeInput = document.getElementById('yjCodeInput');
    elements.searchBtn = document.getElementById('search-btn');
    elements.resultTableBody = document.getElementById('resultTableBody');
    elements.resultCardContainer = document.getElementById('resultCardContainer');
    elements.loadingIndicator = document.getElementById('loadingIndicator');
    elements.tableContainer = document.getElementById('tableContainer');
    elements.cardContainer = document.getElementById('cardContainer');
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
            showMessage(`データ(${dataResult.date}) ${excelData.length} 件を読み込みました。`, "success");
        }
        manufacturerLinks = links || {};

        // Check URL params
        const urlParams = new URLSearchParams(window.location.search);
        const yjCodeParam = urlParams.get('yjcode');
        const modeParam = urlParams.get('mode');

        if (yjCodeParam) {
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

    if (elements.reloadDataBtn) {
        elements.reloadDataBtn.addEventListener('click', async () => {
            showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
            try {
                const result = await clearCacheAndReload(updateProgress);
                if (result && result.data) {
                    excelData = result.data;
                    showMessage(`データを再読み込みしました: ${excelData.length}件`, 'success');
                    searchYjCode();
                }
            } catch (err) {
                showMessage('キャッシュのクリアに失敗しました。', 'error');
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
}

function searchYjCode() {
    const code = elements.yjCodeInput.value;
    const normalizedCode = normalizeString(code);

    const checks = {
        class3: elements.checkboxes.class3.checked,
        class4: elements.checkboxes.class4.checked,
        ingredient: elements.checkboxes.ingredient.checked,
        form: elements.checkboxes.form.checked,
        standard: elements.checkboxes.standard.checked,
        brand: elements.checkboxes.brand.checked
    };

    const statusChecks = {
        normal: elements.statusCheckboxes.normal.checked,
        limited: elements.statusCheckboxes.limited.checked,
        stopped: elements.statusCheckboxes.stopped.checked
    };

    const isAnyFilterChecked = Object.values(checks).some(c => c);
    const isAnyStatusChecked = Object.values(statusChecks).some(c => c);

    if (isAnyFilterChecked) {
        if (!normalizedCode || normalizedCode.length !== 12 || !/^[0-9a-zA-Z]+$/.test(normalizedCode)) {
            showMessage('検索条件をチェックした際は、正しい12桁のYJコードを入力してください。', 'error');
            renderResults([]);
            return;
        }
    }

    if (!isAnyFilterChecked && !isAnyStatusChecked) {
        showMessage('検索条件と出荷状況のチェックを全て外したため、検索結果は表示されません。', 'info');
        renderResults([]);
        return;
    }

    const results = excelData.filter(item => {
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

    renderResults(results);

    if (results.length === 0) {
        showMessage('条件に一致するデータが見つかりませんでした。', 'info');
    } else {
        showMessage(`${results.length} 件見つかりました。`, 'success');
    }
}

function renderResults(data) {
    // Desktop Table
    elements.resultTableBody.innerHTML = '';
    // Mobile Cards
    // elements.resultCardContainer.innerHTML = ''; // If we use cards later

    if (data.length === 0) {
        elements.tableContainer.classList.add('hidden');
        document.body.classList.remove('search-mode');
        return;
    }

    elements.tableContainer.classList.remove('hidden');
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

    displayData.forEach((item, index) => {
        const row = elements.resultTableBody.insertRow();
        const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
        row.className = `${rowBgClass} hover:bg-indigo-50 transition-colors group`;

        // YJ Code
        const cellYj = row.insertCell(0);
        cellYj.className = "px-4 py-3 text-sm font-mono align-top";
        cellYj.setAttribute('data-label', 'YJコード');

        if (item.yjCode) {
            const link = document.createElement('a');
            // Add mode parameter to distinguish from top page navigation
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
        if (item.yjCode) {
            cellName.appendChild(createDropdown(item, data.indexOf(item)));
        } else {
            cellName.textContent = item.productName || '';
        }
        // Highlight if product name was recently updated
        if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
            cellName.classList.add('text-red-600', 'font-bold');
        }

        // Ingredient Name (New Column)
        const cellIngredient = row.insertCell(2);
        cellIngredient.className = "px-4 py-3 text-sm text-gray-600 align-top";
        cellIngredient.setAttribute('data-label', '成分名');
        cellIngredient.textContent = item.ingredientName || '';
        // Highlight if ingredient name was recently updated
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
        // Highlight if manufacturer was recently updated
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

        // Highlight if shipment status was recently updated
        if (isStatusUpdated) {
            cellStatus.classList.add('text-red-600', 'font-bold');
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);
