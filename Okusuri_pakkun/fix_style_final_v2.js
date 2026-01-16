const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Regex to match the target block .certificate-name-input inside @media print
    // We know it ends with width: 80%; }
    const targetRegex = /(\.certificate-name-input\s*\{\s*border:\s*none;[\s\S]*?width:\s*80%;\s*\})/;

    const missingCss = `
    /* Hide placeholder in print */
    .certificate-name-input::placeholder {
        color: transparent;
    }

    .certificate-date {
        font-size: 1.1rem;
        margin-bottom: 30px;
        width: 80%;
        text-align: right;
    }

    .certificate-characters {
        display: flex;
        flex-direction: row;
        margin-bottom: 30px;
        gap: 20px;
        flex-wrap: nowrap;
        width: 100%;
        justify-content: center;
    }

    .character-signature img {
        width: 80px;
        height: 80px;
    }

    .character-signature span {
        font-size: 1rem;
    }`;

    if (targetRegex.test(content)) {
        // Find the print block content to check if we already added it there
        const printBlockRegex = /@media print\s*\{([\s\S]*?)\}\s*$/; // Assuming it's at the end
        const printMatch = content.match(printBlockRegex);

        if (printMatch) {
            const printContent = printMatch[1];
            if (!printContent.includes('.certificate-characters {')) {
                content = content.replace(targetRegex, '$1' + missingCss);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log('Inserted missing CSS into print block.');
            } else {
                console.log('Missing CSS seems to be already present in print block.');
            }
        } else {
            // Fallback if regex for print block fails (maybe not at end)
            // Just insert it.
            content = content.replace(targetRegex, '$1' + missingCss);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Inserted missing CSS (fallback).');
        }
    } else {
        console.log('Could not find target block with regex.');
    }

} catch (err) {
    console.error(err);
}
