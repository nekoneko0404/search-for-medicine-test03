let data = [];
let filteredResults = [];
const loadingIndicator = document.getElementById('loadingIndicator');
const messageBox = document.getElementById('messageBox');
let messageHideTimer = null;

const MAX_RESULTS = 500;

let sortStates = {
    productName: 'asc',
    ingredientName: 'asc',
    updateDate: 'desc'
};
let activeSortKey = 'updateDate';

function showMessage(text, type = 'info') {
    if (messageHideTimer) {
        clearTimeout(messageHideTimer);
        messageHideTimer = null;
    }
    messageBox.textContent = text;
    messageBox.classList.remove('hidden', 'bg-red-200', 'text-red-800', 'bg-green-200', 'text-green-800', 'bg-blue-200', 'text-blue-800');
    messageBox.classList.add('block');
    if (type === 'error') {
        messageBox.classList.add('bg-red-200', 'text-red-800');
    } else if (type === 'success') {
        messageBox.classList.add('bg-green-200', 'text-green-800');
    } else {
        messageBox.classList.add('bg-blue-200', 'text-blue-800');
    }
}

function hideMessage(delay) {
    if (messageHideTimer) {
        clearTimeout(messageHideTimer);
    }
    messageHideTimer = setTimeout(() => {
        messageBox.classList.add('hidden');
    }, delay);
}

function formatExpectedDate(dateValue) {
    if (typeof dateValue === 'string') {
        if (dateValue.startsWith('Date(')) {
            try {
                const parts = dateValue.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]); // 0-indexed
                    const day = parseInt(parts[2]);
                    const dateObj = new Date(Date.UTC(year, month, day));
                    const displayYear = String(dateObj.getUTCFullYear()).slice(-2);
                    const displayMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                    const displayDay = String(dateObj.getUTCDate()).padStart(2, '0');
                    return `${displayYear}-${displayMonth}-${displayDay}`;
                }
            } catch {
                return dateValue;
            }
        }
        const dateObj = new Date(dateValue + 'T00:00:00Z');
        if (!isNaN(dateObj.getTime())) {
            const displayYear = String(dateObj.getUTCFullYear()).slice(-2);
            const displayMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const displayDay = String(dateObj.getUTCDate()).padStart(2, '0');
            return `${displayYear}-${displayMonth}-${displayDay}`;
        }
        return dateValue;
    }
    return '-';
}

function formatDate(date) {
    if (!date) return '-';
    if (typeof date === 'string') {
        date = new Date(date);
    }
    if (!(date instanceof Date) || isNaN(date)) return '-';
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeString(str) {
    if (!str) return '';
    const hiraToKata = str.replace(/[ぁ-ゖ]/g, function (match) {
        const charCode = match.charCodeAt(0) + 0x60;
        return String.fromCharCode(charCode);
    });
    const normalizedStr = hiraToKata.normalize('NFKC');
    return normalizedStr.toLowerCase();
}

function renderStatusButton(status, isUpdated = false) {
    const trimmedStatus = (status || "").trim();
    const span = document.createElement('span');
    let baseClass = "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150";

    if (isUpdated) {
        baseClass += ' border-red-500 border-2';
    }
    span.className = baseClass;

    if (trimmedStatus.includes("通常出荷") || trimmedStatus.includes("通")) {
        span.classList.add('bg-indigo-500', 'text-white', 'hover:bg-indigo-600');
        span.textContent = '通常出荷';
    } else if (trimmedStatus.includes("限定出荷") || trimmedStatus.includes("出荷制限") || trimmedStatus.includes("限") || trimmedStatus.includes("制")) {
        span.classList.add('bg-yellow-400', 'text-gray-800', 'hover:bg-yellow-500');
        span.textContent = '限定出荷';
    } else if (trimmedStatus.includes("供給停止") || trimmedStatus.includes("停止") || trimmedStatus.includes("停")) {
        span.classList.add('bg-gray-700', 'text-white', 'hover:bg-gray-800');
        span.textContent = '供給停止';
    } else {
        span.classList.add('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300');
        span.textContent = trimmedStatus || "不明";
    }
    return span;
}

let isComposing = false;
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function sortResults(key) {
    if (filteredResults.length === 0) {
        showMessage("ソートするデータがありません。", 'info');
        hideMessage(2000);
        return;
    }

    let newDirection;
    if (activeSortKey === key) {
        newDirection = sortStates[key] === 'asc' ? 'desc' : 'asc';
    } else {
        newDirection = (key === 'updateDate') ? 'desc' : 'asc';
    }

    sortStates[key] = newDirection;
    activeSortKey = key;

    filteredResults.sort((a, b) => {
        let aValue, bValue;
        if (key === 'updateDate') {
            aValue = a.updateDateObj ? a.updateDateObj.getTime() : 0;
            bValue = b.updateDateObj ? b.updateDateObj.getTime() : 0;
        } else {
            aValue = normalizeString(a[key] || "");
            bValue = normalizeString(b[key] || "");
        }

        const compare = aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
        return newDirection === 'asc' ? compare : -compare;
    });

    displayResults(filteredResults);

    const sortKeyNameMap = {
        updateDate: '更新日',
        productName: '品名',
        ingredientName: '成分名'
    };
    const sortKeyName = sortKeyNameMap[key] || key;
    showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, 'success');
    hideMessage(2000);
}

