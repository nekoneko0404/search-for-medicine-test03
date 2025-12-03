/** 
 * Hiyari Hat App Main Logic (test03)
 * - Optimized API queries searching both DATMEDNAME and DATGENERIC
 * - Compact single-row UI with auto-search on Enter
 * - 3-column grid layout for wide screens
 */

import { normalizeString, debounce } from '../../js/utils.js';
import { showMessage } from '../../js/ui.js';

const PROXY_URL = 'https://hiyari-proxy-708146219355.asia-east1.run.app/proxy';
const batchSize = 30;

// DOM Elements
const elements = {
    searchInput: null,
    searchBtn: null,
    filterInput: null,
    randomBtn: null,
    resultsContainer: null,
    loadingIndicator: null,
    errorMsg: null,
    mainHeader: null,
    mainFooter: null,
    reloadButton: null
};

let currentData = [];
let currentlyDisplayedCount = 0;

/* -------------------------------------------------
   初期化
------------------------------------------------- */
function initElements() {
    elements.searchInput = document.getElementById('search-input');
    elements.searchBtn = document.getElementById('search-btn');
    elements.filterInput = document.getElementById('filter-input');
    elements.randomBtn = document.getElementById('random-btn');
    elements.resultsContainer = document.getElementById('results-container');
    elements.loadingIndicator = document.getElementById('loading');
    elements.errorMsg = document.getElementById('error-msg');
    elements.mainHeader = document.getElementById('mainHeader');
    elements.mainFooter = document.getElementById('mainFooter');
    elements.reloadButton = document.getElementById('reload-button');
}

/* -------------------------------------------------
   UI 補助関数
------------------------------------------------- */
function showLoading(show) {
    if (show) elements.loadingIndicator.classList.remove('hidden');
    else elements.loadingIndicator.classList.add('hidden');
}

function showError(msg) {
    elements.errorMsg.textContent = msg;
    elements.errorMsg.classList.remove('hidden');
}

function hideError() {
    elements.errorMsg.classList.add('hidden');
}

/* -------------------------------------------------
   API URL 生成
------------------------------------------------- */
function buildApiUrl(searchKeyword, filterWord) {
    const params = new URLSearchParams();
    params.append('count', '50'); // Limit results for performance
    params.append('order', '2'); // Sort by newest first

    // Sanitize inputs
    const sanitize = (input) => {
        return input.replace(/[^ぁ-んァ-ヶー一-龯A-Za-z0-9\s\-,、.()（）]/g, '').trim();
    };

    const cleanSearch = sanitize(searchKeyword);
    const cleanFilter = sanitize(filterWord);

    if (cleanSearch && !cleanFilter) {
        // Drug/Ingredient name only - search in both DATMEDNAME and DATGENERIC fields
        params.append('item', 'DATMEDNAME');
        params.append('item', 'DATGENERIC');
        params.append('word', cleanSearch);
        params.append('condition', 'any'); // OR search across fields
    } else {
        // Combined search - full-text search
        const combinedWord = [cleanSearch, cleanFilter].filter(Boolean).join(' ');
        if (combinedWord) {
            params.append('word', combinedWord);
            if (cleanSearch && cleanFilter) {
                params.append('condition', 'all'); // AND search
            }
        }
    }

    return `${PROXY_URL}?${params.toString()}`;
}

/* -------------------------------------------------
   データ取得
------------------------------------------------- */
async function fetchIncidents() {
    const searchKeyword = elements.searchInput.value.trim();
    const filterWord = elements.filterInput.value.trim();

    if (!searchKeyword && !filterWord) {
        elements.resultsContainer.innerHTML = '';
        hideError();
        document.body.classList.remove('search-mode');
        return;
    }

    showLoading(true);
    hideError();
    elements.resultsContainer.innerHTML = '';
    currentlyDisplayedCount = 0;

    try {
        const response = await fetch(buildApiUrl(searchKeyword, filterWord));
        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        const errorNode = xmlDoc.querySelector('Error');
        if (errorNode) throw new Error(`API Error: ${errorNode.textContent}`);

        const reports = xmlDoc.querySelectorAll('PHARMACY_REPORT');
        if (reports.length === 0) {
            const p = document.createElement('p');
            p.className = 'col-span-full text-center text-gray-500 py-8';
            p.textContent = '該当する事例は見つかりませんでした。';
            elements.resultsContainer.appendChild(p);
            document.body.classList.remove('search-mode');
            return;
        }

        currentData = Array.from(reports).map(parseReport);
        document.body.classList.add('search-mode');
        displayNextBatch();
    } catch (err) {
        console.error('Fetching incidents failed:', err);
        showError(`データ取得に失敗しました: ${err.message}`);
    } finally {
        showLoading(false);
    }
}

