console.log("infection app main.js loaded"); // 追加
const API_URL = 'https://script.google.com/macros/s/AKfycby8wh0NMuPtEOgLVHXfc0jzNqlOENuOgCwQmYYzMSZCKTvhSDiJpZkAyJxntGISTGOmbQ/exec';
let cachedData = {
    current: null, // 当年のデータ
    archives: []   // 過去数年分のデータ
};
let currentDisease = 'Influenza'; // 初期表示疾患
const ALL_DISEASES = [ // 全疾患リスト
    { key: 'Influenza', name: 'インフルエンザ' },
    { key: 'COVID-19', name: 'COVID-19' },
    { key: 'ARI', name: '急性呼吸器感染症' },
    { key: 'RSV', name: 'ＲＳウイルス感染症' },
    { key: 'PharyngoconjunctivalFever', name: '咽頭結膜熱' },
    { key: 'AGS_Pharyngitis', name: 'Ａ群溶血性レンサ球菌咽頭炎' },
    { key: 'InfectiousGastroenteritis', name: '感染性胃腸炎' },
    { key: 'Chickenpox', name: '水痘' },
    { key: 'HandFootMouthDisease', name: '手足口病' },
    { key: 'ErythemaInfectiosum', name: '伝染性紅斑' },
    { key: 'ExanthemSubitum', name: '突発性発しん' },
    { key: 'Herpangina', name: 'ヘルパンギーナ' },
    { key: 'Mumps', name: '流行性耳下腺炎' },
    { key: 'AcuteHemorrhagicConjunctivitis', name: '急性出血性結膜炎' },
    { key: 'EpidemicKeratoconjunctivitis', name: '流行性角結膜炎' },
    { key: 'BacterialMeningitis', name: '細菌性髄膜炎' },
    { key: 'AsepticMeningitis', name: '無菌性髄膜炎' },
    { key: 'MycoplasmaPneumonia', name: 'マイコプラズマ肺炎' },
    { key: 'ChlamydiaPneumonia', name: 'クラミジア肺炎' },
    { key: 'RotavirusGastroenteritis', name: '感染性胃腸炎（ロタウイルス）' }
];

let prefectureChart = null;
let currentRegionId = null;
let currentPrefecture = null;

window.setCurrentRegion = function (regionId) {
    currentRegionId = regionId;
    currentPrefecture = null; // グラフモード解除
};

// sanitization function
function sanitizeHTML(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

// CSVパーサー (簡易版)
function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).map(line => line.trim()).filter(line => line);
    return lines.map(line => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuote && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuote = !inQuote;
                }
            } else if (char === ',' && !inQuote) {
                result.push(sanitizeHTML(current));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(sanitizeHTML(current));
        return result;
    });
}

// キャッシュ設定
const CACHE_CONFIG = {
    COMBINED_DATA_KEY: 'infection_surveillance_combined_data', // 新しいキャッシュキー
    MAIN_EXPIRY: 1 * 60 * 60 * 1000, // 1時間
    HISTORY_EXPIRY: 24 * 60 * 60 * 1000 // 24時間 (combined data uses this for overall cache time)
};

// LocalForageの設定（メイン画面と設定を合わせるため、デフォルト設定を使用）
// メイン画面（../common.js）ではlocalforage.configを呼び出していないため、
// こちらもデフォルト（name: 'localforage', storeName: 'keyvaluepairs'）に合わせます。
// localforage.config({
//     name: 'KusuriCompassDB',
//     storeName: 'infection_surveillance_store'
// });

