
        let data = [];
        let filteredResults = [];
        const loadingIndicator = document.getElementById('loadingIndicator');
        const messageBox = document.getElementById('messageBox');
        let messageTimer = null;
        
        const MAX_RESULTS = 500;

        let sortStates = {
            productName: 'asc',
            ingredientName: 'asc',
            updateDate: 'desc'
        };

        function showMessage(message, isError = false) {
            if (messageTimer) clearTimeout(messageTimer);
            
            messageBox.textContent = message;
            messageBox.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700', 'bg-yellow-100', 'text-yellow-700');
            
            let bgColor, textColor;
            let isTransient = true;

            if (isError) {
                bgColor = 'bg-red-100';
                textColor = 'text-red-700';
                isTransient = false;
            } else if (message.includes('件の医薬品が見つかりました') || message.includes('キャッシュから')) {
                bgColor = 'bg-green-100';
                textColor = 'text-green-700';
            } else {
                bgColor = 'bg-yellow-100';
                textColor = 'text-yellow-700';
            }
            
            messageBox.classList.add(bgColor, textColor);

            if (isTransient) {
                messageTimer = setTimeout(hideMessage, 2000);
            }
        }

        function hideMessage() {
            messageBox.classList.add('hidden');
            messageBox.textContent = '';
            if (messageTimer) {
                clearTimeout(messageTimer);
                messageTimer = null;
            }
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

        function renderStatusButton(status) {
            const trimmedStatus = (status || "").trim();
            let baseClass = "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150";
            
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
            const fileId = '1yhDbdCbnmDoXKRSj_CuLgKkIH2ohK1LD';
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
                        'isBasicDrug':          row[8],
                        'updateDateSerial':     numberRow[12] || row[12]
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
                showMessage(`データの取得に失敗しました。詳細: ${error.message}`, true);
                return [];
            }
        }
        
        function sortResults(key) {
            if (filteredResults.length === 0) {
                showMessage("ソートするデータがありません。", false);
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
            showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, false);
        }

        function performSearch() {
            hideMessage(); 
            
            const rawSearchTerm = document.getElementById('searchInput').value.trim();
            const searchTerms = rawSearchTerm.split(/[　 ]+/).map(normalizeString).filter(term => term.length > 0);
            
            const selectedStatuses = Array.from(document.querySelectorAll('#status-filters input:checked')).map(cb => cb.dataset.status);
            const selectedDays = document.querySelector('#date-filters input:checked')?.dataset.days || 'all';

            if (selectedStatuses.length === 0) {
                document.getElementById('resultsContainer').innerHTML = '';
                showMessage('出荷状況のチェックがすべて外れています。少なくとも1つ選択してください。', true);
                return;
            }

            const isDefaultState = rawSearchTerm === '' && selectedDays === 'all' && selectedStatuses.length === document.querySelectorAll('#status-filters input').length;
            if (data.length > 0 && isDefaultState) {
                document.getElementById('resultsContainer').innerHTML = '';
                showMessage('品名、成分名を入力するか、フィルターを絞り込んでください。'); 
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

            if (limitedResults.length === 0) {
                if (!messageBox.textContent.includes('失敗')) {
                    showMessage('条件に一致する医薬品は見つかりませんでした。');
                }
                return;
            } else {
                let message = `${results.length}件の医薬品が見つかりました。`;
                if (results.length > MAX_RESULTS) {
                    message += ` ただし、表示は最新の${MAX_RESULTS}件に限定しています。`;
                }
                showMessage(message, false);
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
                const row = tbody.insertRow();
                const rowBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
                row.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-200`;
                row.innerHTML = `
                    <td class="px-2 py-2 text-sm text-gray-900 font-semibold">${escapeHTML(item.productName) || '-'}</td>
                    <td class="px-2 py-2 text-sm text-gray-900">
                        <span class="ingredient-link cursor-pointer text-indigo-600 hover:text-indigo-800 hover:underline transition-colors" data-ingredient="${escapeHTML(item.ingredientName || '')}">
                            ${escapeHTML(item.ingredientName) || '-'}
                        </span>
                    </td>
                    <td class="px-1 py-2 text-sm text-gray-900 text-left">${renderStatusButton(item.shipmentStatus)}</td>
                    <td class="px-2 py-2 text-xs text-gray-900">${escapeHTML(item.reasonForLimitation) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900">${escapeHTML(item.resolutionProspect) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900">${escapeHTML(formatExpectedDate(item.expectedDate))}</td>
                    <td class="px-2 py-2 text-xs text-gray-900">${escapeHTML(item.shipmentVolumeStatus) || '-'}</td>
                    <td class="px-2 py-2 text-xs text-gray-900 whitespace-nowrap">${formatDate(item.updateDateObj) || '-'}</td>
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
                        <h3 class="text-base font-semibold text-gray-900 leading-tight pr-2">${escapeHTML(item.productName) || '-'}</h3>
                        <div class="flex-shrink-0">${renderStatusButton(item.shipmentStatus)}</div>
                    </div>
                    <div class="text-sm space-y-1 text-gray-700">
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">成分名:</strong>
                            <span class="ingredient-link cursor-pointer text-indigo-600 hover:text-indigo-800 hover:underline transition-colors" data-ingredient="${escapeHTML(item.ingredientName || '')}">
                                ${escapeHTML(item.ingredientName) || '-'}
                            </span>
                        </div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">制限理由:</strong><span>${escapeHTML(item.reasonForLimitation) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">解消見込み:</strong><span>${escapeHTML(item.resolutionProspect) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">見込み時期:</strong><span>${escapeHTML(formatExpectedDate(item.expectedDate))}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">出荷量:</strong><span>${escapeHTML(item.shipmentVolumeStatus) || '-'}</span></div>
                        <div class="flex items-center"><strong class="w-24 font-medium text-gray-600">情報更新日:</strong><span>${escapeHTML(formatDate(item.updateDateObj))}</span></div>
                    </div>
                `;
                cardListContainer.appendChild(card);
            });
            container.appendChild(cardListContainer);
            
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
            loadingIndicator.classList.remove('hidden');
            localforage.getItem('excelCache').then(async (cachedData) => {
                let sourceData;
                if (cachedData) {
                    console.log("Found cached data in localForage.");
                    sourceData = cachedData.data;
                    showMessage("キャッシュからデータを読み込みました。", false);
                } else {
                    console.log("No cached data found. Fetching from network.");
                    sourceData = await fetchAndProcessExcelData();
                }

                if (sourceData && sourceData.length > 0) {
                    data = sourceData.map(item => {
                        item.updateDateObj = excelSerialDateToJSDate(item.updateDateSerial);
                        return item;
                    });
                    
                    document.querySelector('#date-filters input[data-days="all"]').checked = false;
                    document.querySelector('#date-filters input[data-days="3"]').checked = true;
                    performSearch();
                } else {
                    if (!messageBox.textContent) {
                        showMessage('データを読み込めませんでした。ファイルが空か、形式に問題がある可能性があります。', true);
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
                    
                    document.querySelector('#date-filters input[data-days="all"]').checked = false;
                    document.querySelector('#date-filters input[data-days="3"]').checked = true;
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
                    showMessage('キャッシュをクリアしました。データを再読み込みします。');
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
                    showMessage('キャッシュのクリアに失敗しました。', true);
                });
            });
        });
    
