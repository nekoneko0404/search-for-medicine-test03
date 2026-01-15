const ALL_DISEASES = [
    { key: 'Influenza', name: 'インフルエンザ' }
];

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

function parseTougaiRows(rows) {
    if (!rows || rows.length < 5) {
        console.log("Rows too short:", rows ? rows.length : "null");
        return [];
    }

    const historyData = [];
    const diseaseSections = {};

    for (let i = 0; i < rows.length; i++) {
        const firstCell = String(rows[i][0] || '').trim();
        ALL_DISEASES.forEach(disease => {
            if (firstCell === disease.name || (firstCell.includes(disease.name) && firstCell.length < disease.name.length + 5)) {
                console.log(`Found disease section: ${disease.name} at row ${i}`);
                if (diseaseSections[disease.key] === undefined) {
                    diseaseSections[disease.key] = i;
                }
            }
        });
    }

    ALL_DISEASES.forEach(disease => {
        if (diseaseSections[disease.key] !== undefined) {
            console.log(`Extracting history for ${disease.name} starting at ${diseaseSections[disease.key]}`);
            historyData.push(...extractHistoryFromSection(rows, diseaseSections[disease.key], disease.key, disease.name));
        } else {
            console.log(`Disease section not found for ${disease.name}`);
        }
    });

    return historyData;
}

function extractHistoryFromSection(rows, startRowIndex, diseaseKey, displayDiseaseName) {
    const results = [];
    let weekHeaderRowIndex = -1;
    let typeHeaderRowIndex = -1;

    for (let i = startRowIndex + 1; i < Math.min(rows.length, startRowIndex + 20); i++) {
        const row = rows[i];
        const rowStr = row.join(',');
        console.log(`Checking row ${i} for headers: ${rowStr}`);

        if (rowStr.includes('週')) {
            const weekMatches = rowStr.match(/(\d{1,2})週/g);
            if (weekMatches && weekMatches.length > 1) {
                console.log(`Found week header at row ${i}`);
                weekHeaderRowIndex = i;
                if (i + 1 < rows.length) {
                    typeHeaderRowIndex = i + 1;
                }
                break;
            }
        }
    }

    if (weekHeaderRowIndex === -1 || typeHeaderRowIndex === -1) {
        console.log(`Headers not found for ${displayDiseaseName}`);
        return [];
    }

    const weekHeaderRow = rows[weekHeaderRowIndex];
    const typeHeaderRow = rows[typeHeaderRowIndex];
    const weekColumns = [];

    for (let i = 0; i < weekHeaderRow.length; i++) {
        const weekText = String(weekHeaderRow[i]);
        const match = weekText.match(/(\d{1,2})週/);
        console.log(`Col ${i}: weekText='${weekText}', match=${match ? match[1] : 'null'}`);
        if (match) {
            const weekNum = parseInt(match[1], 10);
            const currentType = String(typeHeaderRow[i] || '');
            console.log(`  Type row val: '${currentType}'`);
            if (currentType.includes('定当') || currentType.includes('定点当たり')) {
                console.log(`  Found valid column at ${i}`);
                weekColumns.push({ week: weekNum, colIndex: i });
            }
        }
    }
    console.log(`Week columns found:`, weekColumns);

    if (weekColumns.length === 0) {
        console.log(`No week columns found for ${displayDiseaseName}`);
        return [];
    }

    for (let i = typeHeaderRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();
        if (!prefName) continue;

        if (prefName === '北海道') {
            const history = weekColumns.map(wc => {
                const val = parseFloat(row[wc.colIndex]);
                return { week: wc.week, value: isNaN(val) ? 0 : val };
            });
            results.push({ disease: diseaseKey, prefecture: prefName, history: history });
        }
    }
    return results;
}

const csvContent = `
,,,,,,
2026年01週(12月29日～01月04日),2026年01月08日,,,
インフルエンザ,,,,
,総数,定点,01週,01週
,報告数,定点当たり,報告数,定点当たり
北海道,33217,10.35,33217,10.35
`;

const rows = parseCSV(csvContent);
const result = parseTougaiRows(rows);
console.log(JSON.stringify(result, null, 2));
