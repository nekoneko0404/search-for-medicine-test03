/**
 * UI handling module for Kusuri Compass
 */

import { normalizeString, extractSearchTerm } from './utils.js';

/**
 * Show toast message
 * @param {string} text - Message text
 * @param {string} type - 'info', 'success', 'error'
 */
export function showMessage(text, type = 'info') {
    const messageBox = document.getElementById('messageBox');
    if (!messageBox) return;

    // Reset classes
    messageBox.className = 'fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-opacity duration-300 opacity-0 transform translate-y-[-20px]';

    // Add type-specific classes
    if (type === 'error') {
        messageBox.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
    } else if (type === 'success') {
        messageBox.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-200');
    } else {
        messageBox.classList.add('bg-blue-100', 'text-blue-800', 'border', 'border-blue-200');
    }

    messageBox.textContent = text;
    messageBox.classList.remove('hidden');

    // Animate in
    requestAnimationFrame(() => {
        messageBox.classList.remove('opacity-0', 'translate-y-[-20px]');
    });

    // Auto hide
    setTimeout(() => {
        messageBox.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 300);
    }, 3000);
}

/**
 * Update progress bar
 * @param {string} message - Status message
 * @param {number} percentage - Progress percentage (0-100)
 */
export function updateProgress(message, percentage) {
    const container = document.getElementById('progressBarContainer');
    const bar = document.getElementById('progressBar');
    const msg = document.getElementById('progressMessage');

    if (container && bar && msg) {
        container.classList.remove('hidden');
        msg.textContent = message;
        bar.style.width = `${percentage}%`;

        if (percentage >= 100) {
            setTimeout(() => {
                container.classList.add('hidden');
            }, 1000);
        }
    }
}

/**
 * Render status badge
 * @param {string} status - Status text
 * @param {boolean} isUpdated - Whether the status was recently updated
 * @returns {HTMLElement} Span element
 */
export function renderStatusButton(status, isUpdated = false) {
    const trimmedStatus = (status || "").trim();
    const span = document.createElement('span');
    span.className = "px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150 border";

    if (trimmedStatus.includes("通常出荷") || trimmedStatus.includes("通")) {
        span.classList.add('bg-indigo-100', 'text-indigo-800', 'border-indigo-200');
        span.textContent = '通常出荷';
    } else if (trimmedStatus.includes("限定出荷") || trimmedStatus.includes("出荷制限") || trimmedStatus.includes("限") || trimmedStatus.includes("制")) {
        span.classList.add('bg-yellow-100', 'text-yellow-800', 'border-yellow-200');
        span.textContent = '限定出荷';
    } else if (trimmedStatus.includes("供給停止") || trimmedStatus.includes("停止") || trimmedStatus.includes("停")) {
        span.classList.add('bg-gray-100', 'text-gray-800', 'border-gray-200');
        span.textContent = '供給停止';
    } else {
        span.classList.add('bg-gray-50', 'text-gray-600', 'border-gray-200');
        span.textContent = trimmedStatus || "不明";
    }

    if (isUpdated) {
        span.classList.add('ring-2', 'ring-red-400');
    }
    return span;
}

/**
 * Open Hiyari Hat page
 * @param {string} type - 'ingredientName' or 'drugName'
 * @param {string} name - Name to search
 */
