import { typewriterPlaceholder } from '../../js/typing-animation.js';

document.addEventListener('DOMContentLoaded', () => {
    const yjCodeInput = document.getElementById('yjCodeInput');
    typewriterPlaceholder(yjCodeInput, 'YJコード (例: 1124009F1020)', 100);
});
