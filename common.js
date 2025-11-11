function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.head.appendChild(script);
    });
}

async function fetchManufacturerData() {
    console.log('Fetching manufacturer data...');
    try {
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js');
    } catch (error) {
        console.error(error);
        return {}; // XLSX library failed to load
    }

    const fileId = '1lTHHbUj6ySAgtum8zJrHjWAxYnbOO9r8H8Cnu-Y0TnA';
    const googleDriveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;

    try {
        const response = await fetch(googleDriveUrl, { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
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
            const url = cellB ? cellB.l ? cellB.l.Target : XLSX.utils.format_cell(cellB) : null;
            if (manufacturerName && url) {
                links[manufacturerName.trim()] = url.trim();
            }
        };
        console.log('Manufacturer data loaded successfully.');
        return links;
    } catch (error) {
        console.error(`メーカーデータの取得に失敗しました: ${googleDriveUrl} ${error}`);
        return {};
    }
}

async function loadAndCacheData() {
    console.log('共通データローダーを開始します。');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBar = document.getElementById('progressBar');
    const progressMessage = document.getElementById('progressMessage');
    const messageBox = document.getElementById('messageBox');

    function showMessage(text, type = 'info') {
        if (messageBox) {
            messageBox.textContent = text;
            messageBox.className = 'message-box-center text-sm sm:text-base text-center p-3 rounded-lg'; // Reset classes
            if (type === 'error') {
                messageBox.classList.add('bg-red-200', 'text-red-800');
            } else if (type === 'success') {
                messageBox.classList.add('bg-green-200', 'text-green-800');
            } else {
                messageBox.classList.add('bg-blue-200', 'text-blue-800');
            }
            messageBox.classList.remove('hidden');
        }
    }

    function updateProgress(message, percentage) {
        if (progressBarContainer && progressMessage && progressBar) {
            progressBarContainer.classList.remove('hidden');
            progressMessage.textContent = message;
            progressBar.style.width = `${percentage}%`;
        }
    }

    function processCsvData(csvText) {
        updateProgress('データを処理中...', 75);
        const rows = csvText.trim().split('\n');
        if (rows.length < 2) return [];

        const dataRows = rows.slice(1);

        const parseGvizDate = (gvizDate) => {
            if (typeof gvizDate !== 'string' || gvizDate.trim() === '') return null;
            try {
                if (gvizDate.startsWith('Date(')) {
                    const parts = gvizDate.match(/\d+/g);
                    if (parts && parts.length >= 3) {
                        return new Date(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
                    }
                }
                const date = new Date(gvizDate);
                return !isNaN(date.getTime()) ? date : null;
            } catch {
                return null;
            }
        };

        return dataRows.map(rowString => {
            const row = rowString.slice(1, -1).split('","');
            
            let updatedCells = [];
            let shippingStatusTrend = '';
            let changedPart = '';

            try {
                let colW = row[22] || '';
                let colX = row[23] || '';

                if (colX.length > 1 && colX.startsWith('{')) {
                    const unescaped = colX.replace(/""/g, '"');
                    const parsedMetadata = JSON.parse(unescaped);
                    if (parsedMetadata && Array.isArray(parsedMetadata.updated_cols)) {
                        updatedCells = parsedMetadata.updated_cols;
                    }
                } else {
                    changedPart = colX;
                }

                if (colW === '▲' || colW === '⤴️') shippingStatusTrend = '⤴️';
                else if (colW === '▼' || colW === '⤵️') shippingStatusTrend = '⤵️';

            } catch (e) {
                // console.warn("Failed to parse metadata or trend:", e);
            }

            return {
                'productName':          row[5],  // ⑥品名
                'ingredientName':       row[2],  // ③成分名
                'manufacturer':         row[6],  // ⑦製造販売業者名
                'shipmentStatus':       row[11], // ⑫出荷対応
                'reasonForLimitation':  row[13], // ⑭制限理由
                'resolutionProspect':   row[14], // ⑮解消見込み
                'expectedDate':         row[15], // ⑯見込み時期
                'shipmentVolumeStatus': row[16], // ⑰出荷量状況
                'yjCode':               row[4],  // ⑤YJコード
                'productCategory':      row[7],  // ⑧製品区分
                'isBasicDrug':          row[8],  // ⑨基礎的医薬品
                'updateDateObj':        parseGvizDate(row[19]), // ⑳更新日
                'updatedCells':         updatedCells,
                'shippingStatusTrend':  shippingStatusTrend, // W列
                'changedPart':          changedPart // X列
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            const processedData = processCsvData(csvText);

            if (processedData.length > 0) {
                const cachePayload = {
                    timestamp: new Date().getTime(),
                    data: processedData
                };
                await localforage.setItem('excelCache', cachePayload);
            }

            console.log(`Data loaded successfully. Rows: ${processedData.length}`);
            updateProgress('データ読み込み完了！', 100);
            return { data: processedData, date: 'Google Drive' };
        } catch (error) {
            console.error(`データ取得失敗: ${csvUrl} ${error}`);
            showMessage(`データの取得に失敗しました。詳細: ${error.message}`, 'error');
            return { data: null, date: null };
        } finally {
            if(progressBarContainer) setTimeout(() => progressBarContainer.classList.add('hidden'), 1000);
        }
    }

    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    try {
        const cachedData = await localforage.getItem('excelCache');
        const oneHour = 1 * 60 * 60 * 1000;
        if (cachedData && (new Date().getTime() - cachedData.timestamp < oneHour)) {
            console.log("キャッシュからデータを読み込みました。");
            cachedData.data.forEach(item => {
                if (item.updateDateObj && typeof item.updateDateObj === 'string') {
                    item.updateDateObj = new Date(item.updateDateObj);
                }
            });
            return { data: cachedData.data, date: 'キャッシュ' };
        } else {
            console.log(cachedData ? "キャッシュが古いため、ネットワークから取得します。" : "キャッシュが見つからないため、ネットワークから取得します。");
            return await fetchExcelData();
        }
    } catch (err) {
        console.error("キャッシュからの読み込みに失敗しました。ネットワークから取得します。", err);
        return await fetchExcelData();
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}
