
import './css/input.css';
import { normalizeString, debounce, formatDate, extractSearchTerm } from './js/utils.js';
import { loadAndCacheData } from './js/data.js';
import { updateProgress, showMessage, hideMessage, renderStatusButton, createDropdown } from './js/ui.js';
import './js/components/MainFooter.js';
import './js/components/MainHeader.js';

let excelData = [];
let filteredResults = [];
let sortStates = {
    status: 'asc',
    productName: 'asc',
    ingredientName: 'asc'
};
const messageBox = document.getElementById('messageBox');
const tableContainer = document.getElementById('tableContainer');
const cardContainer = document.getElementById('cardContainer');
const resultsWrapper = document.getElementById('resultsWrapper');
let isComposing = false;

function getSearchKeywords(input) {
    const terms = input.split(/\s+|　+/).filter(keyword => keyword !== '');
    const include = [];
    const exclude = [];
    terms.forEach(term => {
        if ((term.startsWith('ー') || term.startsWith('-')) && term.length > 1) {
            exclude.push(normalizeString(term.substring(1)));
        } else {
            include.push(normalizeString(term));
        }
    });
    return { include, exclude };
}

function searchData() {
    document.getElementById('infoContainer').classList.add('hidden');

    if (excelData.length === 0) {
        return;
    }



    const drugKeywords = getSearchKeywords(document.getElementById('drugName').value);
    const ingredientKeywords = getSearchKeywords(document.getElementById('ingredientName').value);
    const makerKeywords = getSearchKeywords(document.getElementById('makerName').value);

    const allCheckboxesChecked = document.getElementById('statusNormal').checked && document.getElementById('statusLimited').checked && document.getElementById('statusStopped').checked;

    const allSearchFieldsEmpty = drugKeywords.include.length === 0 && drugKeywords.exclude.length === 0 &&
        ingredientKeywords.include.length === 0 && ingredientKeywords.exclude.length === 0 &&
        makerKeywords.include.length === 0 && makerKeywords.exclude.length === 0;

    if (allSearchFieldsEmpty && allCheckboxesChecked) {
        renderTable([]);
        resultsWrapper.classList.add('hidden');
        document.body.classList.remove('search-mode');
        document.getElementById('infoContainer').classList.remove('hidden');
        return;
    } else {
        resultsWrapper.classList.remove('hidden');
        document.getElementById('infoContainer').classList.add('hidden');
    }

    const statusFilters = [];
    if (document.getElementById('statusNormal').checked) statusFilters.push("通常出荷");
    if (document.getElementById('statusLimited').checked) statusFilters.push("限定出荷");
    if (document.getElementById('statusStopped').checked) statusFilters.push("供給停止");

    filteredResults = excelData.filter(item => {
        if (!item) return false;

        const drugName = item.normalizedProductName || "";
        const ingredientName = item.normalizedIngredientName || "";
        const makerName = item.normalizedMakerName || "";

        const matchDrug = drugKeywords.include.every(keyword => drugName.includes(keyword)) &&
            (drugKeywords.exclude.length === 0 || !drugKeywords.exclude.some(keyword => drugName.includes(keyword)));

        const matchIngredient = ingredientKeywords.include.every(keyword => ingredientName.includes(keyword)) &&
            (ingredientKeywords.exclude.length === 0 || !ingredientKeywords.exclude.some(keyword => ingredientName.includes(keyword)));

        const matchMaker = makerKeywords.include.every(keyword => drugName.includes(keyword) || makerName.includes(keyword) || ingredientName.includes(keyword)) &&
            (makerKeywords.exclude.length === 0 || !makerKeywords.exclude.some(keyword => drugName.includes(keyword) || makerName.includes(keyword) || ingredientName.includes(keyword)));

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

        return matchDrug && matchIngredient && matchMaker && matchStatus;

    });



    renderTable(filteredResults);

    // Control header/footer visibility based on results
    document.body.classList.toggle('search-mode', filteredResults.length > 0);

    if (filteredResults.length === 0) {

        showMessage("検索結果が見つかりませんでした。", "info");

        hideMessage(2000);

    } else if (filteredResults.length > 500) {

        showMessage(`${filteredResults.length} 件のデータが見つかりました。\n表示は上位 500 件に制限されています。`, "success");

        hideMessage(2000);

    } else {

        showMessage(`${filteredResults.length} 件のデータが見つかりました。`, "success");

        hideMessage(2000);

    }



    sortStates.status = 'asc';

    sortStates.productName = 'asc';

    const statusIcon = document.getElementById('sort-status-icon');

    if (statusIcon) statusIcon.textContent = '↕';

    const productNameIcon = document.getElementById('sort-productName-icon');

    if (productNameIcon) productNameIcon.textContent = '↕';

    const ingredientNameIcon = document.getElementById('sort-ingredientName-icon');

    if (ingredientNameIcon) ingredientNameIcon.textContent = '↕';

}


