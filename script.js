        let excelData = [];
        let filteredResults = [];
        let sortStates = {
            status: 'asc'
        };
        const messageBox = document.getElementById('messageBox');
        const tableContainer = document.getElementById('tableContainer');
        let isComposing = false;

        function showMessage(text, type = 'info') {
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
            setTimeout(() => {
                messageBox.classList.add('hidden');
            }, delay);
        }
        function normalizeString(str) {
            if (!str) return '';
            const hiraToKata = str.replace(/[ぁ-ゖ]/g, function(match) {
                const charCode = match.charCodeAt(0) + 0x60;
                return String.fromCharCode(charCode);
            });
            const normalizedStr = hiraToKata.normalize('NFKC');
            return normalizedStr.toLowerCase();
        }
        function getSearchKeywords(input) {
            return input.split(/\s+|　+/).filter(keyword => keyword !== '').map(keyword => normalizeString(keyword));
        }

        function processExcelData(data) {
            try {
                const workbook = XLSX.read(data, {type: 'array'});
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                const jsonDataWithStrings = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, defval: "" });
                const jsonDataWithNumbers = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, raw: true, defval: "" });

                if (jsonDataWithStrings.length < 2) { 
                    excelData = [];
                    showMessage("Excelファイルに処理できるデータがありません。", "info");
                    hideMessage(2000);
                    return;
                }

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

                excelData = mappedData;

            } catch (error) {
                console.error('Error processing data:', error);
                showMessage("データの処理中にエラーが発生しました。", "error");
                hideMessage(2000);
            }
        }

        function renderStatusButton(status) {
            const trimmedStatus = (status || "").trim();
            const span = document.createElement('span');
            span.className = "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150";

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

        function searchData() {
            if (excelData.length === 0) {
                return;
            }

            const drugKeywords = getSearchKeywords(document.getElementById('drugName').value);
            const ingredientKeywords = getSearchKeywords(document.getElementById('ingredientName').value);
            const makerKeywords = getSearchKeywords(document.getElementById('makerName').value);
            
            const allCheckboxesChecked = document.getElementById('statusNormal').checked && document.getElementById('statusLimited').checked && document.getElementById('statusStopped').checked;
            const allSearchFieldsEmpty = drugKeywords.length === 0 && ingredientKeywords.length === 0 && makerKeywords.length === 0;

            if (allSearchFieldsEmpty && allCheckboxesChecked) {
                renderTable([]);
                tableContainer.classList.add('hidden');
                hideMessage(0);
                return;
            } else {
                tableContainer.classList.remove('hidden');
            }
            
            const statusFilters = [];
            if (document.getElementById('statusNormal').checked) statusFilters.push("通常出荷");
            if (document.getElementById('statusLimited').checked) statusFilters.push("限定出荷");
            if (document.getElementById('statusStopped').checked) statusFilters.push("供給停止");

            filteredResults = excelData.filter(item => {
                if (!item) return false;

                const drugName = normalizeString(item.productName || "");
                const ingredientName = normalizeString(item.ingredientName || "");
                const makerName = normalizeString((item.standard || "") + (item.manufacturer || ""));

                const matchDrug = drugKeywords.every(keyword => drugName.includes(keyword));
                const matchIngredient = ingredientKeywords.every(keyword => ingredientName.includes(keyword));
                const matchMaker = makerKeywords.every(keyword => drugName.includes(keyword) || makerName.includes(keyword));
                
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
            document.getElementById('sort-status-icon').textContent = '▲';
        }
        
        function handleIngredientClick(ingredient) {
            document.getElementById('drugName').value = '';
            document.getElementById('makerName').value = '';
            const searchIngredient = ingredient.length > 5 ? ingredient.substring(0, 5) : ingredient;
            document.getElementById('ingredientName').value = searchIngredient;
            searchData();
            showMessage(`「${searchIngredient}」で再検索を実行しました。`, 'info');
            hideMessage(2000);
        }

        function extractSearchTerm(text) {
            if (!text) return '';
            let match = text.match(/^([一-龯ァ-ヶー]+(?:[一-龯ァ-ヶー]+)*)/);
            if (match && match) { return match; }
            match = text.match(/[^一-龯ァ-ヶーA-Za-z0-9]*([一-龯ァ-ヶー]+(?:[一-龯ァ-ヶー]+)*)/);
            if (match && match) { return match; }
            return text;
        }

        function openHiyariPage(type, name) {
            const hiyariBaseUrl = './hiyari_app/index.html';
            let extractedName = extractSearchTerm(name);

            if (Array.isArray(extractedName)) {
                extractedName = extractedName || '';
            } else if (typeof extractedName !== 'string') {
                extractedName = String(extractedName || '');
            }

            let finalName = extractedName;

            if (type === 'ingredientName' && finalName) {
                const parts = finalName.split(/[，,、]/).map(p => p.trim()).filter(p => p !== '');
                let candidate = '';
                for (const p of parts) {
                    const m = p.match(/([ァ-ヶー]+)/);
                    if (m && m) {
                        candidate = m;
                        break;
                    }
                }
                if (!candidate && parts.length > 0) {
                    candidate = parts.replace(/^[ＬL][－-]?/, '').trim();
                }
                if (candidate) {
                    finalName = candidate;
                } else if (parts.length > 0) {
                    finalName = parts;
                }
            }

            const url = `${hiyariBaseUrl}?${type}=${encodeURIComponent(finalName)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        function renderTable(data) {
            const resultBody = document.getElementById('resultTableBody');
            resultBody.innerHTML = "";

            if (data.length === 0) {
                const row = resultBody.insertRow();
                const cell = row.insertCell(0);
                cell.colSpan = 5;
                cell.textContent = "該当データがありません";
                cell.className = "px-4 py-3 text-sm text-gray-500 text-center italic";
                return;
            }

            const displayResults = data.slice(0, 500);
            displayResults.forEach((item, index) => {
                const newRow = resultBody.insertRow();
                const rowBgClass = index % 2 === 1 ? 'bg-indigo-50' : 'bg-white';
                newRow.className = `${rowBgClass} transition-colors duration-150 hover:bg-indigo-200`;

                const drugNameCell = newRow.insertCell(0);
                drugNameCell.setAttribute('data-label', '品名');
                drugNameCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900", "relative");

                const labelsContainer = document.createElement('div');
                labelsContainer.className = 'vertical-labels-container';
                
                const hColumnValue = (item.isGeneric || '').trim();
                const iColumnValue = (item.isBasicDrug || '').trim();

                if (hColumnValue === '後発品') {
                    const span = document.createElement('span');
                    span.className = "bg-green-200 text-green-800 px-1 rounded-sm text-xs font-bold whitespace-nowrap";
                    span.textContent = '後';
                    labelsContainer.appendChild(span);
                }
                if (iColumnValue === '基礎的医薬品') {
                    const span = document.createElement('span');
                    span.className = "bg-purple-200 text-purple-800 px-1 rounded-sm text-xs font-bold whitespace-nowrap";
                    span.textContent = '基';
                    labelsContainer.appendChild(span);
                }
                
                const drugName = item.productName || "";
                const drugNameForHiyari = encodeURIComponent(drugName);

                const flexContainer = document.createElement('div');
                flexContainer.className = 'flex items-start';
                if (labelsContainer.hasChildNodes()) {
                    flexContainer.appendChild(labelsContainer);
                }

                if (!item.yjCode) {
                    const span = document.createElement('span');
                    span.className = "font-semibold truncate-lines";
                    span.textContent = drugName;
                    flexContainer.appendChild(span);
                    drugNameCell.appendChild(flexContainer);
                } else {
                    const pmdaLinkUrl = `https://www.pmda.go.jp/PmdaSearch/rdSearch/02/${item.yjCode}?user=1`;
                    const yjCodeLinkUrl = `./yjcode/index.html?yjcode=${item.yjCode}`;
                    const hiyariLinkUrl = `./hiyari_app/index.html?drugName=${drugNameForHiyari}`;
                    const dropdownContentId = `dropdown-content-${index}`;

                    const dropdownContainer = document.createElement('div');
                    dropdownContainer.className = 'dropdown w-full';

                    const button = document.createElement('button');
                    button.className = "dropdown-button text-indigo-600 font-semibold hover:underline truncate-lines text-left w-full";
                    button.textContent = drugName;
                    button.onclick = toggleDropdown;

                    const dropdownContent = document.createElement('div');
                    dropdownContent.id = dropdownContentId;
                    dropdownContent.className = "dropdown-content hidden absolute bg-white border border-gray-300 rounded-md shadow-lg z-10";
                    dropdownContent.style.minWidth = '120px';

                    const pmdaLink = document.createElement('a');
                    pmdaLink.href = pmdaLinkUrl;
                    pmdaLink.target = '_blank';
                    pmdaLink.rel = 'noopener noreferrer';
                    pmdaLink.className = "block px-3 py-2 text-sm text-gray-800 hover:bg-indigo-100 whitespace-nowrap";
                    pmdaLink.textContent = '医薬品情報';

                    const yjCodeLink = document.createElement('a');
                    yjCodeLink.href = yjCodeLinkUrl;
                    yjCodeLink.target = '_blank';
                    yjCodeLink.rel = 'noopener noreferrer';
                    yjCodeLink.className = "block px-3 py-2 text-sm text-gray-800 hover:bg-indigo-100 whitespace-nowrap";
                    yjCodeLink.textContent = '代替薬検索';

                    const hiyariLink = document.createElement('a');
hiyariLink.href = hiyariLinkUrl;
                    hiyariLink.target = '_blank';
                    hiyariLink.rel = 'noopener noreferrer';
                    hiyariLink.className = "block px-3 py-2 text-sm text-gray-800 hover:bg-indigo-100 whitespace-nowrap";
                    hiyariLink.textContent = 'ヒヤリハット検索';

                    dropdownContent.appendChild(pmdaLink);
                    dropdownContent.appendChild(yjCodeLink);
                    dropdownContent.appendChild(hiyariLink);
                    dropdownContainer.appendChild(button);
                    dropdownContainer.appendChild(dropdownContent);
                    flexContainer.appendChild(dropdownContainer);
                    drugNameCell.appendChild(flexContainer);
                }
                
                const ingredientNameCell = newRow.insertCell(1);
                ingredientNameCell.setAttribute('data-label', '成分名');
                ingredientNameCell.classList.add("px-2", "py-2", "text-sm", "text-gray-900", "truncate-lines");
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
                
                const statusCell = newRow.insertCell(2);
                statusCell.setAttribute('data-label', '出荷状況');
                statusCell.classList.add("tight-cell", "py-2", "text-gray-900", "text-left");

                const statusValue = (item.shipmentStatus || '').trim();
                statusCell.appendChild(renderStatusButton(statusValue));
                
                const reasonCell = newRow.insertCell(3);
                reasonCell.textContent = item.reasonForLimitation || "";
                reasonCell.setAttribute('data-label', '制限理由');
                reasonCell.classList.add("px-2", "py-2", "text-xs", "text-gray-900", "truncate-lines");

                const volumeCell = newRow.insertCell(4);
                volumeCell.textContent = item.shipmentVolumeStatus || "";
                volumeCell.setAttribute('data-label', '出荷量状況');
                volumeCell.classList.add("px-2", "py-2", "text-xs", "text-gray-900");
            });
        }

        function toggleDropdown(event) {
            event.stopPropagation();
            const content = event.currentTarget.nextElementSibling;
            const isAlreadyOpen = !content.classList.contains('hidden');
            closeAllDropdowns();
            if (!isAlreadyOpen) {
                content.classList.remove('hidden');
            }
        }

        function closeAllDropdowns() {
            document.querySelectorAll('.dropdown-content').forEach(dropdown => {
                dropdown.classList.add('hidden');
            });
        }
        
        function sortResults(key) {
            if (filteredResults.length === 0) {
                showMessage("ソートするデータがありません。", "info");
                hideMessage(2000);
                return;
            }
            const newDirection = sortStates[key] === 'asc' ? 'desc' : 'asc';
            sortStates[key] = newDirection;
            document.getElementById(`sort-${key}-icon`).textContent = newDirection === 'asc' ? '▲' : '▼';
            
            filteredResults.sort((a, b) => {
                const aValue = (a.shipmentStatus || '').trim();
                const bValue = (b.shipmentStatus || '').trim();
                const compare = aValue.localeCompare(bValue, 'ja', { sensitivity: 'base' });
                return newDirection === 'asc' ? compare : -compare;
            });

            renderTable(filteredResults);
            showMessage(`「出荷状況」を${newDirection === 'asc' ? '昇順' : '降順'}でソートしました。`, "success");
            hideMessage(2000);
        }
        
        function formatDate(date) {
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${year}${month}${day}`;
        }

        function attachSearchListeners() {
            const inputIds = ['drugName', 'ingredientName', 'makerName'];

            inputIds.forEach(id => {
                const element = document.getElementById(id);
                
                element.addEventListener('compositionstart', () => {
                    isComposing = true;
                });

                element.addEventListener('compositionend', () => {
                    isComposing = false;
                    searchData(); 
                });

                element.addEventListener('input', () => {
                    if (!isComposing) {
                        searchData();
                    }
                });
            });

            document.getElementById('statusNormal').addEventListener('change', searchData);
            document.getElementById('statusLimited').addEventListener('change', searchData);
            document.getElementById('statusStopped').addEventListener('change', searchData);
        }

        window.onload = function() {
            attachSearchListeners();
            window.addEventListener('click', closeAllDropdowns);

            document.getElementById('reload-data').addEventListener('click', () => {
                localforage.removeItem('excelCache').then(() => {
                    showMessage('キャッシュをクリアしました。データを再読み込みします。', 'info');
                    hideMessage(2000);
                    fetchSpreadsheetData();
                }).catch(err => {
                    console.error("Failed to clear cache", err);
                    showMessage('キャッシュのクリアに失敗しました。', 'error');
                    hideMessage(2000);
                });
            });

            const fileId = '1yhDbdCbnmDoXKRSj_CuLgKkIH2ohK1LD';
            const googleDriveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;

            async function fetchSpreadsheetData() {
                showMessage('共有スプレッドシートからデータを読み込み中です...', 'info');
                try {
                    const response = await fetch(googleDriveUrl, { cache: "no-cache" });
                    if (response.ok) {
                        const data = await response.arrayBuffer();
                        processExcelData(new Uint8Array(data));

                        if (excelData.length > 0) {
                            const cachePayload = {
                                timestamp: new Date().getTime(),
                                data: excelData
                            };
                            localforage.setItem('excelCache', cachePayload).catch(err => {
                                console.error("Failed to save data to localForage", err);
                            });
                            showMessage(`${excelData.length} 件のデータを読み込みました。検索を開始できます。`, "success");
                        } else {
                            showMessage("データが0件でした。ファイルまたは処理ロジックを確認してください。", "error");
                        }
                        renderTable([]);
                        tableContainer.classList.add('hidden');
                        hideMessage(3000);
                    } else {
                        showMessage(`データの取得に失敗しました。ステータスコード: ${response.status}`, 'error');
                    }
                } catch (error) {
                    console.error('データの取得に失敗しました:', error);
                    showMessage('共有スプレッドシートからのデータの取得中にエラーが発生しました。', 'error');
                }
            }

            localforage.getItem('excelCache').then(cachedData => {
                const fourHours = 4 * 60 * 60 * 1000;
                if (cachedData && (new Date().getTime() - cachedData.timestamp < fourHours)) {
                    console.log("Found recent cached data in localForage.");
                    excelData = cachedData.data;
                    renderTable([]);
                    tableContainer.classList.add('hidden');
                    showMessage(`キャッシュから ${excelData.length} 件のデータを読み込みました。検索を開始できます。`, "success");
                    hideMessage(3000);
                } else {
                    if(cachedData) {
                        console.log("Cached data is old. Fetching from network.");
                    } else {
                        console.log("No cached data found. Fetching from network.");
                    }
                    fetchSpreadsheetData();
                }
            }).catch(err => {
                console.error("Error reading from localForage, fetching from network.", err);
                fetchSpreadsheetData();
            });
        };
