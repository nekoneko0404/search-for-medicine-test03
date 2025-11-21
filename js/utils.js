/**
 * Utility functions for Kusuri Compass
 */

/**
 * Normalize string for search comparison
 * Converts Hiragana to Katakana and normalizes width
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
export function normalizeString(str) {
    if (!str) return '';
    // Convert Hiragana to Katakana
    const hiraToKata = str.replace(/[ぁ-ゖ]/g, function (match) {
        const charCode = match.charCodeAt(0) + 0x60;
        return String.fromCharCode(charCode);
    });
    // Normalize width (Full-width to Half-width for alphanumeric, etc.)
    const normalizedStr = hiraToKata.normalize('NFKC');
    return normalizedStr.toLowerCase();
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Format Date object to YYYYMMDD string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!date) return '';
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Extract search term from string (e.g. for Hiyari Hat search)
 * @param {string} text - Text to extract from
 * @returns {string} Extracted search term
 */
export function extractSearchTerm(text) {
    if (!text) return '';
    let match = text.match(/^([一-龯ァ-ヶー]+(?:[一-龯ァ-ヶー]+)*)/);
    if (match && match[1]) { return match[1]; }
    match = text.match(/[^一-龯ァ-ヶーA-Za-z0-9]*([一-龯ァ-ヶー]+(?:[一-龯ァ-ヶー]+)*)/);
    if (match && match[1]) { return match[1]; }
    return text;
}
