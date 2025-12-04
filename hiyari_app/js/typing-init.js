import { typewriterMultiple } from '../../js/typing-animation.js';

document.addEventListener('DOMContentLoaded', () => {
    const inputs = [
        { element: document.getElementById('search-input'), text: '医薬品名または成分名を入力', speed: 100 },
        { element: document.getElementById('filter-input'), text: '事例内容、背景・要因で検索', speed: 100 }
    ];

    typewriterMultiple(inputs, 300);
});
