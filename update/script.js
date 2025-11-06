
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

        function excelSerialDateToJSDate(serial) {
            if (typeof serial !== 'number' || isNaN(serial)) return null;
            const adjustedSerial = serial > 60 ? serial - 1 : serial;
            const excelEpoch = new Date(Date.UTC(1899, 11, 31));
            return new Date(excelEpoch.getTime() + adjustedSerial * 86400000);
        }

        function formatExpectedDate(dateValue) {
            if (typeof dateValue === 'number') {
                const dateObj = excelSerialDateToJSDate(dateValue);
                if (dateObj) {
                    const year = String(dateObj.getFullYear()).slice(-2);
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`; 
                }
            } else if (typeof dateValue === 'string') {
                return dateValue;
            }
            return '-';
        }

        function formatDate(date) {
            if (!date || !(date instanceof Date)) return '-';
            const year = String(date.getFullYear()).slice(-2);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function normalizeString(str) {
            if (!str) return '';
            return String(str).trim().toLowerCase().replace(/[ァ-ヶ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60));
        }

        function renderStatusButton(status, isUpdated = false) { // isUpdated引数を追加
            const trimmedStatus = (status || "").trim();
            let baseClass = "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150";
            
            if (isUpdated) { // isUpdatedがtrueの場合に赤枠を追加
                baseClass += ' border-red-500 border-2';
            }

            if (trimmedStatus.includes("通常出荷") || trimmedStatus.includes("通")) {
                return `<span class="${baseClass} bg-indigo-500 text-white hover:bg-indigo-600">通常出荷</span>`; 
            } else if (trimmedStatus.includes("限定出荷") || trimmedStatus.includes("出荷制限") || trimmedStatus.includes("限") || trimmedStatus.includes("制")) {
                return `<span class="${baseClass} bg-yellow-400 text-gray-800 hover:bg-yellow-500">限定出荷</span>`;
            } else if (trimmedStatus.includes("供給停止") || trimmedStatus.includes("停止") || trimmedStatus.includes("停")) {
                return `<span class="${baseClass} bg-gray-700 text-white hover:bg-gray-800">供給停止</span>`;
            } else {
                const escapedStatus = (trimmedStatus || "不明").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
                return `<span class="${baseClass} bg-gray-200 text-gray-800 hover:bg-gray-300">${escapedStatus}</span>`; 
            }
        }


        async function fetchAndProcessExcelData() {
            const fileId = '1ZyjtfiRjGoV9xHSA5Go4rJZr281gqfMFW883Y7s9mQU';
            const googleDriveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;

            try {
                const response = await fetch(googleDriveUrl, { cache: "no-cache" });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Fetch Error Body:', errorText);
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                const jsonDataWithStrings = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, defval: "" });
                const jsonDataWithNumbers = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, raw: true, defval: "" });

                if (jsonDataWithStrings.length < 2) return [];

                const dataRowsAsStrings = jsonDataWithStrings.slice(1);
                const dataRowsAsNumbers = jsonDataWithNumbers.slice(1);

                const mappedData = dataRowsAsStrings.map((row, index) => {
                    const numberRow = dataRowsAsNumbers[index];
                    // Determine the index of the '更新セル情報' column dynamically
                    const updatedCellsMetadataColIndex = row.length - 1;
                    let updatedCells = [];
                    try {
                        const metadata = row[updatedCellsMetadataColIndex];
                        if (metadata) {
                            const parsedMetadata = JSON.parse(metadata);
                            if (parsedMetadata && Array.isArray(parsedMetadata.updated_cols)) {
                                updatedCells = parsedMetadata.updated_cols;
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to parse updatedCells metadata:", e, row[updatedCellsMetadataColIndex]);
                    }

                    return {
                        'productName':          row[5],
                        'ingredientName':       row[2],
                        'manufacturer':         row[6],
                        'shipmentStatus':       row[11],
                        'reasonForLimitation':  row[13],
                        'resolutionProspect':   row[14],
                        'expectedDate':         numberRow[15] || row[15],
                        'shipmentVolumeStatus': row[16],
                        'yjCode':               row[4],
                        'standard':             row[3],
                        'isGeneric':            row[7],
                        'isBasicDrug':            row[8],
                        'updateDateSerial':     numberRow[19] || row[19],
                        'updatedCells':         updatedCells // Add the parsed updated cells info
                    };
                });

                if (mappedData.length > 0) {
                    const cachePayload = {
                        timestamp: new Date().getTime(),
                        data: mappedData
                    };
                    localforage.setItem('excelCache', cachePayload).catch(err => {
                        console.error("Failed to save data to localForage", err);
                    });
                }
                return mappedData;

            } catch (error) {
                console.error(`データ取得エラー: ${error}`);
                showMessage(`データの取得に失敗しました。詳細: ${error.message}`, 'error');
                return [];
            }
        }
        
        function sortResults(key) {
            if (filteredResults.length === 0) {
                showMessage("ソートするデータがありません。", 'info');
                hideMessage(2000);
                return;
            }
            const newDirection = sortStates[key] === 'asc' ? 'desc' : 'asc';
            
            for (const k in sortStates) {
                if (k !== key) {
                    sortStates[k] = 'asc';
                }
                const icon = document.getElementById(`sort-${k}-icon`);
                if (icon && k !== key) {
                    icon.textContent = '↕';
                }
            }

            sortStates[key] = newDirection;
            document.getElementById(`sort-${key}-icon`).textContent = newDirection === 'asc' ? '↑' : '↓';

            filteredResults.sort((a, b) => {
                let aValue, bValue;
                if (key === 'updateDate') {
                    aValue = a.updateDateObj ? a.updateDateObj.getTime() : 0;
                    bValue = b.updateDateObj ? b.updateDateObj.getTime() : 0;
                } else {
                    aValue = normalizeString(a[key]);
                    bValue = normalizeString(b[key]);
                }
                
                const compare = aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
                return newDirection === 'asc' ? compare : -compare;
            });

            displayResults(filteredResults);
            const sortKeyName = key === 'updateDate' ? '更新日' : (key === 'productName' ? '品名' : '成分名');
            showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, 'success');
            hideMessage(2000);
        }

        function performSearch() {
            const rawSearchTerm = document.getElementById('searchInput').value.trim();
            const searchTerms = rawSearchTerm.split(/[　 ]+/).map(normalizeString).filter(term => term.length > 0);
            
            const selectedStatuses = Array.from(document.querySelectorAll('#status-filters input:checked')).map(cb => cb.dataset.status);
            const selectedDays = document.querySelector('#date-filters input:checked')?.dataset.days || 'all';

            if (selectedStatuses.length === 0) {
                document.getElementById('resultsContainer').innerHTML = '';
                showMessage('出荷状況のチェックがすべて外れています。少なくとも1つ選択してください。', 'error');
                return;
            }

            const isDefaultState = rawSearchTerm === '' && selectedDays === 'all' && selectedStatuses.length === document.querySelectorAll('#status-filters input').length;
            if (data.length > 0 && isDefaultState) {
                document.getElementById('resultsContainer').innerHTML = '';
                showMessage('品名、成分名を入力するか、フィルターを絞り込んでください。', 'info'); 
                hideMessage(2000);
                return;
            }
            
            filteredResults = data.filter(item => {
                const productName = normalizeString(item.productName);
                const ingredientName = normalizeString(item.ingredientName);
                return searchTerms.every(term => productName.includes(term) || ingredientName.includes(term));
            });

            if (selectedStatuses.length < document.querySelectorAll('#status-filters input').length) {
                 filteredResults = filteredResults.filter(item => {
                    const itemStatus = item.shipmentStatus || '';
                    return selectedStatuses.some(status => {
                        if (itemStatus.includes(status)) return true;
                        if (status === "出荷制限" && itemStatus.includes("限定出荷")) return true;
                        return false;
                    });
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
            
            sortStates.productName = 'asc';
            sortStates.ingredientName = 'asc';
            sortStates.updateDate = 'desc';
            
            filteredResults.sort((a, b) => {
                const aValue = a.updateDateObj ? a.updateDateObj.getTime() : 0;
                const bValue = b.updateDateObj ? b.updateDateObj.getTime() : 0;
                return bValue - aValue;
            });

            displayResults(filteredResults);
        }
        
        function displayResults(results) {
            const container = document.getElementById('resultsContainer');
            container.innerHTML = '';
            loadingIndicator.classList.add('hidden');

            const escapeHTML = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            const limitedResults = results.slice(0, MAX_RESULTS); 
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
                'updateDateSerial': 19
            };

            if (limitedResults.length === 0) {
                if (!messageBox.textContent.includes('失敗')) {
                    showMessage('条件に一致する医薬品は見つかりませんでした。', 'info');
                    hideMessage(2000);
                }
                return;
            } else {
                let message = `${results.length}件の医薬品が見つかりました。`;
                if (results.length > MAX_RESULTS) {
                    message += ` ただし、表示は最新の${MAX_RESULTS}件に限定しています。`;
                }
                showMessage(message, 'success');
                hideMessage(2000);
            }
            
            const tableContainer = document.createElement('div');
            tableContainer.className = 'shadow hidden md:block';
            const table = document.createElement('table');
            table.id = 'resultTable';
            table.className = 'min-w-full divide-y divide-gray-200 table-fixed';
            
            table.innerHTML = `
                <thead class="bg-indigo-100 sticky top-0">
                    <tr>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[20%]">
                            <div class="flex items-center justify-start"><span>品名</span><button id="sort-productName-button" class="ml-1 text-indigo-600 hover:text-indigo-800 transition-colors duration-150"><span id="sort-productName-icon">↕</span></button></div>
                        </th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[20%]">
                            <div class="flex items-center justify-start"><span>成分名</span><button id="sort-ingredientName-button" class="ml-1 text-indigo-600 hover:text-indigo-800 transition-colors duration-150"><span id="sort-ingredientName-icon">↕</span></button></div>
                        </th>
                        <th class="px-1 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">出荷状況</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[15%]">制限理由</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">解消見込み</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">見込み時期</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[5%]">出荷量</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap lg:w-[10%]">
                            <div class="flex items-center justify-start"><span>更新日</span><button id="sort-updateDate-button" class="ml-1 text-indigo-600 hover:text-indigo-800 transition-colors duration-150"><span id="sort-updateDate-icon">↓</span></button></div>
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200" id="resultTableBody"></tbody>
            `;
            const tbody = table.querySelector('tbody');
            
            limitedResults.forEach((item, index) => {
                const newRow = tbody.insertRow();
                const rowBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
                newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-200`;
                newRow.innerHTML = `
                    <td class="px-2 py-2 text-sm text-gray-900 font-semibold ${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.productName) || '-'}</td>
                    <td class="px-2 py-2 text-sm text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}">
                        <span class="ingredient-link cursor-pointer text-indigo-600 hover:text-indigo-800 hover:underline transition-colors" data-ingredient="${escapeHTML(item.ingredientName || '')}">
                            ${escapeHTML(item.ingredientName) || '-'}
                        </span>
                    </td>
                    <td class="px-1 py-2 text-sm text-gray-900 text-left">${renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus))}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.reasonForLimitation) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.resolutionProspect) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.expectedDate) ? 'text-red-600 font-bold' : ''}">${escapeHTML(formatExpectedDate(item.expectedDate))}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 ${item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.shipmentVolumeStatus) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 whitespace-nowrap ${item.updatedCells && item.updatedCells.includes(columnMap.updateDateSerial) ? 'text-red-600 font-bold' : ''}">${formatDate(item.updateDateObj) || '-'}</td>
                `;
            });
            tableContainer.appendChild(table);
            container.appendChild(tableContainer);
            
            document.getElementById('sort-productName-button').addEventListener('click', () => sortResults('productName'));
            document.getElementById('sort-ingredientName-button').addEventListener('click', () => sortResults('ingredientName'));
            document.getElementById('sort-updateDate-button').addEventListener('click', () => sortResults('updateDate'));

            const cardListContainer = document.createElement('div');
            cardListContainer.className = 'block md:hidden w-full space-y-4 mt-4';
            limitedResults.forEach(item => {
                const card = document.createElement('div');
                card.className = 'bg-white rounded-lg shadow-md border border-gray-200 p-4';
                card.innerHTML = `
                    <div class="flex items-start justify-between mb-2">
                        <h3 class="text-base font-semibold text-gray-900 leading-tight pr-2 ${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.productName) || '-'}</h3>
                        <div class="flex-shrink-0">${renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus))}</div>
                    </div>
                    <div class="text-sm space-y-1 text-gray-700">
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">成分名:</strong>
                            <span class="ingredient-link cursor-pointer text-indigo-600 hover:text-indigo-800 hover:underline transition-colors ${item.updatedCells && item.updatedCells.includes(columnMap.ingredientName) ? 'text-red-600 font-bold' : ''}" data-ingredient="${escapeHTML(item.ingredientName || '')}">
                                ${escapeHTML(item.ingredientName) || '-'}
                            </span>
                        </div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">制限理由:</strong><span class="${item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.reasonForLimitation) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">解消見込み:</strong><span class="${item.updatedCells && item.updatedCells.includes(columnMap.resolutionProspect) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.resolutionProspect) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">見込み時期:</strong><span class="${item.updatedCells && item.updatedCells.includes(columnMap.expectedDate) ? 'text-red-600 font-bold' : ''}">${escapeHTML(formatExpectedDate(item.expectedDate))}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">出荷量:</strong><span class="${item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus) ? 'text-red-600 font-bold' : ''}">${escapeHTML(item.shipmentVolumeStatus) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">情報更新日:</strong><span class="${item.updatedCells && item.updatedCells.includes(columnMap.updateDateSerial) ? 'text-red-600 font-bold' : ''}">${escapeHTML(formatDate(item.updateDateObj))}</span></div>
                    </div>
                `;
                cardListContainer.appendChild(card);
            });

            
            document.querySelectorAll('.ingredient-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    const ingredientName = e.target.dataset.ingredient;
                    if (ingredientName && ingredientName.trim()) {
                        document.getElementById('searchInput').value = ingredientName.trim();
                        document.querySelectorAll('#date-filters input[type="checkbox"]').forEach(cb => {
                            cb.checked = cb.dataset.days === 'all';
                        });
                        performSearch();
                    }
                });
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const productName = urlParams.get('productName');
            const shippingStatus = urlParams.get('shippingStatus');
            const updateDate = urlParams.get('updateDate');

            if (productName) {
                document.getElementById('searchInput').value = productName;
            }

            loadingIndicator.classList.remove('hidden');
            localforage.getItem('excelCache').then(async (cachedData) => {
                let sourceData;
                const oneHour = 1 * 60 * 60 * 1000; // 1時間
                if (cachedData && (new Date().getTime() - cachedData.timestamp < oneHour)) {
                    console.log("Found recent cached data in localForage.");
                    sourceData = cachedData.data;
                    showMessage("キャッシュからデータを読み込みました。", 'success');
                    hideMessage(3000);
                } else {
                    if(cachedData) {
                        console.log("Cached data is old. Fetching from network.");
                    } else {
                        console.log("No cached data found. Fetching from network.");
                    }
                    sourceData = await fetchAndProcessExcelData();
                }

                if (sourceData && sourceData.length > 0) {
                    data = sourceData.map(item => {
                        item.updateDateObj = excelSerialDateToJSDate(item.updateDateSerial);
                        return item;
                    });
                    
                    if (shippingStatus === 'all') {
                        document.querySelectorAll('#status-filters input').forEach(cb => cb.checked = true);
                    }
            
                    if (updateDate === 'all') {
                        document.querySelectorAll('#date-filters input[type="checkbox"]').forEach(cb => {
                            cb.checked = cb.dataset.days === 'all';
                        });
                    } else {
                        document.querySelector('#date-filters input[data-days="all"]').checked = false;
                        document.querySelector('#date-filters input[data-days="3"]').checked = true;
                    }
                    performSearch();
                } else {
                    if (!messageBox.textContent) {
                        showMessage('データを読み込めませんでした。ファイルが空か、形式に問題がある可能性があります。', 'error');
                    }
                }
            }).catch(async (err) => {
                console.error("Error reading from localForage, fetching from network.", err);
                let sourceData = await fetchAndProcessExcelData();
                if (sourceData && sourceData.length > 0) {
                    data = sourceData.map(item => {
                        item.updateDateObj = excelSerialDateToJSDate(item.updateDateSerial);
                        return item;
                    });
                    
                    if (shippingStatus === 'all') {
                        document.querySelectorAll('#status-filters input').forEach(cb => cb.checked = true);
                    }
            
                    if (updateDate === 'all') {
                        document.querySelectorAll('#date-filters input[type="checkbox"]').forEach(cb => {
                            cb.checked = cb.dataset.days === 'all';
                        });
                    } else {
                        document.querySelector('#date-filters input[data-days="all"]').checked = false;
                        document.querySelector('#date-filters input[data-days="3"]').checked = true;
                    }
                    performSearch();
                }
            }).finally(() => {
                loadingIndicator.style.display = 'none';
            });

            const searchInput = document.getElementById('searchInput');
            const searchButton = document.getElementById('searchButton');
            const clearButton = document.getElementById('clearButton');
            
            searchButton.addEventListener('click', performSearch);
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                document.querySelectorAll('#status-filters input').forEach(cb => cb.checked = true);
                dateFilters.forEach(cb => {
                    cb.checked = cb.dataset.days === '3';
                });
                performSearch();
            });

            searchInput.addEventListener('compositionend', performSearch);
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') performSearch();
            });

            document.querySelectorAll('#status-filters input').forEach(cb => {
                cb.addEventListener('change', performSearch);
            });
            
            const dateFilters = document.querySelectorAll('#date-filters input[type="checkbox"]');
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

            document.getElementById('reload-data').addEventListener('click', () => {
                localforage.removeItem('excelCache').then(() => {
                    showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
                    hideMessage(2000);
                    loadingIndicator.classList.remove('hidden');
                    fetchAndProcessExcelData().then(sourceData => {
                        if (sourceData && sourceData.length > 0) {
                            data = sourceData.map(item => {
                                item.updateDateObj = excelSerialDateToJSDate(item.updateDateSerial);
                                return item;
                            });
                            performSearch();
                        }
                    }).finally(() => {
                        loadingIndicator.style.display = 'none';
                    });
                }).catch(err => {
                    console.error("Failed to clear cache", err);
                    showMessage('キャッシュのクリアに失敗しました。', 'error');
                });
            });
        });
    
