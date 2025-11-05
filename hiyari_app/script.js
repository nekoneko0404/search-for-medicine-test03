document.addEventListener('DOMContentLoaded', () => {
    const incidentList = document.getElementById('incident-list');
    const searchTitle = document.getElementById('search-title');
    const searchKeywordInput = document.getElementById('search-keyword');
    const applySearchButton = document.getElementById('apply-search');
    const filterWordInput = document.getElementById('filter-word');
    const applyFilterButton = document.getElementById('apply-filter');
    const randomSortButton = document.getElementById('random-sort');
    const clearSearchButton = document.getElementById('clear-search');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadMoreButton = document.getElementById('load-more');

    const PROXY_BASE_URL = 'https://hiyari-proxy-708146219355.asia-east1.run.app/proxy';
    const batchSize = 30;
    let allIncidents = [];
    let currentlyDisplayedCount = 0;

    // URLパラメータ処理
    const urlParams = new URLSearchParams(window.location.search);
    const initialIngredient = urlParams.get('ingredientName');
    const initialDrugName = urlParams.get('drugName');
    const initialFilterWord = urlParams.get('word');

    if (initialIngredient) searchKeywordInput.value = initialIngredient;
    else if (initialDrugName) searchKeywordInput.value = initialDrugName;
    if (initialFilterWord) filterWordInput.value = initialFilterWord;

    async function fetchIncidents() {
        loadingIndicator.style.display = 'block';
        incidentList.innerHTML = '';
        currentlyDisplayedCount = 0;
        loadMoreButton.style.display = 'none';

        let queryParams = new URLSearchParams();
        queryParams.append('count', '100');
        queryParams.append('order', '2'); // 新しい順

        const sanitizeInput = (input) => {
            // 日本語、英数字、スペース、ハイフン、句読点の一部を許可
            // 日本語、英数字、スペース、ハイフン、句読点、括弧などを許可
            return input.replace(/[^ぁ-んァ-ヶー一-龯A-Za-z0-9\s\-,、.()（）]/g, '').trim();
        };

        const searchKeyword = sanitizeInput(searchKeywordInput.value);
        const filterWord = sanitizeInput(filterWordInput.value);

        if (searchKeyword && !filterWord) {
            queryParams.append('item', 'DATMEDNAME');
            queryParams.append('word', searchKeyword);
            queryParams.append('condition', 'any');
        } else {
            const combinedWord = [searchKeyword, filterWord].filter(Boolean).join(' ');
            if (combinedWord) {
                queryParams.append('word', combinedWord);
                if (searchKeyword && filterWord) {
                    queryParams.append('condition', 'all');
                }
            }
        }

        try {
            const response = await fetch(`${PROXY_BASE_URL}?${queryParams.toString()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const errorNode = xmlDoc.querySelector('Error');
            if (errorNode) throw new Error(`API Error: ${errorNode.textContent}`);

            const reports = xmlDoc.querySelectorAll('PHARMACY_REPORT');
            if (reports.length === 0) {
                const p = document.createElement('p');
                p.textContent = '関連する事例は見つかりませんでした。';
                incidentList.appendChild(p);
                allIncidents = [];
                return;
            }

            allIncidents = Array.from(reports).map(parseReport);
            processAndDisplayIncidents();

        } catch (error) {
            console.error('Fetching incidents failed:', error);
            incidentList.innerHTML = ''; // Clear previous content
            const p = document.createElement('p');
            if (error.message.includes('検索結果が存在しません')) {
                p.textContent = '検索結果が存在しません。メーカー名、規格、剤形などを削除、絞り込みのワードを変更して再検索してください。';
            } else {
                p.textContent = `事例の読み込みに失敗しました. ${error.message}`;
            }
            incidentList.appendChild(p);
            allIncidents = [];
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    function processAndDisplayIncidents() {
        updateSearchTitle();
        // APIがorder=1でソートするのでクライアントサイドソートは不要
        displayNextBatch();
    }

    function displayNextBatch() {
        const batch = allIncidents.slice(currentlyDisplayedCount, currentlyDisplayedCount + batchSize);
        displayIncidents(batch);
        currentlyDisplayedCount += batch.length;

        if (currentlyDisplayedCount < allIncidents.length) {
            loadMoreButton.style.display = 'block';
        } else {
            loadMoreButton.style.display = 'none';
        }
    }

    function updateSearchTitle() {
        const searchKeyword = searchKeywordInput.value.trim();
        const filterWord = filterWordInput.value.trim();
        if (searchKeyword && filterWord) {
            searchTitle.textContent = `「${searchKeyword}」と「${filterWord}」に関するヒヤリ・ハット事例`;
        } else if (searchKeyword) {
            searchTitle.textContent = `「${searchKeyword}」に関するヒヤリ・ハット事例`;
        } else if (filterWord) {
            searchTitle.textContent = `「${filterWord}」に関するヒヤリ・ハット事例`;
        } else {
            searchTitle.textContent = '最新のヒヤリ・ハット事例';
        }
    }

    function displayIncidents(incidents) {
        if (incidents.length === 0 && currentlyDisplayedCount === 0) {
            const p = document.createElement('p');
            p.textContent = '関連する事例は見つかりませんでした。';
            incidentList.appendChild(p);
            return;
        }
        incidents.forEach(incident => {
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
            date.textContent = `発生年月: ${incident.year}年${incident.month}`
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
            incidentList.appendChild(card);
        });
    }

    function parseReport(report) {
        const getText = (selector) => {
            const element = report.querySelector(selector);
            return element ? element.textContent.trim() : '記載なし';
        };

        const DATSUMMARY_MAP = {
            '01': '調剤に関するヒヤリ・ハット事例', '02': '疑義照会や処方医への情報提供に関する事例', '03': '特定保険医療材料等に関する事例', '04': '一般用医薬品等の販売に関する事例',
        };
        const DATCONTENTTEXT_MAP = {
            '01': 'レセコンの入力間違い', '02': '薬剤取り違え（異なる成分）', '03': '薬剤取り違え（同成分）', '04': '数量間違い', '05': '剤形間違い', '06': '規格間違い', '07': '用法間違い', '08': '患者間違い', '09': 'その他',
        };
        const DATFACTORTEXT_MAP = {
            '01': '処方箋やその記載のされ方の要因', '02': '調剤方法の要因', '03': '鑑査方法の要因', '04': '患者の要因', '05': '医薬品の要因', '06': '情報システムの要因', '07': 'その他の要因',
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
            elements.forEach(element => {
                const code = element.getAttribute('CODE');
                const text = element.textContent;
                let displayValue = text.replace(/\s*\(コード:\s*[^)]+\)/g, '').trim();
                let mappedValue = '';

                if (selector === 'DATSUMMARY') mappedValue = DATSUMMARY_MAP[code] || `不明な事例区分`;
                else if (selector === 'DATMONTH') {
                    const monthMap = {'01':'1月','02':'2月','03':'3月','04':'4月','05':'5月','06':'6月','07':'7月','08':'8月','09':'9月','10':'10月','11':'11月','12':'12月'};
                    mappedValue = monthMap[code] || `不明な月 (${code})`;
                } 
                else if (selector === 'DATCONTENTTEXT') mappedValue = DATCONTENTTEXT_MAP[code] || '';
                else if (selector === 'DATFACTORTEXT') mappedValue = DATFACTORTEXT_MAP[code] || '';
                else if (selector === 'DATFACTOR') mappedValue = DATFACTOR_MAP[code] || '';
                else if (selector === 'DATFACTORDOUBT') mappedValue = DATFACTORDOUBT_MAP[code] || '';

                displayValue = mappedValue;
                if (text && text.trim() !== '' && mappedValue !== text.trim() && selector.includes('TEXT')) {
                    displayValue = `${mappedValue} ${text.trim()}`
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

    // --- Event Listeners ---
    applySearchButton.addEventListener('click', fetchIncidents);
    searchKeywordInput.addEventListener('keydown', (event) => event.key === 'Enter' && fetchIncidents());
    applyFilterButton.addEventListener('click', fetchIncidents);
    filterWordInput.addEventListener('keydown', (event) => event.key === 'Enter' && fetchIncidents());
    loadMoreButton.addEventListener('click', displayNextBatch);

    clearSearchButton.addEventListener('click', () => {
        searchKeywordInput.value = '';
        filterWordInput.value = '';
        allIncidents = [];
        incidentList.innerHTML = '';
        searchTitle.textContent = 'ヒヤリ・ハット事例';
        loadMoreButton.style.display = 'none';
    });

    randomSortButton.addEventListener('click', () => {
        // Fisher-Yates shuffle
        for (let i = allIncidents.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allIncidents[i], allIncidents[j]] = [allIncidents[j], allIncidents[i]];
        }
        incidentList.innerHTML = '';
        currentlyDisplayedCount = 0;
        searchTitle.textContent = 'ランダムに50件の事例を表示';
        displayNextBatch(); // Display first batch of shuffled
    });
});
