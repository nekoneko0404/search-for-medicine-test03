const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    let openBraces = 0;
    let closeBraces = 0;

    // Simple check ignoring comments/strings for now (CSS usually doesn't have braces in strings except content property)
    // But content property might have braces? Unlikely in this file.

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') openBraces++;
        if (content[i] === '}') closeBraces++;
    }

    console.log(`Open braces: ${openBraces}`);
    console.log(`Close braces: ${closeBraces}`);

    if (openBraces !== closeBraces) {
        console.log('MISMATCH!');
    } else {
        console.log('Balanced.');
    }

    // Check nesting level at the end
    let level = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') level++;
        if (content[i] === '}') level--;
    }
    console.log(`Final nesting level: ${level}`);

} catch (err) {
    console.error(err);
}