function performSearch() {
    const rawSearchTerm = document.getElementById('searchInput').value.trim();
    const allTerms = rawSearchTerm.split(/[\s　]+/).filter(term => term.length > 0);

    const inclusionTerms = allTerms
        .filter(term => !term.startsWith('ー') && !term.startsWith('-'))
        .map(normalizeString);
    const exclusionTerms = allTerms
        .filter(term => term.startsWith('ー') || term.startsWith('-'))
        .map(term => normalizeString(term.substring(1)).trim())
        .filter(Boolean);

    const selectedStatuses = Array.from(document.querySelectorAll('#status-filters input[data-status]:checked')).map(cb => cb.dataset.status);
    const selectedTrends = Array.from(document.querySelectorAll('#status-filters input[data-trend]:checked')).map(cb => cb.dataset.trend);
    const selectedDays = document.querySelector('#date-filters input:checked')?.dataset.days || 'all';

    if (selectedStatuses.length === 0 && selectedTrends.length === 0) {
        document.getElementById('resultsContainer').innerHTML = '';
        showMessage('出荷状況のチェックがすべて外れています。少なくとも1つ選択してください。', 'error');
        return;
    }

    const isDefaultState = rawSearchTerm === '' && selectedDays === 'all' && selectedStatuses.length === document.querySelectorAll('#status-filters input[data-status]').length && selectedTrends.length === 0;
    if (data.length > 0 && isDefaultState) {
        document.getElementById('resultsContainer').innerHTML = '';
        showMessage('品名、成分などを入力するか、フィルターを絞り込んでください。', 'info');
        hideMessage(2000);
        return;
    }

    filteredResults = data.filter(item => {
        const productName = normalizeString(item.productName);
        const ingredientName = normalizeString(item.ingredientName);
        const makerName = normalizeString((item.standard || "") + (item.manufacturer || ""));

        const matchesInclusion = inclusionTerms.every(term => productName.includes(term) || ingredientName.includes(term) || makerName.includes(term));
        const matchesExclusion = exclusionTerms.length > 0 && exclusionTerms.some(term => productName.includes(term) || ingredientName.includes(term) || makerName.includes(term));

        return matchesInclusion && !matchesExclusion;
    });

    if (selectedStatuses.length > 0 || selectedTrends.length > 0) {
        filteredResults = filteredResults.filter(item => {
            const itemStatus = item.shipmentStatus || '';

            let statusMatch = !selectedStatuses.length;
            if (!statusMatch) {
                statusMatch = selectedStatuses.some(status => {
                    if (status === "通常出荷") {
                        return itemStatus.includes("通常出荷") || itemStatus.includes("通");
                    }
                    if (status === "出荷制限") { // "限定出荷" checkbox has data-status="出荷制限"
                        return itemStatus.includes("限定出荷") || itemStatus.includes("出荷制限") || itemStatus.includes("限") || itemStatus.includes("制") || itemStatus.includes("調整") || itemStatus.includes("出荷調整") || itemStatus.includes("供給調整");
                    }
                    if (status === "供給停止") {
                        return itemStatus.includes("供給停止") || itemStatus.includes("停止") || itemStatus.includes("停");
                    }
                    return false;
                });
            }

            const trendMatch = !selectedTrends.length || selectedTrends.includes(item.shippingStatusTrend);

            return statusMatch && trendMatch;
        });
    }

    if (selectedDays !== 'all') {
        const days = parseInt(selectedDays, 10);
        const cutoffDate = new Date();
        cutoffDate.setHours(0, 0, 0, 0);
        cutoffDate.setDate(cutoffDate.getDate() - days + 1);

        filteredResults = filteredResults.filter(item => {
            if (!item.updateDateObj) return false;
            const itemDate = new Date(item.updateDateObj);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate >= cutoffDate;
        });
    }

    activeSortKey = 'updateDate';
    sortStates.updateDate = 'desc';

    filteredResults.sort((a, b) => {
        const aValue = a.updateDateObj ? a.updateDateObj.getTime() : 0;
        const bValue = b.updateDateObj ? b.updateDateObj.getTime() : 0;
        return bValue - aValue;
    });

    displayResults(filteredResults);
}

