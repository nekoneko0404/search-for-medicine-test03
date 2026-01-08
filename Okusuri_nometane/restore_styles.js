const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'kiyoshi', 'Github_repository', 'search-for-medicine', 'Okusuri_nometane', 'style.css');

const missingStyles = `

/* Modal Base */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    backdrop-filter: blur(5px);
}

.modal-content {
    background: white;
    width: 90%;
    max-width: 500px;
    max-height: 85vh;
    border-radius: 30px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
}

.close-btn {
    position: absolute;
    top: 15px;
    right: 15px;
    background: var(--accent-color);
    border: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 1.5rem;
    cursor: pointer;
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-color);
    transition: transform 0.2s;
}

.close-btn:hover {
    transform: scale(1.1);
}

/* Settings Header */
.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    width: 100%;
}

.settings-header h1 {
    margin-bottom: 0;
}

.btn-icon {
    background: var(--accent-color);
    border: none;
    padding: 8px 15px;
    border-radius: 20px;
    font-family: var(--font-main);
    font-weight: bold;
    color: var(--text-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background 0.2s;
}

.btn-icon:hover {
    background: var(--secondary-color);
    color: white;
}

/* Manual Content */
.manual-inner {
    padding: 2rem;
    overflow-y: auto;
    flex: 1;
}

.manual-header {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-bottom: 2rem;
    text-align: center;
}

.manual-header h2 {
    font-size: 1.5rem;
    color: var(--primary-color);
    margin: 0;
    line-height: 1.3;
}

.manual-char {
    width: 60px;
    height: 60px;
    object-fit: contain;
}

.manual-section {
    margin-bottom: 2rem;
    text-align: left;
}

.manual-section h3 {
    color: var(--primary-color);
    border-bottom: 2px solid var(--accent-color);
    padding-bottom: 5px;
    margin-bottom: 1rem;
    font-size: 1.2rem;
}

.step-card {
    background: #fff9f9;
    border-radius: 15px;
    padding: 15px;
    margin-bottom: 15px;
    border-left: 5px solid var(--primary-color);
}

.step-card h4 {
    margin: 0 0 5px 0;
    color: var(--primary-color);
}

.step-card p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
}

.manual-section ul {
    padding-left: 20px;
    margin: 0;
}

.manual-section li {
    margin-bottom: 10px;
    line-height: 1.4;
}

.advice-section {
    background: var(--accent-color);
    padding: 20px;
    border-radius: 20px;
    margin-top: 2rem;
}

.advice-card {
    font-size: 0.95rem;
    line-height: 1.6;
}

.advice-card p {
    margin-bottom: 10px;
}

.manual-footer-char {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 15px;
    justify-content: center;
}

.manual-footer-char img {
    width: 50px;
    height: 50px;
}

.manual-footer-char p {
    margin: 0;
    font-weight: bold;
    color: var(--primary-color);
}
`;

try {
    fs.appendFileSync(filePath, missingStyles, 'utf8');
    console.log('Successfully appended missing styles to style.css');
} catch (err) {
    console.error(err);
}
