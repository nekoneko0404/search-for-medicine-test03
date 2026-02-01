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
    const summaryCardContainer = document.getElementById('summaryCardContainer');
    const summaryResults = document.getElementById('summaryResults');
    const tableBody = document.getElementById('searchResultTableBody');
    const cardContainer = document.getElementById('cardContainer');

    const summaryContainer = document.getElementById('summaryContainer');
    const detailContainer = document.getElementById('detailContainer');
    const backButtonContainer = document.getElementById('backButtonContainer');
    const backBtn = document.getElementById('backBtn');

    const categoryFilterContainer = document.getElementById('categoryFilterContainer');
    const statusFilterContainer = document.getElementById('statusFilterContainer');

    const reloadDataBtn = document.getElementById('reload-data');
    const shareBtn = document.getElementById('share-btn');

    let allData = [];
    let categoryMap = new Map();
    let categoryData = []; // Added back as it's used in some places
    let filteredData = [];
    let currentView = 'summary';
    let currentIngredient = null;
    let currentSort = { key: 'category', direction: 'asc' };

    init();

    async function init() {
        // Restore state from URL before first render
        restoreStateFromUrl();
        try {
            updateProgress('初期化中...', 10);
            const catResponse = await fetch('data/category_data.json');
            categoryData = await catResponse.json();

            // Create a Map for O(1) lookups with priority A > B > C
            categoryMap = new Map();
            const priority = { 'A': 3, 'B': 2, 'C': 1 };
            categoryData.forEach(c => {
                const normIng = normalizeString(c.ingredient_name);
                const existing = categoryMap.get(normIng);
                if (!existing || (priority[c.category] || 0) > (priority[existing.category] || 0)) {
                    categoryMap.set(normIng, c);
                }
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

                // Add ingredients from category_data.json that are missing in allData
                const seenIngredients = new Set(allData.map(d => d.normalizedIngredientName));
                categoryMap.forEach((c, normIng) => {
                    if (!seenIngredients.has(normIng)) {
                        allData.push({
                            productName: '-',
                            normalizedProductName: '-',
                            ingredientName: c.ingredient_name,
                            normalizedIngredientName: normIng,
                            manufacturer: '-',
                            normalizedManufacturer: '-',
                            shipmentStatus: 'データなし',
                            reasonForLimitation: '-',
                            resolutionProspect: '-',
                            expectedDate: '-',
                            yjCode: null,
                            productCategory: c.category,
                            isBasicDrug: '-',
                            category: c.category,
                            drugClassCode: c.drug_class_code,
                            drugClassName: c.drug_class_name,
                            updateDateObj: null
                        });
                        seenIngredients.add(normIng);
                    }
                });

                const loadingIndicator = document.getElementById('loadingIndicator');
                const summaryTable = document.getElementById('summaryTable');
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                if (summaryResults) summaryResults.classList.remove('hidden');

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

                    // Add ingredients from category_data.json that are missing in allData
                    const seenIngredients = new Set(allData.map(d => d.normalizedIngredientName));
                    categoryMap.forEach((c, normIng) => {
                        if (!seenIngredients.has(normIng)) {
                            allData.push({
                                productName: '-',
                                normalizedProductName: '-',
                                ingredientName: c.ingredient_name,
                                normalizedIngredientName: normIng,
                                manufacturer: '-',
                                normalizedManufacturer: '-',
                                shipmentStatus: 'データなし',
                                reasonForLimitation: '-',
                                resolutionProspect: '-',
                                expectedDate: '-',
                                yjCode: null,
                                productCategory: c.category,
                                isBasicDrug: '-',
                                category: c.category,
                                drugClassCode: c.drug_class_code,
                                drugClassName: c.drug_class_name,
                                updateDateObj: null
                            });
                            seenIngredients.add(normIng);
                        }
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
    if (shareBtn) shareBtn.addEventListener('click', handleShare);

    function handleShare() {
        const url = generateShareUrl();
        navigator.clipboard.writeText(url).then(() => {
            showMessage('検索条件をクリップボードにコピーしました', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showMessage('コピーに失敗しました', 'error');
        });
    }

    function generateShareUrl() {
        const params = new URLSearchParams();
        if (drugNameInput.value) params.set('drug', drugNameInput.value);
        if (ingredientNameInput.value) params.set('ing', ingredientNameInput.value);

        const cats = [];
        if (catACheckbox.checked) cats.push('A');
        if (catBCheckbox.checked) cats.push('B');
        if (catCCheckbox.checked) cats.push('C');
        if (cats.length < 3) params.set('cat', cats.join(','));

        const status = [];
        if (statusNormalCheckbox.checked) status.push('normal');
        if (statusLimitedCheckbox.checked) status.push('limited');
        if (statusStoppedCheckbox.checked) status.push('stopped');
        if (status.length < 3) params.set('status', status.join(','));

        if (currentSort.key !== 'category' || currentSort.direction !== 'asc') {
            params.set('sort', currentSort.key);
            params.set('dir', currentSort.direction);
        }

        const baseUrl = window.location.origin + window.location.pathname;
        return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    }

    function restoreStateFromUrl() {
        const params = new URLSearchParams(window.location.search);

        if (params.has('drug')) drugNameInput.value = params.get('drug');
        if (params.has('ing')) ingredientNameInput.value = params.get('ing');

        if (params.has('cat')) {
            const cats = params.get('cat').split(',');
            catACheckbox.checked = cats.includes('A');
            catBCheckbox.checked = cats.includes('B');
            catCCheckbox.checked = cats.includes('C');
        }

        if (params.has('status')) {
            const status = params.get('status').split(',');
            statusNormalCheckbox.checked = status.includes('normal');
            statusLimitedCheckbox.checked = status.includes('limited');
            statusStoppedCheckbox.checked = status.includes('stopped');
        }

        if (params.has('sort')) {
            currentSort.key = params.get('sort');
            currentSort.direction = params.get('dir') || 'asc';
            updateSortIcons();
        }
    }

    const summaryTableHeaders = document.querySelectorAll('#summaryTable th[data-sort]');
    summaryTableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const key = header.getAttribute('data-sort');
            if (currentSort.key === key) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.key = key;
                currentSort.direction = 'asc';
            }
            updateSortIcons();
            renderResults();
        });
    });

    function updateSortIcons() {
        summaryTableHeaders.forEach(header => {
            const icon = header.querySelector('.sort-icon');
            if (header.getAttribute('data-sort') === currentSort.key) {
                icon.classList.remove('text-gray-400', 'group-hover:text-gray-600');
                icon.classList.add('text-indigo-600');
                icon.innerHTML = currentSort.direction === 'asc'
                    ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>'
                    : '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>';
            } else {
                icon.classList.add('text-gray-400', 'group-hover:text-gray-600');
                icon.classList.remove('text-indigo-600');
                icon.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>';
            }
        });
    }

    // Debounce helper
    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const debouncedRender = debounce(renderResults, 300);
    let isComposing = false;

    const textInputs = [drugNameInput, ingredientNameInput];
    textInputs.forEach(input => {
        input.addEventListener('compositionstart', () => {
            isComposing = true;
        });
        input.addEventListener('compositionend', () => {
            isComposing = false;
            debouncedRender();
        });
        input.addEventListener('input', () => {
            if (!isComposing) {
                debouncedRender();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                renderResults(); // Immediate execution on Enter
                input.blur();
            }
        });
    });

    const checkboxes = [catACheckbox, catBCheckbox, catCCheckbox, statusNormalCheckbox, statusLimitedCheckbox, statusStoppedCheckbox];
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', renderResults);
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

        // 検索中（非デフォルト状態）判定
        const isDefaultState = !drugQuery && !ingredientQuery &&
            catACheckbox.checked && catBCheckbox.checked && catCCheckbox.checked &&
            statusNormalCheckbox.checked && statusLimitedCheckbox.checked && statusStoppedCheckbox.checked &&
            currentView === 'summary';

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

            // "No data" items are shown regardless of status filter if they match name/category
            if (currentStatus === 'データなし') matchStatus = true;

            return matchDrug && matchIngredient && matchCategory && matchStatus;
        });

        if (currentView === 'summary') {
            renderSummaryTable(filteredData);
        } else {
            renderDetailView(filteredData.filter(item => item.normalizedIngredientName === normalizeString(currentIngredient)));
        }

        // 医薬品データが表示されている時、または詳細表示の時にヘッダーを隠す
        // 結果が0件の場合のみ表示したままにする
        const hasResults = filteredData.length > 0;
        const isDetailView = currentView === 'detail';
        document.body.classList.toggle('search-mode', hasResults || isDetailView);
    }

    function renderSummaryTable(data) {
        summaryTableBody.innerHTML = '';
        summaryCardContainer.innerHTML = '';
        if (data.length === 0) {
            summaryTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-4 text-center text-gray-500">該当するデータがありません</td></tr>';
            summaryCardContainer.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">該当するデータがありません</div>';
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

            // Helper for comparison
            const compare = (valA, valB, dir = 'asc') => {
                const direction = dir === 'asc' ? 1 : -1;
                if (typeof valA === 'string' && typeof valB === 'string') {
                    return valA.localeCompare(valB, 'ja') * direction;
                }
                if (valA < valB) return -1 * direction;
                if (valA > valB) return 1 * direction;
                return 0;
            };

            // Define hierarchy of keys for tie-breaking
            // Default hierarchy: category -> drugClassCode -> drugClassName -> ingredientName
            const hierarchy = [
                { key: 'category', getVal: (s, name) => s.category },
                { key: 'drugClassCode', getVal: (s, name) => s.drugClassCode },
                { key: 'drugClassName', getVal: (s, name) => s.drugClassName },
                { key: 'ingredientName', getVal: (s, name) => name }
            ];

            // Remove the primary key from hierarchy if it exists there, to handle it first
            const primaryKeyIndex = hierarchy.findIndex(h => h.key === currentSort.key);
            let primaryConfig = null;

            // Determine primary value getter
            let getPrimaryVal;
            switch (currentSort.key) {
                case 'category': getPrimaryVal = (s, name) => s.category; break;
                case 'drugClassCode': getPrimaryVal = (s, name) => s.drugClassCode; break;
                case 'drugClassName': getPrimaryVal = (s, name) => s.drugClassName; break;
                case 'ingredientName': getPrimaryVal = (s, name) => name; break;
                case 'normal': getPrimaryVal = (s, name) => s.normal; break;
                case 'limited': getPrimaryVal = (s, name) => s.limited; break;
                case 'stopped': getPrimaryVal = (s, name) => s.stopped; break;
                default: getPrimaryVal = (s, name) => name;
            }

            // 1. Compare by Primary Key
            const primaryDiff = compare(getPrimaryVal(statsA, a), getPrimaryVal(statsB, b), currentSort.direction);
            if (primaryDiff !== 0) return primaryDiff;

            // 2. Compare by Hierarchy (Tie-breakers) - Always ASC for stability unless otherwise desired
            for (const item of hierarchy) {
                // If this item is the primary key, we already compared it (but if it was e.g. 'normal' count, we still check hierarchy)
                // If primary key *was* one of the hierarchy keys, we should skip it to avoid redundant comparison, 
                // BUT since we just returned on primaryDiff !== 0, if we are here, they are equal.
                // So strictly speaking re-comparing is safe (returns 0), but we can skip if we want optimization.
                // However, the primary key might have been DESC, and here we enforce ASC for tie-breakers? 
                // Usually tie-breakers are ASC.
                if (item.key === currentSort.key) continue;

                const valA = item.getVal(statsA, a);
                const valB = item.getVal(statsB, b);
                const diff = compare(valA, valB, 'asc');
                if (diff !== 0) return diff;
            }

            return 0;
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

            // Render Card for Mobile
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 cursor-pointer hover:bg-gray-50 transition-colors';
            card.addEventListener('click', () => showDetailView(ingredient));

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                        カテゴリ ${stats.category}
                    </span>
                    <span class="text-xs text-gray-500 font-medium">
                        ${stats.drugClassCode}: ${stats.drugClassName}
                    </span>
                </div>
                <h3 class="text-lg font-bold text-indigo-900 mb-3">${ingredient}</h3>
                <div class="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    <div class="text-center">
                        <span class="block text-[10px] text-gray-500 mb-1">通常</span>
                        <div class="inline-flex items-center justify-center w-full py-1 rounded-full text-xs font-bold ${stats.normal > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}">
                            ${stats.normal}
                        </div>
                    </div>
                    <div class="text-center">
                        <span class="block text-[10px] text-gray-500 mb-1">限定</span>
                        <div class="inline-flex items-center justify-center w-full py-1 rounded-full text-xs font-bold ${stats.limited > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}">
                            ${stats.limited}
                        </div>
                    </div>
                    <div class="text-center">
                        <span class="block text-[10px] text-gray-500 mb-1">停止</span>
                        <div class="inline-flex items-center justify-center w-full py-1 rounded-full text-xs font-bold ${stats.stopped > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}">
                            ${stats.stopped}
                        </div>
                    </div>
                </div>
            `;
            summaryCardContainer.appendChild(card);
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
                <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${formattedDate}</td>
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
                        <span class="text-xs text-gray-700 whitespace-nowrap">${formattedDate}</span>
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