async function fetchCombinedData() {
    const now = Date.now();

    // 1. キャッシュ確認
    try {
        const cached = await localforage.getItem(CACHE_CONFIG.COMBINED_DATA_KEY);
        // combinedデータは、履歴データのキャッシュ期間に合わせる
        if (cached && (now - cached.timestamp < CACHE_CONFIG.HISTORY_EXPIRY)) {
            // console.log('Using cached combined data');
            return cached.data;
        }
    } catch (e) {
        console.warn('Combined data cache check failed:', e);
    }

    // 2. API取得 (type=combined)
    // console.log('Fetching combined data from API...');
    try {
        const response = await fetch(`${API_URL}?type=combined`, {
            redirect: 'follow' // リダイレクトを明示的に許可
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            // JSONでない場合はテキストとして取得してエラー詳細を確認
            const text = await response.text();
            console.error("Received non-JSON response:", text);
            throw new Error(`Invalid content-type: ${contentType}. Expected application/json. Response sample: ${text.substring(0, 100)}`);
        }

        const data = await response.json(); // Code.gsからJSONで返される

        // 3. キャッシュ保存
        try {
            await localforage.setItem(CACHE_CONFIG.COMBINED_DATA_KEY, {
                timestamp: now,
                data: data
            });
        } catch (e) {
            console.warn('Combined data cache save failed:', e);
        }

        return data;
    } catch (e) {
        console.error('Fetch error for combined data:', e);
        throw e;
    }
}

function processData(teitenRows, ariRows, tougaiRows, historicalArchives) {
    const influenzaData = parseTeitenRows(teitenRows, 'Influenza');
    const covid19Data = parseTeitenRows(teitenRows, 'COVID-19');
    const ariDataParsed = parseAriRows(ariRows, 'ARI');

    const allData = [...influenzaData, ...covid19Data, ...ariDataParsed];

    // 履歴データのパース
    const historyData = parseTougaiRows(tougaiRows);

    const alerts = generateAlerts(allData);

    // historicalArchives はすでにパースされていることを想定
    return {
        current: {
            data: allData,
            history: historyData,
            summary: { alerts }
        },
        archives: historicalArchives || []
    };
}

function parseTeitenRows(rows, diseaseName) {
    if (!rows || rows.length < 5) {
        console.warn('Rows are empty or too short', rows);
        return [];
    }

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const diseaseHeaderRow = rows[2];
    const subHeaderRow = rows[3];

    let searchKeys = [diseaseName];
    if (diseaseName === 'Influenza') searchKeys.push('インフルエンザ');
    if (diseaseName === 'COVID-19') searchKeys.push('新型コロナウイルス感染症', 'COVID-19');

    let diseaseColumnIndex = -1;

    for (let i = 1; i < diseaseHeaderRow.length; i++) {
        const cellValue = diseaseHeaderRow[i] || '';
        if (searchKeys.some(key => cellValue.includes(key))) {
            for (let j = i; j < subHeaderRow.length; j++) {
                if ((subHeaderRow[j] || '').includes('定当')) {
                    diseaseColumnIndex = j;
                    break;
                }
            }
            break;
        }
    }

    if (diseaseColumnIndex === -1) {
        console.warn(`${diseaseName} column not found.`);
        return [];
    }

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= diseaseColumnIndex) continue;

        const prefName = String(row[0] || '').trim();
        const value = parseFloat(row[diseaseColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseAriRows(rows, diseaseName) {
    if (!rows || rows.length < 5) return [];

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const valueColumnIndex = 2;

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();
        const value = parseFloat(row[valueColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseTougaiRows(rows) {
    if (!rows || rows.length < 10) return [];

    const historyData = [];
    const diseaseSections = {}; // { diseaseKey: startRowIndex }

    // 各疾患の開始行を探す
    for (let i = 0; i < rows.length; i++) {
        // A列 (index 0) をチェック
        const firstCell = String(rows[i][0] || '').trim();

        ALL_DISEASES.forEach(disease => {
            // 完全一致、または特定の文字列を含む場合を疾患セクションの開始とみなす
            // "インフルエンザ" という単独セル、あるいは "RSウイルス感染症" など
            if (firstCell === disease.name || (firstCell.includes(disease.name) && firstCell.length < disease.name.length + 5)) {
                // 既に検出済みの場合は上書きしない（最初の出現を採用）
                if (diseaseSections[disease.key] === undefined) {
                    diseaseSections[disease.key] = i;
                }
            }
        });
    }

    // 各疾患の履歴データを抽出
    ALL_DISEASES.forEach(disease => {
        if (diseaseSections[disease.key] !== undefined) {
            historyData.push(...extractHistoryFromSection(rows, diseaseSections[disease.key], disease.key, disease.name));
        }
    });

    return historyData;
}


// 修正版: 画像1のCSV構造（疾患名行 -> 週ヘッダー -> タイプヘッダー -> データ）に対応
function extractHistoryFromSection(rows, startRowIndex, diseaseKey, displayDiseaseName) {
    const results = [];
    let weekHeaderRowIndex = -1;
    let typeHeaderRowIndex = -1;

    // ヘッダー行を探索 (startRowIndexの直下から広めに確認)
    for (let i = startRowIndex + 1; i < Math.min(rows.length, startRowIndex + 20); i++) {
        const row = rows[i];
        const rowStr = row.join(','); // join(', ')だと見づらい可能性があるのでカンマのみ

        // 「週」が含まれる行を週ヘッダーとみなす
        if (rowStr.includes('週')) {
            const weekMatches = rowStr.match(/(\d{1,2})週/g);
            if (weekMatches && weekMatches.length > 5) { // 5つ以上週の表記があれば確度が高い
                weekHeaderRowIndex = i;
                // その次の行をタイプヘッダーと仮定
                if (i + 1 < rows.length) {
                    typeHeaderRowIndex = i + 1;
                }
                break;
            }
        }
    }

    if (weekHeaderRowIndex === -1 || typeHeaderRowIndex === -1) {
        return [];
    }

    // 重複する宣言を削除し、一度定義した変数を使用
    const weekHeaderRow = rows[weekHeaderRowIndex];
    const typeHeaderRow = rows[typeHeaderRowIndex];

    const weekColumns = [];

    for (let i = 0; i < weekHeaderRow.length; i++) {
        const weekText = String(weekHeaderRow[i]);
        // "01週" や "1週" にマッチ
        const match = weekText.match(/(\d{1,2})週/);
        if (match) {
            const weekNum = parseInt(match[1], 10);
            const currentType = String(typeHeaderRow[i] || '');

            // "定当" を含む列を探す
            if (currentType.includes('定当')) {
                weekColumns.push({ week: weekNum, colIndex: i });
            }
        }
    }

    if (weekColumns.length === 0) {
        console.warn(`No week columns found for ${displayDiseaseName}`);
        return [];
    }

    // データ抽出 (タイプヘッダーの次の行から)
    for (let i = typeHeaderRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();

        if (!prefName) continue; // 空行はスキップ

        // 次の疾患セクションの開始（またはフッター）を検知したら終了
        const isNextSection = ALL_DISEASES.some(d => d.key !== diseaseKey && prefName.includes(d.name));
        if (isNextSection || prefName.includes('報告数・定点当たり')) break;

        // 都道府県名リストに含まれるか、または「総数」である場合のみ処理
        const isValidPrefecture = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '総数'
        ].includes(prefName);

        if (isValidPrefecture) {
            const history = weekColumns.map(wc => {
                const val = parseFloat(row[wc.colIndex]);
                return { week: wc.week, value: isNaN(val) ? 0 : val };
            });

            results.push({
                disease: diseaseKey,
                prefecture: prefName === '総数' ? '全国' : prefName,
                history: history
            });
        }
    }
    return results;
}


function generateAlerts(data) {
    const comments = [];
    // 主要な疾患のみアラートを生成
    const diseasesForAlerts = ALL_DISEASES.filter(d => ['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    diseasesForAlerts.forEach(diseaseObj => {
        const diseaseKey = diseaseObj.key;
        const nationalData = data.find(item => item.disease === diseaseKey && item.prefecture === '全国');
        if (nationalData) {
            const value = nationalData.value;
            let level = 'normal';
            let message = '全国的に平常レベルです。';

            if (diseaseKey === 'Influenza') {
                if (value >= 30.0) { level = 'alert'; message = '全国的に警報レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '全国的に注意報レベルです。'; }
                else if (value >= 1.0) { level = 'normal'; message = '全国的に流行入りしています。'; }
            } else if (diseaseKey === 'COVID-19') {
                if (value >= 15.0) { level = 'alert'; message = '高い感染レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '注意が必要です。'; }
            } else if (diseaseKey === 'ARI') {
                if (value >= 120.0) { level = 'alert'; message = '流行レベルです。'; }
                else if (value >= 80.0) { level = 'warning'; message = '注意が必要です。'; }
            }

            comments.push({ disease: diseaseKey, level, message });
        }
    });
    return comments;
}

function renderSummary(data) {
    const container = document.getElementById('summary-cards');
    if (!container) return;
    
    // Clear previous content safely
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // 主要な疾患のみサマリーカードを表示
    const diseasesForSummary = ALL_DISEASES.filter(d => ['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    diseasesForSummary.forEach(diseaseObj => {
        const diseaseKey = diseaseObj.key;
        const nationalData = data.current.data.find(d => d.disease === diseaseKey && d.prefecture === '全国');
        const alert = data.current.summary.alerts.find(a => a.disease === diseaseKey);

        const card = document.createElement('div');
        card.className = `card ${currentDisease === diseaseKey ? 'active' : ''}`;
        card.dataset.disease = diseaseKey;
        card.dataset.status = alert ? alert.level : 'normal';
        card.onclick = () => switchDisease(diseaseKey);

        const h4 = document.createElement('h4');
        h4.textContent = getDiseaseName(diseaseKey);
        card.appendChild(h4);

        const pValue = document.createElement('p');
        pValue.className = 'value';
        pValue.textContent = `${nationalData ? nationalData.value.toFixed(2) : '-'}`;
        const spanUnit = document.createElement('span');
        spanUnit.className = 'unit';
        spanUnit.textContent = ' 定点当たり';
        pValue.appendChild(spanUnit);
        card.appendChild(pValue);

        const pStatus = document.createElement('p');
        pStatus.className = `status ${alert ? alert.level : 'normal'}`;
        pStatus.textContent = alert ? alert.message : 'データなし';
        card.appendChild(pStatus);

        container.appendChild(card);
    });
}

function switchDisease(disease) {
    currentDisease = disease;

    document.querySelectorAll('.summary-cards .card').forEach(card => {
        card.classList.toggle('active', card.dataset.disease === disease);
    });

    const otherDiseasesListView = document.getElementById('other-diseases-list-view');
    const isOtherDiseasesViewActive = otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden');

    if (isOtherDiseasesViewActive) {
        // 「その他の感染症」ビューがアクティブな場合、選択中の都道府県でリストを更新
        renderOtherDiseasesList(currentPrefecture || '全国');
    } else if (currentPrefecture) {
        // 都道府県別詳細チャート表示中の場合、疾患を切り替えてチャートを更新
        showPrefectureChart(currentPrefecture, disease);
    } else {
        switchView('main-view'); // メインビューを表示
    }

    // 右パネルの更新（地域詳細パネル）
    // グラフ表示中も、その都道府県の詳細データを表示し続けるのが自然
    // ただし、currentRegionId は showPrefectureChart で null にされることがあるため、
    // currentPrefecture がある場合はその ID を特定するか、
    // 既存のロジック（updateDetailPanel）が ID ベースなら ID が必要。
    // showPrefectureChart では currentRegionId = null にしているので、
    // グラフモードではここはスキップされるはず。

    if (!currentPrefecture) {
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, disease);
        } else {
            closePanel();
        }
    } else {
        // グラフモードの時も、その都道府県が含まれる地域の詳細を表示する
        if (typeof window.getRegionIdByPrefecture === 'function' && typeof window.updateDetailPanel === 'function' && cachedData) {
            const regionId = window.getRegionIdByPrefecture(currentPrefecture);
            if (regionId) {
                window.updateDetailPanel(regionId, cachedData, disease);
            } else {
                closePanel();
            }
        } else {
            closePanel();
        }
    }

    if (cachedData) {
        renderDashboard(disease, cachedData);
    }
}

function getDiseaseName(key) {
    const disease = ALL_DISEASES.find(d => d.key === key);
    return disease ? disease.name : key;
}

let currentChart = null;

// 全都道府県・全期間の最大値を取得する関数
function getGlobalMaxForDisease(disease) {
    let max = 0;
    // Current year
    if (cachedData.current && cachedData.current.history) {
        cachedData.current.history.forEach(h => {
            if (h.disease === disease) {
                h.history.forEach(item => {
                    if (item.value > max) max = item.value;
                });
            }
        });
    }
    // Archives
    if (cachedData.archives) {
        cachedData.archives.forEach(archive => {
            if (archive.data) {
                archive.data.forEach(h => {
                    if (h.disease === disease) {
                        h.history.forEach(item => {
                            if (item.value > max) max = item.value;
                        });
                    }
                });
            }
        });
    }
    return max;
}

// 比較グラフを描画する汎用関数
function renderComparisonChart(canvasId, diseaseKey, prefecture, yearDataSets, yAxisMax = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.warn(`Canvas element with ID '${canvasId}' not found.`);
        return;
    }
    const ctx = canvas.getContext('2d');

    // 既存のChartインスタンスがあれば破棄
    if (canvas.chart) {
        canvas.chart.destroy();
    }

    const isMobile = window.innerWidth <= 768; // スマホ判定簡易版

    const labels = []; // 週のラベル
    // すべてのデータセットから週のユニオンを取得しソート
    yearDataSets.forEach(ds => {
        ds.data.forEach(item => {
            if (!labels.includes(`${item.week}週`)) {
                labels.push(`${item.week}週`);
            }
        });
    });
    labels.sort((a, b) => parseInt(a) - parseInt(b));


    let pointRadius = 1;
    const datasets = yearDataSets.map(ds => {
        const year = ds.year;
        let borderColor;
        let borderWidth;

        // 配色ルール
        if (year === new Date().getFullYear()) {
            // 当年 (2025年): 感染レベルに応じて色を変える
            // 初期値（セグメント機能が効かない場合のフォールバック）
            borderColor = '#2ecc71';
            borderWidth = 3;
            pointRadius = 2.5;
        } else if (year === new Date().getFullYear() - 1) {
            // 昨年 (2024年): 少し薄い青（今年より目立たず、過去より目立つ）
            borderColor = '#A9CCE3';
            borderWidth = 2;
        } else {
            // それ以前 (2023年以前): 薄いグレー
            borderColor = '#E0E0E0'; // 薄いグレー
            borderWidth = 1;
        }

        // その他の感染症一覧ビューではポイントを消す
        if (canvasId.startsWith('chart-')) {
            pointRadius = 0;
        }

        // ラベルに「全国」が含まれるか、prefectureが「全国」の場合のラベル調整
        const dataLabel = prefecture === '全国' ? `${year}年 全国` : `${year}年 ${prefecture}`;

        const dataset = {
            label: dataLabel,
            data: labels.map(weekLabel => {
                const week = parseInt(weekLabel);
                const item = ds.data.find(d => d.week === week);
                return item ? item.value : null; // データがない週はnullでプロットしない
            }),
            borderColor: borderColor,
            borderWidth: borderWidth,
            pointRadius: pointRadius,
            fill: false,
            tension: 0.1,
            spanGaps: true, // データがない箇所の線は途切れる
            // カスタムプロパティとして元の色情報を保持
            _originalColor: borderColor,
            _originalBorderWidth: borderWidth
        };

        // 当年の場合、セグメントの色を動的に変更
        if (year === new Date().getFullYear()) {
            dataset.segment = {
                borderColor: ctx => {
                    // p0: start point, p1: end point
                    // 終了点の値に基づいて区間の色を決定する
                    // p0やp1がskipされている(null)場合のハンドリングはChart.jsがよしなにやってくれるが、
                    //念のため確認
                    if (!ctx.p1 || !ctx.p1.parsed) return borderColor;
                    const val = ctx.p1.parsed.y;
                    if (typeof getColorForValue === 'function') {
                        return getColorForValue(val, diseaseKey);
                    }
                    return borderColor;
                }
            };
            // ポイントの色も変更
            dataset.pointBackgroundColor = (ctx) => {
                const val = ctx.parsed.y;
                if (typeof getColorForValue === 'function') {
                    return getColorForValue(val, diseaseKey);
                }
                return borderColor;
            };
            dataset.pointBorderColor = (ctx) => {
                const val = ctx.parsed.y;
                if (typeof getColorForValue === 'function') {
                    return getColorForValue(val, diseaseKey);
                }
                return borderColor;
            };
        }

        return dataset;
    });

    canvas.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '定点当たり報告数' },
                    suggestedMax: yAxisMax
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
                axis: 'x'
            },
            elements: {
                point: {
                    hitRadius: 20, // タッチ判定範囲を広げる
                    radius: pointRadius,
                    hoverRadius: pointRadius + 2
                },
                line: {
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round'
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${prefecture} ${getDiseaseName(diseaseKey)} 週次推移`,
                    font: { size: 16, family: "'Noto Sans JP', sans-serif" }
                },
                tooltip: {
                    enabled: !isMobile,
                    mode: 'index',
                    intersect: false,
                    position: 'nearest',
                    bodyFont: { size: isMobile ? 14 : 13 },
                    titleFont: { size: isMobile ? 14 : 13 },
                    padding: 10,
                    boxPadding: 4,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    footerColor: '#fff'
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: isMobile ? 15 : 12,
                        padding: 15,
                        font: { size: isMobile ? 11 : 12 }
                    },
                    onClick: function (e, legendItem, legend) {
                        // 凡例クリック時にカードの拡大縮小が暴発しないように伝播を止める
                        if (e.native) {
                            e.native.stopPropagation();
                        }

                        const index = legendItem.datasetIndex;
                        const chart = legend.chart;
                        const datasets = chart.data.datasets;
                        const clickedDataset = datasets[index];

                        // すでにハイライトされているか（他のデータセットがグレーになっているか）を確認
                        // ここでは簡易的に、クリックされたデータセットの色が元の色で、かつ他のどれかがグレーなら「ハイライト中」とみなす
                        // あるいは、独自のフラグを管理する方が確実

                        // 今回クリックされたデータセット以外のデータセット
                        const otherDatasets = datasets.filter((_, i) => i !== index);

                        // 全てが元の色かどうか（ハイライトされていない状態）
                        const isAllOriginal = otherDatasets.every(ds => ds.borderColor === ds._originalColor);

                        if (isAllOriginal) {
                            // ハイライトされていない -> クリックされたものをハイライトし、他をグレーに
                            datasets.forEach((ds, i) => {
                                if (i === index) {
                                    // 元の色がグレーの場合は、強調色（濃い青など）に変更して目立たせる
                                    if (ds._originalColor === '#E0E0E0') {
                                        ds.borderColor = '#34495e'; // ネイビー
                                    } else {
                                        ds.borderColor = ds._originalColor;
                                    }
                                    ds.borderWidth = 3; // 強調時は太くする
                                } else {
                                    ds.borderColor = '#e0e0e0'; // グレー
                                    ds.borderWidth = 1;
                                }
                            });
                        } else {
                            // すでに何かがハイライトされている状態
                            // もしクリックされたのが「現在ハイライトされているもの」なら、解除（全て元に戻す）
                            // 別のものがハイライトされているなら、クリックされたものをハイライトに切り替え

                            // クリックされたものが現在グレー（＝非ハイライト）かどうか
                            const isClickedGray = clickedDataset.borderColor === '#e0e0e0';

                            if (isClickedGray) {
                                // 別のものがハイライトされていた -> これをハイライトに切り替え
                                datasets.forEach((ds, i) => {
                                    if (i === index) {
                                        if (ds._originalColor === '#E0E0E0') {
                                            ds.borderColor = '#34495e';
                                        } else {
                                            ds.borderColor = ds._originalColor;
                                        }
                                        ds.borderWidth = 3;
                                    } else {
                                        ds.borderColor = '#e0e0e0';
                                        ds.borderWidth = 1;
                                    }
                                });
                            } else {
                                // これがハイライトされていた -> 解除
                                datasets.forEach(ds => {
                                    ds.borderColor = ds._originalColor;
                                    ds.borderWidth = ds._originalBorderWidth;
                                });
                            }
                        }
                        chart.update();
                    }
                }
            }
        }
    });
}

function renderDashboard(disease, data) {
    if (typeof renderJapanMap === 'function') {
        if (document.getElementById('japan-map')) {
            renderJapanMap('japan-map', data.current, disease); // cachedData.currentを渡す
        }
    }

    renderTrendChart(disease, data.current); // cachedData.currentを渡す
}

function renderTrendChart(disease, data) {
    const chartView = document.getElementById('chart-view');
    if (!chartView) return;

    // Clear container and recreate canvas safely
    while (chartView.firstChild) {
        chartView.removeChild(chartView.firstChild);
    }
    const canvas = document.createElement('canvas');
    canvas.id = 'trendChart';
    chartView.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const diseaseData = data.data
        .filter(d => d.disease === disease && d.prefecture !== '全国')
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const labels = diseaseData.map(d => d.prefecture);
    const values = diseaseData.map(d => d.value);
    const backgroundColors = values.map(v => (typeof getColorForValue === 'function' ? getColorForValue(v, disease) : '#3498db'));

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '定点当たり報告数',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${getDiseaseName(disease)} 都道府県別 報告数 Top 10`,
                    font: { size: 14, family: "'Noto Sans JP', sans-serif" }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: '定点当たり報告数' }
                },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

function toggleCardExpansion(card) {
    const backdrop = document.getElementById('card-backdrop');
    const isExpanded = card.classList.contains('expanded');

    if (isExpanded) {
        // 縮小
        // プレースホルダーから元に戻す
        const placeholder = document.getElementById(`placeholder-${card.dataset.disease}`);
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(card, placeholder);
            placeholder.remove();
        }

        card.classList.remove('expanded');
        if (backdrop) backdrop.classList.remove('active');
    } else {
        // 拡大
        // 他に開いているカードがあれば閉じる
        const expandedCard = document.querySelector('.disease-card.expanded');
        if (expandedCard) {
            // 既存の拡大カードを縮小処理（プレースホルダー処理含む）
            const diseaseKey = expandedCard.dataset.disease;
            const placeholder = document.getElementById(`placeholder-${diseaseKey}`);
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(expandedCard, placeholder);
                placeholder.remove();
            }
            expandedCard.classList.remove('expanded');
        }

        // プレースホルダーを作成して挿入
        const placeholder = document.createElement('div');
        placeholder.id = `placeholder-${card.dataset.disease}`;
        placeholder.className = 'disease-card placeholder';
        placeholder.style.visibility = 'hidden'; // 見えないようにするがスペースは確保
        // 元のカードのサイズを維持するようスタイルをコピーできればベストだが、
        // 単にgrid内に挿入するだけでもレイアウト崩れは防げるはず。
        // 高さだけ合わせる
        placeholder.style.height = getComputedStyle(card).height;

        card.parentNode.insertBefore(placeholder, card);

        card.classList.add('expanded');
        // body直下に移動させて、z-indexやpositionの影響を受けないようにする（fixed配置のため）
        // ただし、fixedなら移動しなくてもいい場合もあるが、親のtransformなどの影響を避けるため移動が安全
        // 今回はCSSでfixedにしているので、DOM移動は必須ではないかもしれないが、
        // 拡大時に元の場所に穴が開くのを防ぐためにプレースホルダーは必須。

        if (backdrop) backdrop.classList.add('active');
    }
}

function showPrefectureChart(prefecture, disease) {
    currentPrefecture = prefecture;
    currentRegionId = null;

    document.getElementById('map-view').classList.add('hidden');
    const prefChartContainer = document.getElementById('pref-chart-container');
    prefChartContainer.classList.remove('hidden');

    // ARIの場合はグラフを表示せずメッセージを表示
    if (disease === 'ARI') {
        // prefChartContainer の子要素をクリア
        prefChartContainer.innerHTML = ''; 

        // 戻るボタンの作成
        const backButton = document.createElement('button');
        backButton.id = 'back-to-map-btn';
        backButton.textContent = '戻る';
        backButton.style.alignSelf = 'flex-end';
        backButton.style.marginBottom = '10px';
        backButton.style.zIndex = '10';
        backButton.style.padding = '5px 15px';
        backButton.style.cursor = 'pointer';
        backButton.style.backgroundColor = '#fff';
        backButton.style.border = '1px solid #ddd';
        backButton.style.borderRadius = '8px';
        backButton.style.fontSize = '0.9rem';
        backButton.style.fontWeight = '500';
        backButton.style.color = '#666';
        backButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
        prefChartContainer.appendChild(backButton);

        // メッセージラッパーの作成
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'pref-chart-wrapper';
        messageWrapper.style.display = 'flex';
        messageWrapper.style.justifyContent = 'center';
        messageWrapper.style.alignItems = 'center';
        messageWrapper.style.height = '100%';
        prefChartContainer.appendChild(messageWrapper);

        // メッセージPタグの作成
        const messageP = document.createElement('p');
        messageP.style.color = '#666';
        messageP.style.fontSize = '1rem';
        messageP.textContent = '急性呼吸器感染症 (ARI) の週次推移データはありません。';
        messageWrapper.appendChild(messageP);

        // 戻るボタンのイベントリスナー再設定
        const backBtn = prefChartContainer.querySelector('#back-to-map-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.getElementById('map-view').classList.remove('hidden');
                document.getElementById('pref-chart-container').classList.add('hidden');
                currentPrefecture = null;

                // コンテナの中身を元に戻す（Canvas再作成）
                // これをしないと次回別の疾患でグラフが表示できなくなるため、構造を復元する
                setTimeout(() => {
                    // prefChartContainer の子要素をクリア
                    prefChartContainer.innerHTML = '';

                    // 戻るボタンの作成
                    const backButton = document.createElement('button');
                    backButton.id = 'back-to-map-btn';
                    backButton.textContent = '戻る';
                    prefChartContainer.appendChild(backButton);

                    // グラフラッパーの作成
                    const chartWrapper = document.createElement('div');
                    chartWrapper.className = 'pref-chart-wrapper';
                    prefChartContainer.appendChild(chartWrapper);

                    // Canvasの作成
                    const canvas = document.createElement('canvas');
                    canvas.id = 'prefectureHistoryChart';
                    chartWrapper.appendChild(canvas);
                    // 再生成されたボタンにもイベントリスナーが必要だが、
                    // init()内のイベントリスナーは初期化時のみなので、ここでも付与するか、
                    // あるいは innerHTML を書き換えずに表示/非表示で制御する方が良い。
                    // ここでは簡易的に、innerHTML書き換え後に再度リスナーを設定する方針でいくが、
                    // 戻るボタンのIDが重複しないよう注意（生成時は1つなのでOK）
                    const newBackBtn = document.getElementById('back-to-map-btn');
                    if (newBackBtn) {
                        newBackBtn.addEventListener('click', () => {
                            document.getElementById('map-view').classList.remove('hidden');
                            document.getElementById('pref-chart-container').classList.add('hidden');
                            currentPrefecture = null;
                        });
                    }
                }, 100);
            });
        }
        return;
    } else {
        // ARI以外で、もしコンテナがメッセージ表示状態になっていたら復元する（念のため）
        if (!document.getElementById('prefectureHistoryChart')) {
            // prefChartContainer の子要素をクリア
            prefChartContainer.innerHTML = '';

            // 戻るボタンの作成
            const backButton = document.createElement('button');
            backButton.id = 'back-to-map-btn';
            backButton.textContent = '戻る';
            prefChartContainer.appendChild(backButton);

            // グラフラッパーの作成
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'pref-chart-wrapper';
            prefChartContainer.appendChild(chartWrapper);

            // Canvasの作成
            const canvas = document.createElement('canvas');
            canvas.id = 'prefectureHistoryChart';
            chartWrapper.appendChild(canvas);
            const newBackBtn = document.getElementById('back-to-map-btn');
            if (newBackBtn) {
                newBackBtn.addEventListener('click', () => {
                    document.getElementById('map-view').classList.remove('hidden');
                    document.getElementById('pref-chart-container').classList.add('hidden');
                    currentPrefecture = null;
                });
            }
        }

        // 既存の戻るボタンにイベントリスナーがない場合の対策（innerHTML書き換え後など）
        // ただし、init()で設定されたリスナーは要素が置換されると消える。
        // 毎回ここで設定しなおすのが安全。
        const backBtn = document.getElementById('back-to-map-btn');
        // 既存のリスナーを削除するのは難しいので、クローンして置換することでリセットするか、
        // 単純に上書きする。
        // ここでは、要素が存在すれば、新しい要素として再取得しているので、都度設定する。
        // 重複登録を防ぐため、replaceWithで要素をリフレッシュする手もあるが、
        // 簡易的に「クリック時の動作」を関数化して割り当てる。
        if (backBtn) {
            // クローンしてイベントリスナーを削除
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            newBackBtn.addEventListener('click', () => {
                document.getElementById('map-view').classList.remove('hidden');
                document.getElementById('pref-chart-container').classList.add('hidden');
                currentPrefecture = null;
            });
        }
    }

    const yearDataSets = [];
    const currentYear = new Date().getFullYear();

    // 当年のデータ
    const currentYearHistory = cachedData.current.history.find(h => h.disease === disease && h.prefecture === prefecture);
    if (currentYearHistory) {
        yearDataSets.push({ year: currentYear, data: currentYearHistory.history });
    }

    // 過去のアーカイブデータ
    cachedData.archives.forEach(archive => {
        // 当年のデータは、すでに currentYearHistory で追加されているので重複しないようにする
        if (parseInt(archive.year) === currentYear) return;

        const history = archive.data.find(d => d.disease === disease && d.prefecture === prefecture);
        if (history) {
            // Tougai CSVから抽出されたデータはすでにhistoryプロパティを持っている
            yearDataSets.push({ year: archive.year, data: history.history });
        }
    });

    if (yearDataSets.length === 0) {
        console.warn(`No history data for ${prefecture} (${disease}) across all years.`);
        const chartCanvas = document.getElementById('prefectureHistoryChart');
        if (chartCanvas && chartCanvas.parentNode) {
            const wrapper = chartCanvas.parentNode;
            const p = document.createElement('p');
            p.textContent = 'データがありません。';
            // スタイルを適用して中央に表示
            p.style.textAlign = 'center';
            p.style.padding = '2rem';
            p.style.color = '#666';
            wrapper.replaceChildren(p); // canvasを<p>に置き換える
        }
        return;
    }

    const globalMax = getGlobalMaxForDisease(disease);
    renderComparisonChart('prefectureHistoryChart', disease, prefecture, yearDataSets, globalMax);
}
window.showPrefectureChart = showPrefectureChart;