function renderTable(data) {
    console.log("renderTable called with data length:", data.length);
    const resultBody = document.getElementById('searchResultTableBody');
    const cardContainer = document.getElementById('cardContainer');
    const tableContainer = document.getElementById('tableContainer');

    if (!resultBody || !cardContainer || !tableContainer) {
        console.error("Missing DOM elements in renderTable:", { resultBody, cardContainer, tableContainer });
        return;
    }

    resultBody.innerHTML = "";
    cardContainer.innerHTML = "";

    if (data.length === 0) {
        // Table no-data message
        const row = resultBody.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 5;
        cell.textContent = "該当データがありません";
        cell.className = "px-4 py-3 text-sm text-gray-500 text-center italic";

        // Card no-data message
        const noDataCard = document.createElement('div');
        noDataCard.className = "bg-white p-8 text-center text-gray-500 italic rounded-lg shadow";
        noDataCard.textContent = "該当データがありません";
        cardContainer.appendChild(noDataCard);

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
        // --- Table Row Creation ---
        const newRow = resultBody.insertRow();
        const rowBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
        newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-200`;

        // 1. Drug Name Cell
        const drugNameCell = newRow.insertCell(0);
        drugNameCell.setAttribute('data-label', '品名');
        drugNameCell.classList.add("px-4", "py-2", "text-sm", "text-gray-900", "relative", "align-top");
        if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
            drugNameCell.classList.add('text-red-600', 'font-bold');
        }

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

        const drugName = item.productName || "";
        const flexContainer = document.createElement('div');
        flexContainer.className = 'flex items-start';

        // 1. Append badges first
        if (labelsContainer.hasChildNodes()) {
            flexContainer.appendChild(labelsContainer);
        }

        // 2. Append name or dropdown
        if (!item.yjCode) {
            const span = document.createElement('span');
            span.className = "font-semibold truncate-lines";
            span.textContent = drugName;
            flexContainer.appendChild(span);
        } else {
            const dropdownContainer = createDropdown(item, index);
            flexContainer.appendChild(dropdownContainer);
        }
        drugNameCell.appendChild(flexContainer);

        // 2. Ingredient Name Cell
        const ingredientNameCell = newRow.insertCell(1);
        ingredientNameCell.setAttribute('data-label', '成分名');
        ingredientNameCell.classList.add("px-4", "py-2", "text-sm", "text-gray-900", "truncate-lines", "align-top");
        if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) {
            ingredientNameCell.classList.add('text-red-600', 'font-bold');
        }
        const ingredientName = item.ingredientName || "";

        if (ingredientName) {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-indigo-600 font-semibold hover:underline';
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
        statusCell.classList.add("tight-cell", "py-2", "text-gray-900", "text-left", "align-top");

        const statusContainer = document.createElement('div');
        statusContainer.className = 'flex items-center';

        const isStatusUpdated = item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus);
        if (isStatusUpdated) {
            statusCell.classList.add('text-red-600', 'font-bold');
        }

        const statusValue = (item.shipmentStatus || '').trim();
        statusContainer.appendChild(renderStatusButton(statusValue, isStatusUpdated));

        if (item.shippingStatusTrend) {
            const trendIcon = document.createElement('span');
            trendIcon.className = 'ml-1 text-red-500';
            trendIcon.textContent = item.shippingStatusTrend;
            statusContainer.appendChild(trendIcon);
        }
        statusCell.appendChild(statusContainer);

        // 4. Reason Cell
        const reasonCell = newRow.insertCell(3);
        reasonCell.textContent = item.reasonForLimitation || "";
        reasonCell.setAttribute('data-label', '制限理由');
        reasonCell.classList.add("px-4", "py-2", "text-xs", "text-gray-900", "truncate-lines", "align-top");
        if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) {
            reasonCell.classList.add('text-red-600', 'font-bold');
        }

        // 5. Volume Cell
        const volumeCell = newRow.insertCell(4);
        volumeCell.textContent = item.shipmentVolumeStatus || "";
        volumeCell.setAttribute('data-label', '出荷量状況');
        volumeCell.classList.add("px-4", "py-2", "text-xs", "text-gray-900", "align-top");
        if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) {
            volumeCell.classList.add('text-red-600', 'font-bold');
        }

        // --- Card Creation (Mobile) ---
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-3";

        // Card Header: Labels + Drug Name
        const cardHeader = document.createElement('div');
        cardHeader.className = "flex items-start gap-2";

        // Recycle logic for labels (generic/basic)
        const cardLabelsContainer = document.createElement('div');
        cardLabelsContainer.className = "flex flex-col gap-1 mt-1";
        if (isGeneric) {
            const span = document.createElement('span');
            span.className = "bg-green-200 text-green-800 px-1 rounded-sm text-[10px] font-bold whitespace-nowrap text-center";
            span.textContent = '後';
            cardLabelsContainer.appendChild(span);
        }
        if (isBasic) {
            const span = document.createElement('span');
            span.className = "bg-purple-200 text-purple-800 px-1 rounded-sm text-[10px] font-bold whitespace-nowrap text-center";
            span.textContent = '基';
            cardLabelsContainer.appendChild(span);
        }
        if (cardLabelsContainer.hasChildNodes()) {
            cardHeader.appendChild(cardLabelsContainer);
        }

        // Drug Name in Card
        const cardDrugNameWrapper = document.createElement('div');
        cardDrugNameWrapper.className = "flex-grow min-w-0"; // minimal width 0 to allow truncate
        if (!item.yjCode) {
            const span = document.createElement('span');
            span.className = "font-bold text-gray-900 break-words";
            if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
                span.classList.add('text-red-600');
            }
            span.textContent = drugName;
            cardDrugNameWrapper.appendChild(span);
        } else {
            // Use createDropdown for mobile card too (it handles mobile click properly)
            // We need a unique index for card dropdowns to avoid ID conflict? 
            // format: dropdown-content-{index} - might conflict if we assume 1:1 mapping. 
            // createDropdown internal ID is generic. Since the table dropdowns are also in DOM, ID conflict is real.
            // But ui.js uses `dropdown-content-${index}`. 
            // We should use a different index or modify ui.js? 
            // ui.js logic closes "other" dropdowns. 
            // If we use index + 10000 for cards, it should be fine.
            const cardDropdown = createDropdown(item, index + 10000);
            cardDrugNameWrapper.appendChild(cardDropdown);
        }
        cardHeader.appendChild(cardDrugNameWrapper);
        card.appendChild(cardHeader);

        // Ingredient Name
        if (ingredientName) {
            const ingDiv = document.createElement('div');
            ingDiv.className = "text-xs text-gray-600";
            const label = document.createElement('span');
            label.textContent = "成分: ";
            ingDiv.appendChild(label);

            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-indigo-600 hover:underline';
            link.textContent = ingredientName;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                handleIngredientClick(ingredientName);
            });
            ingDiv.appendChild(link);
            card.appendChild(ingDiv);
        }

        // Status Row
        const statusRow = document.createElement('div');
        statusRow.className = "flex items-center justify-between";

        const statusBtnContainer = document.createElement('div');
        statusBtnContainer.className = "flex items-center";
        statusBtnContainer.appendChild(renderStatusButton(statusValue, isStatusUpdated));
        if (item.shippingStatusTrend) {
            const trendIcon = document.createElement('span');
            trendIcon.className = 'ml-1 text-red-500';
            trendIcon.textContent = item.shippingStatusTrend;
            statusBtnContainer.appendChild(trendIcon);
        }
        statusRow.appendChild(statusBtnContainer);

        // Volume Status (Right aligned)
        if (item.shipmentVolumeStatus) {
            const volDiv = document.createElement('div');
            volDiv.className = "text-xs text-gray-500";
            volDiv.textContent = item.shipmentVolumeStatus;
            if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) {
                volDiv.classList.add('text-red-600', 'font-bold');
            }
            statusRow.appendChild(volDiv);
        }
        card.appendChild(statusRow);

        // Reason
        if (item.reasonForLimitation) {
            const reasonDiv = document.createElement('div');
            reasonDiv.className = "text-xs text-gray-700 bg-gray-50 p-2 rounded";
            if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) {
                reasonDiv.classList.add('text-red-600', 'font-bold');
            }
            reasonDiv.textContent = item.reasonForLimitation;
            card.appendChild(reasonDiv);
        }

        cardContainer.appendChild(card);
    });
}

/**
 * Restore search conditions from URL parameters
 */
function restoreFromUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const drug = urlParams.get('drug');
    const ingredient = urlParams.get('ingredient');
    const maker = urlParams.get('maker');

    // Only proceed if at least one parameter is present
    if (!drug && !ingredient && !maker && !urlParams.has('normal')) return false;

    if (drug) document.getElementById('drugName').value = drug;
    if (ingredient) document.getElementById('ingredientName').value = ingredient;
    if (maker) document.getElementById('makerName').value = maker;

    const normal = urlParams.get('normal');
    const limited = urlParams.get('limited');
    const stopped = urlParams.get('stopped');

    if (normal !== null) document.getElementById('statusNormal').checked = normal === '1';
    if (limited !== null) document.getElementById('statusLimited').checked = limited === '1';
    if (stopped !== null) document.getElementById('statusStopped').checked = stopped === '1';

    return true;
}

/**
 * Share current search conditions via URL
 */
async function shareSearchConditions() {
    const drug = document.getElementById('drugName').value.trim();
    const ingredient = document.getElementById('ingredientName').value.trim();
    const maker = document.getElementById('makerName').value.trim();

    const normal = document.getElementById('statusNormal').checked;
    const limited = document.getElementById('statusLimited').checked;
    const stopped = document.getElementById('statusStopped').checked;

    const params = new URLSearchParams();
    if (drug) params.set('drug', drug);
    if (ingredient) params.set('ingredient', ingredient);
    if (maker) params.set('maker', maker);

    params.set('normal', normal ? '1' : '0');
    params.set('limited', limited ? '1' : '0');
    params.set('stopped', stopped ? '1' : '0');

    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?${params.toString()}`;

    try {
        await navigator.clipboard.writeText(shareUrl);
        showMessage('検索条件のURLをクリップボードにコピーしました', 'success');
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        showMessage('URLのコピーに失敗しました', 'error');
    }
}

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
            sortStates[otherKey] = 'asc'; // Or your default
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





function attachSearchListeners() {
    const inputIds = ['drugName', 'ingredientName', 'makerName'];
    const debouncedSearch = debounce(searchData, 300);

    inputIds.forEach(id => {
        const element = document.getElementById(id);

        element.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        element.addEventListener('compositionend', () => {
            isComposing = false;
            debouncedSearch();
        });

        element.addEventListener('input', () => {
            if (!isComposing) {
                debouncedSearch();
            }
        });
    });

    document.getElementById('statusNormal').addEventListener('change', searchData);
    document.getElementById('statusLimited').addEventListener('change', searchData);
    document.getElementById('statusStopped').addEventListener('change', searchData);

    document.getElementById('sort-productName-button').addEventListener('click', () => sortResults('productName'));
    document.getElementById('sort-ingredientName-button').addEventListener('click', () => sortResults('ingredientName'));
    document.getElementById('sort-status-button').addEventListener('click', () => sortResults('status'));
}



function handleIngredientClick(ingredientName) {
    document.getElementById('drugName').value = '';
    document.getElementById('makerName').value = '';

    // Optional: Trim or clean up ingredient name if needed. 
    // The previous implementation had logic to truncate to 5 characters, but the user didn't explicitly ask for it back.
    // However, clicking a long ingredient name usually means exact match search is desired.

    const ingredientInput = document.getElementById('ingredientName');
    if (ingredientInput) {
        ingredientInput.value = ingredientName;
        searchData();
        // Scroll to top to ensure results are visible from the start
        window.scrollTo({ top: 0, behavior: 'instant' });
        showMessage(`成分「${ingredientName}」で検索しました。`, 'info');
    }
}

window.onload = async function () {
    document.body.classList.add('loaded');
    document.getElementById('sort-status-icon').textContent = '↕';
    document.getElementById('sort-productName-icon').textContent = '↕';
    document.getElementById('sort-ingredientName-icon').textContent = '↕';

    attachSearchListeners();
    document.getElementById('share-btn').addEventListener('click', shareSearchConditions);

    document.getElementById('reload-data').addEventListener('click', () => {
        localforage.removeItem('excelCache').then(async () => {
            showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
            const result = await loadAndCacheData(updateProgress);
            if (result && result.data) {
                excelData = result.data;
                showMessage(`データを再読み込みしました: ${excelData.length}件`, 'success');
            }
        }).catch(err => {
            console.error("Failed to clear cache", err);
            showMessage('キャッシュのクリアに失敗しました。', 'error');
        });
    });

    const result = await loadAndCacheData(updateProgress);
    if (result && result.data) {
        excelData = result.data;
        renderTable([]);
        resultsWrapper.classList.add('hidden');

        if (restoreFromUrlParams()) {
            searchData();
        } else {
            showMessage(`データ(${result.date}) ${excelData.length} 件を読み込みました。検索を開始できます。`, "success");
        }
    } else {
        showMessage('データの読み込みに失敗しました。リロードボタンで再試行してください。', "error");
    }
};
