import"./modulepreload-polyfill-B5Qt9EMX.js";/* empty css              */let l,h,v,d,y,b,_,f,m,p,x,u;const L="https://recipe-worker.neko-neko-0404.workers.dev",$=[{label:"血圧が高め",value:"血圧"},{label:"血糖値が気になる",value:"血糖値"},{label:"腎臓をいたわりたい",value:"腎臓"},{label:"肝臓をいたわりたい",value:"肝臓"},{label:"体重が気になる",value:"減量"},{label:"尿酸値が高め",value:"尿酸値"},{label:"骨密度が気になる",value:"骨強化"},{label:"筋力をつけたい",value:"筋力アップ"},{label:"認知機能を維持したい",value:"脳活性化"},{label:"中性脂肪が気になる",value:"中性脂肪"},{label:"コレステロールが高め",value:"コレステロール"},{label:"風邪気味",value:"免疫力"},{label:"肩こりがひどい",value:"肩こり解消"},{label:"冷え性",value:"血行促進"},{label:"疲れが取れない",value:"疲労回復"},{label:"便秘気味",value:"腸内環境"},{label:"貧血気味",value:"鉄分補給"},{label:"肌荒れ",value:"美肌"}];function w(){l=document.getElementById("recipe-form"),h=document.getElementById("symptoms-container"),v=document.getElementById("api-key-input-container"),d=document.getElementById("api-key"),y=document.getElementById("advanced-settings-toggle"),b=document.getElementById("advanced-settings"),_=document.getElementById("result-section"),f=document.getElementById("loading"),m=document.getElementById("recipe-cards"),p=document.getElementById("save-api-key"),x=document.getElementById("save-key-warning"),u=document.getElementById("save-form-state"),h?A():console.error("Symptoms container not found!"),l&&(T(),H(),D(),M())}function A(){h.innerHTML=$.map(t=>`<label class="cursor-pointer group">
            <input type="checkbox" name="symptoms" value="${t.value}" class="peer hidden">
            <span class="inline-block px-4 py-2 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-orange-50 hover:border-orange-300 transition-all select-none text-sm peer-checked:bg-orange-500 peer-checked:text-white peer-checked:border-orange-500 peer-checked:shadow-md peer-checked:scale-105 transform">
                ${t.label}
            </span>
        </label>`).join("")}function T(){y&&b&&y.addEventListener("click",()=>{b.classList.toggle("hidden");const s=y.querySelector("i");b.classList.contains("hidden")?s.classList.remove("rotate-180"):s.classList.add("rotate-180")}),p&&p.addEventListener("change",s=>{s.target.checked?(x.classList.remove("hidden"),d.value&&localStorage.setItem("recipe_app_user_key",d.value)):(x.classList.add("hidden"),localStorage.removeItem("recipe_app_user_key"))}),d&&d.addEventListener("input",s=>{p.checked&&localStorage.setItem("recipe_app_user_key",s.target.value)});const t=document.getElementsByName("api_option");Array.from(t).forEach(s=>{s.addEventListener("change",a=>{const n=a.target.value;localStorage.setItem("recipe_app_provider",n),n==="system"?v.classList.add("hidden"):v.classList.remove("hidden")})}),l.addEventListener("submit",C);const r=document.getElementById("print-btn");r&&r.addEventListener("click",()=>{document.querySelectorAll("#recipe-cards details").forEach(i=>i.setAttribute("open","true"));const a=document.getElementById("print-header"),n=document.querySelectorAll(".recipe-card"),o=[];if(a&&n.length>0)for(let i=1;i<n.length;i++){const c=a.cloneNode(!0);c.classList.add("cloned-header"),c.id="",n[i].parentNode.insertBefore(c,n[i]),o.push(c)}window.print(),setTimeout(()=>{o.forEach(i=>i.remove())},100)});const e=document.getElementById("copy-prompt-btn");e&&e.addEventListener("click",B)}function S(){const t=new FormData(l),r=Array.from(t.getAll("symptoms")),e=t.get("other_symptom");e&&e.trim()!==""&&r.push(e.trim());const s=Array.from(t.getAll("ingredient")).filter(i=>i.trim()!==""),a=Array.from(t.getAll("excluded_ingredient")).filter(i=>i.trim()!==""),n=t.get("cuisine"),o=t.get("time");return{symptoms:r,ingredients:s,excludedIngredients:a,cuisine:n,time:o}}async function B(){const t=S(),r=t.symptoms.length>0?t.symptoms.join("、"):"特になし",e=t.ingredients.length>0?t.ingredients.join("、"):"おまかせ",s=t.excludedIngredients.length>0?t.excludedIngredients.join("、"):"なし",n=`あなたは管理栄養士かつ一流のシェフです。
ユーザーの体調や症状、手持ちの食材、希望する料理ジャンル、調理時間に合わせて、最適なレシピを3つ提案してください。

# ユーザー情報
【体調・気になること】${r}
【使いたい食材】${e}
【除外したい食材】${s}
【ジャンル】${t.cuisine}
【希望調理時間】${t.time}

# 制約事項
- 治療や治癒などの医学的表現は避け、健康をサポートするという表現にとどめてください。
- 具体的な材料と分量、手順を提示してください。
- 糖質、脂質、タンパク質、塩分（概算値）も併記してください。
- 材料費の概算（調味料除く）を「estimated_cost」として記載してください。
- 明るく励ますようなトーンで回答してください。
- 現地の本格的な食材を積極的に使用してください。ただし、日本で入手困難な食材には、必ず日本で購入可能な代替食材を提案してください（ingredientsにsubstituteを含める）。

# データ形式の定義
- **cuisine_region**: 料理のルーツとなる地域や国を記載してください。
  - 日本に馴染みのある国（日本、イタリア、アメリカなど）は、国名だけでなく地域名まで詳しく（例: 「日本・長野」「イタリア・シチリア」）。
  - 馴染みのない国は広域地域名で（例: 「東南アジア」「中東」）。
- **ingredients**: 各食材の情報をオブジェクトの配列で記載してください。
  - name: 食材名
  - amount: 分量
  - estimated_price: その食材の概算価格（日本円）。
  - substitute: 代替食材（日本で入手困難な本格食材を使用する場合のみ記載）。例: "レモン汁(大さじ1) + ショウガ薄切り"`;try{await navigator.clipboard.writeText(n);const o=document.getElementById("copy-prompt-btn"),i=o.innerHTML;o.innerHTML='<i class="fas fa-check"></i> コピーしました！',o.classList.remove("bg-blue-50","text-blue-700","border-blue-200"),o.classList.add("bg-green-50","text-green-700","border-green-200"),setTimeout(()=>{o.innerHTML=i,o.classList.add("bg-blue-50","text-blue-700","border-blue-200"),o.classList.remove("bg-green-50","text-green-700","border-green-200")},3e3)}catch(o){console.error("Failed to copy keys: ",o),alert("クリップボードへのコピーに失敗しました。")}}document.addEventListener("DOMContentLoaded",w);async function C(t){t.preventDefault(),_.classList.remove("hidden"),m.innerHTML="",f.classList.remove("hidden"),_.scrollIntoView({behavior:"smooth"});const e=new FormData(l).get("api_option");let s=null;if((e==="openai"||e==="gemini")&&(s=d.value.trim()),(e==="openai"||e==="gemini")&&!s){I("APIキーが入力されていません。設定を確認するか、「おまかせ」を選択してください。"),f.classList.add("hidden");return}const{symptoms:a,ingredients:n,excludedIngredients:o,cuisine:i,time:c}=S(),E={symptoms:a,ingredients:n,excludedIngredients:o,cuisine:i,time:c,provider:e==="openai"?"openai":"gemini"};try{const g=await q(E,s);P(g)}catch(g){console.error("Error:",g),I(g.message,g.status,e)}finally{f.classList.add("hidden")}}function H(){const t=localStorage.getItem("recipe_app_user_key"),r=localStorage.getItem("recipe_app_provider");if(r){const e=document.querySelector(`input[name="api_option"][value="${r}"]`);e&&(e.checked=!0,r!=="system"&&v.classList.remove("hidden"))}t&&(d.value=t,p&&(p.checked=!0,x.classList.remove("hidden")))}function k(){if(u&&!u.checked)return;S();const t=new FormData(l),r={symptoms:t.getAll("symptoms"),other_symptom:t.get("other_symptom"),ingredients:t.getAll("ingredient"),excluded_ingredients:t.getAll("excluded_ingredient"),excluded_ingredients:t.getAll("excluded_ingredient"),cuisine:t.get("cuisine"),time:t.get("time")};localStorage.setItem("recipe_app_form_state",JSON.stringify(r))}function D(){if(!(localStorage.getItem("recipe_app_enable_history")!=="false"))return;const r=localStorage.getItem("recipe_app_form_state");if(r)try{const e=JSON.parse(r);if(e.symptoms&&document.querySelectorAll('input[name="symptoms"]').forEach(a=>{a.checked=e.symptoms.includes(a.value)}),e.other_symptom){const s=document.querySelector('input[name="other_symptom"]');s&&(s.value=e.other_symptom)}if(e.ingredients){const s=document.querySelectorAll('input[name="ingredient"]');e.ingredients.forEach((a,n)=>{s[n]&&(s[n].value=a)})}if(e.excluded_ingredients){const s=document.querySelectorAll('input[name="excluded_ingredient"]');e.excluded_ingredients.forEach((a,n)=>{s[n]&&(s[n].value=a)})}if(e.cuisine){const s=document.querySelector(`input[name="cuisine"][value="${e.cuisine}"]`);s&&(s.checked=!0)}if(e.time){const s=document.querySelector(`input[name="time"][value="${e.time}"]`);s&&(s.checked=!0)}}catch(e){console.error("Failed to restore form state:",e)}}function M(){if(u){const e=localStorage.getItem("recipe_app_enable_history")!=="false";u.checked=e,u.addEventListener("change",s=>{const a=s.target.checked;localStorage.setItem("recipe_app_enable_history",a),a?k():localStorage.removeItem("recipe_app_form_state")})}let t;const r=()=>{clearTimeout(t),t=setTimeout(k,500)};l.addEventListener("change",r),l.addEventListener("input",r)}async function q(t,r){const e={"Content-Type":"application/json"};r&&(e["X-User-Key"]=r);try{const s=await fetch(L,{method:"POST",headers:e,body:JSON.stringify(t)}),a=await s.text();let n;try{n=JSON.parse(a)}catch{throw new Error(a||`Server Error: ${s.status}`)}if(!s.ok){const o=n.error||`Server Error: ${s.status}`,i=new Error(o);throw i.status=s.status,i}return n}catch(s){throw s}}function P(t){if(!t.recipes||t.recipes.length===0){m.innerHTML='<p class="text-center text-gray-500">レシピが見つかりませんでした。</p>';return}const r=e=>String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");if(t.message){const e=document.createElement("div");e.className="col-span-1 md:col-span-2 lg:col-span-3 bg-orange-50 p-4 rounded-xl border border-orange-200 text-orange-800 mb-4 fade-in",e.innerHTML=`<i class="fas fa-comment-medical mr-2"></i><strong>AIからのアドバイス:</strong> ${r(t.message)}`,m.appendChild(e)}t.recipes.forEach((e,s)=>{const a=document.createElement("div");a.className="recipe-card fade-in-up w-full",a.style.animationDelay=`${s*.2}s`,a.innerHTML=`
            <details class="group">
                <summary class="bg-orange-100 p-4 border-b border-orange-200 flex justify-between items-center cursor-pointer list-none hover:bg-orange-200 transition-colors">
                    <div class="flex-1">
                        <div class="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                             <div class="flex items-center gap-2">
                                <span class="text-2xl group-open:rotate-90 transition-transform duration-200">🥘</span>
                                <h3 class="text-xl font-bold text-gray-800">${r(e.name)}</h3>
                             </div>
                             ${e.cuisine_region?`<span class="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 self-start md:self-auto"><i class="fas fa-globe-asia mr-1 text-gray-400"></i>${r(e.cuisine_region)}</span>`:""}
                        </div>
                        <div class="flex flex-wrap gap-2 text-sm text-gray-600 pl-0 md:pl-8">
                            <span class="bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100"><i class="fas fa-clock text-orange-400 mr-1"></i>${r(e.time)}</span>
                            <span class="bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100"><i class="fas fa-fire text-red-500 mr-1"></i>${r(e.calories)}</span>
                            ${e.estimated_cost?`<span class="bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100" title="調味料を除くメイン食材の概算費用"><i class="fas fa-coins text-yellow-500 mr-1"></i>${r(e.estimated_cost)}</span>`:""}
                        </div>
                        <div class="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 pl-0 md:pl-8">
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">糖質:${r(e.carbs)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">脂質:${r(e.fat)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">タンパク:${r(e.protein)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">塩分:${r(e.salt)}</span>
                        </div>
                        <div class="mt-2 pl-0 md:pl-8 text-sm text-green-700 bg-green-50 p-2 rounded-lg border border-green-200 mx-0 md:mx-0">
                             <i class="fas fa-heart text-green-500 mr-1"></i>${r(e.health_point)}
                        </div>
                    </div>
                    <div class="text-orange-500">
                        <i class="fas fa-chevron-down group-open:rotate-180 transition-transform duration-200"></i>
                    </div>
                </summary>
                
                <div class="p-5 bg-white">
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-700 mb-2 border-l-4 border-orange-500 pl-2">材料
                            ${e.estimated_cost?`<span class="text-xs font-normal text-gray-400 ml-2">※費用目安: ${r(e.estimated_cost)} (調味料除く)</span>`:""}
                        </h4>
                        <ul class="list-none text-sm text-gray-600 bg-gray-50 p-3 rounded-lg space-y-2">
                            ${e.ingredients.map(n=>typeof n=="object"&&n!==null?`<li class="flex justify-between items-center border-b border-gray-200 pb-1 last:border-0 last:pb-0">
                                        <div>
                                            <span class="font-bold text-gray-700">${r(n.name)}</span>
                                            <span class="text-gray-500 ml-2 text-xs">${r(n.amount)}</span>
                                            ${n.substitute?`<div class="text-xs text-orange-600 mt-0.5"><i class="fas fa-exchange-alt mr-1"></i>代用: ${r(n.substitute)}</div>`:""}
                                        </div>
                                        <span class="text-xs font-mono text-gray-500 bg-white px-1 rounded border border-gray-200">${r(n.estimated_price)}</span>
                                    </li>`:`<li>${r(n)}</li>`).join("")}
                        </ul>
                    </div>

                    <div>
                        <h4 class="font-bold text-gray-700 mb-2 border-l-4 border-blue-500 pl-2">作り方</h4>
                        <ol class="list-decimal list-inside text-sm text-gray-600 space-y-1">
                            ${e.steps.map(n=>`<li>${r(n)}</li>`).join("")}
                        </ol>
                    </div>
                    
                    <div class="mt-4 text-center">
                         <button type="button" class="text-sm text-orange-500 hover:text-orange-700 underline" onclick="this.closest('details').removeAttribute('open')">閉じる</button>
                    </div>
                </div>
            </details>
        `,m.appendChild(a)})}function I(t,r,e){let s="エラーが発生しました",a="時間をおいて再度お試しいただくか、APIキーの設定を確認してください。";(r===429||t.includes("429")||t.includes("Quota exceeded")||t.includes("exceeded your current quota")||t.includes("Too Many Requests")||t.includes("Resource has been exhausted"))&&(e==="system"?(s="本日の利用上限に達しました",t="システム無料枠（おまかせモデル）は、1日の利用回数に制限があります。",a=`
                <div class="mt-4 bg-orange-100 p-4 rounded-lg text-left">
                    <p class="font-bold text-orange-800 mb-2">解決策:</p>
                    <ul class="list-disc list-inside text-orange-700 text-sm space-y-1">
                        <li>ご自身のGemini APIキーまたはOpenAI APIキーをお持ちの場合は、詳細設定から入力してご利用ください。</li>
                        <li>または、明日以降に再度お試しください。</li>
                    </ul>
                </div>
            `):(s="APIキーの利用枠を超過しました",t="設定されたAPIキーで利用枠（Quota）を超過したか、課金制限に達しました。",a=`
                <div class="mt-4 bg-red-100 p-4 rounded-lg text-left">
                    <p class="font-bold text-red-800 mb-2">解決策:</p>
                    <ul class="list-disc list-inside text-red-700 text-sm space-y-1">
                        <li>OpenAI (またはGoogle) の管理画面で、Billing設定やCredit残高をご確認ください。</li>
                        <li>GPT-5 Nanoなどの新しいモデルは、一部のアカウントでまだ利用できない場合や、高いクレジット残高が必要な場合があります。</li>
                        <li>解決しない場合は、モデルを「おまかせ (無料)」に切り替えてお試しください。</li>
                    </ul>
                </div>
            `)),m.innerHTML=`
        <div class="col-span-1 md:col-span-3 bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center fade-in">
            <i class="fas fa-exclamation-circle text-4xl mb-3 text-red-400"></i>
            <h3 class="font-bold text-xl mb-2">${s}</h3>
            <p class="text-lg mb-2">${t}</p>
            <div class="text-sm mt-2">${a}</div>
        </div>
    `}
