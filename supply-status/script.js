import { loadAndCacheData, clearCacheAndReload } from '../js/data.js';
import { normalizeString, formatDate } from '../js/utils.js';
import { renderStatusButton, showMessage, updateProgress, createDropdown } from '../js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const drugNameInput = document.getElementById('drugName');
    const ingredientNameInput = document.getElementById('ingredientName');

    const catACheckbox = document.getElementById('catA');
    const catBCheckbox = document.getElementById('catB');
    const catCCheckbox = document.getElementById('catC');

    const statusNormalCheckbox = document.getElementById('statusNormal');
    const statusLimitedCheckbox = document.getElementById('statusLimited');
    const statusStoppedCheckbox = document.getElementById('statusStopped');

    const summaryTableBody = document.getElementById('summaryTableBody');
    const tableBody = document.getElementById('searchResultTableBody');
    const cardContainer = document.getElementById('cardContainer');

    const summaryContainer = document.getElementById('summaryContainer');
    const detailContainer = document.getElementById('detailContainer');
    const backButtonContainer = document.getElementById('backButtonContainer');
    const backBtn = document.getElementById('backBtn');

    const categoryFilterContainer = document.getElementById('categoryFilterContainer');
    const statusFilterContainer = document.getElementById('statusFilterContainer');

    const reloadDataBtn = document.getElementById('reload-data');

    let allData = [];
    let categoryMap = new Map();
    let categoryData = []; // Added back as it's used in some places
    let filteredData = [];
    let currentView = 'summary';
    let currentIngredient = null;

    init();

    async function init() {
        try {
            updateProgress('初期化中...', 10);
            const catResponse = await fetch('data/category_data.json');
            categoryData = await catResponse.json();

            // Create a Map for O(1) lookups
            categoryMap = new Map();
            categoryData.forEach(c => {
                categoryMap.set(normalizeString(c.ingredient_name), c);
            });

            updateProgress('カテゴリデータ読み込み完了', 30);

            const result = await loadAndCacheData(updateProgress);
            if (result && result.data) {
                // Optimize data processing: reuse pre-normalized fields and use Map lookup
                allData = result.data.map(item => {
                    const catItem = categoryMap.get(item.normalizedIngredientName);
                    return {
                        ...item,
                        category: catItem ? catItem.category : '-',
                        drugClassCode: catItem ? catItem.drug_class_code : '-',
                        drugClassName: catItem ? catItem.drug_class_name : '-'
                    };
                });

                const loadingIndicator = document.getElementById('loadingIndicator');
                const summaryTable = document.getElementById('summaryTable');
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                if (summaryTable) summaryTable.classList.remove('hidden');

                showMessage(`データ(${result.date}) ${allData.length} 件を読み込みました。`, "success");
                renderResults();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            summaryTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-4 text-center text-red-500">データの読み込みに失敗しました</td></tr>';
            showMessage('データの読み込みに失敗しました。', 'error');
        }
    }

    if (reloadDataBtn) {
        reloadDataBtn.addEventListener('click', async () => {
            if (reloadDataBtn.disabled) return;

            reloadDataBtn.disabled = true;
            reloadDataBtn.classList.add('opacity-50', 'cursor-not-allowed');

            showMessage('最新データを取得しています...', 'info');
            try {
                const result = await clearCacheAndReload(updateProgress);
                if (result && result.data) {
                    allData = result.data.map(item => {
                        const catItem = categoryMap.get(item.normalizedIngredientName);
                        return {
                            ...item,
                            category: catItem ? catItem.category : '-',
                            drugClassCode: catItem ? catItem.drug_class_code : '-',
                            drugClassName: catItem ? catItem.drug_class_name : '-'
                        };
                    });
                    showMessage(`データを更新しました: ${allData.length}件`, 'success');
                    renderResults();
                }
            } catch (err) {
                console.error('Reload failed:', err);
                showMessage(`データの更新に失敗しました: ${err.message || '不明なエラー'}`, 'error');
            } finally {
                reloadDataBtn.disabled = false;
                reloadDataBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    const inputs = [drugNameInput, ingredientNameInput, catACheckbox, catBCheckbox, catCCheckbox, statusNormalCheckbox, statusLimitedCheckbox, statusStoppedCheckbox];
    inputs.forEach(input => {
        input.addEventListener('input', renderResults);
        input.addEventListener('change', renderResults);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                renderResults();
                input.blur();
            }
        });
    });

    backBtn.addEventListener('click', () => {
        currentView = 'summary';
        currentIngredient = null;
        showSummaryView();
        renderResults();
    });

    function renderResults() {
        const drugQuery = drugNameInput.value.trim();
        const ingredientQuery = ingredientNameInput.value.trim();

        const processQuery = (query) => {
            if (!query) return { include: [], exclude: [] };
            const terms = query.split(/[\s　]+/).filter(t => t.length > 0);
            const include = [];
            const exclude = [];
            terms.forEach(term => {
                if (term.startsWith('ー') && term.length > 1) {
                    exclude.push(normalizeString(term.substring(1)));
                } else {
                    include.push(normalizeString(term));
                }
            });
            return { include, exclude };
        };

        const drugFilter = processQuery(drugQuery);
        const ingredientFilter = processQuery(ingredientQuery);

        const selectedCategories = [];
        if (catACheckbox.checked) selectedCategories.push('A');
        if (catBCheckbox.checked) selectedCategories.push('B');
        if (catCCheckbox.checked) selectedCategories.push('C');

        const selectedStatuses = [];
        if (statusNormalCheckbox.checked) selectedStatuses.push('通常出荷');
        if (statusLimitedCheckbox.checked) selectedStatuses.push('限定出荷');
        if (statusStoppedCheckbox.checked) selectedStatuses.push('供給停止');

        filteredData = allData.filter(item => {
            const matchQuery = (text, filter) => {
                const normalizedText = text || '';
                const matchInclude = filter.include.length === 0 || filter.include.every(term => normalizedText.includes(term));
                const matchExclude = filter.exclude.length === 0 || !filter.exclude.some(term => normalizedText.includes(term));
                return matchInclude && matchExclude;
            };

            const matchDrug = matchQuery(item.normalizedProductName, drugFilter);
            const matchIngredient = matchQuery(item.normalizedIngredientName, ingredientFilter);
            const matchCategory = selectedCategories.includes(item.category);

            const currentStatus = (item.shipmentStatus || '').trim();
            let matchStatus = false;
            if (selectedStatuses.includes('通常出荷') && (currentStatus.includes('通常') || currentStatus.includes('通'))) matchStatus = true;
            if (selectedStatuses.includes('限定出荷') && (currentStatus.includes('限定') || currentStatus.includes('制限') || currentStatus.includes('限') || currentStatus.includes('制'))) matchStatus = true;
            if (selectedStatuses.includes('供給停止') && (currentStatus.includes('停止') || currentStatus.includes('停'))) matchStatus = true;

            return matchDrug && matchIngredient && matchCategory && matchStatus;
        });

        if (currentView === 'summary') {
            renderSummaryTable(filteredData);
        } else {
            renderDetailView(filteredData.filter(item => item.normalizedIngredientName === normalizeString(currentIngredient)));
        }
    }

    function renderSummaryTable(data) {
        summaryTableBody.innerHTML = '';
        if (data.length === 0) {
            summaryTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-4 text-center text-gray-500">該当するデータがありません</td></tr>';
            return;
        }

        const grouped = {};
        data.forEach(item => {
            const ingredient = item.ingredientName || '不明';
            if (!grouped[ingredient]) {
                grouped[ingredient] = {
                    category: item.category,
                    drugClassCode: item.drugClassCode,
                    drugClassName: item.drugClassName,
                    normal: 0,
                    limited: 0,
                    stopped: 0
                };
            }

            const status = (item.shipmentStatus || '').trim();
            if (status.includes('通常') || status.includes('通')) grouped[ingredient].normal++;
            else if (status.includes('限定') || status.includes('制限') || status.includes('限') || status.includes('制')) grouped[ingredient].limited++;
            else if (status.includes('停止') || status.includes('停')) grouped[ingredient].stopped++;
        });

        const sortedIngredients = Object.keys(grouped).sort((a, b) => {
            const statsA = grouped[a];
            const statsB = grouped[b];

            if (statsA.category !== statsB.category) {
                return statsA.category.localeCompare(statsB.category);
            }

            if (statsA.drugClassCode !== statsB.drugClassCode) {
                return statsA.drugClassCode.localeCompare(statsB.drugClassCode);
            }

            return a.localeCompare(b, 'ja');
        });

        sortedIngredients.forEach(ingredient => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors cursor-pointer';
            row.addEventListener('click', () => showDetailView(ingredient));

            const stats = grouped[ingredient];

            const normalBtn = renderStatusButton('通常出荷');
            normalBtn.innerHTML = `通常出荷 <span class="ml-1 font-bold">${stats.normal}</span>`;

            const limitedBtn = renderStatusButton('限定出荷');
            limitedBtn.innerHTML = `限定出荷 <span class="ml-1 font-bold">${stats.limited}</span>`;

            const stoppedBtn = renderStatusButton('供給停止');
            stoppedBtn.innerHTML = `供給停止 <span class="ml-1 font-bold">${stats.stopped}</span>`;

            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-gray-900 font-bold text-center">${stats.category}</td>
                <td class="px-4 py-3 text-sm text-gray-700 text-center">${stats.drugClassCode}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${stats.drugClassName}</td>
                <td class="px-4 py-3 text-sm text-indigo-600 font-medium hover:underline">${ingredient}</td>
                <td class="px-4 py-3 text-sm text-center"></td>
                <td class="px-4 py-3 text-sm text-center"></td>
                <td class="px-4 py-3 text-sm text-center"></td>
            `;

            row.cells[4].appendChild(normalBtn);
            row.cells[5].appendChild(limitedBtn);
            row.cells[6].appendChild(stoppedBtn);
            summaryTableBody.appendChild(row);
        });
    }

    function showDetailView(ingredient) {
        currentView = 'detail';
        currentIngredient = ingredient;
        summaryContainer.classList.add('hidden');
        detailContainer.classList.remove('hidden');
        backButtonContainer.classList.remove('hidden');

        if (categoryFilterContainer) categoryFilterContainer.classList.add('hidden');
        if (statusFilterContainer) statusFilterContainer.classList.remove('hidden');

        const ingredientData = filteredData.filter(item => item.normalizedIngredientName === normalizeString(ingredient));
        renderDetailView(ingredientData);
    }

    function showSummaryView() {
        summaryContainer.classList.remove('hidden');
        detailContainer.classList.add('hidden');
        backButtonContainer.classList.add('hidden');

        if (categoryFilterContainer) categoryFilterContainer.classList.remove('hidden');
        if (statusFilterContainer) statusFilterContainer.classList.add('hidden');
    }

    function renderDetailView(data) {
        renderTable(data);
        renderCards(data);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="px-4 py-4 text-center text-gray-500">該当するデータがありません</td></tr>';
            return;
        }

        data.slice(0, 100).forEach((item, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';

            const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
            const formattedDate = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : '';

            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-gray-900 font-bold text-center">${item.category}</td>
                <td class="px-4 py-3 text-sm"></td>
                <td class="px-4 py-3 text-sm text-gray-500">${item.ingredientName || ''}</td>
                <td class="px-4 py-3 text-sm"></td>
                <td class="px-4 py-3 text-sm text-gray-700">${item.reasonForLimitation || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${item.resolutionProspect || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${item.expectedDate || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${formattedDate}</td>
            `;

            // Drug Name Dropdown
            const drugNameCell = row.cells[1];
            if (item.yjCode) {
                drugNameCell.appendChild(createDropdown(item, `table-${index}`));
            } else {
                drugNameCell.className += " text-indigo-600 font-medium";
                drugNameCell.textContent = item.productName || '';
            }

            const statusBtn = renderStatusButton(item.shipmentStatus);
            row.cells[3].appendChild(statusBtn);

            tableBody.appendChild(row);
        });
    }

    function renderCards(data) {
        cardContainer.innerHTML = '';
        if (data.length === 0) {
            cardContainer.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">該当するデータがありません</div>';
            return;
        }

        data.slice(0, 50).forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col gap-3';

            const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
            const formattedDate = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : '';

            const statusBtn = renderStatusButton(item.shipmentStatus);

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        カテゴリ ${item.category}
                    </span>
                    <span id="status-placeholder"></span>
                </div>
                <div class="product-name-container">
                    <!-- Dropdown will be inserted here -->
                </div>
                <p class="text-sm text-gray-500">${item.ingredientName || ''}</p>
                <div class="grid grid-cols-2 gap-2 text-sm mt-2 border-t border-gray-100 pt-2">
                    <div>
                        <span class="block text-xs text-gray-500">制限理由</span>
                        <span class="text-gray-700 font-medium">${item.reasonForLimitation || '-'}</span>
                    </div>
                    <div>
                        <span class="block text-xs text-gray-500">解消見込み</span>
                        <span class="text-gray-700 font-medium">${item.resolutionProspect || '-'}</span>
                    </div>
                    <div>
                        <span class="block text-xs text-gray-500">見込み時期</span>
                        <span class="text-gray-700 font-medium">${item.expectedDate || '-'}</span>
                    </div>
                    <div>
                        <span class="block text-xs text-gray-500">更新日</span>
                        <span class="text-gray-700">${formattedDate}</span>
                    </div>
                </div>
            `;

            const nameContainer = card.querySelector('.product-name-container');
            if (item.yjCode) {
                nameContainer.appendChild(createDropdown(item, `card-${index}`));
            } else {
                const h3 = document.createElement('h3');
                h3.className = 'text-lg font-bold text-indigo-900 mb-1';
                h3.textContent = item.productName || '';
                nameContainer.appendChild(h3);
            }

            const placeholder = card.querySelector('#status-placeholder');
            placeholder.replaceWith(statusBtn);

            cardContainer.appendChild(card);
        });
    }
});
