const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

const missingCharacterStyles = `

/* Character Signature Styles (Default) */
.certificate-characters {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    margin-top: 40px;
    flex-wrap: wrap;
    gap: 30px;
}

.character-signature {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
}

.character-signature img {
    width: 80px;
    height: 80px;
    object-fit: contain;
    margin-bottom: 5px;
}

.character-signature span {
    font-weight: bold;
    font-size: 1rem;
    color: var(--primary-color);
    font-family: var(--font-main);
}
`;

try {
    fs.appendFileSync(filePath, missingCharacterStyles, 'utf8');
    console.log('Successfully appended missing character styles to style.css');
} catch (err) {
    console.error(err);
}