/* -------------------------------------------------
   XML レポート解析
------------------------------------------------- */
function parseReport(report) {
    const getText = (selector) => {
        const element = report.querySelector(selector);
        return element ? element.textContent.trim() : '記載なし';
    };

    const DATSUMMARY_MAP = {
        '01': '調剤に関するヒヤリ・ハット事例',
        '02': '疑義照会や処方医への情報提供に関する事例',
        '03': '特定保険医療材料等に関する事例',
        '04': '一般用医薬品等の販売に関する事例',
    };
    const DATCONTENTTEXT_MAP = {
        '01': 'レセコンの入力間違い',
        '02': '薬剤取り違え（異なる成分）',
        '03': '薬剤取り違え（同成分）',
        '04': '数量間違い',
        '05': '剤形間違い',
        '06': '規格間違い',
        '07': '用法間違い',
        '08': '患者間違い',
        '09': 'その他',
    };
    const DATFACTORTEXT_MAP = {
        '01': '処方箋やその記載のされ方の要因',
        '02': '調剤方法の要因',
        '03': '鑑査方法の要因',
        '04': '患者の要因',
        '05': '医薬品の要因',
        '06': '情報システムの要因',
        '07': 'その他の要因',
    };
    const DATFACTOR_MAP = {
        '100101': '判断誤り', '100102': '手順不遵守', '100103': 'スタッフ間のコミュニケーション不足・齟齬', '100104': '患者とのコミュニケーション不足・齟齬', '100199': 'その他',
        '110101': '知識不足', '110102': '技術・手技が未熟', '110103': '慣れ・慢心', '110104': '焦り・慌て', '110105': '疲労・体調不良・身体的不調', '110106': '心配ごと等心理的状態', '110199': 'その他',
        '120101': '医薬品の名称類似', '120102': '医薬品や包装の外観類似', '120103': '医薬品包装表示・添付文書の要因', '120104': '処方箋やその記載のされ方の要因', '120105': 'コンピューターシステムの使いにくさ・不具合', '120106': '調剤設備・調剤機器の使いにくさ・不具合', '120107': '薬剤服用歴などの記録の不備', '120108': '調剤室の環境的な要因', '120109': '調剤室以外の環境的な要因', '120199': 'その他',
        '130101': '繁忙であった', '130102': '標榜する営業時間外であった', '130103': '普段とは異なる業務状況だった', '130199': 'その他',
        '140101': '教育訓練のなされ方', '140102': '設備機器等の管理', '140103': '薬局内のルールや管理の体制・仕方', '140104': '薬局内の風土・雰囲気', '140199': 'その他',
        '150101': '患者や家族の不注意', '150102': '患者や家族の理解力・誤解', '150103': '患者や家族のコンプライアンス・協力態度', '150199': 'その他',
    };
    const DATFACTORDOUBT_MAP = {
        '160101': '患者とのコミュニケーション不足・齟齬', '160102': 'カルテ記載の不備', '160103': 'コンピューターシステムの使いにくさ・不具合', '160104': '連携不足', '160105': '知識不足', '160106': '判断誤り', '160107': '処方内容の確認不足', '160199': 'その他',
        '170101': '医薬品の名称類似', '170102': '患者や家族の要因', '170199': 'その他',
    };

    const getCodeText = (selector) => {
        const elements = report.querySelectorAll(selector);
        if (elements.length === 0) return 'N/A';
        let displayValues = [];
        elements.forEach((element) => {
            const code = element.getAttribute('CODE');
            const text = element.textContent;
            let displayValue = text.replace(/\s*\(コード:\s*[^)]+\)/g, '').trim();
            let mappedValue = '';

            if (selector === 'DATSUMMARY') mappedValue = DATSUMMARY_MAP[code] || `不明な事例区分`;
            else if (selector === 'DATMONTH') {
                const monthMap = { '01': '1月', '02': '2月', '03': '3月', '04': '4月', '05': '5月', '06': '6月', '07': '7月', '08': '8月', '09': '9月', '10': '10月', '11': '11月', '12': '12月' };
                mappedValue = monthMap[code] || `不明な月 (${code})`;
            }
            else if (selector === 'DATCONTENTTEXT') mappedValue = DATCONTENTTEXT_MAP[code] || '';
            else if (selector === 'DATFACTORTEXT') mappedValue = DATFACTORTEXT_MAP[code] || '';
            else if (selector === 'DATFACTOR') mappedValue = DATFACTOR_MAP[code] || '';
            else if (selector === 'DATFACTORDOUBT') mappedValue = DATFACTORDOUBT_MAP[code] || '';

            displayValue = mappedValue;
            if (text && text.trim() !== '' && mappedValue !== text.trim() && selector.includes('TEXT')) {
                displayValue = `${mappedValue} ${text.trim()}`;
            }
            if (displayValue) displayValues.push(displayValue);
        });
        return displayValues.join('<br>') || 'N/A';
    };

    return {
        year: getText('DATYEAR'),
        month: getCodeText('DATMONTH'),
        summary: getCodeText('DATSUMMARY'),
        content: getCodeText('DATCONTENTTEXT'),
        factor: getCodeText('DATFACTORTEXT'),
        factors: getCodeText('LSTFACTOR DATFACTOR'),
        factorDoubts: getCodeText('LSTFACTORDOUBT DATFACTORDOUBT'),
        improvement: getText('DATIMPROVEMENTTEXT'),
        estimatedText: getText('DATESTIMATEDTEXT'),
        effortText: getText('DATEFFORTTEXT'),
    };
}

