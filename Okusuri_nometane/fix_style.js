const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');

    // 1. Fix mobile layout
    let targetStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (i > 1500 && lines[i].includes('.certificate-characters {')) {
            targetStartIndex = i;
            break;
        }
    }

    if (targetStartIndex !== -1) {
        if (lines[targetStartIndex + 1].includes('column')) {
            const newContent = [
                '    .certificate-characters {',
                '        flex-direction: row;',
                '        flex-wrap: nowrap;',
                '        gap: 5px;',
                '        justify-content: center;',
                '    }',
                '',
                '    .character-signature img {',
                '        width: 50px;',
                '        height: 50px;',
                '    }',
                '',
                '    .character-signature span {',
                '        font-size: 0.8rem;',
                '    }'
            ];
            // Replace 4 lines
            lines.splice(targetStartIndex, 4, ...newContent);
            console.log('Mobile layout fixed.');
        } else {
            console.log(`Target content mismatch at line ${targetStartIndex + 1}: ${lines[targetStartIndex + 1]}`);
        }
    } else {
        console.log('Could not find .certificate-characters block.');
    }

    // 2. Remove duplicates
    // Recalculate lines because we modified the array
    // Find start of duplicate block
    let dupStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (i > 1570 && lines[i].includes('.certificate-body {')) {
            dupStartIndex = i;
            break;
        }
    }

    let dupEndIndex = -1;
    if (dupStartIndex !== -1) {
        for (let i = dupStartIndex; i < lines.length; i++) {
            if (lines[i].includes('.certificate-characters {')) {
                if (i + 1 < lines.length && lines[i + 1].includes('column')) {
                    dupEndIndex = i + 4; // Closing brace of media query
                    break;
                }
            }
        }
    }

    if (dupStartIndex !== -1 && dupEndIndex !== -1) {
        lines.splice(dupStartIndex, dupEndIndex - dupStartIndex + 1);
        console.log('Duplicates removed.');
    } else {
        console.log(`Could not find duplicates range. Start: ${dupStartIndex}, End: ${dupEndIndex}`);
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('File saved.');

} catch (err) {
    console.error(err);
}
