/**
 * Common Header Component for Kusuri Compass
 */
export class MainHeader extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        const baseDir = this.getAttribute('base-dir') || './';
        const activePage = this.getAttribute('active-page') || '';
        const extraContent = this.innerHTML; // Capture any existing HTML inside the tag

        this.innerHTML = `
        <header id="mainHeader" class="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <a href="${baseDir}index.html" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <img src="${baseDir}images/KusuriCompass.png" alt="Kusuri Compass Icon" class="h-10 w-10 object-contain">
                        <div class="flex flex-col">
                            <h1 class="text-lg sm:text-xl font-bold text-indigo-900 leading-tight">Kusuri Compass</h1>
                            <span class="text-[10px] sm:text-xs font-semibold text-indigo-600 leading-tight">薬剤師業務支援ツール</span>
                        </div>
                    </a>
                </div>
                
                <nav class="flex items-center gap-2 sm:gap-4">
                    ${this.renderNavLinks(baseDir, activePage)}
                    
                    ${extraContent} <!-- Insert extra links from the original HTML -->

                    <!-- X link -->
                    <a href="https://x.com/oshigoto_twitte" target="_blank" rel="noopener noreferrer"
                        class="hidden sm:flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors ml-2"
                        aria-label="連絡先 (X/Twitter)">
                        <i class="fa-brands fa-x-twitter text-xl"></i>
                    </a>
                </nav>
            </div>
        </header>
        `;
    }

    renderNavLinks(baseDir, activePage) {
        const links = [
            { id: 'search', label: '出荷状況', fullLabel: '出荷状況検索', path: 'search.html' },
            { id: 'hiyari', label: 'ヒヤリ調査', fullLabel: 'ヒヤリ・ハット検索', path: 'hiyari_app/index.html' },
            { id: 'pollen', label: '花粉監視', fullLabel: '花粉リアルタイム監視', path: 'pollen-app/index.html' }
        ];

        return links.map(link => {
            const isActive = activePage === link.id;
            const activeClass = isActive ? 'text-indigo-700 bg-indigo-50 border border-indigo-200' : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-50';

            return `
                <a href="${baseDir}${link.path}"
                    class="text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 rounded-md transition-all duration-200 ${activeClass}">
                    <span class="hidden md:inline">${link.fullLabel}</span>
                    <span class="md:hidden">${link.label}</span>
                </a>
            `;
        }).join('');
    }
}

// Define the custom element
if (!customElements.get('main-header')) {
    customElements.define('main-header', MainHeader);
}
