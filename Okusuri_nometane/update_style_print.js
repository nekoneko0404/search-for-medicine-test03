const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Update .certificate-border in print
    // We want to change height to 90vh and margin to 5vh auto
    const borderRegex = /(\.certificate-border\s*\{[\s\S]*?height:\s*)100vh(;[\s\S]*?margin:\s*)0(;\s*\})/;
    if (borderRegex.test(content)) {
        content = content.replace(borderRegex, '$190vh$25vh auto$3');
        console.log('Updated .certificate-border margins.');
    } else {
        console.log('Could not find .certificate-border block to update.');
        // Fallback: try to find it without specific values if they changed
        const borderRegexFallback = /(\.certificate-border\s*\{[\s\S]*?height:\s*)[^;]+(;[\s\S]*?margin:\s*)[^;]+(;\s*\})/;
        if (borderRegexFallback.test(content)) {
            content = content.replace(borderRegexFallback, '$190vh$25vh auto$3');
            console.log('Updated .certificate-border margins (fallback).');
        }
    }

    // 2. Update .certificate-name-area in print
    // We want align-items: flex-start and width: 80% (already 80? let's check)
    // And add margin-left: auto; margin-right: auto;

    // Find the block inside @media print
    // It looks like:
    /*
    .certificate-name-area {
        margin: 40px 0;
        transform: scale(1.2);
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    */
    // We want to change align-items: center to align-items: flex-start
    // And width: 100% to width: 80%
    // And add margins.

    const nameAreaRegex = /(\.certificate-name-area\s*\{[\s\S]*?width:\s*)100%(;[\s\S]*?align-items:\s*)center(;\s*\})/;
    if (nameAreaRegex.test(content)) {
        content = content.replace(nameAreaRegex, '$180%$2flex-start;\n        margin-left: auto;\n        margin-right: auto$3');
        console.log('Updated .certificate-name-area alignment.');
    } else {
        console.log('Could not find .certificate-name-area block to update.');
    }

    fs.writeFileSync(filePath, content, 'utf8');

} catch (err) {
    console.error(err);
}
