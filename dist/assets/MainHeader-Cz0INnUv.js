class n extends HTMLElement{constructor(){super()}connectedCallback(){const e=this.getAttribute("base-dir")||"./";this.innerHTML=`
        <footer id="mainFooter" class="bg-white border-t border-gray-200 mt-auto">
            <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div class="flex items-center gap-2">
                        <img src="${e}images/KusuriCompass.png" alt="Kusuri Compass" class="h-8 w-8 object-contain opacity-50 gray-scale">
                        <span class="text-sm text-gray-500 font-medium">© 2025 Kusuri Compass. All rights reserved.</span>
                    </div>
                    <nav class="flex flex-wrap justify-center gap-6">
                        <a href="${e}terms.html" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">利用規約</a>
                        <a href="${e}privacy.html" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">プライバシーポリシー</a>
                        <a href="https://x.com/oshigoto_twitte" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-600 hover:text-indigo-600 transition-colors duration-200">
                            <i class="fa-brands fa-x-twitter mr-1"></i>連絡先
                        </a>
                    </nav>
                </div>
            </div>
        </footer>
        `}}customElements.get("main-footer")||customElements.define("main-footer",n);class o extends HTMLElement{constructor(){super()}connectedCallback(){const t=this.getAttribute("base-dir")||"./",e=this.getAttribute("active-page")||"",a=this.innerHTML;this.innerHTML=`
        <header id="mainHeader" class="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <a href="${t}index.html" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <img src="${t}images/KusuriCompass.png" alt="Kusuri Compass Icon" class="h-10 w-10 object-contain">
                        <div class="flex flex-col">
                            <h1 class="text-lg sm:text-xl font-bold text-indigo-900 leading-tight">Kusuri Compass</h1>
                            <span class="text-[10px] sm:text-xs font-semibold text-indigo-600 leading-tight">薬剤師業務支援ツール</span>
                        </div>
                    </a>
                </div>
                
                <nav class="flex items-center gap-2 sm:gap-4">
                    ${this.renderNavLinks(t,e)}
                    
                    ${a} <!-- Insert extra links from the original HTML -->

                    <!-- X link -->
                    <a href="https://x.com/oshigoto_twitte" target="_blank" rel="noopener noreferrer"
                        class="hidden sm:flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors ml-2"
                        aria-label="連絡先 (X/Twitter)">
                        <i class="fa-brands fa-x-twitter text-xl"></i>
                    </a>
                </nav>
            </div>
        </header>
        `}renderNavLinks(t,e){return[{id:"search",label:"出荷状況",fullLabel:"出荷状況検索",path:"search.html"},{id:"hiyari",label:"ヒヤリ調査",fullLabel:"ヒヤリ・ハット検索",path:"hiyari_app/index.html"},{id:"pollen",label:"花粉監視",fullLabel:"花粉リアルタイム監視",path:"pollen-app/index.html"}].map(s=>{const r=e===s.id?"text-indigo-700 bg-indigo-50 border border-indigo-200":"text-gray-600 hover:text-indigo-600 hover:bg-gray-50";return`
                <a href="${t}${s.path}"
                    class="text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 rounded-md transition-all duration-200 ${r}">
                    <span class="hidden md:inline">${s.fullLabel}</span>
                    <span class="md:hidden">${s.label}</span>
                </a>
            `}).join("")}}customElements.get("main-header")||customElements.define("main-header",o);
