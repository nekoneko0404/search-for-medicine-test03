
        let data = [];
        let filteredResults = [];
        let manufacturerLinks = {};
        const loadingIndicator = document.getElementById('loadingIndicator');
        const progressBarContainer = document.getElementById('progressBarContainer');
        const progressBar = document.getElementById('progressBar');
        const progressMessage = document.getElementById('progressMessage');
        const messageBox = document.getElementById('messageBox');

        let messageHideTimer = null;

        let sortStates = {
            yjCode: 'asc',
            productName: 'asc',
            ingredientName: 'asc'
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

        function normalizeString(str) {
            if (!str) return '';
            return String(str).trim().toLowerCase().replace(/[ァ-ヶ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60));
        }

        function updateProgress(message, percentage) {
            progressBarContainer.classList.remove('hidden');
            progressMessage.textContent = message;
            progressBar.style.width = `${percentage}%`;
        }
        
        function renderStatusButton(status, isUpdated = false) { // isUpdated引数を追加
            const trimmedStatus = (status || "").trim();
            const span = document.createElement('span');
            let baseClass = "status-button";

            if (isUpdated) { // isUpdatedがtrueの場合に赤枠を追加
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


        function processCsvData(csvText) {
            updateProgress('データを処理中...', 75);
            const rows = csvText.trim().split('\n');
            if (rows.length < 2) return [];

            const dataRows = rows.slice(1);

            const parseGvizDate = (gvizDate) => {
                if (typeof gvizDate !== 'string' || gvizDate.trim() === '') {
                    return null;
                }
                try {
                    // Handle gviz date format e.g. "Date(2024,10,2)"
                    if (gvizDate.startsWith('Date(')) {
                        const parts = gvizDate.match(/\d+/g);
                        if (parts && parts.length >= 3) {
                            const year = parseInt(parts[0]);
                            const month = parseInt(parts[1]); // 0-indexed
                            const day = parseInt(parts[2]);
                            return new Date(year, month, day);
                        }
                    }
                    // Handle ISO-like date strings "YYYY-MM-DD ..."
                    const date = new Date(gvizDate);
                    if (!isNaN(date.getTime())) {
                        return date;
                    }
                } catch {
                    return null;
                }
                return null;
            };

            return dataRows.map(rowString => {
                const row = rowString.slice(1, -1).split('","');
                
                let updatedCells = [];
                let shippingStatusTrend = ''; // New variable for the trend icon
                try {
                    let colW = row[22] || ''; // Get content of column W for trend
                    let colX = row[23] || ''; // Get content of column X for metadata

                    // Parse updatedCells from colX
                    if (colX.length > 1 && colX.startsWith('{')) {
                        const unescaped = colX.replace(/""/g, '"');
                        const parsedMetadata = JSON.parse(unescaped);
                        if (parsedMetadata && Array.isArray(parsedMetadata.updated_cols)) {
                            updatedCells = parsedMetadata.updated_cols;
                        }
                    }

                    // Use colW for trend icon
                    if (colW === '▲' || colW === '⤴️') {
                        shippingStatusTrend = '⤴️';
                    } else if (colW === '▼' || colW === '⤵️') {
                        shippingStatusTrend = '⤵️';
                    }

                } catch (e) {
                    // console.warn("Failed to parse metadata or trend:", e);
                }

                return {
                    'productName':          row[5],
                    'ingredientName':       row[2],
                    'manufacturer':         row[6],
                    'shipmentStatus':       row[11],
                    'reasonForLimitation':  row[13],
                    'resolutionProspect':   row[14],
                    'expectedDate':         row[15],
                    'shipmentVolumeStatus': row[16],
                    'yjCode':               row[4],
                    'productCategory':      row[7],
                    'isBasicDrug':          row[8],
                    'updateDateObj':        parseGvizDate(row[19]),
                    'updatedCells':         updatedCells,
                    'shippingStatusTrend':  shippingStatusTrend // Add this
                };
            });
        }

        async function fetchExcelData() {
            console.log('Fetching CSV data from Google Drive...');
            updateProgress('Google Driveからデータを読み込み中...', 0);
            
            const fileId = '1ZyjtfiRjGoV9xHSA5Go4rJZr281gqfMFW883Y7s9mQU';
            const csvUrl = `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?tqx=out:csv&cb=${new Date().getTime()}`;

            try {
                updateProgress('データをダウンロード中...', 50);
                const response = await fetch(csvUrl, { cache: "no-cache" });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Fetch Error Body:', errorText);
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }
                
                const csvText = await response.text();
                const processedData = processCsvData(csvText);

                if (processedData.length > 0) {
                    const cachePayload = {
                        timestamp: new Date().getTime(),
                        data: processedData
                    };
                    localforage.setItem('excelCache', cachePayload).catch(err => {
                        console.error("Failed to save data to localForage", err);
                    });
                }

                console.log(`Data loaded successfully. Number of rows: ${processedData.length}`);
                updateProgress('データの読み込みが完了しました！', 100);
                return { data: processedData, date: 'Google Drive' };
            } catch (error) {
                console.error(`データの取得に失敗しました: ${csvUrl} ${error}`);
                showMessage(`データの取得に失敗しました。詳細: ${error.message}`, 'error');
            } finally {
                setTimeout(() => progressBarContainer.classList.add('hidden'), 1000);
            }
            return { data: null, date: null };
        }

        async function fetchManufacturerData() {
            console.log('Fetching manufacturer data from Google Drive...');
            const fileId = '1lTHHbUj6ySAgtum8zJrHjWAxYnbOO9r8H8Cnu-Y0TnA';
            const googleDriveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;

            try {
                const response = await fetch(googleDriveUrl, { cache: "no-cache" });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Fetch Error Body (Manufacturer):', errorText);
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                const links = {};
                for(let R = range.s.r + 1; R <= range.e.r; ++R) {
                    const cellA = worksheet[XLSX.utils.encode_cell({r: R, c: 0})];
                    const cellB = worksheet[XLSX.utils.encode_cell({r: R, c: 1})];
                    const manufacturerName = cellA ? XLSX.utils.format_cell(cellA) : null;
                    const url = cellB ? XLSX.utils.format_cell(cellB) : null;
                    if (manufacturerName && url) links[manufacturerName.trim()] = url.trim();
                };
                return links;
            } catch (error) {
                console.error(`メーカーデータの取得に失敗しました: ${googleDriveUrl} ${error}`);
                return {};
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
                const aValue = normalizeString(a[key]);
                const bValue = normalizeString(b[key]);
                const compare = aValue.localeCompare(bValue, 'ja', { sensitivity: 'base' });
                return newDirection === 'asc' ? compare : -compare;
            });

            displayResults(filteredResults);
            const sortKeyName = key === 'yjCode' ? 'YJコード' : (key === 'productName' ? '品名' : '成分名');
            showMessage(`「${sortKeyName}」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, 'success');
            hideMessage(2000);
        }

        function performSearch() {
            const yjCodeInput = document.getElementById('yjCodeInput');
            const yjCode = normalizeString(yjCodeInput.value.trim());
            
            const isAnyDigitChecked = ['digits3', 'digits4', 'digits7', 'digits8', 'digits9', 'digits11'].some(id => document.getElementById(id).checked);
            const statusNormal = document.getElementById('statusNormal').checked;
            const statusLimited = document.getElementById('statusLimited').checked;
            const statusStop = document.getElementById('statusStop').checked;

            document.getElementById('resultsContainer').innerHTML = '';

            if (isAnyDigitChecked) {
                if (!yjCode || yjCode.length !== 12 || !/^[0-9a-zA-Z]+$/.test(yjCode)) {
                    showMessage('検索項目をチェックした際は、正しい12桁のYJコードを入力してください。', 'error');
                    return;
                }
            }

            if (!isAnyDigitChecked && !statusNormal && !statusLimited && !statusStop) {
                showMessage('検索項目と出荷状況のチェックを全て外したため、検索結果は表示されません。', 'info');
                hideMessage(2000);
                return;
            }

            filteredResults = data;
            
            if (isAnyDigitChecked) {
                const checks = {
                    d11: document.getElementById('digits11').checked,
                    d9: document.getElementById('digits9').checked,
                    d8: document.getElementById('digits8').checked,
                    d7: document.getElementById('digits7').checked,
                    d4: document.getElementById('digits4').checked,
                    d3: document.getElementById('digits3').checked
                };

                filteredResults = filteredResults.filter(item => {
                    const itemYjCode = normalizeString(item.yjCode || '');
                    if (!itemYjCode) return false;

                    if (checks.d11) return itemYjCode.startsWith(yjCode.substring(0, 11));
                    
                    let match = true;
                    if (checks.d9) match = match && itemYjCode.charAt(8) === yjCode.charAt(8);
                    if (checks.d8) match = match && itemYjCode.charAt(7) === yjCode.charAt(7);
                    if (checks.d7) match = match && itemYjCode.startsWith(yjCode.substring(0, 7));
                    else if (checks.d4) match = match && itemYjCode.startsWith(yjCode.substring(0, 4));
                    else if (checks.d3) match = match && itemYjCode.startsWith(yjCode.substring(0, 3));

                    return match;
                });
            }
            
            if (statusNormal || statusLimited || statusStop) {
                filteredResults = filteredResults.filter(item => {
                    const status = normalizeString(item.shipmentStatus || '');
                    if (statusNormal && (status.includes('通常出荷') || status.includes('通'))) return true;
                    if (statusLimited && (status.includes('限定出荷') || status.includes('出荷制限') || status.includes('限') || status.includes('制'))) return true;
                    if (statusStop && (status.includes('供給停止') || status.includes('停止') || status.includes('停'))) return true;
                    return false;
                });
            }

            sortStates.yjCode = 'asc';
            sortStates.productName = 'asc';
            sortStates.ingredientName = 'asc';

            displayResults(filteredResults.slice(0, 500));
            if (filteredResults.length === 0) {
                showMessage('条件に一致する医薬品は見つかりませんでした。', 'info');
                hideMessage(2000);
            }
        }

        function displayResults(results) {
            const container = document.getElementById('resultsContainer');
            container.innerHTML = '';
            if (results.length === 0) return;

            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container rounded-lg shadow border border-gray-200 hidden md:block';
            const table = document.createElement('table');
            table.id = 'resultTable';
            table.className = 'min-w-full divide-y divide-gray-200 table-fixed';
            const thead = table.createTHead();
            thead.className = "bg-indigo-100 sticky top-0";
            
            const headerRow = thead.insertRow();
            const headers = [
                { key: 'yjCode', text: 'YJコード', width: '10%' },
                { key: 'productName', text: '品名', width: '25%' },
                { key: 'ingredientName', text: '成分名', width: '20%' },
                { key: null, text: 'メーカー', width: '15%' },
                { key: null, text: '出荷状況', width: '10%' },
                { key: null, text: '制限理由', width: '10%' },
                { key: null, text: '出荷量状況', width: '10%' }
            ];

            headers.forEach(header => {
                const th = document.createElement('th');
                th.className = `px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap w-[${header.width}]`;
                if (header.key) {
                    th.innerHTML = `<div class="flex items-center justify-start"><span>${header.text}</span><button id="sort-${header.key}-button" class="ml-1 text-indigo-600 hover:text-indigo-800 transition-colors duration-150"><span id="sort-${header.key}-icon">↕</span></button></div>`;
                } else {
                    th.textContent = header.text;
                }
                headerRow.appendChild(th);
            });
            
            const tbody = table.createTBody();
            tbody.id = 'resultTableBody';
            tbody.className = 'bg-white divide-y divide-gray-200';

            const columnMap = {
                'yjCode': 4,
                'productName': 5,
                'ingredientName': 2,
                'manufacturer': 6,
                'shipmentStatus': 11,
                'reasonForLimitation': 13,
                'resolutionProspect': 14,
                'expectedDate': 15,
                'shipmentVolumeStatus': 16,
                'productCategory': 7,
                'isBasicDrug': 8
            };

            results.forEach((item, index) => {
                const newRow = tbody.insertRow();
                const rowBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
                newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-200`;

                const yjCodeCell = newRow.insertCell(0);
                yjCodeCell.setAttribute('data-label', 'YJコード');
                yjCodeCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900");
                if (item.updatedCells && item.updatedCells.includes(columnMap.yjCode)) {
                    yjCodeCell.classList.add('text-red-600', 'font-bold');
                }
                yjCodeCell.textContent = item.yjCode || '-';

                const drugNameCell = newRow.insertCell(1);
                drugNameCell.setAttribute('data-label', '品名');
                drugNameCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900");
                if (item.updatedCells && item.updatedCells.includes(columnMap.productName)) {
                    drugNameCell.classList.add('text-red-600', 'font-bold');
                }
                
                const labelsContainer = document.createElement('div');
                labelsContainer.className = 'vertical-labels-container';
                const isBase = item.isBasicDrug && normalizeString(item.isBasicDrug).includes('基礎的医薬品');
                const isGeneric = item.productCategory && normalizeString(item.productCategory).includes('後発品');
                if (isGeneric) {
                    const span = document.createElement('span');
                    span.className = "bg-green-200 text-green-800 px-1 rounded-xs text-xs font-bold whitespace-nowrap";
                    span.textContent = '後';
                    labelsContainer.appendChild(span);
                }
                if (isBase) {
                    const span = document.createElement('span');
                    span.className = "bg-purple-200 text-purple-800 px-1 rounded-xs text-xs font-bold whitespace-nowrap";
                    span.textContent = '基';
                    labelsContainer.appendChild(span);
                }
                
                const flexContainer = document.createElement('div');
                flexContainer.className = 'flex items-start';
                if (labelsContainer.hasChildNodes()) {
                    flexContainer.appendChild(labelsContainer);
                }

                const nameSpan = document.createElement('span');
                nameSpan.className = "name-clickable text-indigo-600 font-semibold hover:underline truncate-lines";
                nameSpan.dataset.yjcode = item.yjCode || '';
                nameSpan.textContent = item.productName || '-';
                flexContainer.appendChild(nameSpan);
                drugNameCell.appendChild(flexContainer);
                
                const ingredientNameCell = newRow.insertCell(2);
                ingredientNameCell.setAttribute('data-label', '成分名');
                ingredientNameCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900", "truncate-lines");
                if (item.updatedCells && item.updatedCells.includes(columnMap.ingredientName)) {
                    ingredientNameCell.classList.add('text-red-600', 'font-bold');
                }
                ingredientNameCell.textContent = item.ingredientName || '-';

                const manufacturerCell = newRow.insertCell(3);
                manufacturerCell.setAttribute('data-label', 'メーカー');
                manufacturerCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900");
                if (item.updatedCells && item.updatedCells.includes(columnMap.manufacturer)) {
                    manufacturerCell.classList.add('text-red-600', 'font-bold');
                }
                const manufacturerName = item.manufacturer || '-';
                const manufacturerUrl = manufacturerLinks[manufacturerName];
                if (manufacturerUrl && (manufacturerUrl.startsWith('http:') || manufacturerUrl.startsWith('https:'))) {
                    const link = document.createElement('a');
                    link.href = manufacturerUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'text-indigo-600 hover:underline';
                    link.textContent = manufacturerName;
                    manufacturerCell.appendChild(link);
                } else {
                    manufacturerCell.textContent = manufacturerName;
                }

                const statusCell = newRow.insertCell(4);
                statusCell.setAttribute('data-label', '出荷状況');
                statusCell.classList.add("tight-cell", "py-2", "text-gray-900", "text-left");
                const statusDiv = document.createElement('div');
                statusDiv.className = 'flex items-center justify-start';
                statusDiv.appendChild(renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus)));

                if (item.shippingStatusTrend) {
                    const trendIcon = document.createElement('span');
                    trendIcon.className = 'ml-1 text-red-500';
                    trendIcon.textContent = item.shippingStatusTrend;
                    statusDiv.appendChild(trendIcon);
                }
                statusCell.appendChild(statusDiv);

                const reasonCell = newRow.insertCell(5);
                reasonCell.textContent = item.reasonForLimitation || '-';
                reasonCell.setAttribute('data-label', '制限理由');
                reasonCell.classList.add("px-2", "py-2", "text-xs", "text-gray-900", "truncate-lines");
                if (item.updatedCells && item.updatedCells.includes(columnMap.reasonForLimitation)) {
                    reasonCell.classList.add('text-red-600', 'font-bold');
                }

                const volumeCell = newRow.insertCell(6);
                volumeCell.textContent = item.shipmentVolumeStatus || '-';
                volumeCell.setAttribute('data-label', '出荷量状況');
                volumeCell.classList.add("px-2", "py-2", "text-xs", "text-gray-900");
                if (item.updatedCells && item.updatedCells.includes(columnMap.shipmentVolumeStatus)) {
                    volumeCell.classList.add('text-red-600', 'font-bold');
                }
            });
            table.appendChild(tbody);
            tableContainer.appendChild(table);
            container.appendChild(tableContainer);

            document.getElementById('sort-yjCode-button').addEventListener('click', () => sortResults('yjCode'));
            document.getElementById('sort-productName-button').addEventListener('click', () => sortResults('productName'));
            document.getElementById('sort-ingredientName-button').addEventListener('click', () => sortResults('ingredientName'));

            const cardListContainer = document.createElement('div');
            cardListContainer.className = 'block md:hidden w-full space-y-4 mt-4';
            results.forEach((item, index) => cardListContainer.appendChild(createCardElement(item, columnMap, index))); // Pass columnMap to createCardElement
            container.appendChild(cardListContainer);

            document.querySelectorAll('#resultsContainer .name-clickable').forEach(element => {
                element.addEventListener('click', (e) => {
                    const yjCode = e.currentTarget.dataset.yjcode;
                    if (yjCode) {
                        document.getElementById('yjCodeInput').value = yjCode;
                        ['digits3', 'digits4', 'digits7', 'statusNormal'].forEach(id => document.getElementById(id).checked = true);
                        ['digits8', 'digits9', 'digits11', 'statusLimited', 'statusStop'].forEach(id => document.getElementById(id).checked = false);
                        performSearch();
                    }
                });
            });
        }

        function createCardElement(item, columnMap, index) {
            const card = document.createElement('div');
            const cardBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
            card.className = `${cardBgClass} rounded-lg shadow border border-gray-200 p-4`;
            
            const header = document.createElement('div');
            header.className = 'flex items-start justify-between mb-2';
            
            const title = document.createElement('h3');
            title.className = `text-base font-bold text-gray-900 leading-tight whitespace-nowrap overflow-hidden text-overflow-ellipsis ${item.updatedCells && item.updatedCells.includes(columnMap.productName) ? 'text-red-600 font-bold' : ''}`;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'card-name-clickable name-clickable text-indigo-600 hover:underline';
            nameSpan.dataset.yjcode = item.yjCode || '';
            nameSpan.textContent = item.productName || '-';
            title.appendChild(nameSpan);
            
            const labelsContainer = document.createElement('div');
            labelsContainer.className = 'flex items-center space-x-1 flex-shrink-0';
            const isBase = item.isBasicDrug && normalizeString(item.isBasicDrug).includes('基礎的医薬品');
            const isGeneric = item.productCategory && normalizeString(item.productCategory).includes('後発品');
            if (isGeneric) {
                const span = document.createElement('span');
                span.className = 'bg-green-200 text-green-800 px-1 rounded-xs text-xs font-bold whitespace-nowrap mr-1';
                span.textContent = '後';
                labelsContainer.appendChild(span);
            }
            if (isBase) {
                const span = document.createElement('span');
                span.className = 'bg-purple-200 text-purple-800 px-1 rounded-xs text-xs font-bold whitespace-nowrap mr-1';
                span.textContent = '基';
                labelsContainer.appendChild(span);
            }
            
            header.appendChild(title);
            header.appendChild(labelsContainer);
            
            const body = document.createElement('div');
            body.className = 'text-sm space-y-1';

            const createCardItem = (label, value, isHtml = false, colKey = null) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex justify-between items-start card-item';
                const labelSpan = document.createElement('span');
                labelSpan.className = 'text-gray-700 font-semibold w-1/3 flex-shrink-0';
                labelSpan.textContent = label;
                const valueSpan = document.createElement('span');
                valueSpan.className = `text-right w-2/3 ${colKey && item.updatedCells && item.updatedCells.includes(columnMap[colKey]) ? 'text-red-600 font-bold' : ''}`;
                if (isHtml) {
                    valueSpan.appendChild(value);
                } else {
                    valueSpan.textContent = value;
                }
                itemDiv.appendChild(labelSpan);
                itemDiv.appendChild(valueSpan);
                return itemDiv;
            };

            const manufacturerName = item.manufacturer || '-';
            const manufacturerUrl = manufacturerLinks[manufacturerName];
            let manufacturerContent;
            if (manufacturerUrl && (manufacturerUrl.startsWith('http:') || manufacturerUrl.startsWith('https:'))) {
                const link = document.createElement('a');
                link.href = manufacturerUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'text-indigo-600 hover:underline';
                link.textContent = manufacturerName;
                manufacturerContent = document.createElement('span');
                manufacturerContent.className = 'text-gray-900';
                manufacturerContent.appendChild(link);
            } else {
                manufacturerContent = document.createElement('span');
                manufacturerContent.className = 'text-gray-900';
                manufacturerContent.textContent = manufacturerName;
            }

            body.appendChild(createCardItem('YJコード:', item.yjCode || '-', false, 'yjCode'));
            body.appendChild(createCardItem('成分名:', item.ingredientName || '-', false, 'ingredientName'));
            body.appendChild(createCardItem('メーカー:', manufacturerContent, true, 'manufacturer'));
            const hr = document.createElement('hr');
