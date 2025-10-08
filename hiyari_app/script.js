document.addEventListener('DOMContentLoaded', () => {
    const incidentList = document.getElementById('incident-list');
    const searchTitle = document.getElementById('search-title');
    
    // デプロイしたCloud RunのURL
    const PROXY_BASE_URL = 'https://hiyari-proxy-708146219355.asia-east1.run.app/proxy';

    // URLから成分名パラメータを取得
    const urlParams = new URLSearchParams(window.location.search);
    const ingredient = urlParams.get('ingredientName'); // ingredientName に変更
    const drugName = urlParams.get('drugName'); // drugName を追加

    // APIからヒヤリ・ハット事例を取得する
    async function fetchIncidents() {
        let query = '?count=20&order=2'; // デフォルトは最新20件
        let searchTerm = '';
        let searchType = '';

        if (ingredient) {
            searchTerm = ingredient;
            searchType = '成分名';
            query = `?item=DATMEDNAME&word=${encodeURIComponent(ingredient)}&condition=any&count=50`;
        } else if (drugName) {
            searchTerm = drugName;
            searchType = '品名';
            query = `?item=DATMEDNAME&word=${encodeURIComponent(drugName)}&condition=any&count=50`;
        }

        if (searchTerm) {
            searchTitle.textContent = `「${searchTerm}」に関するヒヤリ・ハット事例 (${searchType}で検索)`;
        } else {
            searchTitle.textContent = '最新のヒヤリ・ハット事例';
        }

        try {
            // Cloud Runプロキシ経由でAPIを呼び出す
            const response = await fetch(PROXY_BASE_URL + query);
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
                return;
            }

            const incidents = Array.from(reports).map(report => {
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

            displayIncidents(incidents);

        } catch (error) {
            console.error('Fetching incidents failed:', error);
            incidentList.innerHTML = `<p>事例の読み込みに失敗しました。<br>${error.message}</p>`;
        }
    }

    function displayIncidents(incidents) {
        incidentList.innerHTML = ''; // 既存の表示をクリア
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

    // 事例データを取得して表示
    fetchIncidents();
});