/* -------------------------------------------------
   UI 描画
------------------------------------------------- */
function displayNextBatch() {
    const batch = currentData.slice(currentlyDisplayedCount, currentlyDisplayedCount + batchSize);
    displayIncidents(batch);
    currentlyDisplayedCount += batch.length;
}

function displayIncidents(incidents) {
    if (incidents.length === 0 && currentlyDisplayedCount === 0) {
        const p = document.createElement('p');
        p.className = 'col-span-full text-center text-gray-500 py-8';
        p.textContent = '関連する事例は見つかりませんでした。';
        elements.resultsContainer.appendChild(p);
        return;
    }

    incidents.forEach((incident) => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-lg border border-slate-200 p-4 transition-transform duration-200 hover:scale-[1.02]';

        const createParagraph = (strongText, contentText) => {
            if (!contentText || contentText === '記載なし' || contentText === 'N/A') return null;
            const p = document.createElement('p');
            p.className = 'text-sm text-gray-700 leading-relaxed mb-2';
            const strong = document.createElement('strong');
            strong.className = 'font-semibold text-indigo-600 border-b border-slate-300 pb-0.5 mb-1 inline-block';
            strong.textContent = strongText;
            p.appendChild(strong);
            p.appendChild(document.createElement('br'));
            const lines = contentText.split('<br>');
            lines.forEach((line, index) => {
                p.appendChild(document.createTextNode(line));
                if (index < lines.length - 1) {
                    p.appendChild(document.createElement('br'));
                }
            });
            return p;
        };

        const title = document.createElement('h2');
        title.className = 'text-lg font-bold text-indigo-700 border-b-2 border-slate-200 pb-2 mb-3';
        title.textContent = incident.summary;
        card.appendChild(title);

        const date = document.createElement('p');
        date.className = 'text-sm text-gray-500 text-right mb-3';
        date.textContent = `発生年月: ${incident.year}年${incident.month}`;
        card.appendChild(date);

        const contentP = createParagraph('事例の詳細:', incident.content);
        if (contentP) card.appendChild(contentP);

        if (incident.summary.includes('疑義照会')) {
            const estimatedTextP = createParagraph('推定される要因:', incident.estimatedText);
            if (estimatedTextP) card.appendChild(estimatedTextP);
            const effortTextP = createParagraph('薬局での取り組み:', incident.effortText);
            if (effortTextP) card.appendChild(effortTextP);
        } else {
            const factorP = createParagraph('背景・要因:', incident.factor);
            if (factorP) card.appendChild(factorP);
            const factorsP = createParagraph('発生要因:', incident.factors);
            if (factorsP) card.appendChild(factorsP);
            const factorDoubtsP = createParagraph('発生要因(疑義照会):', incident.factorDoubts);
            if (factorDoubtsP) card.appendChild(factorDoubtsP);
            const improvementP = createParagraph('改善策:', incident.improvement);
            if (improvementP) card.appendChild(improvementP);
        }
        elements.resultsContainer.appendChild(card);
    });
}

/* -------------------------------------------------
   ランダム表示
------------------------------------------------- */
function shuffleAndDisplay() {
    if (currentData.length === 0) return;
    // Fisher-Yates shuffle
    for (let i = currentData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentData[i], currentData[j]] = [currentData[j], currentData[i]];
    }
    elements.resultsContainer.innerHTML = '';
    currentlyDisplayedCount = 0;
    displayNextBatch();
}

/* -------------------------------------------------
   初期化 & イベント設定
------------------------------------------------- */
function init() {
    initElements();

    // Enter key triggers search on both inputs
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchIncidents();
    });
    elements.filterInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchIncidents();
    });

    // Search button
    if (elements.searchBtn) elements.searchBtn.addEventListener('click', fetchIncidents);

    // Random button
    if (elements.randomBtn) elements.randomBtn.addEventListener('click', shuffleAndDisplay);

    elements.reloadButton.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.filterInput.value = '';
        elements.resultsContainer.innerHTML = '';
        hideError();
        document.body.classList.remove('search-mode');
        // URLからクエリパラメータを削除
        const url = new URL(window.location);
        url.search = '';
        window.history.pushState({}, '', url);
    });

    // URL パラメータで自動検索
    const params = new URLSearchParams(window.location.search);
    const kw = params.get('drugName') || params.get('ingredientName') || params.get('keyword');
    if (kw) {
        elements.searchInput.value = kw;
        fetchIncidents();
    }

}

document.addEventListener('DOMContentLoaded', init);