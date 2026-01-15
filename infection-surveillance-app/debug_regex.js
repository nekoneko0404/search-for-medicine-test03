const fs = require('fs');
const htmlContent = fs.readFileSync('debug_2026.html', 'utf8');

// Old regex (for comparison)
// const linkRegex = /<a[^>]*\bhref="([^"]+)"[^>]*>[\s\S]*?IDWR速報データ \d{4}年第(\d{1,2})週/g;

// New regex: Ensure we don't cross a closing </a> tag
const linkRegex = /<a[^>]*\bhref="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?IDWR速報データ \d{4}年第(\d{1,2})週/g;

let match;
let latestWeek = -1;
let latestLinkUrl = null;

console.log("--- Testing Regex ---");
while ((match = linkRegex.exec(htmlContent)) !== null) {
    const href = match[1];
    const weekNumber = parseInt(match[2], 10);
    console.log(`Found week: ${weekNumber}, href: ${href}`);

    if (weekNumber > latestWeek) {
        latestWeek = weekNumber;
        latestLinkUrl = href;
    }
}

console.log(`Latest Week: ${latestWeek}`);
console.log(`Latest Link URL (raw): ${latestLinkUrl}`);

const indexPageUrl = "https://id-info.jihs.go.jp/surveillance/idwr/jp/rapid/2026/index.html";

if (latestLinkUrl) {
    let finalUrl = latestLinkUrl;
    if (!latestLinkUrl.startsWith('http')) {
        const baseUrl = indexPageUrl.substring(0, indexPageUrl.lastIndexOf('/') + 1);
        finalUrl = baseUrl + latestLinkUrl;
    }
    console.log(`Resolved URL (simple): ${finalUrl}`);

    // Resolve ./
    // Note: In GAS we don't have 'path' module easily, so we might need manual string manipulation
    // or just rely on the fact that we can strip ./

    // Manual resolve simulation
    const parts = finalUrl.split('/');
    const resolvedParts = [];
    for (const part of parts) {
        if (part === '.') continue;
        if (part === '..') {
            resolvedParts.pop();
        } else {
            resolvedParts.push(part);
        }
    }
    const resolvedUrl = resolvedParts.join('/');
    console.log(`Resolved URL (clean): ${resolvedUrl}`);

    // Test validation regex
    const validationRegex = /\/(\d{4})\/(\d{2})\/index\.html$/;
    console.log(`Validation match: ${resolvedUrl.match(validationRegex)}`);
}
