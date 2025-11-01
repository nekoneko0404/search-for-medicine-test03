document.addEventListener('DOMContentLoaded', () => {
    const incidentList = document.getElementById('incident-list');
    const searchTitle = document.getElementById('search-title');
    const searchKeywordInput = document.getElementById('search-keyword');
    const applySearchButton = document.getElementById('apply-search');
    const filterWordInput = document.getElementById('filter-word');
    const applyFilterButton = document.getElementById('apply-filter');
    const randomSortButton = document.getElementById('random-sort'); // ランダムソートボタンの要素を追加
    const clearSearchButton = document.getElementById('clear-search');
    const loadingIndicator = document.getElementById('loading-indicator');

    // デプロイしたCloud RunのURL
    const PROXY_BASE_URL = 'https://proxy-test-url-1.example.com/proxy';

    let allIncidents = []; // 全ての事例を保持する配列
    let filteredIncidents = []; // 絞り込まれた事例を保持する配列

    // URLからパラメータを取得し、入力フィールドに設定
    const urlParams = new URLSearchParams(window.location.search);
    const initialIngredient = urlParams.get('ingredientName');
    const initialDrugName = urlParams.get('drugName');
    const initialFilterWord = urlParams.get('word');

    if (initialIngredient) {
        searchKeywordInput.value = initialIngredient;
    } else if (initialDrugName) {
        searchKeywordInput.value = initialDrugName;
    }

    if (initialFilterWord) {
        filterWordInput.value = initialFilterWord;
    }

    async function fetchIncidents() {
        loadingIndicator.style.display = 'block'; // ローディングインジケーターを表示
        let queryParams = new URLSearchParams();
        queryParams.append('count', '500');
        queryParams.append('order', '2');

        const searchKeyword = searchKeywordInput.value.trim();

        if (searchKeyword) {
            queryParams.append('item', 'DATMEDNAME');
            queryParams.append('word', searchKeyword);
            queryParams.append('condition', 'any');
        }


        try {
            const response = await fetch(`${PROXY_BASE_URL}?${queryParams.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const errorNode = xmlDoc.querySelector('Error');
            if (errorNode) {
                throw new Error(`API Error: ${errorNode.textContent}`);
            }

            const reports = xmlDoc.querySelectorAll('PHARMACY_REPORT');
            if (reports.length === 0) {
                incidentList.innerHTML = '<p>関連する事例は見つかりませんでした。</p>';
                allIncidents = [];
                return;
            }

            allIncidents = Array.from(reports).map(report => {
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
                    '100101': '判断誤り', '100102': '手順不遵守', '100103': 'スタッフ間のコミュニケーション不足・齟齬',
                    '100104': '患者とのコミュニケーション不足・齟齬', '100199': 'その他',
                    '110101': '知識不足', '110102': '技術・手技が未熟', '110103': '慣れ・慢心',
                    '110104': '焦り・慌て', '110105': '疲労・体調不良・身体的不調', '110106': '心配ごと等心理的状態',
                    '110199': 'その他',
                    '120101': '医薬品の名称類似', '120102': '医薬品や包装の外観類似', '120103': '医薬品包装表示・添付文書の要因',
                    '120104': '処方箋やその記載のされ方の要因', '120105': 'コンピューターシステムの使いにくさ・不具合',
                    '120106': '調剤設備・調剤機器の使いにくさ・不具合', '120107': '薬剤服用歴などの記録の不備',
                    '120108': '調剤室の環境的な要因', '120109': '調剤室以外の環境的な要因', '120199': 'その他',
                    '130101': '繁忙であった', '130102': '標榜する営業時間外であった', '130103': '普段とは異なる業務状況だった',
                    '130199': 'その他',
                    '140101': '教育訓練のなされ方', '140102': '設備機器等の管理', '140103': '薬局内のルールや管理の体制・仕方',
                    '140104': '薬局内の風土・雰囲気', '140199': 'その他',
                    '150101': '患者や家族の不注意', '150102': '患者や家族の理解力・誤解', '150103': '患者や家族のコンプライアンス・協力態度',
                    '150199': 'その他',
                };

                const DATFACTORDOUBT_MAP = {
                    '160101': '患者とのコミュニケーション不足・齟齬', '160102': 'カルテ記載の不備',
                    '160103': 'コンピューターシステムの使いにくさ・不具合', '160104': '連携不足',
                    '160105': '知識不足', '160106': '判断誤り', '160107': '処方内容の確認不足',
                    '160199': 'その他',
                    '170101': '医薬品の名称類似', '170102': '患者や家族の要因', '170199': 'その他',
                };

                const getCodeText = (selector) => {
                    const elements = report.querySelectorAll(selector); // All elements for the selector
                    if (elements.length === 0) return 'N/A';

                    let displayValues = [];
                    elements.forEach(element => {
                        const code = element.getAttribute('CODE');
                        const text = element.textContent;
                        let displayValue = text.replace(/\s*\(コード:\s*[^)]+\)/g, '').trim();
                        let mappedValue = '';

                        if (selector === 'DATSUMMARY') {
                            if (code && code !== 'null') {
                                mappedValue = DATSUMMARY_MAP[code] || `不明な事例区分`;
                                displayValue = mappedValue;
                            } else {
                                displayValue = text.replace(/\s*\(コード:\s*[^)]+\)/g, '').trim();
                            }
                        } else if (selector === 'DATMONTH') {
                            if (code && code !== 'null') {
                                const monthMap = {
                                    '01': '1月', '02': '2月', '03': '3月', '04': '4月', '05': '5月', '06': '6月',
                                    '07': '7月', '08': '8月', '09': '9月', '10': '10月', '11': '11月', '12': '12月'
                                };
                                displayValue = monthMap[code] || `不明な月 (${code})`;
                            }
                        } else if (selector === 'DATCONTENTTEXT') {
                            if (code && code !== 'null') {
                                mappedValue = DATCONTENTTEXT_MAP[code] || `不明な事例内容`;
                                displayValue = mappedValue;
                                if (text && text.trim() !== '' && mappedValue !== text.trim()) {
                                    displayValue = `${mappedValue} ${text.trim()}`;
                                }
                            } else {
                                displayValue = text && text.trim() !== '' ? text.trim() : '';
                            }
                        } else if (selector === 'DATFACTORTEXT') {
                            if (code && code !== 'null') {
                                mappedValue = DATFACTORTEXT_MAP[code] || `不明な発生要因`;
                                displayValue = mappedValue;
                                if (text && text.trim() !== '' && mappedValue !== text.trim()) {
                                    displayValue = `${mappedValue} ${text.trim()}`;
                                }
                            } else {
                                displayValue = text && text.trim() !== '' ? text.trim() : '';
                            }
                        } else if (selector === 'DATFACTOR') {
                            if (code && code !== 'null') {
                                mappedValue = DATFACTOR_MAP[code] || `不明な発生要因`;
                                displayValue = mappedValue;
                                if (text && text.trim() !== '' && mappedValue !== text.trim()) {
                                    displayValue = `${mappedValue} ${text.trim()}`;
                                }
                            } else {
                                displayValue = text && text.trim() !== '' ? text.trim() : '';
                            }
                        } else if (selector === 'DATFACTORDOUBT') {
                            if (code && code !== 'null') {
                                mappedValue = DATFACTORDOUBT_MAP[code] || `不明な発生要因(疑義照会)`;
                                displayValue = mappedValue;
                                if (text && text.trim() !== '' && mappedValue !== text.trim()) {
                                    displayValue = `${mappedValue} ${text.trim()}`;
                                }
                            } else {
                                displayValue = text && text.trim() !== '' ? text.trim() : '';
                            }
                        }

                        // コード表示は不要になったため、このブロックを削除
                        // if (code && code !== 'null' && selector !== 'DATMONTH' && selector !== 'DATSUMMARY' && !displayValue.includes(`(コード: ${code})`)) {
                        //     if (displayValue !== '') { // displayValueが空でない場合のみコードを追加
                        //         displayValue += ` (コード: ${code})`;
                        //     }
                        // }
                        if (displayValue !== '') {
                            displayValues.push(displayValue);
                        }
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
                    estimatedText: getText('DATESTIMATEDTEXT'), // 推定される要因
                    effortText: getText('DATEFFORTTEXT'), // 薬局での取り組み
                };
            });

            filterAndDisplayIncidents();

        } catch (error) {
            console.error('Fetching incidents failed:', error);
            incidentList.innerHTML = ''; // Clear previous content
            const p = document.createElement('p');
            p.textContent = `事例の読み込みに失敗しました. ${error.message}`;
            incidentList.appendChild(p);
            allIncidents = [];
        } finally {
            loadingIndicator.style.display = 'none'; // ローディングインジケーターを非表示
        }
    }

    function filterAndDisplayIncidents() {
        let incidentsToFilter = [...allIncidents];
        const searchKeyword = searchKeywordInput.value.trim();
        const filterWord = filterWordInput.value.trim();

        // searchTitleの更新
        if (searchKeyword && filterWord) {
            searchTitle.textContent = `「${searchKeyword}」に関するヒヤリ・ハット事例 (「${filterWord}」で絞り込み)`;
        } else if (searchKeyword) {
            searchTitle.textContent = `「${searchKeyword}」に関するヒヤリ・ハット事例`;
        } else if (filterWord) {
            searchTitle.textContent = `「${filterWord}」に関するヒヤリ・ハット事例 (事例内容・背景要因で絞り込み)`;
        } else {
            searchTitle.textContent = '最新のヒヤリ・ハット事例';
        }

        if (filterWord) {
            const filterKeywordLower = filterWord.toLowerCase();
            incidentsToFilter = incidentsToFilter.filter(incident =>
                incident.content.toLowerCase().includes(filterKeywordLower) ||
                incident.factor.toLowerCase().includes(filterKeywordLower) ||
                incident.factors.toLowerCase().includes(filterKeywordLower) ||
                incident.factorDoubts.toLowerCase().includes(filterKeywordLower)
            );
        }

        incidentsToFilter.sort((a, b) => {
            const hasImprovementA = a.improvement !== 'N/A';
            const hasImprovementB = b.improvement !== 'N/A';

            if (hasImprovementA && !hasImprovementB) return -1;
            if (!hasImprovementA && hasImprovementB) return 1;

            const yearA = parseInt(a.year, 10);
            const monthA = parseInt(a.month.replace(/[^0-9]/g, ''), 10);
            const yearB = parseInt(b.year, 10);
            const monthB = parseInt(b.month.replace(/[^0-9]/g, ''), 10);

            if (yearA !== yearB) {
                return yearB - yearA;
            }
            return monthB - monthA;
        });

        filteredIncidents = incidentsToFilter; // 絞り込み結果をグローバル変数に保存
        displayIncidents(filteredIncidents.slice(0, 50));
    }

    randomSortButton.addEventListener('click', () => {
        let incidentsToShuffle = (filteredIncidents.length > 0 || filterWordInput.value.trim() !== '') ? [...filteredIncidents] : [...allIncidents];

        for (let i = incidentsToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [incidentsToShuffle[i], incidentsToShuffle[j]] = [incidentsToShuffle[j], incidentsToShuffle[i]];
        }

        const searchKeyword = searchKeywordInput.value.trim();
        const filterWord = filterWordInput.value.trim();

        if (searchKeyword || filterWord) {
            searchTitle.textContent = `検索結果をランダムに50件表示`;
        } else {
            searchTitle.textContent = 'ランダムに50件の事例を表示';
        }

        displayIncidents(incidentsToShuffle.slice(0, 50));
    });

    function displayIncidents(incidents) {
        incidentList.innerHTML = '';
        if (incidents.length === 0) {
            incidentList.innerHTML = '<p>関連する事例は見つかりませんでした。</p>';
            return;
        }

        const createParagraph = (strongText, contentText) => {
            if (!contentText || contentText === '記載なし' || contentText === 'N/A') {
                return null;
            }
            const p = document.createElement('p');
            const strong = document.createElement('strong');
            strong.textContent = strongText;
            p.appendChild(strong);
            p.appendChild(document.createElement('br'));
            
            const lines = contentText.replace(/\n/g, '<br>').split('<br>');
            lines.forEach((line, index) => {
                p.appendChild(document.createTextNode(line));
                if (index < lines.length - 1) {
                    p.appendChild(document.createElement('br'));
                }
            });
            return p;
        };

        incidents.forEach(incident => {
            const card = document.createElement('div');
            card.className = 'incident-card';

            const title = document.createElement('h2');
            title.textContent = incident.summary;
            card.appendChild(title);
            
            const date = document.createElement('p');
            date.className = 'incident-date';
            date.textContent = `発生年月: ${incident.year}年${incident.month}`;
            card.appendChild(date);

            const content = createParagraph('事例の詳細:', incident.content);
            if (content) card.appendChild(content);

            if (incident.summary.includes('疑義照会')) {
                const estimatedText = createParagraph('推定される要因:', incident.estimatedText);
                if (estimatedText) card.appendChild(estimatedText);

                const effortText = createParagraph('薬局での取り組み:', incident.effortText);
                if (effortText) card.appendChild(effortText);
            } else {
                const factor = createParagraph('背景・要因:', incident.factor);
                if (factor) card.appendChild(factor);

                const factors = createParagraph('発生要因:', incident.factors);
                if (factors) card.appendChild(factors);

                const factorDoubts = createParagraph('発生要因(疑義照会):', incident.factorDoubts);
                if (factorDoubts) card.appendChild(factorDoubts);
                
                const improvement = createParagraph('改善策:', incident.improvement);
                if (improvement) card.appendChild(improvement);
            }

            incidentList.appendChild(card);
        });
    }

    searchKeywordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applySearchButton.click();
        }
    });

    applySearchButton.addEventListener('click', () => {
        const searchKeyword = searchKeywordInput.value.trim();
        if (searchKeyword) {
            // 検索キーワードがクリアされた場合、絞り込みキーワードもクリア
            if (!searchKeywordInput.value.trim()) {
                filterWordInput.value = ''; // 絞り込み入力欄をクリア
            }
            fetchIncidents();
        }
    });

    filterWordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyFilterButton.click();
        }
    });

    applyFilterButton.addEventListener('click', () => {
        filterAndDisplayIncidents();
    });

    clearSearchButton.addEventListener('click', () => {
        searchKeywordInput.value = '';
        filterWordInput.value = '';
        allIncidents = [];
        filteredIncidents = [];
        incidentList.innerHTML = '';
        searchTitle.textContent = 'ヒヤリ・ハット事例';
    });

    // URLパラメータがある場合でも、自動で読み込まないように修正
    // if (initialIngredient || initialDrugName) {
    //     fetchIncidents();
    // }
});