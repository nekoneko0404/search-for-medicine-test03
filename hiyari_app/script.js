document.addEventListener('DOMContentLoaded', () => {
    const incidentList = document.getElementById('incident-list');
    const searchTitle = document.getElementById('search-title');
    const searchKeywordInput = document.getElementById('search-keyword');
    const applySearchButton = document.getElementById('apply-search');
    const filterWordInput = document.getElementById('filter-word');
    const applyFilterButton = document.getElementById('apply-filter');

    // デプロイしたCloud RunのURL
    const PROXY_BASE_URL = 'https://hiyari-proxy-708146219355.asia-east1.run.app/proxy';

    let allIncidents = []; // 全ての事例を保持する配列

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
        let queryParams = new URLSearchParams();
        queryParams.append('count', '100');
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
                const getText = (selector) => report.querySelector(selector)?.textContent || 'N/A';

                const DATSUMMARY_MAP = {
                    '01': '調剤に関するヒヤリ・ハット事例',
                    '02': '疑義照会や処方医への情報提供に関する事例',
                    '03': '患者からの情報収集に関する事例',
                    '04': '医薬品の供給に関する事例',
                    '05': '薬歴管理に関する事例',
                    '06': '服薬指導に関する事例',
                    '07': 'その他の事例',
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

                const getCodeText = (selector) => {
                    const element = report.querySelector(selector);
                    if (!element) return 'N/A';
                    const code = element.getAttribute('CODE');
                    const text = element.textContent;

                    let displayValue = text || '記載なし';
                    let mappedValue = '';

                    if (selector === 'DATSUMMARY') {
                        if (code && code !== 'null') {
                            mappedValue = DATSUMMARY_MAP[code] || `不明な事例区分`;
                            displayValue = mappedValue;
                        } else {
                            // コードがない場合、テキストから "(コード: XX)" を削除
                            displayValue = text.replace(/\s*\(コード:\s*[^)]+\)/g, '').trim() || '記載なし';
                        }
                    } else if (selector === 'DATMONTH') {
                        if (code && code !== 'null') {
                            return parseInt(code, 10).toString();
                        }
                    } else if (selector === 'DATCONTENTTEXT') {
                        if (code && code !== 'null') {
                            mappedValue = DATCONTENTTEXT_MAP[code] || `不明な事例内容`;
                            if (text && mappedValue !== text) { // mappedValueとtextが異なる場合のみ結合
                                displayValue = `${mappedValue} ${text}`;
                            } else {
                                displayValue = mappedValue; // mappedValueとtextが同じか、textがない場合はmappedValueのみ
                            }
                        } else {
                            displayValue = text || '記載なし';
                        }
                    } else if (selector === 'DATFACTORTEXT') {
                        if (code && code !== 'null') {
                            mappedValue = DATFACTORTEXT_MAP[code] || `不明な発生要因`;
                            if (text && mappedValue !== text) { // mappedValueとtextが異なる場合のみ結合
                                displayValue = `${mappedValue} ${text}`;
                            } else {
                                displayValue = mappedValue; // mappedValueとtextが同じか、textがない場合はmappedValueのみ
                            }
                        } else {
                            displayValue = text || '記載なし';
                        }
                    }

                    // DATMONTHとDATSUMMARYにはコード表示は不要
                    if (code && code !== 'null' && selector !== 'DATMONTH' && selector !== 'DATSUMMARY' && !displayValue.includes(`(コード: ${code})`)) {
                        displayValue += ` (コード: ${code})`;
                    }

                    return displayValue;
                };

                return {
                    year: getText('DATYEAR'),
                    month: getCodeText('DATMONTH'), // 月も表示するため、getCodeTextを使用
                    summary: getCodeText('DATSUMMARY'),
                    content: getCodeText('DATCONTENTTEXT'), // コードから内容を取得
                    factor: getCodeText('DATFACTORTEXT'), // コードから内容を取得
                    improvement: getText('DATIMPROVEMENTTEXT'),
                };
            });

            filterAndDisplayIncidents();

        } catch (error) {
            console.error('Fetching incidents failed:', error);
            incidentList.innerHTML = `<p>事例の読み込みに失敗しました。<br>${error.message}</p>`;
            allIncidents = [];
        }
    }

    function filterAndDisplayIncidents() {
        let filteredIncidents = [...allIncidents];
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
            filteredIncidents = filteredIncidents.filter(incident =>
                incident.content.toLowerCase().includes(filterKeywordLower) ||
                incident.factor.toLowerCase().includes(filterKeywordLower)
            );
        }

        filteredIncidents.sort((a, b) => {
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

        displayIncidents(filteredIncidents);
    }

    function displayIncidents(incidents) {
        incidentList.innerHTML = '';
        if (incidents.length === 0) {
            incidentList.innerHTML = '<p>関連する事例は見つかりませんでした。</p>';
            return;
        }
        incidents.forEach(incident => {
            const card = document.createElement('div');
            card.className = 'incident-card';

            const title = document.createElement('h2');
            title.textContent = incident.summary;
            
            const date = document.createElement('p');
            date.className = 'incident-date';
            date.textContent = `発生年月: ${incident.year}年${incident.month}月`;

            const content = document.createElement('p');
            content.innerHTML = `<strong>事例の詳細:</strong><br>${incident.content.replace(/\n/g, '<br>') || '記載なし'}`;
            
            const factor = document.createElement('p');
            factor.innerHTML = `<strong>背景・要因:</strong><br>${incident.factor.replace(/\n/g, '<br>') || '記載なし'}`;
            
            const improvement = document.createElement('p');
            improvement.innerHTML = `<strong>改善策:</strong><br>${incident.improvement.replace(/\n/g, '<br>') || '記載なし'}`;

            card.appendChild(title);
            card.appendChild(date);
            card.appendChild(content);
            card.appendChild(factor);
            card.appendChild(improvement);

            incidentList.appendChild(card);
        });
    }

    function updateUrlAndFetch() {
        const newUrlParams = new URLSearchParams();
        const searchKeyword = searchKeywordInput.value.trim();
        const filterWord = filterWordInput.value.trim();

        if (searchKeyword) {
            newUrlParams.append('ingredientName', searchKeyword);
        }
        if (filterWord) {
            newUrlParams.append('word', filterWord);
        }
        window.location.search = newUrlParams.toString();
    }

    searchKeywordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applySearchButton.click();
        }
    });

    applySearchButton.addEventListener('click', () => {
        // 検索キーワードがクリアされた場合、絞り込みキーワードもクリア
        if (!searchKeywordInput.value.trim()) {
            filterWordInput.value = ''; // 絞り込み入力欄をクリア
        }
        updateUrlAndFetch();
    });

    filterWordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyFilterButton.click();
        }
    });

    applyFilterButton.addEventListener('click', () => {
        updateUrlAndFetch();
    });

    fetchIncidents();
});
