const fs = require('fs');

const rawData = fs.readFileSync('municipalities.json', 'utf8');
const municipalities = JSON.parse(rawData);

// Major cities (Prefectural capitals and designated cities) to be Level 1
// We can identify them by name or just use a heuristic.
// For now, let's use a simple heuristic:
// If it was in our original list as Level 1, we want to keep it Level 1.
// But matching names might be tricky.
// Let's just say:
// Level 1: Designated cities (approx 20) + Prefectural capitals.
// Actually, simpler:
// Level 1: Any city ending in "市" that is a prefectural capital?
// The JSON has "prefecture_kanji". Usually the capital has the same name as prefecture (e.g. Aomori-shi, Aomori-ken) or is well known.
// Let's just use a broad classification for now.
// Level 2: Cities (Shi) and Wards (Ku)
// Level 3: Towns (Cho/Machi) and Villages (Mura/Son)

// We also need to handle the 6-digit code. Weathernews likely uses 5 digits.
// We will strip the last digit.

const cities = municipalities.map(m => {
    const code5 = m.code.substring(0, 5);
    let level = 3;

    if (m.name_kanji.endsWith('市') || m.name_kanji.endsWith('区')) {
        level = 2;
    }

    // Promote some to Level 1
    // List of major cities (approximate)
    const majorCities = [
        '札幌市', '仙台市', 'さいたま市', '千葉市', '横浜市', '川崎市', '相模原市', '新潟市',
        '静岡市', '浜松市', '名古屋市', '京都市', '大阪市', '堺市', '神戸市', '岡山市',
        '広島市', '北九州市', '福岡市', '熊本市', '東京都' // Tokyo is special
    ];

    if (majorCities.includes(m.name_kanji) || m.name_kanji === '千代田区' || m.name_kanji === '港区' || m.name_kanji === '新宿区') {
        level = 1;
    }

    // Also promote prefectural capitals if not in list (e.g. Naha, Takamatsu)
    // This is a bit manual, but let's just stick to the above + maybe a few more.
    // Actually, let's make it simple:
    // If it was in our previous "Level 1" list, we want it Level 1.
    // Previous Level 1: Sapporo, Sendai, Tokyo, Nagoya, Osaka, Hiroshima, Takamatsu, Fukuoka, Naha.
    const manualLevel1 = ['札幌市', '仙台市', '東京都', '名古屋市', '大阪市', '広島市', '高松市', '福岡市', '那覇市'];
    if (manualLevel1.includes(m.name_kanji)) {
        level = 1;
    }

    return {
        code: code5,
        name: m.name_kanji,
        lat: parseFloat(m.lat),
        lng: parseFloat(m.lon),
        level: level
    };
});

// Remove duplicates (if any, due to code truncation)
const uniqueCities = [];
const seenCodes = new Set();
for (const c of cities) {
    if (!seenCodes.has(c.code)) {
        seenCodes.add(c.code);
        uniqueCities.push(c);
    }
}

const output = `const CITIES = ${JSON.stringify(uniqueCities, null, 4)};`;
fs.writeFileSync('cities.js', output);
console.log(`Generated cities.js with ${uniqueCities.length} entries.`);
