const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Update .certificate-border in print
    // Ensure height is calc(100vh - 14cm), margin is 7cm auto, and border color is pink.
    const borderRegex = /(\.certificate-border\s*\{[\s\S]*?height:\s*)[^;]+(;[\s\S]*?width:\s*)[^;]+(;[\s\S]*?border:\s*)[^;]+(;[\s\S]*?margin:\s*)[^;]+(;\s*\})/;

    // We want:
    /*
    .certificate-border {
        height: calc(100vh - 14cm);
        width: 90%;
        border: 10px double var(--primary-color);
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        margin: 7cm auto;
    }
    */
    // Note: padding might need adjustment if content overflows.

    // Using a more robust replacement for the print block specifically.
    // Let's find the @media print block again and replace the relevant parts.

    const printBlockStart = content.indexOf('@media print');
    if (printBlockStart !== -1) {
        let printBlock = content.substring(printBlockStart);

        // Replace .certificate-border style
        const newBorder = `
    .certificate-border {
        height: calc(100vh - 14cm);
        width: 90%;
        border: 10px double var(--primary-color);
        padding: 10px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        margin: 7cm auto;
    }`;

        // Regex to find .certificate-border block inside print block
        // It matches .certificate-border { ... }
        const borderBlockRegex = /\.certificate-border\s*\{[^}]+\}/;

        if (borderBlockRegex.test(printBlock)) {
            printBlock = printBlock.replace(borderBlockRegex, newBorder.trim());
        }

        // Replace .certificate-name-area style
        // We want label left aligned.
        /*
        .certificate-name-area {
            margin: 20px 0;
            transform: scale(1.0);
            width: 80%;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            margin-left: auto;
            margin-right: auto;
        }
        */
        const newNameArea = `
    .certificate-name-area {
        margin: 20px 0;
        transform: scale(1.0);
        width: 80%;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        margin-left: auto;
        margin-right: auto;
    }
    
    .certificate-name-area label {
        font-size: 1.2rem;
        font-weight: bold;
        margin-bottom: 10px;
        align-self: flex-start;
        width: 100%;
        text-align: left;
    }`;

        const nameAreaBlockRegex = /\.certificate-name-area\s*\{[^}]+\}/;
        if (nameAreaBlockRegex.test(printBlock)) {
            printBlock = printBlock.replace(nameAreaBlockRegex, newNameArea.trim());
        }

        // Reassemble content
        content = content.substring(0, printBlockStart) + printBlock;
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated print styles for 7cm margin and left-aligned name.');
    } else {
        console.log('Could not find @media print block.');
    }

} catch (err) {
    console.error(err);
}