hr.className = 'my-2 border-gray-200';
            body.appendChild(hr);

            const statusContainer = document.createElement('div');
            statusContainer.className = 'flex items-center justify-end'; // justify-end for card view
            statusContainer.appendChild(renderStatusButton(item.shipmentStatus, item.updatedCells && item.updatedCells.includes(columnMap.shipmentStatus)));

            if (item.shippingStatusTrend) {
                const trendIcon = document.createElement('span');
                trendIcon.className = 'ml-1 text-red-500';
                trendIcon.textContent = item.shippingStatusTrend;
                statusContainer.appendChild(trendIcon);
            }
            body.appendChild(createCardItem('出荷状況:', statusContainer, true, 'shipmentStatus'));

            body.appendChild(createCardItem('制限理由:', item.reasonForLimitation || '-', false, 'reasonForLimitation'));
            body.appendChild(createCardItem('出荷量状況:', item.shipmentVolumeStatus || '-', false, 'shipmentVolumeStatus'));

            card.appendChild(header);
            card.appendChild(body);
            return card;
        }

        async function initializeApp() {
            loadingIndicator.classList.remove('hidden');
            
            const manufacturerDataPromise = fetchManufacturerData();
            
            const excelDataPromise = localforage.getItem('excelCache').then(cachedData => {
                const oneHour = 1 * 60 * 60 * 1000; // 1時間
                if (cachedData && (new Date().getTime() - cachedData.timestamp < oneHour)) {
                    console.log("Found recent cached data in localForage.");
                    cachedData.data.forEach(item => {
                        if (item.updateDateObj && typeof item.updateDateObj === 'string') {
                            item.updateDateObj = new Date(item.updateDateObj);
                        }
                    });
                    return { data: cachedData.data, date: 'キャッシュ' };
                } else {
                    if(cachedData) {
                        console.log("Cached data is old. Fetching from network.");
                    } else {
                        console.log("No cached data found. Fetching from network.");
                    }
                    return fetchExcelData();
                }
            }).catch(err => {
                console.error("Error reading from localForage, fetching from network.", err);
                return fetchExcelData(); // フォールバック
            });

            const [manufacturerDataResult, excelDataResult] = await Promise.all([manufacturerDataPromise, excelDataPromise]);

            manufacturerLinks = manufacturerDataResult;
            
            if (excelDataResult && excelDataResult.data) {
                data = excelDataResult.data;
                document.getElementById('dataDate').textContent = '';

                const urlParams = new URLSearchParams(window.location.search);
                const yjCodeFromUrl = urlParams.get('yjcode');
                if (yjCodeFromUrl) {
                    document.getElementById('yjCodeInput').value = String(yjCodeFromUrl).trim();
                    performSearch();
                } else {
                    showMessage('データの準備ができました。YJコードを入力して検索してください。', 'success');
                    hideMessage(3000);
                }
            } else {
                showMessage('データの読み込みに失敗しました。ページを再読み込みしてください。', 'error');
            }
            
            loadingIndicator.style.display = 'none';
        }

        document.getElementById('searchButton').addEventListener('click', performSearch);
        document.getElementById('yjCodeInput').addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });
        document.getElementById('yjCodeInput').addEventListener('input', e => { if (e.target.value.trim().length === 12) performSearch(); });
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', performSearch));
        
        initializeApp();
    
