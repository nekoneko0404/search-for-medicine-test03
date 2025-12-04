import { typewriterPlaceholder } from '../../js/typing-animation.js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    typewriterPlaceholder(searchInput, '医薬品名・成分名・メーカー名で検索 (スペースでAND検索)', 80);
});
