// Japan Map SVG Data and Rendering Logic
const JAPAN_PREFECTURES = [
    { code: 1, name: "北海道", region: "Hokkaido-Tohoku", path: "M..." }, // Simplified for brevity, will use real paths
    // ... (Full list of 47 prefectures with paths would be here)
    // For this implementation, we will generate a simplified grid/tile map or use a library if paths are too complex for inline.
    // Given the constraints, I will implement a "Tile Map" style which is modern and easier to maintain inline, 
    // or fetch a standard SVG. Let's use a structured SVG generation approach.
];

// Simplified SVG Paths for a recognizable Japan Map (Low Poly style for aesthetics)
// This is a placeholder. In a real scenario, we'd load a detailed topojson/geojson or a high-quality SVG.
// For this demo, I will construct a functional SVG map programmatically.

const REGIONS = {
    "Hokkaido": ["北海道"],
    "Tohoku": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "Kanto": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "Chubu": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    "Kansai": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "Chugoku": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
    "Shikoku": ["徳島県", "香川県", "愛媛県", "高知県"],
    "Kyushu": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
};

function renderJapanMap(containerId, data, disease) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Map container '${containerId}' not found.`);
        return;
    }
    container.innerHTML = ''; // Clear previous map

    // Create SVG element
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // 地図の描画範囲に合わせてviewBoxを調整し、下の余白を削除
    svg.setAttribute("viewBox", "0 0 800 600");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.filter = "drop-shadow(0 4px 6px rgba(0,0,0,0.1))";

    // Draw regions (simplified geometric representation for demo purposes)
    // In a production app, we would use actual geo-coordinates. 
    // Here we simulate with a stylized layout.

    // Layout configuration (x, y coordinates for regions)
    const layout = [
        { id: "Hokkaido", x: 600, y: 50, w: 120, h: 100, label: "北海道" },
        { id: "Tohoku", x: 600, y: 160, w: 100, h: 180, label: "東北" },
        { id: "Kanto", x: 580, y: 350, w: 100, h: 100, label: "関東" },
        { id: "Chubu", x: 470, y: 330, w: 100, h: 140, label: "中部" },
        { id: "Kansai", x: 360, y: 380, w: 100, h: 100, label: "関西" },
        { id: "Chugoku", x: 250, y: 380, w: 100, h: 80, label: "中国" },
        { id: "Shikoku", x: 280, y: 470, w: 100, h: 60, label: "四国" },
        { id: "Kyushu", x: 130, y: 420, w: 100, h: 120, label: "九州・沖縄" }
    ];

    layout.forEach(region => {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "region-group");
        group.setAttribute("data-region", region.id);
        group.style.cursor = "pointer";

        // Calculate average value for the region to determine color
        const regionPrefectures = REGIONS[region.id];
        let totalValue = 0;
        let count = 0;

        regionPrefectures.forEach(pref => {
            const prefData = data.data.find(d => d.disease === disease && d.prefecture === pref);
            if (prefData) {
                totalValue += prefData.value;
                count++;
            }
        });

        const avgValue = count > 0 ? totalValue / count : 0;
        const color = getColorForValue(avgValue, disease);

        // Draw region shape (Hexagon or rounded rect for modern look)
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", region.x);
        rect.setAttribute("y", region.y);
        rect.setAttribute("width", region.w);
        rect.setAttribute("height", region.h);
        rect.setAttribute("rx", 10); // Rounded corners
        rect.setAttribute("fill", color);
        rect.setAttribute("stroke", "white");
        rect.setAttribute("stroke-width", 2);

        // Add hover effect via CSS class, but we can also add events here
        rect.addEventListener('mouseover', () => {
            rect.setAttribute("stroke", "#333");
            rect.style.filter = "brightness(1.1)";
        });
        rect.addEventListener('mouseout', () => {
            rect.setAttribute("stroke", "white");
            rect.style.filter = "none";
        });

        // Click event to show details
        group.addEventListener('click', () => {
            // main.jsの状態変数を更新
            if (typeof window.setCurrentRegion === 'function') {
                window.setCurrentRegion(region.id);
            }
            showRegionDetails(region.id, region.label, regionPrefectures, data, disease);
        });

        // Label
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", region.x + region.w / 2);
        text.setAttribute("y", region.y + region.h / 2);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("fill", "white");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("font-size", "14px");
        text.style.pointerEvents = "none"; // Let clicks pass through to rect
        text.textContent = region.label;

        group.appendChild(rect);
        group.appendChild(text);
        svg.appendChild(group);
    });

    container.appendChild(svg);
}

function getColorForValue(value, disease) {
    const thresholds = {
        'Influenza': { alert: 30.0, warning: 10.0, epidemic: 1.0 },
        'COVID-19': { alert: 15.0, warning: 10.0 }, // 山梨県基準など
        'ARI': { alert: 120.0, warning: 80.0 },
        'PharyngoconjunctivalFever': { alert: 3.0 }, // 咽頭結膜熱
        'AGS_Pharyngitis': { alert: 8.0 }, // A群溶血性レンサ球菌咽頭炎
        'InfectiousGastroenteritis': { alert: 20.0 }, // 感染性胃腸炎
        'Chickenpox': { alert: 2.0, warning: 1.0 }, // 水痘
        'HandFootMouthDisease': { alert: 5.0 }, // 手足口病
        'ErythemaInfectiosum': { alert: 2.0 }, // 伝染性紅斑
        'Herpangina': { alert: 6.0 }, // ヘルパンギーナ
        'Mumps': { alert: 6.0, warning: 3.0 }, // 流行性耳下腺炎
        'AcuteHemorrhagicConjunctivitis': { alert: 1.0 }, // 急性出血性結膜炎
        'EpidemicKeratoconjunctivitis': { alert: 8.0 } // 流行性角結膜炎
    };

    const t = thresholds[disease];

    if (!t) {
        // 定義がない疾患はデフォルト（例：すべて緑、あるいは適当な閾値）
        // ここではとりあえず緑
        return "#2ecc71";
    }

    if (t.alert !== undefined && value >= t.alert) return "#e74c3c"; // Alert Red
    if (t.warning !== undefined && value >= t.warning) return "#f39c12"; // Warning Orange
    if (t.epidemic !== undefined && value >= t.epidemic) return "#f1c40f";  // Caution Yellow

    return "#2ecc71"; // Normal Green
}

function showRegionDetails(regionId, regionLabel, prefectures, data, disease, highlightPrefecture = null) {
    const panel = document.getElementById('detail-panel');
    const title = document.getElementById('region-title');
    const content = document.getElementById('region-content');

    title.textContent = `${regionLabel} 詳細 (${getDiseaseName(disease)})`;
    content.replaceChildren(); // Clear content safely

    const list = document.createElement('div');
    list.className = 'prefecture-list';

    // Sort prefectures by value (descending)
    const sortedPrefs = prefectures.map(pref => {
        const prefData = data.data.find(d => d.disease === disease && d.prefecture === pref);
        return {
            name: pref,
            value: prefData ? prefData.value : 0
        };
    }).sort((a, b) => b.value - a.value);

    // Get max value for scaling bar width
    const maxValue = Math.max(...sortedPrefs.map(item => item.value));

    sortedPrefs.forEach(item => {
        const row = document.createElement('div');
        row.className = 'pref-row';
        if (highlightPrefecture && item.name === highlightPrefecture) {
            row.classList.add('selected');
        }

        // Determine status class
        let statusClass = 'normal';
        const color = getColorForValue(item.value, disease);
        if (color === "#e74c3c") statusClass = 'alert';
        else if (color === "#f39c12") statusClass = 'warning';
        else if (color === "#f1c40f") statusClass = 'caution'; // CSSに追加が必要

        // 安全なDOM構築 (XSS対策)
        const nameSpan = document.createElement('span');
        nameSpan.className = 'pref-name';
        nameSpan.style.cursor = 'pointer';
        nameSpan.style.textDecoration = 'underline';
        nameSpan.textContent = item.name;
        nameSpan.addEventListener('click', () => {
            if (window.showPrefectureChart) {
                window.showPrefectureChart(item.name, disease);
            }
        });

        const barContainer = document.createElement('div');
        barContainer.className = 'pref-bar-container';

        const bar = document.createElement('div');
        bar.className = `pref-bar ${statusClass}`;
        bar.style.width = `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`;
        barContainer.appendChild(bar);

        const valueSpan = document.createElement('span');
        valueSpan.className = 'pref-value';
        valueSpan.textContent = item.value.toFixed(2);

        row.appendChild(nameSpan);
        row.appendChild(barContainer);
        row.appendChild(valueSpan);
        list.appendChild(row);
    });

    content.appendChild(list);
}

// 外部から詳細パネルを更新するための関数
window.updateDetailPanel = function (regionId, data, disease, highlightPrefecture = null) {
    // layoutデータなどが必要だが、ここでは簡易的にREGIONSから復元
    const prefectures = REGIONS[regionId];
    if (!prefectures) return;

    // ラベルの復元（簡易実装：IDをそのまま使うか、マッピングを持つか）
    // layout変数にアクセスできないため、REGIONSのキーで代用、またはマッピングを再定義
    const regionLabels = {
        "Hokkaido": "北海道", "Tohoku": "東北", "Kanto": "関東", "Chubu": "中部",
        "Kansai": "関西", "Chugoku": "中国", "Shikoku": "四国", "Kyushu": "九州・沖縄"
    };
    const label = regionLabels[regionId] || regionId;

    // data構造の正規化: main.jsからの呼び出しでは cachedData 全体が渡されるため、currentを取り出す
    const currentData = data.current ? data.current : data;

    showRegionDetails(regionId, label, prefectures, currentData, disease, highlightPrefecture);
};

window.getRegionIdByPrefecture = function (prefectureName) {
    for (const [regionId, prefectures] of Object.entries(REGIONS)) {
        if (prefectures.includes(prefectureName)) {
            return regionId;
        }
    }
    return null;
};
