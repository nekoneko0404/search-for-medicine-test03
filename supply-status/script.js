import { loadAndCacheData, clearCacheAndReload } from '../js/data.js';
import { normalizeString, formatDate } from '../js/utils.js';
import { renderStatusButton, showMessage, updateProgress, createDropdown } from '../js/ui.js';
import '../js/components/MainHeader.js';
import '../js/components/MainFooter.js';

document.addEventListener('DOMContentLoaded', () => {
    const drugNameInput = document.getElementById('drugName');
    const ingredientNameInput = document.getElementById('ingredientName');

    const catACheckbox = document.getElementById('catA');
    const catBCheckbox = document.getElementById('catB');
    const catCCheckbox = document.getElementById('catC');

    const routeInternalCheckbox = document.getElementById('routeInternal');
    const routeInjectableCheckbox = document.getElementById('routeInjectable');
    const routeExternalCheckbox = document.getElementById('routeExternal');

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
    const routeFilterContainer = document.getElementById('routeFilterContainer');

    const reloadDataBtn = document.getElementById('reload-data');
    const shareBtn = document.getElementById('share-btn');

    let allData = [];
    let categoryMap = new Map();
    let categoryData = []; // Added back as it's used in some places
    let filteredData = [];
    let currentView = 'summary';
    let currentIngredient = null;
    let currentSort = { key: 'category', direction: 'asc' };

    function getRouteFromYJCode(yjCode) {
        if (!yjCode) return null;
        // YJコードの5桁目が区分を示す（0-3:内, 4-6:注, 7-9:外）
        const yjStr = String(yjCode);
        if (yjStr.length < 5) return null;
        const digit = parseInt(yjStr.charAt(4));
        if (isNaN(digit)) return null;
        if (digit >= 0 && digit <= 3) return '内';
        if (digit >= 4 && digit <= 6) return '注';
        if (digit >= 7 && digit <= 9) return '外';
        return null;
    }

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
            categoryData.forEach(c => {
                const normIng = normalizeString(c.ingredient_name);
                const key = `${normIng}|${c.route}`;
                categoryMap.set(key, c);
            });

            updateProgress('カテゴリデータ読み込み完了', 30);

            const result = await loadAndCacheData(updateProgress);
            if (result && result.data) {
                // Optimize data processing: reuse pre-normalized fields and use Map lookup
                allData = result.data.map(item => {
                    const route = getRouteFromYJCode(item.yjCode);
                    const catItem = route ? categoryMap.get(item.normalizedIngredientName + '|' + route) : null;
                    return {
                        ...item,
                        category: catItem ? catItem.category : '-',
                        route: route || (catItem ? catItem.route : '-'),
                        drugClassCode: catItem ? catItem.drug_class_code : '-',
                        drugClassName: catItem ? catItem.drug_class_name : '-'
                    };
                });

                // Add ingredients from category_data.json that are missing in allData
                const seenKeys = new Set(allData.map(d => `${d.normalizedIngredientName}|${d.route}`));
                categoryMap.forEach((c, key) => {
                    if (!seenKeys.has(key)) {
                        allData.push({
                            productName: '-',
                            normalizedProductName: '-',
                            ingredientName: c.ingredient_name,
                            normalizedIngredientName: normalizeString(c.ingredient_name),
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
                            route: c.route,
                            drugClassCode: c.drug_class_code,
                            drugClassName: c.drug_class_name,
                            updateDateObj: null
                        });
                        seenKeys.add(key);
                    }
                });

                const loadingIndicator = document.getElementById('loadingIndicator');
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                if (summaryResults) summaryResults.classList.remove('hidden');

                showMessage(`データ(${result.date}) ${allData.length} 件を読み込みました。`, "success");
                renderResults();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            summaryTableBody.innerHTML = '<tr><td colspan="8" class="px-4 py-4 text-center text-red-500">データの読み込みに失敗しました</td></tr>';
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
                        const route = getRouteFromYJCode(item.yjCode);
                        const catItem = route ? categoryMap.get(item.normalizedIngredientName + '|' + route) : null;
                        return {
                            ...item,
                            category: catItem ? catItem.category : '-',
                            route: route || (catItem ? catItem.route : '-'),
                            drugClassCode: catItem ? catItem.drug_class_code : '-',
                            drugClassName: catItem ? catItem.drug_class_name : '-'
                        };
                    });

                    // Add ingredients from category_data.json that are missing in allData
                    const seenKeys = new Set(allData.map(d => `${d.normalizedIngredientName}|${d.route}`));
                    categoryMap.forEach((c, key) => {
                        if (!seenKeys.has(key)) {
                            allData.push({
                                productName: '-',
                                normalizedProductName: '-',
                                ingredientName: c.ingredient_name,
                                normalizedIngredientName: normalizeString(c.ingredient_name),
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
                                route: c.route,
                                drugClassCode: c.drug_class_code,
                                drugClassName: c.drug_class_name,
                                updateDateObj: null
                            });
                            seenKeys.add(key);
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

    const inputs = [drugNameInput, ingredientNameInput, catACheckbox, catBCheckbox, catCCheckbox,
        routeInternalCheckbox, routeInjectableCheckbox, routeExternalCheckbox,
        statusNormalCheckbox, statusLimitedCheckbox, statusStoppedCheckbox];
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

        const routes = [];
        if (routeInternalCheckbox.checked) routes.push('internal');
        if (routeInjectableCheckbox.checked) routes.push('injectable');
        if (routeExternalCheckbox.checked) routes.push('external');
        if (routes.length < 3) params.set('route', routes.join(','));

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

        if (params.has('route')) {
            const routes = params.get('route').split(',');
            routeInternalCheckbox.checked = routes.includes('internal');
            routeInjectableCheckbox.checked = routes.includes('injectable');
            routeExternalCheckbox.checked = routes.includes('external');
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

    const checkboxes = [
        catACheckbox, catBCheckbox, catCCheckbox,
        routeInternalCheckbox, routeInjectableCheckbox, routeExternalCheckbox,
        statusNormalCheckbox, statusLimitedCheckbox, statusStoppedCheckbox
    ];
    checkboxes.forEach(checkbox => {
        if (checkbox) checkbox.addEventListener('change', renderResults);
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
            routeInternalCheckbox.checked && routeInjectableCheckbox.checked && routeExternalCheckbox.checked &&
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

        const selectedCats = [];
        if (catACheckbox.checked) selectedCats.push('A');
        if (catBCheckbox.checked) selectedCats.push('B');
        if (catCCheckbox.checked) selectedCats.push('C');

        const selectedRoutes = [];
        if (routeInternalCheckbox.checked) selectedRoutes.push('内');
        if (routeInjectableCheckbox.checked) selectedRoutes.push('注');
        if (routeExternalCheckbox.checked) selectedRoutes.push('外');

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
            const matchCat = selectedCats.includes(item.category);
            const matchRoute = selectedRoutes.includes(item.route);

            const currentStatus = (item.shipmentStatus || '').trim();
            let matchStatus = false;
            if (selectedStatuses.includes('通常出荷') && (currentStatus.includes('通常') || currentStatus.includes('通'))) matchStatus = true;
            if (selectedStatuses.includes('限定出荷') && (currentStatus.includes('限定') || currentStatus.includes('制限') || currentStatus.includes('限') || currentStatus.includes('制'))) matchStatus = true;
            if (selectedStatuses.includes('供給停止') && (currentStatus.includes('停止') || currentStatus.includes('停'))) matchStatus = true;

            // "No data" items are shown regardless of status filter if they match name/category
            if (currentStatus === 'データなし') matchStatus = true;

            return matchDrug && matchIngredient && matchCat && matchRoute && matchStatus;
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
            summaryTableBody.innerHTML = '<tr><td colspan="8" class="px-4 py-4 text-center text-gray-500">該当するデータがありません</td></tr>';
            summaryCardContainer.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">該当するデータがありません</div>';
            return;
        }

        const grouped = {};
        data.forEach(item => {
            const ingredient = item.ingredientName || '不明';
            const route = item.route || '-';
            const groupKey = `${ingredient}|${route}`;

            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    ingredientName: ingredient,
                    route: route,
                    category: item.category,
                    drugClassCode: item.drugClassCode,
                    drugClassName: item.drugClassName, // Fixed undefined bug
                    counts: { normal: 0, limited: 0, stopped: 0 }
                };
            }

            // Count statuses
            const status = (item.shipmentStatus || '').trim();
            if (status.includes('通常') || status.includes('通')) {
                grouped[groupKey].counts.normal++;
            } else if (status.includes('限定') || status.includes('制限') || status.includes('限') || status.includes('制')) {
                grouped[groupKey].counts.limited++;
            } else if (status.includes('停止') || status.includes('停')) {
                grouped[groupKey].counts.stopped++;
            }
        });

        const sortedIngredients = Object.keys(grouped).sort((a, b) => {
            const statsA = grouped[a];
            const statsB = grouped[b];

            // Priority maps for custom sorting
            const categoryPriority = { 'A': 1, 'B': 2, 'C': 3 };
            const routePriority = { '内': 1, '注': 2, '外': 3 };

            // Helper for comparison
            const compare = (valA, valB, key, dir = 'asc') => {
                const direction = dir === 'asc' ? 1 : -1;

                // Use priority maps if applicable
                if (key === 'category') {
                    const pA = categoryPriority[valA] || 99;
                    const pB = categoryPriority[valB] || 99;
                    if (pA !== pB) return (pA - pB) * direction;
                } else if (key === 'route') {
                    const pA = routePriority[valA] || 99;
                    const pB = routePriority[valB] || 99;
                    if (pA !== pB) return (pA - pB) * direction;
                }

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return valA.localeCompare(valB, 'ja') * direction;
                }
                if (valA < valB) return -1 * direction;
                if (valA > valB) return 1 * direction;
                return 0;
            };

            // Define hierarchy of keys for tie-breaking
            const hierarchy = [
                { key: 'category', getVal: (s) => s.category },
                { key: 'route', getVal: (s) => s.route },
                { key: 'drugClassCode', getVal: (s) => s.drugClassCode },
                { key: 'drugClassName', getVal: (s) => s.drugClassName },
                { key: 'ingredientName', getVal: (s) => s.ingredientName },
                { key: 'statusNormal', getVal: (s) => s.counts.normal },
                { key: 'statusLimited', getVal: (s) => s.counts.limited },
                { key: 'statusStopped', getVal: (s) => s.counts.stopped }
            ];

            // 1. Compare by Primary Key
            let getPrimaryVal;
            switch (currentSort.key) {
                case 'category': getPrimaryVal = (s) => s.category; break;
                case 'route': getPrimaryVal = (s) => s.route; break;
                case 'drugClassCode': getPrimaryVal = (s) => s.drugClassCode; break;
                case 'drugClassName': getPrimaryVal = (s) => s.drugClassName; break;
                case 'ingredientName': getPrimaryVal = (s) => s.ingredientName; break;
                case 'statusNormal': getPrimaryVal = (s) => s.counts.normal; break;
                case 'statusLimited': getPrimaryVal = (s) => s.counts.limited; break;
                case 'statusStopped': getPrimaryVal = (s) => s.counts.stopped; break;
                default: getPrimaryVal = (s) => s.ingredientName;
            }

            const primaryDiff = compare(getPrimaryVal(statsA), getPrimaryVal(statsB), currentSort.key, currentSort.direction);
            if (primaryDiff !== 0) return primaryDiff;

            // 2. Compare by Hierarchy (Tie-breakers) - Always ASC for stability
            for (const item of hierarchy) {
                if (item.key === currentSort.key) continue;

                const valA = item.getVal(statsA);
                const valB = item.getVal(statsB);
                const diff = compare(valA, valB, item.key, 'asc');
                if (diff !== 0) return diff;
            }

            return 0;
        });

        sortedIngredients.forEach(groupKey => {
            const stats = grouped[groupKey];
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors cursor-pointer';
            row.addEventListener('click', () => showDetailView(stats.ingredientName, stats.route));


            row.innerHTML = `
                <td class="px-4 py-2 text-sm text-gray-900 font-bold text-center">${stats.category}</td>
                <td class="px-4 py-2 text-sm text-gray-900 font-bold text-center">${stats.route || '-'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 text-center">${stats.drugClassCode}</td>
                <td class="px-4 py-2 text-sm text-gray-700 max-w-[150px] truncate" title="${stats.drugClassName}">${stats.drugClassName}</td>
                <td class="px-4 py-2 text-sm text-indigo-600 font-medium hover:underline">${stats.ingredientName}</td>
                 <td class="px-4 py-2 text-sm text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        通常出荷 ${stats.counts.normal}
                    </span>
                </td>
                <td class="px-4 py-2 text-sm text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        限定出荷 ${stats.counts.limited}
                    </span>
                </td>
                <td class="px-4 py-2 text-sm text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        供給停止 ${stats.counts.stopped}
                    </span>
                </td>
            `;

            summaryTableBody.appendChild(row);

            // Render Card for Mobile
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 cursor-pointer hover:bg-gray-50 transition-colors';
            card.addEventListener('click', () => showDetailView(stats.ingredientName, stats.route));

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                        カテゴリ ${stats.category} / ${stats.route}
                    </span>
                    <span class="text-xs text-gray-500 font-medium truncate max-w-[150px]">
                        ${stats.drugClassCode}: ${stats.drugClassName}
                    </span>
                </div>
                <h3 class="text-lg font-bold text-indigo-900 mb-3">${stats.ingredientName}</h3>
                <div class="grid grid-cols-3 gap-2 mt-2">
                    <div class="text-center p-2 bg-blue-50 rounded-lg">
                        <span class="block text-xs text-blue-600 font-bold mb-1">通常</span>
                        <span class="text-lg font-bold text-blue-800">${stats.counts.normal}</span>
                    </div>
                    <div class="text-center p-2 bg-yellow-50 rounded-lg">
                        <span class="block text-xs text-yellow-600 font-bold mb-1">限定</span>
                        <span class="text-lg font-bold text-yellow-800">${stats.counts.limited}</span>
                    </div>
                    <div class="text-center p-2 bg-red-50 rounded-lg">
                        <span class="block text-xs text-red-600 font-bold mb-1">停止</span>
                        <span class="text-lg font-bold text-red-800">${stats.counts.stopped}</span>
                    </div>
                </div>
            `;
            summaryCardContainer.appendChild(card);
        });
    }

    function showDetailView(ingredient, route) {
        currentView = 'detail';
        currentIngredient = ingredient;
        const normalizedIng = normalizeString(ingredient);

        summaryContainer.classList.add('hidden');
        detailContainer.classList.remove('hidden');
        backButtonContainer.classList.remove('hidden');

        if (categoryFilterContainer) categoryFilterContainer.classList.add('hidden');
        if (routeFilterContainer) routeFilterContainer.classList.add('hidden');
        if (statusFilterContainer) statusFilterContainer.classList.remove('hidden');

        // Toggle grid columns
        const filterGrid = document.getElementById('filterGrid');
        if (filterGrid) {
            filterGrid.classList.remove('md:grid-cols-3');
        }

        // Filter allData for this ingredient AND route
        const details = allData.filter(item => {
            return item.normalizedIngredientName === normalizedIng && item.route === route;
        });

        renderDetailView(details);
        window.scrollTo(0, 0);
    }

    function showSummaryView() {
        summaryContainer.classList.remove('hidden');
        detailContainer.classList.add('hidden');
        backButtonContainer.classList.add('hidden');

        if (categoryFilterContainer) categoryFilterContainer.classList.remove('hidden');
        if (routeFilterContainer) routeFilterContainer.classList.remove('hidden');
        if (statusFilterContainer) statusFilterContainer.classList.add('hidden');

        // Restore grid columns
        const filterGrid = document.getElementById('filterGrid');
        if (filterGrid) {
            filterGrid.classList.add('md:grid-cols-3');
        }
    }


    function renderDetailView(data) {
        renderTable(data);
        renderCards(data);
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" class="px-4 py-4 text-center text-gray-500">該当するデータがありません</td></tr>';
            return;
        }

        data.slice(0, 100).forEach((item, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors';

            const dateStr = item.updateDateObj ? formatDate(item.updateDateObj) : '';
            const formattedDate = dateStr ? `${dateStr.substring(2, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}` : '';

            row.innerHTML = `
                <td class="px-4 py-2 text-sm text-gray-900 font-bold text-center align-top">${item.category}</td>
                <td class="px-4 py-2 text-sm text-gray-900 font-bold text-center align-top">${item.route || '-'}</td>
                <td class="px-4 py-2 text-sm align-top"></td>
                <td class="px-4 py-2 text-sm text-gray-500 align-top">${item.ingredientName || ''}</td>
                <td class="px-4 py-2 text-sm align-top"></td>
                <td class="px-4 py-2 text-sm text-gray-700 align-top">${item.reasonForLimitation || '-'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 align-top">${item.resolutionProspect || '-'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 align-top">${item.expectedDate || '-'}</td>
                <td class="px-4 py-2 text-xs text-gray-500 whitespace-nowrap align-top">${formattedDate}</td>
            `;

            // Drug Name 
            const drugNameCell = row.cells[2];

            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'vertical-labels-container';

            const isGeneric = item.productCategory && normalizeString(item.productCategory).includes('後発品');
            const isBasic = item.isBasicDrug && normalizeString(item.isBasicDrug).includes('基礎的医薬品');

            if (isGeneric) {
                const span = document.createElement('span');
                span.className = "medicine-badge badge-generic";
                span.textContent = '後';
                labelsContainer.appendChild(span);
            }
            if (isBasic) {
                const span = document.createElement('span');
                span.className = "medicine-badge badge-basic";
                span.textContent = '基';
                labelsContainer.appendChild(span);
            }

            const flexContainer = document.createElement('div');
            flexContainer.className = 'flex items-start';

            if (labelsContainer.hasChildNodes()) {
                flexContainer.appendChild(labelsContainer);
            }

            if (item.yjCode) {
                flexContainer.appendChild(createDropdown(item, `table-${index}`));
            } else {
                const productNameSpan = document.createElement('span');
                productNameSpan.className = "text-indigo-600 font-medium";
                productNameSpan.textContent = item.productName || '';
                flexContainer.appendChild(productNameSpan);
            }
            drugNameCell.appendChild(flexContainer);

            const statusBtn = renderStatusButton(item.shipmentStatus);
            row.cells[4].appendChild(statusBtn);

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

            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'vertical-labels-container';

            const isGeneric = item.productCategory && normalizeString(item.productCategory).includes('後発品');
            const isBasic = item.isBasicDrug && normalizeString(item.isBasicDrug).includes('基礎的医薬品');

            if (isGeneric) {
                const span = document.createElement('span');
                span.className = "medicine-badge badge-generic";
                span.textContent = '後';
                labelsContainer.appendChild(span);
            }
            if (isBasic) {
                const span = document.createElement('span');
                span.className = "medicine-badge badge-basic";
                span.textContent = '基';
                labelsContainer.appendChild(span);
            }

            const flexContainer = document.createElement('div');
            flexContainer.className = 'flex items-start';

            if (labelsContainer.hasChildNodes()) {
                flexContainer.appendChild(labelsContainer);
            }

            if (item.yjCode) {
                flexContainer.appendChild(createDropdown(item, `card-${index}`));
            } else {
                const h3 = document.createElement('h3');
                h3.className = 'text-lg font-bold text-indigo-900 mb-1';
                h3.textContent = item.productName || '';
                flexContainer.appendChild(h3);
            }
            nameContainer.appendChild(flexContainer);

            const placeholder = card.querySelector('#status-placeholder');
            placeholder.replaceWith(statusBtn);

            cardContainer.appendChild(card);
        });
    }
});
