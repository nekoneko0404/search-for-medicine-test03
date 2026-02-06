/**
 * Common Footer Component for Kusuri Compass
 */
export class MainFooter extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        const year = 2025;
        const baseDir = this.getAttribute('base-dir') || './';

        this.innerHTML = `
        <footer id="mainFooter" class="bg-white border-t border-gray-200 mt-auto">
            <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div class="flex items-center gap-2">
                        <img src="${baseDir}images/KusuriCompass.png" alt="Kusuri Compass" class="h-8 w-8 object-contain opacity-50 gray-scale">
                        <span class="text-sm text-gray-500 font-medium">© ${year} Kusuri Compass. All rights reserved.</span>
                    </div>
                    <nav class="flex flex-wrap justify-center gap-6">
                        <a href="${baseDir}terms.html" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">利用規約</a>
                        <a href="${baseDir}privacy.html" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">プライバシーポリシー</a>
                        <a href="https://x.com/oshigoto_twitte" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">
                            <i class="fa-brands fa-x-twitter mr-1"></i>連絡先
                        </a>
                    </nav>
                </div>
            </div>
        </footer>
        `;
    }
}

// Define the custom element
if (!customElements.get('main-footer')) {
    customElements.define('main-footer', MainFooter);
}
