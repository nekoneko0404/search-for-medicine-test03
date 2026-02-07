let c=null,m=null;function C(i,t="info"){const e=document.getElementById("messageBox");e&&(c&&clearTimeout(c),m&&clearTimeout(m),e.className="fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg transition-all duration-300 opacity-0 transform translate-y-[-20px]",t==="error"?e.classList.add("bg-red-100","text-red-800","border","border-red-200"):t==="success"?e.classList.add("bg-green-100","text-green-800","border","border-green-200"):e.classList.add("bg-blue-100","text-blue-800","border","border-blue-200"),e.textContent=i,e.classList.remove("hidden"),requestAnimationFrame(()=>{e.classList.remove("opacity-0","translate-y-[-20px]")}),c=setTimeout(()=>{e.classList.add("opacity-0","translate-y-[-20px]"),m=setTimeout(()=>{e.classList.add("hidden")},300)},4e3))}function E(i=2e3){const t=document.getElementById("messageBox");t&&(c&&clearTimeout(c),m&&clearTimeout(m),c=setTimeout(()=>{t.classList.add("opacity-0","translate-y-[-20px]"),m=setTimeout(()=>{t.classList.add("hidden")},300)},i))}function $(i,t){const e=document.getElementById("progressBarContainer"),s=document.getElementById("progressBar"),o=document.getElementById("progressMessage");e&&s&&o&&(e.classList.remove("hidden"),o.textContent=i,s.style.width=`${t}%`,t>=100&&setTimeout(()=>{e.classList.add("hidden")},1e3))}function k(i,t=!1){const e=(i||"").trim(),s=document.createElement("span");return s.className="px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap inline-block transition-colors duration-150 border",e.includes("通常出荷")||e.includes("通")?(s.classList.add("bg-indigo-100","text-indigo-800","border-indigo-200"),s.textContent="通常出荷"):e.includes("限定出荷")||e.includes("出荷制限")||e.includes("限")||e.includes("制")?(s.classList.add("bg-yellow-100","text-yellow-800","border-yellow-200"),s.textContent="限定出荷"):e.includes("供給停止")||e.includes("停止")||e.includes("停")?(s.classList.add("bg-gray-100","text-gray-800","border-gray-200"),s.textContent="供給停止"):(s.classList.add("bg-gray-50","text-gray-600","border-gray-200"),s.textContent=e||"不明"),t&&s.classList.add("ring-2","ring-red-400"),s}function A(i,t){const e=i.productName||"",s=encodeURIComponent(e),o=`https://www.pmda.go.jp/PmdaSearch/rdSearch/02/${i.yjCode}?user=1`,h=`dropdown-content-${t}`,r=document.createElement("div");r.className="relative inline-block group/dropdown";const d=document.createElement("button");d.className="text-indigo-600 font-semibold hover:text-indigo-800 text-left flex items-center focus:outline-none name-clickable text-sm",d.textContent=e;const x=document.createElement("span");x.innerHTML="";const l=document.createElementNS("http://www.w3.org/2000/svg","svg");l.setAttribute("class","w-4 h-4 ml-1 opacity-0 group-hover/dropdown:opacity-100 transition-opacity"),l.setAttribute("fill","none"),l.setAttribute("stroke","currentColor"),l.setAttribute("viewBox","0 0 24 24");const p=document.createElementNS("http://www.w3.org/2000/svg","path");p.setAttribute("stroke-linecap","round"),p.setAttribute("stroke-linejoin","round"),p.setAttribute("stroke-width","2"),p.setAttribute("d","M19 9l-7 7-7-7"),l.appendChild(p),x.appendChild(l),d.appendChild(x);const n=document.createElement("div");n.id=h,n.className="invisible opacity-0 group-hover/dropdown:visible group-hover/dropdown:opacity-100 transition-all duration-200 delay-200 group-hover/dropdown:delay-0 absolute left-0 z-[100] min-w-[160px] py-1 bg-white border border-gray-200 rounded-md shadow-xl";const y=()=>{d.getBoundingClientRect().top<200?(n.classList.remove("bottom-full","mb-1"),n.classList.add("top-full","mt-1")):(n.classList.remove("top-full","mt-1"),n.classList.add("bottom-full","mb-1"))};r.addEventListener("mouseenter",()=>{window.innerWidth>640&&y()}),d.addEventListener("click",g=>{window.innerWidth<=640&&(g.preventDefault(),g.stopPropagation(),document.querySelectorAll('[id^="dropdown-content-"]').forEach(a=>{a.id!==h&&a.classList.remove("!visible","!opacity-100")}),n.classList.contains("!visible")?n.classList.remove("!visible","!opacity-100"):(y(),n.classList.add("!visible","!opacity-100")))});const u=(g,f)=>{const a=document.createElement("a");return a.href=g,a.target="_blank",a.rel="noopener noreferrer",a.className="block px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 text-left",a.textContent=f,a},b=window.location.pathname.includes("/drug-classification/")||window.location.pathname.includes("/update/")||window.location.pathname.includes("/hiyari_app/")||window.location.pathname.includes("/supply-status/")?"../":"./";return n.appendChild(u(o,"医薬品情報 (PMDA)")),n.appendChild(u(`${b}drug-classification/index.html?yjcode=${i.yjCode}`,"薬効分類検索")),n.appendChild(u(`https://drug-navigator.pages.dev/?medicineName=${encodeURIComponent(e)}`,"代替薬ナビゲーター")),n.appendChild(u(`${b}update/index.html?productName=${encodeURIComponent(e)}&shippingStatus=all&updateDate=all`,"情報更新日")),n.appendChild(u(`${b}hiyari_app/index.html?drugName=${s}`,"ヒヤリハット検索")),r.appendChild(d),r.appendChild(n),r}document.addEventListener("click",i=>{window.innerWidth<=640&&(i.target.closest(".group\\/dropdown")||document.querySelectorAll('[id^="dropdown-content-"]').forEach(t=>{t.classList.remove("!visible","!opacity-100")}))});class v extends HTMLElement{constructor(){super()}connectedCallback(){const e=this.getAttribute("base-dir")||"./";this.innerHTML=`
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
        `}}customElements.get("main-footer")||customElements.define("main-footer",v);class w extends HTMLElement{constructor(){super()}connectedCallback(){const t=this.getAttribute("base-dir")||"./",e=this.getAttribute("active-page")||"",s=this.innerHTML;this.innerHTML=`
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
                    
                    ${s} <!-- Insert extra links from the original HTML -->

                    <!-- X link -->
                    <a href="https://x.com/oshigoto_twitte" target="_blank" rel="noopener noreferrer"
                        class="hidden sm:flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors ml-2"
                        aria-label="連絡先 (X/Twitter)">
                        <i class="fa-brands fa-x-twitter text-xl"></i>
                    </a>
                </nav>
            </div>
        </header>
        `}renderNavLinks(t,e){return[{id:"search",label:"出荷状況",fullLabel:"出荷状況検索",path:"search.html"},{id:"hiyari",label:"ヒヤリ調査",fullLabel:"ヒヤリ・ハット検索",path:"hiyari_app/index.html"},{id:"pollen",label:"花粉監視",fullLabel:"花粉リアルタイム監視",path:"pollen-app/index.html"}].map(o=>{const r=e===o.id?"text-indigo-700 bg-indigo-50 border border-indigo-200":"text-gray-600 hover:text-indigo-600 hover:bg-gray-50";return`
                <a href="${t}${o.path}"
                    class="text-xs sm:text-sm font-medium px-2 sm:px-3 py-2 rounded-md transition-all duration-200 ${r}">
                    <span class="hidden md:inline">${o.fullLabel}</span>
                    <span class="md:hidden">${o.label}</span>
                </a>
            `}).join("")}}customElements.get("main-header")||customElements.define("main-header",w);export{A as c,E as h,k as r,C as s,$ as u};