// ビューを切り替える汎用関数
function switchView(viewId) {
    console.log('DEBUG: switchView called with viewId:', viewId);
    const views = ['main-view', 'other-diseases-list-view']; // すべてのビューのID
    views.forEach(id => {
        const viewElement = document.getElementById(id);
        if (viewElement) {
            if (id === viewId) {
                viewElement.classList.remove('hidden');
                console.log(`DEBUG: Removed hidden from ${id}`);
            } else {
                viewElement.classList.add('hidden');
                console.log(`DEBUG: Added hidden to ${id}`);
            }
        }
    });
}

// その他感染症リストのレンダリング関数
function renderOtherDiseasesList(prefecture = '全国') {
    const gridContainer = document.getElementById('other-diseases-grid');
    if (!gridContainer) return;
    
    while (gridContainer.firstChild) {
        gridContainer.removeChild(gridContainer.firstChild);
    }

    // タイトルの更新
    const titleElement = document.getElementById('other-diseases-title');
    if (titleElement) {
        titleElement.textContent = `その他の感染症（${prefecture}）`;
    }

    // ドロップダウンの選択値を更新
    const prefSelect = document.getElementById('prefecture-select');
    if (prefSelect) {
        prefSelect.value = prefecture; // ドロップダウンの値を設定
    }

    // 主要3疾患以外をフィルタリング
    const otherDiseases = ALL_DISEASES.filter(d => !['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    otherDiseases.forEach(disease => {
        const card = document.createElement('div');
        card.className = 'disease-card';
        card.dataset.disease = disease.key;

        // card.onclick を削除し、ボタンでの拡大に変更

        // card-header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';

        const h4 = document.createElement('h4');
        h4.textContent = disease.name; // Use textContent for safety

        const expandButton = document.createElement('button');
        expandButton.className = 'expand-action-btn';
        expandButton.setAttribute('aria-label', '拡大表示');
// SVGをクリア
expandButton.innerHTML = ''; 

const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
svg.setAttribute("width", "20");
svg.setAttribute("height", "20");
svg.setAttribute("viewBox", "0 0 24 24");
svg.setAttribute("fill", "none");
svg.setAttribute("stroke", "currentColor");
svg.setAttribute("stroke-width", "2");
svg.setAttribute("stroke-linecap", "round");
svg.setAttribute("stroke-linejoin", "round");

const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
path.setAttribute("d", "M12 5v14M5 12h14");

svg.appendChild(path);
expandButton.appendChild(svg);

        cardHeader.appendChild(h4);
        cardHeader.appendChild(expandButton);
        card.appendChild(cardHeader);

        // chart-container
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${disease.key}`;
        chartContainer.appendChild(canvas);
        card.appendChild(chartContainer);

        // close-expanded-btn
        const closeButton = document.createElement('button');
        closeButton.className = 'close-expanded-btn';
        closeButton.setAttribute('aria-label', '閉じる');
        closeButton.textContent = '×'; // Use textContent for safety
        card.appendChild(closeButton);
        gridContainer.appendChild(card);

        // イベントリスナー設定
        const expandBtn = card.querySelector('.expand-action-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCardExpansion(card);
            });
        }


        const closeBtn = card.querySelector('.close-expanded-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCardExpansion(card);
            });
        }

        // 各疾患のデータと過去データを取得
        const yearDataSets = [];
        const currentYear = new Date().getFullYear();

        const currentHistory = cachedData.current.history.find(h => h.disease === disease.key && h.prefecture === prefecture);
        if (currentHistory) {
            yearDataSets.push({ year: currentYear, data: currentHistory.history });
        }

        cachedData.archives.forEach(archive => {
            if (parseInt(archive.year) === currentYear) return;

            const archiveHistory = archive.data.find(d => d.disease === disease.key && d.prefecture === prefecture);
            if (archiveHistory) {
                yearDataSets.push({ year: archive.year, data: archiveHistory.history });
            }
        });

        if (yearDataSets.length > 0) {
            const globalMax = getGlobalMaxForDisease(disease.key);
            renderComparisonChart(`chart-${disease.key}`, disease.key, prefecture, yearDataSets, globalMax);
        } else {
            // console.warn(`No history data for ${disease.name} in ${prefecture}`);
            const chartContainer = card.querySelector('.chart-container');
            if (chartContainer) {
                const p = document.createElement('p');
                p.className = 'no-data-message';
                p.textContent = 'データがありません';
                
                while (chartContainer.firstChild) {
                    chartContainer.removeChild(chartContainer.firstChild);
                }
                chartContainer.appendChild(p);

                chartContainer.style.display = 'flex';
                chartContainer.style.alignItems = 'center';
                chartContainer.style.justifyContent = 'center';
                chartContainer.style.fontSize = '0.9rem';
                chartContainer.style.color = '#999';
            }
        }
    });
}

function closePanel() {
    const content = document.getElementById('region-content');
    if (content) {
        const p = document.createElement('p');
        p.className = 'placeholder-text';
        p.textContent = '地図上のエリアをクリックすると詳細が表示されます。';
        content.replaceChildren(p);
    }
    const title = document.getElementById('region-title');
    if (title) {
        title.textContent = '地域詳細';
    }
}

function updateLoadingState(isLoading) {
    const container = document.body;
    if (isLoading) {
        container.classList.add('loading');
    } else {
        container.classList.remove('loading');
    }
}

async function reloadData() {
    try {
        updateLoadingState(true);

        // 1. 既存のチャートインスタンスを破棄
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        const prefectureHistoryChartCanvas = document.getElementById('prefectureHistoryChart');
        if (prefectureHistoryChartCanvas && prefectureHistoryChartCanvas.chart) {
            prefectureHistoryChartCanvas.chart.destroy();
        }

        // 2. 表示をスケルトンに置き換え
        const summaryCardsContainer = document.getElementById('summary-cards');
        summaryCardsContainer.innerHTML = ''; // Clear existing content

        const skeletonWrapper = document.createElement('div');
        skeletonWrapper.className = 'skeleton-card-wrapper';

        for (let i = 0; i < 5; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'skeleton-card';

            const skeletonTitle = document.createElement('div');
            skeletonTitle.className = 'skeleton skeleton-title';
            skeletonCard.appendChild(skeletonTitle);

            const skeletonValue = document.createElement('div');
            skeletonValue.className = 'skeleton skeleton-value';
            skeletonCard.appendChild(skeletonValue);

            const skeletonStatus = document.createElement('div');
            skeletonStatus.className = 'skeleton skeleton-status';
            skeletonCard.appendChild(skeletonStatus);

            skeletonWrapper.appendChild(skeletonCard);
        }
        summaryCardsContainer.appendChild(skeletonWrapper);
                const japanMapContainer = document.getElementById('japan-map');
        japanMapContainer.innerHTML = ''; // Clear existing content
        const skeletonMap = document.createElement('div');
        skeletonMap.className = 'skeleton skeleton-map';
        japanMapContainer.appendChild(skeletonMap);
        const chartView = document.getElementById('chart-view');
        if (chartView) {
                    chartView.innerHTML = ''; // Clear existing content
        const skeletonChart = document.createElement('div');
        skeletonChart.className = 'skeleton skeleton-chart';
        chartView.appendChild(skeletonChart);
        }
        const otherDiseasesGrid = document.getElementById('other-diseases-grid');
        if (otherDiseasesGrid) {
            otherDiseasesGrid.innerHTML = '';
        }

        // 都道府県チャートがアクティブな場合はスケルトンを追加
        const prefChartContainer = document.getElementById('pref-chart-container');
        if (prefChartContainer && !prefChartContainer.classList.contains('hidden')) {
            prefChartContainer.innerHTML = ''; // 既存のチャートやメッセージをクリア
            const skeletonPrefChart = document.createElement('div');
            skeletonPrefChart.className = 'skeleton skeleton-chart large'; // より大きなスケルトンスタイルを使用（もしあれば）
            prefChartContainer.appendChild(skeletonPrefChart);
        }

        // 地域詳細パネルがアクティブな場合はスケルトンを追加
        const regionContent = document.getElementById('region-content');
        if (regionContent && currentRegionId) { // currentRegionId が null でない、つまり地域が選択されている場合のみ処理
            regionContent.innerHTML = ''; // 既存の内容をクリア
            const skeletonRegionDetail = document.createElement('div');
            skeletonRegionDetail.className = 'skeleton skeleton-chart large'; // 棒グラフなので 'skeleton-chart' を流用
            regionContent.appendChild(skeletonRegionDetail);
        }

        // キャッシュをクリア
        await localforage.removeItem(CACHE_CONFIG.COMBINED_DATA_KEY);
        console.log('Cache cleared for combined data reload.');

        // データ取得とレンダリングのコア処理を再実行
        await loadAndRenderData();

        // 地域が選択されていた場合は地域詳細パネルを再描画
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, currentDisease);
        }

        const otherDiseasesListView = document.getElementById('other-diseases-list-view');
        if (otherDiseasesListView && !otherDiseasesListView.classList.contains('hidden')) {
            const prefSelect = document.getElementById('prefecture-select');
            renderOtherDiseasesList(prefSelect ? prefSelect.value : '全国');
        }

    } catch (error) {
        console.error('Error reloading data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            while (summaryCards.firstChild) {
                summaryCards.removeChild(summaryCards.firstChild);
            }
            const errorPara = document.createElement('p');
            errorPara.className = 'error';
            errorPara.textContent = `データの再取得に失敗しました。詳細: ${error.message}`;
            summaryCards.appendChild(errorPara);
        }
    } finally {
        // 少し待ってからローディング表示を消す
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);
    }
}

function initEventListeners() {
    const accordionToggle = document.getElementById('accordion-toggle');
    const accordionContent = document.getElementById('accordion-content');
    if (accordionToggle && accordionContent) {
        accordionToggle.addEventListener('click', () => {
            accordionContent.classList.toggle('open');
            accordionToggle.classList.toggle('open');
        });
    }

    const reloadBtn = document.getElementById('reload-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadData);
    }

    const closeBtn = document.getElementById('detail-panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePanel);
    }

    const backdrop = document.getElementById('card-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            const expandedCard = document.querySelector('.disease-card.expanded');
            if (expandedCard) {
                toggleCardExpansion(expandedCard);
            }
        });
    }

    const backBtn = document.getElementById('back-to-map-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('map-view').classList.remove('hidden');
            document.getElementById('pref-chart-container').classList.add('hidden');
            currentPrefecture = null;
        });
    }

    const otherDiseasesBtn = document.getElementById('other-diseases-btn');
    if (otherDiseasesBtn) {
        otherDiseasesBtn.addEventListener('click', () => {
            const currentView = document.getElementById('other-diseases-list-view');
            const isOtherDiseasesView = currentView && !currentView.classList.contains('hidden');

            if (isOtherDiseasesView) {
                // メインビューに戻る処理
                otherDiseasesBtn.textContent = 'その他の感染症';
                document.getElementById('summary-cards').classList.remove('hidden');
                switchView('main-view');
            } else {
                // 「その他の感染症」ビューに切り替える処理
                otherDiseasesBtn.textContent = 'インフルエンザ・COVID-19';
                document.getElementById('summary-cards').classList.add('hidden');
                switchView('other-diseases-list-view');
                renderOtherDiseasesList(currentPrefecture || '全国'); // 現在の都道府県を渡す
            }

                // 都道府県リストの生成（初回のみ）
                const prefSelect = document.getElementById('prefecture-select');
                if (prefSelect && prefSelect.options.length <= 1) {
                    const prefectures = [
                        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
                        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
                        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
                        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
                        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
                        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
                        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
                    ];
                    prefectures.forEach(pref => {
                        const option = document.createElement('option');
                        option.value = pref;
                        option.textContent = pref;
                        prefSelect.appendChild(option);
                    });

                    // currentPrefecture が設定されていれば、それを初期選択する
                    if (currentPrefecture) {
                        prefSelect.value = currentPrefecture;
                    }

                    prefSelect.addEventListener('change', (e) => {
                        renderOtherDiseasesList(e.target.value);
                    });
                }
        });
    }
}
// 過去データを取得する関数
async function fetchHistoryData() {
    try {
        const response = await fetch(`${API_URL}?type=history`, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        return data.data; // { data: [...], logs: [...] } の data を返す
    } catch (e) {
        console.warn('Failed to fetch history data:', e);
        return [];
    }
}

// 最新データを取得する関数
async function fetchLatestData() {
    try {
        const response = await fetch(`${API_URL}?type=latest`, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error('Failed to fetch latest data:', e);
        throw e;
    }
}

async function loadAndRenderData() {
    try {
        const now = Date.now();
        let useCache = false;
        let cachedCombined = null;

        // 1. キャッシュの確認
        try {
            cachedCombined = await localforage.getItem(CACHE_CONFIG.COMBINED_DATA_KEY);
            // console.log('DEBUG: Cached combined data from main.js:', cachedCombined);
            // console.log('DEBUG: Current time:', now);
            if (cachedCombined) {
                // console.log('DEBUG: Cached timestamp:', cachedCombined.timestamp);
                // console.log('DEBUG: Cache age:', now - cachedCombined.timestamp);
                // console.log('DEBUG: Cache expiry (HISTORY_EXPIRY):', CACHE_CONFIG.HISTORY_EXPIRY);
            }
            if (cachedCombined && (now - cachedCombined.timestamp < CACHE_CONFIG.HISTORY_EXPIRY)) {
                // console.log('DEBUG: Cache is valid and will be used.');
                useCache = true;
            } else {
                // console.log('DEBUG: Cache is invalid or too old, will fetch new data.');
            }
        } catch (e) {
            console.warn('Cache check failed in main.js:', e);
        }

        if (useCache && cachedCombined) {
            // キャッシュデータを使用
            const data = cachedCombined.data; // { latestData, historyData }
            const latestData = data.latestData;
            const historyData = data.historyData || [];

            const teitenCsv = latestData.Teiten;
            const ariCsv = latestData.ARI;
            const tougaiCsv = latestData.Tougai;

            const teitenData = parseCSV(teitenCsv);
            const ariData = parseCSV(ariCsv);
            const tougaiData = parseCSV(tougaiCsv);

            const historicalArchives = historyData.map(archive => {
                const rows = parseCSV(archive.content);
                return {
                    year: archive.year,
                    data: parseTougaiRows(rows)
                };
            });

            // 一括で処理
            cachedData = processData(teitenData, ariData, tougaiData, historicalArchives);

            // 日付表示更新
            updateDateDisplay(teitenCsv);

            // 描画
            renderSummary(cachedData);
            renderDashboard(currentDisease, cachedData);
            updateLoadingState(false);

        } else {
            // 2. キャッシュがない場合: 最新データを先に取得・表示
            console.log('Fetching latest data from API...');
            const latestData = await fetchLatestData();

            const teitenCsv = latestData.Teiten;
            const ariCsv = latestData.ARI;
            const tougaiCsv = latestData.Tougai;

            const teitenData = parseCSV(teitenCsv);
            const ariData = parseCSV(ariCsv);
            const tougaiData = parseCSV(tougaiCsv);

            // まず最新データのみで初期化
            cachedData = processData(teitenData, ariData, tougaiData, []);

            // 日付表示更新
            updateDateDisplay(teitenCsv);

                        renderSummary(cachedData);

                        renderDashboard(currentDisease, cachedData);

                        updateLoadingState(false);

            // 3. 過去データを非同期で取得して追加
            // console.log('Fetching history data in background...');
            const historyData = await fetchHistoryData();

            if (historyData) { // historyData might be empty array
                const historicalArchives = historyData.map(archive => {
                    const rows = parseCSV(archive.content);
                    return {
                        year: archive.year,
                        data: parseTougaiRows(rows)
                    };
                });

                // 既存のデータに過去データを統合
                cachedData.archives = historicalArchives;

                // console.log(`Loaded ${historicalArchives.length} history files. Updating charts...`);

                // グラフのみ再描画 (現在の表示状態を維持)
                if (currentPrefecture) {
                    showPrefectureChart(currentPrefecture, currentDisease);
                } else {
                    // その他感染症リストが表示中なら更新
                    if (!document.getElementById('other-diseases-list-view').classList.contains('hidden')) {
                        const prefSelect = document.getElementById('prefecture-select');
                        renderOtherDiseasesList(prefSelect ? prefSelect.value : '全国');
                    }
                }

                // 4. 次回のためにキャッシュに保存 (Combined形式で)
                try {
                    const combinedData = {
                        latestData: latestData,
                        historyData: historyData
                    };
                    await localforage.setItem(CACHE_CONFIG.COMBINED_DATA_KEY, {
                        timestamp: Date.now(),
                        data: combinedData
                    });
                    // console.log('Data cached successfully (constructed from split fetch).');
                } catch (e) {
                    console.warn('Failed to save cache:', e);
                }
            }
        }

    } catch (e) {
        console.error('Error in loadAndRenderData:', e);
        throw e;
    }
}

function updateDateDisplay(csvContent) {
    const dateMatch = csvContent.match(/(\d{4})年(\d{1,2})週(?:\((.*?)\))?/);
    const dateElement = document.getElementById('update-date');
    if (dateElement) {
        if (dateMatch) {
            const year = dateMatch[1];
            const week = dateMatch[2];
            let dateRange = dateMatch[3];

            if (dateRange) {
                // Convert 11月17日〜11月23日 to 11/17～11/23
                dateRange = dateRange.replace(/月/g, '/').replace(/日/g, '').replace(/[〜~]/g, '～');
                dateElement.textContent = `${year}年 第${week}週 （${dateRange}）`;
            } else {
                dateElement.textContent = `${year}年 第${week}週`;
            }
        } else {
            dateElement.textContent = new Date().toLocaleDateString('ja-JP');
        }
    }
}

async function init() {
    try {
        updateLoadingState(true);

        initEventListeners();
        console.log("DEBUG: initEventListeners called");

        await loadAndRenderData();

        // データの取得・処理が終わってから少し待つ（アニメーションを見せるため）
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);

    } catch (error) {
        console.error('Error fetching data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            while (summaryCards.firstChild) {
                summaryCards.removeChild(summaryCards.firstChild);
            }
            const errorPara = document.createElement('p');
            errorPara.className = 'error';
            errorPara.textContent = `データの取得に失敗しました。詳細: ${error.message}`;
            summaryCards.appendChild(errorPara);
        }
        updateLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', init);