export function openHiyariPage(type, name) {
    const hiyariBaseUrl = './hiyari_app/index.html';
    let extractedName = extractSearchTerm(name);

    if (Array.isArray(extractedName)) {
        extractedName = extractedName || '';
    } else if (typeof extractedName !== 'string') {
        extractedName = String(extractedName || '');
    }

    let finalName = extractedName;

    if (type === 'ingredientName' && finalName) {
        const parts = finalName.split(/[，,、]/).map(p => p.trim()).filter(p => p !== '');
        let candidate = '';
        for (const p of parts) {
            const m = p.match(/([ァ-ヶー]+)/);
            if (m && m[1]) {
                candidate = m[1];
                break;
            }
        }
        if (!candidate && parts.length > 0) {
            candidate = parts[0].replace(/^[ＬL][－-]?/, '').trim();
        }
        if (candidate) {
            finalName = candidate;
        } else if (parts.length > 0) {
            finalName = parts[0];
        }
    }

    const url = `${hiyariBaseUrl}?${type}=${encodeURIComponent(finalName)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Create dropdown menu for drug name
 * @param {Object} item - Data item
 * @param {number} index - Row index
 * @returns {HTMLElement} Dropdown container
 */
export function createDropdown(item, index) {
    const drugName = item.productName || "";
    const drugNameForHiyari = encodeURIComponent(drugName);
    const pmdaLinkUrl = `https://www.pmda.go.jp/PmdaSearch/rdSearch/02/${item.yjCode}?user=1`;
    const dropdownContentId = `dropdown-content-${index}`;

    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'relative inline-block group/dropdown';

    const button = document.createElement('button');
    button.className = "text-indigo-600 font-semibold hover:text-indigo-800 text-left flex items-center focus:outline-none";
    button.textContent = drugName;

    // Add chevron icon
    const chevron = document.createElement('span');
    chevron.innerHTML = '<svg class="w-4 h-4 ml-1 opacity-0 group-hover/dropdown:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>';
    button.appendChild(chevron);

    const dropdownContent = document.createElement('div');
    dropdownContent.id = dropdownContentId;
    // Use opacity/visibility with delay to prevent menu from disappearing when crossing the gap
    dropdownContent.className = "invisible opacity-0 group-hover/dropdown:visible group-hover/dropdown:opacity-100 transition-all duration-200 delay-200 group-hover/dropdown:delay-0 absolute left-0 z-[60] min-w-[160px] py-1 bg-white border border-gray-200 rounded-md shadow-xl";

    // Position check on mouse enter
    dropdownContainer.addEventListener('mouseenter', () => {
        // Desktop hover behavior
        if (window.innerWidth > 640) {
            const rect = dropdownContainer.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 200; // Approximate height

            if (spaceBelow < dropdownHeight) {
                dropdownContent.classList.remove('top-full', 'mt-1');
                dropdownContent.classList.add('bottom-full', 'mb-1');
            } else {
                dropdownContent.classList.remove('bottom-full', 'mb-1');
                dropdownContent.classList.add('top-full', 'mt-1');
            }
        }
    });

    // Mobile click behavior
    button.addEventListener('click', (e) => {
        if (window.innerWidth <= 640) {
            e.preventDefault();
            e.stopPropagation();

            // Close other open dropdowns
            document.querySelectorAll('[id^="dropdown-content-"]').forEach(el => {
                if (el.id !== dropdownContentId) {
                    el.classList.remove('!visible', '!opacity-100');
                }
            });

            // Toggle current dropdown
            const isVisible = dropdownContent.classList.contains('!visible');
            if (!isVisible) {
                // Position check for mobile (similar to desktop but on click)
                const rect = dropdownContainer.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropdownHeight = 200;

                if (spaceBelow < dropdownHeight) {
                    dropdownContent.classList.remove('top-full', 'mt-1');
                    dropdownContent.classList.add('bottom-full', 'mb-1');
                } else {
                    dropdownContent.classList.remove('bottom-full', 'mb-1');
                    dropdownContent.classList.add('top-full', 'mt-1');
                }

                dropdownContent.classList.add('!visible', '!opacity-100');
            } else {
                dropdownContent.classList.remove('!visible', '!opacity-100');
            }
        }
    });

    const createLink = (href, text) => {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = "block px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 text-left";
        link.textContent = text;
        return link;
    };

    // Adjust paths based on current location
    const isSubPage = window.location.pathname.includes('/yjcode/') || window.location.pathname.includes('/update/') || window.location.pathname.includes('/hiyari_app/');
    const basePath = isSubPage ? '../' : './';

    dropdownContent.appendChild(createLink(pmdaLinkUrl, '医薬品情報 (PMDA)'));
    dropdownContent.appendChild(createLink(`${basePath}yjcode/index.html?yjcode=${item.yjCode}`, '代替薬検索'));
    dropdownContent.appendChild(createLink(`${basePath}update/index.html?productName=${encodeURIComponent(drugName)}&shippingStatus=all&updateDate=all`, '情報更新日'));
    dropdownContent.appendChild(createLink(`${basePath}hiyari_app/index.html?drugName=${drugNameForHiyari}`, 'ヒヤリハット検索'));

    dropdownContainer.appendChild(button);
    dropdownContainer.appendChild(dropdownContent);

    return dropdownContainer;
}

// Global listener to close dropdowns when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 640) {
        // If click is not inside a dropdown container
        if (!e.target.closest('.group\\/dropdown')) {
            document.querySelectorAll('[id^="dropdown-content-"]').forEach(el => {
                el.classList.remove('!visible', '!opacity-100');
            });
        }
    }
});
