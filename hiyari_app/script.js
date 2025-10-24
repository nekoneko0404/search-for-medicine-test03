document.addEventListener('DOMContentLoaded', () => {
    const incidentList = document.getElementById('incident-list');
    const searchTitle = document.getElementById('search-title');
    const searchKeywordInput = document.getElementById('search-keyword');
    const applySearchButton = document.getElementById('apply-search');
    const filterWordInput = document.getElementById('filter-word');
    const applyFilterButton = document.getElementById('apply-filter');

    // デプロイしたCloud RunのURL
    const PROXY_BASE_URL = 'https://hiyari-proxy-708146219355.asia-east1.run.app/proxy';

    let currentIngredient = '';
    let currentDrugName = '';
    let currentFilterWord = '';
    let allIncidents = []; // 全ての事例を保持する配列

    // URLからパラメータを取得し、入力フィールドに設定
    const urlParams = new URLSearchParams(window.location.search);
    const initialIngredient = urlParams.get('ingredientName');
    const initialDrugName = urlParams.get('drugName');
    const initialFilterWord = urlParams.get('word');

    if (initialIngredient) {
        currentIngredient = initialIngredient;
        searchKeywordInput.value = initialIngredient;
    } else if (initialDrugName) {
        currentDrugName = initialDrugName;
        searchKeywordInput.value = initialDrugName;
    }

    if (initialFilterWord) {
        currentFilterWord = initialFilterWord;
        filterWordInput.value = initialFilterWord;
    }

    // APIからヒヤリ・ハット事例を取得する
    async function fetchIncidents() {
        let queryParams = new URLSearchParams();
        queryParams.append('count', '50'); // 検索時は50件取得
        queryParams.append('order', '2'); // 新しいもの順

        let searchTerm = '';
        let searchType = '';

        if (currentIngredient) {
            searchTerm = currentIngredient;
            searchType = '成分名';
            queryParams.append('item', 'DATMEDNAME');
            queryParams.append('word', currentIngredient);
            queryParams.append('condition', 'any');
        } else if (currentDrugName) {
            searchTerm = currentDrugName;
            searchType = '品名';
            queryParams.append('item', 'DATMEDNAME');
            queryParams.append('word', currentDrugName);
            queryParams.append('condition', 'any');
        }

        if (searchTerm) {
            searchTitle.textContent = `「${searchTerm}」に関するヒヤリ・ハット事例 (${searchType}で検索)`;
        } else {
            searchTitle.textContent = '最新のヒヤリ・ハット事例';
        }

        try {
            // Cloud Runプロキシ経由でAPIを呼び出す
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
                    return element ? element.textContent : 'N/A';
                };
                
                const getCodeText = (selector) => {
                    const element = report.querySelector(selector);
                    if (!element) return 'N/A';
                    const code = element.getAttribute('CODE');
                    const text = element.textContent;
                    if (text) {
                        return `${text} (コード: ${code})`;
                    }
                    if(code) {
                        return `コード: ${code}`;
                    }
                    return 'N/A';
                };

                return {
                    year: getText('DATYEAR'),
                    month: getCodeText('DATMONTH'),
                    summary: getCodeText('DATSUMMARY'),
                    content: getText('DATCONTENTTEXT'),
                    factor: getText('DATFACTORTEXT'),
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

        if (currentFilterWord) {
            const filterKeyword = currentFilterWord.toLowerCase();
            filteredIncidents = filteredIncidents.filter(incident =>
                incident.content.toLowerCase().includes(filterKeyword) ||
                incident.factor.toLowerCase().includes(filterKeyword)
            );
            searchTitle.textContent += ` (「${currentFilterWord}」で絞り込み)`;
        }

        // 改善策があるものを優先し、その中で新しいものから順にソート
        filteredIncidents.sort((a, b) => {
            const hasImprovementA = a.improvement !== '記載なし';
            const hasImprovementB = b.improvement !== '記載なし';

            if (hasImprovementA && !hasImprovementB) return -1;
            if (!hasImprovementA && hasImprovementB) return 1;

            // 発生年月日で降順ソート (新しいものが先)
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
        incidentList.innerHTML = ''; // 既存の表示をクリア
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
            date.textContent = `発生年月: ${incident.year}年 ${incident.month}`;

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
        if (currentIngredient) {
            newUrlParams.append('ingredientName', currentIngredient);
        } else if (currentDrugName) {
            newUrlParams.append('drugName', currentDrugName);
        }
        if (currentFilterWord) {
            newUrlParams.append('word', currentFilterWord);
        }
        window.location.search = newUrlParams.toString();
    }

    searchKeywordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applySearchButton.click();
        }
    });

    applySearchButton.addEventListener('click', () => {
        const keyword = searchKeywordInput.value.trim();
        if (keyword) {
            currentIngredient = keyword;
            currentDrugName = '';
        } else {
            currentIngredient = '';
            currentDrugName = '';
        }
        updateUrlAndFetch();
    });

    filterWordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyFilterButton.click();
        }
    });

    applyFilterButton.addEventListener('click', () => {
        const word = filterWordInput.value.trim();
        currentFilterWord = word; // 絞り込みキーワードは常に更新
        updateUrlAndFetch();
    });

    // 事例データを取得して表示
    fetchIncidents();
});
