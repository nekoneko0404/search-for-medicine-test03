/**
 * Data handling module for Kusuri Compass
 * Handles fetching from Google Sheets and caching with LocalForage
 */

// We assume localforage is loaded globally via CDN in index.html for now, 
// or we could import it if we were using a bundler. 
// Since we are using native ES modules without a bundler, and localforage UMD build 
// sets a global variable, we'll access it via window.localforage.

const FILE_ID_MAIN = '1ZyjtfiRjGoV9xHSA5Go4rJZr281gqfMFW883Y7s9mQU';
const FILE_ID_MANUFACTURER = '1lTHHbUj6ySAgtum8zJrHjWAxYnbOO9r8H8Cnu-Y0TnA';

/**
 * Load script dynamically
 * @param {string} src - Script source URL
 * @returns {Promise<void>}
 */
export function loadScript(src) {
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

/**
 * Parse GViz Date string
 * Handles various formats including Japanese date strings
 * @param {string} gvizDate - Date string from Google Visualization API
 * @returns {Date|null} Date object or null
 */
function parseGvizDate(gvizDate) {
    if (typeof gvizDate !== 'string' || gvizDate.trim() === '') return null;

    // 1. Try standard Date constructor
    let date = new Date(gvizDate);
    if (!isNaN(date.getTime())) return date;

    // 2. Handle "Date(2023,0,1)" format
    if (gvizDate.startsWith('Date(')) {
        const parts = gvizDate.match(/\d+/g);
        if (parts && parts.length >= 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]));
        }
    }

    // 3. Handle Japanese format like "金曜日, 1月 17, 2025" or "2025年1月17日"
    // Extract numbers: Year (4 digits), Month (1-2 digits), Day (1-2 digits)
    const numbers = gvizDate.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
        // Assuming order might be Year, Month, Day OR Month, Day, Year
        // Heuristic: Year is usually > 1900
        let y, m, d;

        // Check for 4-digit year
        const yearIndex = numbers.findIndex(n => parseInt(n) > 1900);

        if (yearIndex !== -1) {
            y = parseInt(numbers[yearIndex]);
            // Remove year from array to find month and day
            const remaining = numbers.filter((_, i) => i !== yearIndex);
            if (remaining.length >= 2) {
                // Usually Month comes before Day in these formats
                m = parseInt(remaining[0]) - 1; // Month is 0-indexed
                d = parseInt(remaining[1]);

                date = new Date(y, m, d);
                if (!isNaN(date.getTime())) return date;
            }
        }
    }

    return null;
}

/**
 * Robust CSV Line Parser
 * Handles quoted fields and escaped quotes correctly
 * @param {string} text - CSV line text
 * @returns {Array<string>} Array of fields
 */
