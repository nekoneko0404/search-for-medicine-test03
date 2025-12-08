const API_URL = 'https://script.google.com/macros/s/AKfycbyPukigFWkXjjB9nN8Ve5Xlnn2rgGqiPTCGU8m3F1ETMWYCyxHgd1juOZyGlT_-ljWXNA/exec';
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
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    });
}

// キャッシュ設定
const CACHE_CONFIG = {
    MAIN_DATA_KEY: 'infection_surveillance_main_data',
    HISTORY_DATA_KEY: 'infection_surveillance_history_data',
    MAIN_EXPIRY: 1 * 60 * 60 * 1000, // 1時間
    HISTORY_EXPIRY: 24 * 60 * 60 * 1000 // 24時間
};

// LocalForageの設定（DB名を統一して親画面と確実に共有する）
localforage.config({
    name: 'KusuriCompassDB',
    storeName: 'infection_surveillance_store'
});

async function fetchMainData() {
    const now = Date.now();

    // 1. キャッシュ確認
    try {
        const cached = await localforage.getItem(CACHE_CONFIG.MAIN_DATA_KEY);
        if (cached && (now - cached.timestamp < CACHE_CONFIG.MAIN_EXPIRY)) {
            console.log('Using cached main data');
            return cached.data; // { Teiten: ..., ARI: ..., Tougai: ... }
        }
    } catch (e) {
        console.warn('Cache check failed:', e);
    }

    // 2. API取得 (type=all)
    console.log('Fetching main data from API...');
    try {
        const response = await fetch(`${API_URL}?type=all`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();

        // 3. キャッシュ保存
        try {
            await localforage.setItem(CACHE_CONFIG.MAIN_DATA_KEY, {
                timestamp: now,
                data: data
            });
        } catch (e) {
            console.warn('Cache save failed:', e);
        }

        return data;
    } catch (e) {
        console.error('Fetch error for main data:', e);
        throw e;
    }
}

async function fetchHistoryData() {
    const now = Date.now();

    // 1. キャッシュ確認
    try {
        const cached = await localforage.getItem(CACHE_CONFIG.HISTORY_DATA_KEY);
        if (cached && (now - cached.timestamp < CACHE_CONFIG.HISTORY_EXPIRY)) {
            console.log('Using cached history data');
            return cached.data;
        }
    } catch (e) {
        console.warn('History cache check failed:', e);
    }

    // 2. API取得 (type=history)
    console.log('Fetching history data from API...');
    try {
        const response = await fetch(`${API_URL}?type=history`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const text = await response.text();

        // 3. キャッシュ保存
        try {
            await localforage.setItem(CACHE_CONFIG.HISTORY_DATA_KEY, {
                timestamp: now,
                data: text
            });
        } catch (e) {
            console.warn('History cache save failed:', e);
        }

        return text;
    } catch (e) {
        console.error('Fetch error for history data:', e);
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
    // 疾患名行の下に説明書きなどが入る場合があるため、探索範囲を広げる
    for (let i = startRowIndex + 1; i < Math.min(rows.length, startRowIndex + 20); i++) {
        const rowStr = rows[i].join('');
        // 「週」または「第1週」などが含まれる行を週ヘッダーとみなす
        // 数字が含まれていなくても、明らかに週の並び（1週, 2週...）がある行を探すのがベストだが、
        // ここでは簡易的に「週」が含まれる行を候補とする
        if (rowStr.includes('週')) {
            // さらにその行のセルを見て、"1週" や "01週" のようなパターンが複数あるか確認
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
        console.warn(`Header rows not found for ${displayDiseaseName} (start: ${startRowIndex})`);
        return [];
    }

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
    container.innerHTML = '';
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

        card.innerHTML = `
            <h4>${getDiseaseName(diseaseKey)}</h4>
            <p class="value">${nationalData ? nationalData.value.toFixed(2) : '-'} <span class="unit">定点当たり</span></p>
            <p class="status ${alert ? alert.level : 'normal'}">${alert ? alert.message : 'データなし'}</p>
        `;
        container.appendChild(card);
    });
}

function switchDisease(disease) {
    currentDisease = disease;

    document.querySelectorAll('.summary-cards .card').forEach(card => {
        card.classList.toggle('active', card.dataset.disease === disease);
    });


    // グラフ表示モード（都道府県選択中）の場合は、グラフを更新して維持する
    if (currentPrefecture) {
        showPrefectureChart(currentPrefecture, disease);
    } else {
        switchView('main-view'); // メインビューを表示
    }

    // 右パネルの更新（地域詳細パネル）
    // グラフ表示中も、その都道府県の詳細データを表示し続けるのが自然
    // ただし、currentRegionId は showPrefectureChart で null にされることがあるため、
    // currentPrefecture がある場合はその ID を特定するか、
    // 既存のロジック（updateDetailPanel）が ID ベースなら ID が必要。
    // showPrefectureChart では currentRegionId = null にしているが、
    // updateDetailPanel は regionId を引数にとる。
    // ここでは、地図モードの時のみ updateDetailPanel を呼ぶか、
    // あるいは currentPrefecture から regionId を逆引きできればベストだが、
    // 簡易的に「地図モードで選択中の場合」のみ更新し、グラフモードでは詳細パネルは
    // そのまま（あるいは閉じる）とするのが安全かもしれない。
    // しかし、要望は「そのままその都道府県のグラフを表示」なので、右パネルの挙動については
    // 明示されていないが、整合性を保つなら閉じるか、その県の情報を出すべき。
    // 現状の switchDisease の実装では、currentRegionId があれば updateDetailPanel を呼んでいる。
    // showPrefectureChart で currentRegionId = null になるので、
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


    const datasets = yearDataSets.map(ds => {
        const year = ds.year;
        let borderColor;
        let borderWidth;
        let pointRadius = 1;

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
            plugins: {
                title: {
                    display: true,
                    text: `${prefecture} ${getDiseaseName(diseaseKey)} 週次推移`,
                    font: { size: 16, family: "'Noto Sans JP', sans-serif" }
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    onClick: function (e, legendItem, legend) {
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
            },
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
            },
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
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

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

function showPrefectureChart(prefecture, disease) {
    currentPrefecture = prefecture;
    currentRegionId = null;

    document.getElementById('map-view').classList.add('hidden');
    const prefChartContainer = document.getElementById('pref-chart-container');
    prefChartContainer.classList.remove('hidden');

    // ARIの場合はグラフを表示せずメッセージを表示
    if (disease === 'ARI') {
        prefChartContainer.innerHTML = `
            <button id="back-to-map-btn" style="align-self: flex-end; margin-bottom: 10px; z-index: 10; padding: 5px 15px; cursor: pointer; background-color: #fff; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem; font-weight: 500; color: #666; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);">戻る</button>
            <div class="pref-chart-wrapper" style="display: flex; justify-content: center; align-items: center; height: 100%;">
                <p style="color: #666; font-size: 1rem;">急性呼吸器感染症 (ARI) の週次推移データはありません。</p>
            </div>
        `;

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
                    prefChartContainer.innerHTML = `
                        <button id="back-to-map-btn">戻る</button>
                        <div class="pref-chart-wrapper">
                            <canvas id="prefectureHistoryChart"></canvas>
                        </div>
                    `;
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
            prefChartContainer.innerHTML = `
                <button id="back-to-map-btn">戻る</button>
                <div class="pref-chart-wrapper">
                    <canvas id="prefectureHistoryChart"></canvas>
                </div>
            `;
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
        // データがない場合の表示を考慮することもできる
        document.getElementById('prefectureHistoryChart').innerHTML = '<p>データがありません。</p>';
        return;
    }

    const globalMax = getGlobalMaxForDisease(disease);
    renderComparisonChart('prefectureHistoryChart', disease, prefecture, yearDataSets, globalMax);
}
window.showPrefectureChart = showPrefectureChart;

// ビューを切り替える汎用関数
function switchView(viewId) {
    const views = ['main-view', 'other-diseases-list-view']; // すべてのビューのID
    views.forEach(id => {
        const viewElement = document.getElementById(id);
        if (viewElement) {
            if (id === viewId) {
                viewElement.classList.remove('hidden');
            } else {
                viewElement.classList.add('hidden');
            }
        }
    });
}

// その他感染症リストのレンダリング関数
function renderOtherDiseasesList(prefecture = '全国') {
    const gridContainer = document.getElementById('other-diseases-grid');
    if (!gridContainer) return;
    gridContainer.innerHTML = ''; // 既存のカードをクリア

    // タイトルの更新
    const titleElement = document.getElementById('other-diseases-title');
    if (titleElement) {
        titleElement.textContent = `その他の感染症（${prefecture}）`;
    }

    // 主要3疾患以外をフィルタリング
    const otherDiseases = ALL_DISEASES.filter(d => !['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    otherDiseases.forEach(disease => {
        const card = document.createElement('div');
        card.className = 'disease-card';
        card.dataset.disease = disease.key;
        // card.onclick = ... クリックイベントは無効化

        card.innerHTML = `
            <h4>${disease.name}</h4>
            <div class="chart-container">
                <canvas id="chart-${disease.key}"></canvas>
            </div>
        `;
        gridContainer.appendChild(card);

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
                chartContainer.innerHTML = '<p class="no-data-message">データがありません</p>';
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
        content.innerHTML = '<p class="placeholder-text">地図上のエリアをクリックすると詳細が表示されます。</p>';
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

        // キャッシュをクリア
        await Promise.all([
            localforage.removeItem(CACHE_CONFIG.MAIN_DATA_KEY),
            localforage.removeItem(CACHE_CONFIG.HISTORY_DATA_KEY)
        ]);
        console.log('Cache cleared for data reload.');

        // データ取得とレンダリングのコア処理を再実行
        await loadAndRenderData();

    } catch (error) {
        console.error('Error reloading data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            summaryCards.innerHTML = `<p class="error">データの再取得に失敗しました。詳細: ${error.message}</p>`;
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
            const isOtherDiseasesView = !currentView.classList.contains('hidden');

            if (isOtherDiseasesView) {
                // メインビューに戻る処理
                otherDiseasesBtn.textContent = 'その他の感染症';
                document.getElementById('summary-cards').classList.remove('hidden');
                const dashboardHeader = document.querySelector('.dashboard-header');
                if (dashboardHeader) dashboardHeader.classList.remove('hidden');
                switchView('main-view');
            } else {
                // 「その他の感染症」ビューに切り替える処理
                otherDiseasesBtn.textContent = 'インフルエンザ・COVID-19';
                document.getElementById('summary-cards').classList.add('hidden');
                const dashboardHeader = document.querySelector('.dashboard-header');
                if (dashboardHeader) dashboardHeader.classList.add('hidden');
                switchView('other-diseases-list-view');

                // 現在の都道府県を引き継ぐ（未選択時は全国）
                let initialPref = currentPrefecture || '全国';

                const prefSelect = document.getElementById('prefecture-select');
                if (prefSelect) {
                    // 都道府県リストの生成（初回のみ）
                    if (prefSelect.options.length <= 1) {
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

                        // イベントリスナー追加
                        prefSelect.addEventListener('change', (e) => {
                            renderOtherDiseasesList(e.target.value);
                        });
                    }
                    // 初期値をセット
                    prefSelect.value = initialPref;
                }
                renderOtherDiseasesList(initialPref);
            }
        });
    }
}

async function loadAndRenderData() {
    // 並列でデータ取得（キャッシュがあればそれを使用）
    const [mainData, historyJson] = await Promise.all([
        fetchMainData(),
        fetchHistoryData()
    ]);

    const teitenCsv = mainData.Teiten;
    const ariCsv = mainData.ARI;
    const tougaiCsv = mainData.Tougai;

    const teitenData = parseCSV(teitenCsv);
    const ariData = parseCSV(ariCsv);
    const tougaiData = parseCSV(tougaiCsv);

    // 過去データ（JSON形式）をパース
    let historicalArchives = [];
    try {
        const response = JSON.parse(historyJson);
        let archives = [];

        // デバッグログの出力
        if (response.logs && Array.isArray(response.data)) {
            console.group("Backend (GAS) Logs");
            response.logs.forEach(log => console.log(log));
            console.groupEnd();
            archives = response.data;
        } else if (Array.isArray(response)) {
            archives = response; // 旧形式互換
        }

        console.log(`Fetched ${archives.length} history files from backend.`);

        historicalArchives = archives.map(archive => {
            const rows = parseCSV(archive.content);
            return {
                year: archive.year,
                data: parseTougaiRows(rows) // CSV行データをオブジェクト配列に変換
            };
        });
    } catch (e) {
        console.warn("Failed to parse history JSON. Backend might be returning error text or old version.", e);
        console.log("Raw response for history:", historyJson);
        // 過去データなしで続行
    }

    cachedData = processData(teitenData, ariData, tougaiData, historicalArchives);

    const dateMatch = teitenCsv.match(/(\d{4})年(\d{1,2})週(?:\((.*?)\))?/);
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

    renderSummary(cachedData);
    renderDashboard(currentDisease, cachedData);

    // 地域詳細パネルの初期表示（「地図上のエリアをクリック...」を表示）
    closePanel();
}


async function init() {
    try {
        updateLoadingState(true);

        initEventListeners();

        await loadAndRenderData();

        // データの取得・処理が終わってから少し待つ（アニメーションを見せるため）
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);

    } catch (error) {
        console.error('Error fetching data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            summaryCards.innerHTML = `<p class="error">データの取得に失敗しました。詳細: ${error.message}</p>`;
        }
        updateLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', init);
