/**
 * Typewriter effect for input placeholder
 * @param {HTMLInputElement} inputElement - The input element to animate
 * @param {string} fullText - The full placeholder text to display
 * @param {number} speed - Typing speed in milliseconds per character
 */
export function typewriterPlaceholder(inputElement, fullText, speed = 100) {
    if (!inputElement || !fullText) return;

    let currentIndex = 0;
    let timeoutId = null;
    let isAnimating = true;

    // Clear the placeholder initially
    inputElement.placeholder = '';

    // Function to stop animation and show full text
    const stopAnimation = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        isAnimating = false;
        inputElement.placeholder = fullText;
    };

    // Function to type one character
    const typeNextChar = () => {
        if (!isAnimating) return;

        if (currentIndex < fullText.length) {
            inputElement.placeholder = fullText.substring(0, currentIndex + 1);
            currentIndex++;
            timeoutId = setTimeout(typeNextChar, speed);
        }
    };

    // Stop animation if user focuses or inputs
    const handleUserInteraction = () => {
        stopAnimation();
        // Remove listeners after first interaction
        inputElement.removeEventListener('focus', handleUserInteraction);
        inputElement.removeEventListener('input', handleUserInteraction);
    };

    inputElement.addEventListener('focus', handleUserInteraction);
    inputElement.addEventListener('input', handleUserInteraction);

    // Start typing animation
    typeNextChar();
}

/**
 * Apply typewriter effect to multiple inputs with staggered start times
 * @param {Array<{element: HTMLInputElement, text: string, speed?: number}>} inputs - Array of input configurations
 * @param {number} staggerDelay - Delay between starting each animation in milliseconds
 */
export function typewriterMultiple(inputs, staggerDelay = 300) {
    inputs.forEach((config, index) => {
        setTimeout(() => {
            typewriterPlaceholder(config.element, config.text, config.speed || 100);
        }, index * staggerDelay);
    });
}
