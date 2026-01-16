const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');

    // Find the first "Character Signature Styles" block after line 1560
    let firstBlockStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (i > 1560 && lines[i].includes('/* Character Signature Styles */')) {
            firstBlockStart = i;
            break;
        }
    }

    // Find the second "Character Signature Styles" block
    let secondBlockStart = -1;
    if (firstBlockStart !== -1) {
        for (let i = firstBlockStart + 1; i < lines.length; i++) {
            if (lines[i].includes('/* Character Signature Styles */')) {
                secondBlockStart = i;
                break;
            }
        }
    }

    if (firstBlockStart !== -1 && secondBlockStart !== -1) {
        // Delete everything from firstBlockStart up to (but not including) secondBlockStart
        lines.splice(firstBlockStart, secondBlockStart - firstBlockStart);
        console.log('Removed duplicate incomplete block.');
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    } else {
        console.log(`Could not find two blocks. First: ${firstBlockStart}, Second: ${secondBlockStart}`);
    }

} catch (err) {
    console.error(err);
}
