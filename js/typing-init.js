import { typewriterMultiple } from './typing-animation.js';

document.addEventListener('DOMContentLoaded', () => {
    const inputs = [
        { element: document.getElementById('drugName'), text: '例: ロキソニン', speed: 150 },
        { element: document.getElementById('ingredientName'), text: '例: ロキソプロフェン', speed: 150 },
        { element: document.getElementById('makerName'), text: '例: 60mg', speed: 150 }
    ];

    typewriterMultiple(inputs, 400);
});
