const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Find the start of @media print
    const printIndex = content.indexOf('@media print');

    if (printIndex !== -1) {
        const baseContent = content.substring(0, printIndex);

        const newPrintBlock = `
/* Print Styles (A4 Portrait) */
@media print {
    @page {
        size: A4 portrait;
        margin: 0;
    }

    body {
        display: block;
        background: white;
        padding: 0;
        margin: 0;
        width: 100%;
        height: 100%;
    }

    #app {
        display: block;
        box-shadow: none;
        max-width: none;
        width: 100%;
        min-height: 100vh;
        border-radius: 0;
        position: static;
        background: white;
    }

    /* Hide everything in app except the overlay */
    .tab-bar,
    .view,
    header,
    #status-message {
        display: none !important;
    }

    #surprise-overlay {
        position: relative;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        background: white;
        z-index: 9999;
        display: flex !important;
        align-items: center;
        justify-content: center;
        opacity: 1 !important;
        pointer-events: auto;
    }

    .completion-modal {
        width: 100%;
        height: 100%;
        border: none;
        box-shadow: none;
        padding: 0;
        animation: none;
        display: block;
    }

    .certificate-border {
        height: calc(100vh - 14cm) !important; /* 7cm top + 7cm bottom */
        width: 90% !important;
        border: 10px double #FF9AA2 !important; /* Pink border */
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        margin: 7cm auto !important;
    }

    .certificate-header {
        margin-top: 30px;
    }

    .certificate-header h2 {
        font-size: 2.5rem;
    }

    .certificate-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
    }

    .certificate-text {
        font-size: 1.3rem;
        margin-bottom: 30px;
        line-height: 1.6;
    }

    .certificate-name-area {
        margin: 20px 0;
        transform: scale(1.0);
        width: 80%;
        display: flex;
        flex-direction: column;
        align-items: flex-start !important; /* Force left align */
        margin-left: auto;
        margin-right: auto;
    }

    .certificate-name-area label {
        font-size: 1.2rem;
        font-weight: bold;
        margin-bottom: 10px;
        align-self: flex-start !important;
        width: 100%;
        text-align: left !important;
        display: block;
    }

    .certificate-name-input {
        border: none;
        border-bottom: 2px solid #000;
        text-align: center;
        background: transparent;
        width: 100%;
    }

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
    }
    
    .no-print {
        display: none !important;
    }
}`;

        fs.writeFileSync(filePath, baseContent + newPrintBlock, 'utf8');
        console.log('Rewrote @media print block with !important styles.');
    } else {
        console.log('Could not find @media print block.');
    }

} catch (err) {
    console.error(err);
}