function parseCSVLine(text) {
    const result = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (inQuote && text[i + 1] === '"') {
                current += '"';
                i++; // Skip escaped quote
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/**
 * Process CSV text into objects
 * @param {string} csvText - Raw CSV text
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Array<Object>} Array of data objects
 */
function processCsvData(csvText, onProgress) {
    if (onProgress) onProgress('データを処理中...', 75);
    const rows = csvText.trim().split('\n');
    if (rows.length < 2) return [];

    // Skip header rows. 
    // User reported data starts from row 3 (index 2) in the sheet.
    // GViz CSV might contain headers. We filter out rows that look like headers.
    // Header usually has "品名" in col 5 or "更新" in col 19.

    const dataRows = [];
    for (let i = 0; i < rows.length; i++) {
        const rowString = rows[i].trim();
        if (!rowString) continue;

        const row = parseCSVLine(rowString);

        // Basic validation to skip header/empty rows
        // Check if 'productName' (index 5) is '品名' or empty
        // Check if 'updateDate' (index 19) contains '更新' (header text)
        if (row.length < 5) continue;

        const col5 = row[5] || '';
        const col19 = row[19] || '';

        // Skip if it looks like a header
        if (col5.includes('品名') || col19.includes('更新有無') || col19.includes('当該品目')) {
            continue;
        }

        // Skip if essential data is missing (optional, but good for safety)
        if (!col5 && !row[2]) continue;

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

        dataRows.push({
            'productName': row[5],  // ⑥品名
            'ingredientName': row[2],  // ③成分名
            'manufacturer': row[6],  // ⑦製造販売業者名
            'shipmentStatus': row[11], // ⑫出荷対応
            'reasonForLimitation': row[13], // ⑭制限理由
            'resolutionProspect': row[14], // ⑮解消見込み
            'expectedDate': row[15], // ⑯見込み時期
            'expectedDateObj': parseGvizDate(row[15]), // ⑯見込み時期(日付オブジェクト)
            'shipmentVolumeStatus': row[16], // ⑰出荷量状況
            'yjCode': row[4],  // ⑤YJコード
            'productCategory': row[7],  // ⑧製品区分
            'isBasicDrug': row[8],  // ⑨基礎的医薬品
            'updateDateObj': parseGvizDate(row[19]), // ⑳更新日
            'updatedCells': updatedCells,
            'shippingStatusTrend': shippingStatusTrend, // W列
            'changedPart': changedPart // X列
        });
    }

    return dataRows;
}

/**
 * Fetch manufacturer data (links)
 * @returns {Promise<Object>} Map of manufacturer name to URL
 */
export async function fetchManufacturerData() {
    console.log('Fetching manufacturer data...');
    try {
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js');
    } catch (error) {
        console.error(error);
        return {}; // XLSX library failed to load
    }

    const googleDriveUrl = `https://docs.google.com/spreadsheets/d/${FILE_ID_MANUFACTURER}/export?format=xlsx`;

    try {
        const response = await fetch(googleDriveUrl, { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // We need to rely on the global XLSX variable loaded by the script
        if (typeof window.XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const arrayBuffer = await response.arrayBuffer();
        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const range = window.XLSX.utils.decode_range(worksheet['!ref']);
        const links = {};
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const cellA = worksheet[window.XLSX.utils.encode_cell({ r: R, c: 0 })];
            const cellB = worksheet[window.XLSX.utils.encode_cell({ r: R, c: 1 })];
            const manufacturerName = cellA ? window.XLSX.utils.format_cell(cellA) : null;
            const url = cellB ? cellB.l ? cellB.l.Target : window.XLSX.utils.format_cell(cellB) : null;
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


/**
 * Fetch main data from Google Sheets
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<Object>} { data: Array, date: string }
 */
async function fetchExcelData(onProgress) {
    console.log('Fetching CSV data from Google Drive...');
    if (onProgress) onProgress('Google Driveからデータを読み込み中...', 0);

    const csvUrl = `https://docs.google.com/spreadsheets/d/${FILE_ID_MAIN}/gviz/tq?tqx=out:csv&cb=${new Date().getTime()}`;

    try {
        if (onProgress) onProgress('データをダウンロード中...', 50);
        const response = await fetch(csvUrl, { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const csvText = await response.text();
        const processedData = processCsvData(csvText, onProgress);

        if (processedData.length > 0) {
            const cachePayload = {
                timestamp: new Date().getTime(),
                data: processedData
            };
            await window.localforage.setItem('excelCache', cachePayload);
        }

        console.log(`Data loaded successfully. Rows: ${processedData.length}`);
        if (onProgress) onProgress('データ読み込み完了！', 100);
        return { data: processedData, date: 'Google Drive' };
    } catch (error) {
        console.error(`データ取得失敗: ${csvUrl} ${error}`);
        throw error;
    }
}
/**
 * Load data (try cache first, then network)
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<Object>} { data: Array, date: string }
 */
export async function loadAndCacheData(onProgress) {
    console.log('共通データローダーを開始します。');

    try {
        const cachedData = await window.localforage.getItem('excelCache');
        const oneHour = 1 * 60 * 60 * 1000;
        if (cachedData && (new Date().getTime() - cachedData.timestamp < oneHour)) {
            console.log("キャッシュからデータを読み込みました。");
            // Restore Date objects from strings (JSON serialization converts dates to strings)
            cachedData.data.forEach(item => {
                if (item.updateDateObj && typeof item.updateDateObj === 'string') {
                    item.updateDateObj = new Date(item.updateDateObj);
                }
                if (item.expectedDateObj && typeof item.expectedDateObj === 'string') {
                    item.expectedDateObj = new Date(item.expectedDateObj);
                }
            });
            if (onProgress) onProgress('キャッシュから読み込み完了', 100);
            return { data: cachedData.data, date: 'キャッシュ' };
        } else {
            console.log(cachedData ? "キャッシュが古いため、ネットワークから取得します。" : "キャッシュが見つからないため、ネットワークから取得します。");
            return await fetchExcelData(onProgress);
        }
    } catch (err) {
        console.error("キャッシュからの読み込みに失敗しました。ネットワークから取得します。", err);
        return await fetchExcelData(onProgress);
    }
}

export async function clearCacheAndReload(onProgress) {
    try {
        await window.localforage.removeItem('excelCache');
        return await loadAndCacheData(onProgress);
    } catch (err) {
        console.error("Failed to clear cache", err);
        throw err;
    }
}