function performRecoverySearch() {
    // Uncheck all status and trend checkboxes
    document.querySelectorAll('#status-filters input[data-status]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#status-filters input[data-trend]').forEach(cb => cb.checked = false);

    // Check the three specified boxes
    document.querySelector('#status-filters input[data-status="通常出荷"]').checked = true;
    document.querySelector('#status-filters input[data-trend="⤴️"]').checked = true;

    // Uncheck all date filter checkboxes and check the correct one
    const dateFilters = document.querySelectorAll('#date-filters input[type="checkbox"]');
    dateFilters.forEach(cb => cb.checked = false);
    document.querySelector('#date-filters input[data-days="7"]').checked = true;

    performSearch();
    showMessage(`「復旧情報」の条件で検索しました。`, 'success');
    hideMessage(2000);
}

function displayResults(results) {
    const tableContainer = document.getElementById('tableContainer');
    const resultTableBody = document.getElementById('resultTableBody');
    resultTableBody.innerHTML = ''; // Clear previous results

    if (results.length === 0) {
        tableContainer.classList.add('hidden');
        if (!messageBox.textContent.includes('失敗')) {
            showMessage('条件に一致する医薬品が見つかりませんでした。', 'info');
            hideMessage(2000);
        }
        return;
    }

    tableContainer.classList.remove('hidden');
    let message = `${results.length}件の医薬品が見つかりました。`;
    if (results.length > MAX_RESULTS) {
        message += ` ただし、表示は最新の${MAX_RESULTS}件に限定しています。`;
    }
    showMessage(message, 'success');
    hideMessage(2000);


    const limitedResults = results.slice(0, MAX_RESULTS);
    const columnMap = {
        'productName': 5,
        'ingredientName': 2,
        'shipmentStatus': 11,
        'reasonForLimitation': 13,
        'resolutionProspect': 14,
        'expectedDate': 15,
        'shipmentVolumeStatus': 16,
        'updateDateObj': 19
    };
    const escapeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    limitedResults.forEach((item, index) => {
        const newRow = resultTableBody.insertRow();
        const rowBgClass = index % 2 === 1 ? 'bg-gray-50' : 'bg-white';
        newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-50 group fade-in-up`;
        newRow.style.animationDelay = `${index * 0.05}s`;

        // 1. 品名
        const productNameCell = newRow.insertCell();
        productNameCell.className = `px-2 py-3 text-sm text-gray-900 align-top ${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}`;
        
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

        productNameCell.innerHTML = ''; // Clear content
        const flexContainer = document.createElement('div');
        flexContainer.className = 'flex flex-col';

        if (labelsContainer.hasChildNodes()) { // labelsContainerが空でなければ追加
            flexContainer.appendChild(labelsContainer);
        }

        const spanProductName = document.createElement('span');
        spanProductName.className = 'font-semibold break-words';
        spanProductName.textContent = escapeHTML(item.productName) || '-';
        flexContainer.appendChild(spanProductName);

        productNameCell.appendChild(flexContainer);

        // 2. 成分名
        const ingredientNameCell = newRow.insertCell();
        ingredientNameCell.className = `px-2 py-3 text-sm align-top ${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}`;
        ingredientNameCell.innerHTML = ''; // Clear content
        const spanIngredient = document.createElement('span');
        spanIngredient.className = 'ingredient-link cursor-pointer text-indigo-600 font-medium hover:text-indigo-800 hover:underline transition-colors break-words';
        spanIngredient.dataset.ingredient = escapeHTML(item.ingredientName || '');
        spanIngredient.textContent = escapeHTML(item.ingredientName) || '-';
        ingredientNameCell.appendChild(spanIngredient);

        // 3. 出荷状況
        const statusCell = newRow.insertCell();
        statusCell.className = 'px-2 py-3 text-sm text-gray-900 text-left align-top';
        statusCell.innerHTML = ''; // Clear content
        const flexContainer = document.createElement('div');
        flexContainer.className = 'flex items-center gap-1';

        flexContainer.appendChild(renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus)));

        if (item.shippingStatusTrend) {
            const spanTrend = document.createElement('span');
            spanTrend.className = 'text-red-500 font-bold text-lg';
            spanTrend.textContent = item.shippingStatusTrend;
            flexContainer.appendChild(spanTrend);
        }
        statusCell.appendChild(flexContainer);

        // 4. 制限理由
        const reasonCell = newRow.insertCell();
        reasonCell.className = `px-2 py-3 text-xs text-gray-600 break-words align-top ${item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation) ? 'text-red-600 font-bold' : ''}`;
        reasonCell.textContent = item.reasonForLimitation || '-';
        
        // 5. 解消見込み
        const resolutionCell = newRow.insertCell();
        resolutionCell.className = `px-2 py-3 text-xs text-gray-600 align-top ${item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect) ? 'text-red-600 font-bold' : ''}`;
        resolutionCell.textContent = item.resolutionProspect || '-';

        // 6. 見込み時期
        const expectedDateCell = newRow.insertCell();
        expectedDateCell.className = `px-2 py-3 text-xs text-gray-600 align-top ${item.updatedCells && item.updatedCells.includes(columnMap.expectedDate) ? 'text-red-600 font-bold' : ''}`;
        expectedDateCell.textContent = formatExpectedDate(item.expectedDate);

        // 7. 出荷量
        const volumeCell = newRow.insertCell();
        volumeCell.className = `px-2 py-3 text-xs text-gray-600 align-top ${item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus) ? 'text-red-600 font-bold' : ''}`;
        volumeCell.textContent = item.shipmentVolumeStatus || '-';
        
        // 8. 更新日
        const updateDateCell = newRow.insertCell();
        updateDateCell.className = `px-2 py-3 text-xs text-gray-600 whitespace-nowrap align-top ${item.updatedCells && item.updatedCells.toString().includes(columnMap.updateDateObj.toString()) ? 'text-red-600 font-bold' : ''}`;
        updateDateCell.textContent = formatDate(item.updateDateObj);
    });

    // Re-attach ingredient link listeners
    document.querySelectorAll('.ingredient-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const ingredientName = e.target.dataset.ingredient;
            if (ingredientName && ingredientName.trim()) {
                document.getElementById('searchInput').value = ingredientName.trim();
                document.getElementById('updatePeriod').value = 'all';
                performSearch();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productName = urlParams.get('productName');
    const shippingStatus = urlParams.get('shippingStatus');
    const updateDate = urlParams.get('updateDate');

    if (productName) {
        document.getElementById('searchInput').value = productName;
    }

    loadingIndicator.classList.remove('hidden');

    const result = await loadAndCacheData();

    if (result && result.data) {
        data = result.data;
        showMessage(`データ(${result.date}) ${data.length} 件を読み込みました。`, 'success');
        hideMessage(2000);

        if (shippingStatus === 'all') {
            document.querySelectorAll('#status-filters input[data-status]').forEach(cb => cb.checked = true);
            document.querySelectorAll('#status-filters input[data-trend]').forEach(cb => cb.checked = false);
        }

        if (updateDate === 'all') {
            document.querySelectorAll('#date-filters input[type="checkbox"]').forEach(cb => {
                cb.checked = cb.dataset.days === 'all';
            });
        } else {
            document.querySelector('#date-filters input[data-days="all"]').checked = false;
            document.querySelector('#date-filters input[data-days="7"]').checked = true;
        }
        performSearch();
    } else {
        if (!messageBox.textContent) {
            showMessage('データを読み込めませんでした。ファイルが空か、形式に問題がある可能性があります。', 'error');
        }
    }

    loadingIndicator.style.display = 'none';

    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearButton = document.getElementById('clearButton');
    const recoveryButton = document.getElementById('recoveryButton');
    const dateFilters = document.querySelectorAll('#date-filters input[type="checkbox"]');

    const debouncedSearch = debounce(performSearch, 500);

    searchButton.addEventListener('click', performSearch);
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        document.querySelectorAll('#status-filters input[data-status]').forEach(cb => cb.checked = true);
        document.querySelectorAll('#status-filters input[data-trend]').forEach(cb => cb.checked = false);
        dateFilters.forEach(cb => {
            cb.checked = cb.dataset.days === '7';
        });
        performSearch();
    });

    recoveryButton.addEventListener('click', performRecoverySearch);

    searchInput.addEventListener('compositionstart', () => {
        isComposing = true;
    });
    searchInput.addEventListener('compositionend', () => {
        isComposing = false;
        debouncedSearch();
    });
    searchInput.addEventListener('input', () => {
        if (!isComposing) {
            debouncedSearch();
        }
    });

    document.querySelectorAll('#status-filters input').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (document.querySelectorAll('#status-filters input:checked').length === 0) {
                document.querySelectorAll('#status-filters input[data-status]').forEach(statusCb => {
                    statusCb.checked = true;
                });
            }
            performSearch();
        });
    });

    dateFilters.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                dateFilters.forEach(other => { if (other !== e.target) other.checked = false; });
            }
            if (!Array.from(dateFilters).some(cb => cb.checked)) {
                document.querySelector('#date-filters input[data-days="all"]').checked = true;
            }
            performSearch();
        });
    });

    document.getElementById('reload-data').addEventListener('click', async () => {
        await localforage.removeItem('excelCache');
        showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
        hideMessage(2000);
        loadingIndicator.classList.remove('hidden');
        const freshResult = await loadAndCacheData();
        if (freshResult && freshResult.data) {
            data = freshResult.data;
            performSearch();
        }
        loadingIndicator.style.display = 'none';
    });
});