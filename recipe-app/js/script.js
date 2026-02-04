// DOM Elements (Initialized in init)
let form, symptomsContainer, apiKeyInputContainer, apiKeyInput, advancedSettingsToggle, advancedSettings, resultSection, loadingDiv, recipeCardsDiv, saveApiKeyCheckbox, saveKeyWarning;

// API Configuration URLs
const API_URL = 'https://recipe-worker.neko-neko-0404.workers.dev';

// Symptoms List
const SYMPTOMS = [
    { label: '血圧が高め', value: '血圧' },
    { label: '血糖値が気になる', value: '血糖値' },
    { label: '腎臓をいたわりたい', value: '腎臓' },
    { label: '肝臓をいたわりたい', value: '肝臓' },
    { label: '体重が気になる', value: '減量' },
    { label: '尿酸値が高め', value: '尿酸値' },
    { label: '骨密度が気になる', value: '骨強化' },
    { label: '筋力をつけたい', value: '筋力アップ' },
    { label: '認知機能を維持したい', value: '脳活性化' },
    { label: '中性脂肪が気になる', value: '中性脂肪' },
    { label: 'コレステロールが高め', value: 'コレステロール' },
    { label: '風邪気味', value: '免疫力' },
    { label: '肩こりがひどい', value: '肩こり解消' },
    { label: '冷え性', value: '血行促進' },
    { label: '疲れが取れない', value: '疲労回復' },
    { label: '便秘気味', value: '腸内環境' },
    { label: '貧血気味', value: '鉄分補給' },
    { label: '肌荒れ', value: '美肌' },
];

/**
 * Initialize the application
 */
function init() {
    // Initialize DOM Elements
    form = document.getElementById('recipe-form');
    symptomsContainer = document.getElementById('symptoms-container');
    apiKeyInputContainer = document.getElementById('api-key-input-container');
    apiKeyInput = document.getElementById('api-key');
    advancedSettingsToggle = document.getElementById('advanced-settings-toggle');
    advancedSettings = document.getElementById('advanced-settings');
    resultSection = document.getElementById('result-section');
    loadingDiv = document.getElementById('loading');
    recipeCardsDiv = document.getElementById('recipe-cards');
    saveApiKeyCheckbox = document.getElementById('save-api-key');
    saveKeyWarning = document.getElementById('save-key-warning');

    if (symptomsContainer) {
        renderSymptoms();
    } else {
        console.error("Symptoms container not found!");
    }

    if (form) {
        setupEventListeners();
        loadSavedSettings();
    }
}

/**
 * Render symptom checkboxes
 */
function renderSymptoms() {
    // Simplified template string to avoid whitespace issues
    symptomsContainer.innerHTML = SYMPTOMS.map(s =>
        `<label class="cursor-pointer group">
            <input type="checkbox" name="symptoms" value="${s.value}" class="peer hidden">
            <span class="inline-block px-4 py-2 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-orange-50 hover:border-orange-300 transition-all select-none text-sm peer-checked:bg-orange-500 peer-checked:text-white peer-checked:border-orange-500 peer-checked:shadow-md peer-checked:scale-105 transform">
                ${s.label}
            </span>
        </label>`
    ).join('');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Advanced Settings Toggle
    if (advancedSettingsToggle && advancedSettings) {
        advancedSettingsToggle.addEventListener('click', () => {
            advancedSettings.classList.toggle('hidden');
            const icon = advancedSettingsToggle.querySelector('i');
            if (advancedSettings.classList.contains('hidden')) {
                icon.classList.remove('rotate-180');
            } else {
                icon.classList.add('rotate-180');
            }
        });
    }



    // Save API Key Checkbox
    if (saveApiKeyCheckbox) {
        saveApiKeyCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
                saveKeyWarning.classList.remove('hidden');
                if (apiKeyInput.value) {
                    localStorage.setItem('recipe_app_user_key', apiKeyInput.value);
                }
            } else {
                saveKeyWarning.classList.add('hidden');
                localStorage.removeItem('recipe_app_user_key');
            }
        });
    }

    // API Key Input
    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', (e) => {
            if (saveApiKeyCheckbox.checked) {
                localStorage.setItem('recipe_app_user_key', e.target.value);
            }
        });
    }

    // API Option Radio Change
    const apiOptions = document.getElementsByName('api_option');
    Array.from(apiOptions).forEach(radio => {
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            localStorage.setItem('recipe_app_provider', value);

            if (value === 'system') {
                apiKeyInputContainer.classList.add('hidden');
            } else {
                apiKeyInputContainer.classList.remove('hidden');
            }
        });
    });

    // Form Submit
    form.addEventListener('submit', handleFormSubmit);

    // Print Button
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            // Force expand all details for printing
            const details = document.querySelectorAll('#recipe-cards details');
            details.forEach(d => d.setAttribute('open', 'true'));

            // Print
            window.print();
        });
    }

    // Copy Prompt Button
    const copyPromptBtn = document.getElementById('copy-prompt-btn');
    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', handleCopyPrompt);
    }
}



/**
 * Get form data helper
 */
function getFormData() {
    const formData = new FormData(form);

    // Symptoms
    const symptoms = Array.from(formData.getAll('symptoms'));
    const otherSymptom = formData.get('other_symptom');
    if (otherSymptom && otherSymptom.trim() !== '') {
        symptoms.push(otherSymptom.trim());
    }

    const ingredients = Array.from(formData.getAll('ingredient')).filter(i => i.trim() !== '');
    const excludedIngredients = Array.from(formData.getAll('excluded_ingredient')).filter(i => i.trim() !== '');
    const cuisine = formData.get('cuisine');
    const time = formData.get('time');

    return { symptoms, ingredients, excludedIngredients, cuisine, time };
}

/**
 * Handle Copy Prompt
 */
async function handleCopyPrompt() {
    const data = getFormData();

    const symptomText = data.symptoms.length > 0 ? data.symptoms.join("、") : "特になし";
    const ingredientText = data.ingredients.length > 0 ? data.ingredients.join("、") : "おまかせ";
    const excludedText = data.excludedIngredients.length > 0 ? data.excludedIngredients.join("、") : "なし";

    const prompt = `あなたは管理栄養士かつ一流のシェフです。
ユーザーの体調や症状、手持ちの食材、希望する料理ジャンル、調理時間に合わせて、最適なレシピを3つ提案してください。

# ユーザー情報
【体調・気になること】${symptomText}
【使いたい食材】${ingredientText}
【除外したい食材】${excludedText}
【ジャンル】${data.cuisine}
【希望調理時間】${data.time}

# 制約事項
- 治療や治癒などの医学的表現は避け、健康をサポートするという表現にとどめてください。
- 具体的な材料と分量、手順を提示してください。
- 糖質、脂質、タンパク質、塩分（概算値）も併記してください。
- 明るく励ますようなトーンで回答してください。`;

    try {
        await navigator.clipboard.writeText(prompt);

        // Show success feedback
        const btn = document.getElementById('copy-prompt-btn');
        const originalHTML = btn.innerHTML;

        // Change button style temporarily
        btn.innerHTML = '<i class="fas fa-check"></i> コピーしました！';
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
        btn.classList.add('bg-green-50', 'text-green-700', 'border-green-200');

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
            btn.classList.remove('bg-green-50', 'text-green-700', 'border-green-200');
        }, 3000);

    } catch (err) {
        console.error('Failed to copy keys: ', err);
        alert('クリップボードへのコピーに失敗しました。');
    }
}
// ... (HandleFormSubmit and others remain same, focusing on Init)

// Start with DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    // Reset UI
    resultSection.classList.remove('hidden');
    recipeCardsDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');

    // Scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth' });

    // Gather API Key
    const formData = new FormData(form);
    const apiOption = formData.get('api_option');
    let userKey = null;

    if (apiOption === 'openai' || apiOption === 'gemini') {
        userKey = apiKeyInput.value.trim();
    }

    // Validation
    if ((apiOption === 'openai' || apiOption === 'gemini') && !userKey) {
        renderError('APIキーが入力されていません。設定を確認するか、「おまかせ」を選択してください。');
        loadingDiv.classList.add('hidden');
        return;
    }

    // Get Data from helper
    const { symptoms, ingredients, excludedIngredients, cuisine, time } = getFormData();

    const requestData = {
        symptoms,
        ingredients,
        excludedIngredients,
        cuisine,
        time,
        provider: apiOption === 'openai' ? 'openai' : 'gemini'
    };

    try {
        const data = await fetchRecipes(requestData, userKey);
        renderRecipes(data);
    } catch (error) {
        console.error('Error:', error);
        renderError(error.message, error.status); // Pass status if available
    } finally {
        loadingDiv.classList.add('hidden');
    }
}



/**
 * Load saved settings from localStorage
 */
function loadSavedSettings() {
    const savedKey = localStorage.getItem('recipe_app_user_key');
    const savedProvider = localStorage.getItem('recipe_app_provider');

    // Restore Provider
    if (savedProvider) {
        const radio = document.querySelector(`input[name="api_option"][value="${savedProvider}"]`);
        if (radio) {
            radio.checked = true;
            // Trigger UI update manually since setting checked doesn't fire change event
            if (savedProvider !== 'system') {
                apiKeyInputContainer.classList.remove('hidden');
            }
        }
    }

    // Restore Key
    if (savedKey) {
        apiKeyInput.value = savedKey;
        if (saveApiKeyCheckbox) {
            saveApiKeyCheckbox.checked = true;
            saveKeyWarning.classList.remove('hidden');
        }
    }
}

/**
 * Fetch recipes from Backend (Worker)
 */
async function fetchRecipes(requestData, userKey) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (userKey) {
        headers['X-User-Key'] = userKey;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData)
        });

        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch (e) {
            // If response is not JSON (e.g. 500 error text), throw that as error
            throw new Error(text || `Server Error: ${response.status}`);
        }

        if (!response.ok) {
            // Check for specific limitation errors
            const errorMessage = data.error || `Server Error: ${response.status}`;
            const error = new Error(errorMessage);
            error.status = response.status; // Attach status code
            throw error;
        }

        return data;

    } catch (e) {
        // Network errors or JSON parse errors
        throw e;
    }
}

/**
 * Render recipes to DOM
 */
/**
 * Render recipes to DOM
 */
function renderRecipes(data) {
    if (!data.recipes || data.recipes.length === 0) {
        recipeCardsDiv.innerHTML = '<p class="text-center text-gray-500">レシピが見つかりませんでした。</p>';
        return;
    }

    // Escape HTML Helper
    const escapeHtml = (unsafe) => {
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Message
    if (data.message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'col-span-1 md:col-span-2 lg:col-span-3 bg-orange-50 p-4 rounded-xl border border-orange-200 text-orange-800 mb-4 fade-in';
        messageDiv.innerHTML = `<i class="fas fa-comment-medical mr-2"></i><strong>AIからのアドバイス:</strong> ${escapeHtml(data.message)}`;
        recipeCardsDiv.appendChild(messageDiv);
    }

    // Recipes
    data.recipes.forEach((recipe, index) => {
        const div = document.createElement('div');
        div.className = 'recipe-card fade-in-up w-full';
        div.style.animationDelay = `${index * 0.2}s`;

        div.innerHTML = `
            <details class="group">
                <summary class="bg-orange-100 p-4 border-b border-orange-200 flex justify-between items-center cursor-pointer list-none hover:bg-orange-200 transition-colors">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl group-open:rotate-90 transition-transform duration-200">🥘</span>
                            <h3 class="text-xl font-bold text-gray-800">${escapeHtml(recipe.name)}</h3>
                        </div>
                        <div class="flex flex-wrap gap-2 mt-2 text-sm text-gray-600 pl-8">
                            <span class="bg-white px-2 py-1 rounded-md shadow-sm"><i class="fas fa-clock text-orange-400 mr-1"></i>${escapeHtml(recipe.time)}</span>
                            <span class="bg-white px-2 py-1 rounded-md shadow-sm"><i class="fas fa-fire text-red-500 mr-1"></i>${escapeHtml(recipe.calories)}</span>
                        </div>
                        <div class="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 pl-8">
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">糖質:${escapeHtml(recipe.carbs)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">脂質:${escapeHtml(recipe.fat)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">タンパク:${escapeHtml(recipe.protein)}</span>
                            <span class="bg-gray-50 px-2 py-1 rounded border border-gray-200">塩分:${escapeHtml(recipe.salt)}</span>
                        </div>
                        <div class="mt-2 pl-8 text-sm text-green-700 bg-green-50 p-2 rounded-lg border border-green-200">
                             <i class="fas fa-heart text-green-500 mr-1"></i>${escapeHtml(recipe.health_point)}
                        </div>
                    </div>
                    <div class="text-orange-500">
                        <i class="fas fa-chevron-down group-open:rotate-180 transition-transform duration-200"></i>
                    </div>
                </summary>
                
                <div class="p-5 bg-white">
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-700 mb-2 border-l-4 border-orange-500 pl-2">材料</h4>
                        <ul class="list-disc list-inside text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                            ${recipe.ingredients.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
                        </ul>
                    </div>

                    <div>
                        <h4 class="font-bold text-gray-700 mb-2 border-l-4 border-blue-500 pl-2">作り方</h4>
                        <ol class="list-decimal list-inside text-sm text-gray-600 space-y-1">
                            ${recipe.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                        </ol>
                    </div>
                    
                    <div class="mt-4 text-center">
                         <button type="button" class="text-sm text-orange-500 hover:text-orange-700 underline" onclick="this.closest('details').removeAttribute('open')">閉じる</button>
                    </div>
                </div>
            </details>
        `;
        recipeCardsDiv.appendChild(div);
    });
}

/**
 * Render Error
 */
function renderError(message, status) {
    let title = "エラーが発生しました";
    let helpText = "時間をおいて再度お試しいただくか、APIキーの設定を確認してください。";

    // Detect Rate Limit (429) or Service Unavailable (503) or generic "Too Many Requests"
    // Gemini often returns 429 for rate limits.
    if (status === 429 || message.includes('429') || message.includes('Quota exceeded') || message.includes('Too Many Requests') || message.includes('Resource has been exhausted')) {
        title = "本日の利用上限に達しました";
        message = "システム無料枠（おまかせモデル）は、1日の利用回数に制限があります。";
        helpText = `
            <div class="mt-4 bg-orange-100 p-4 rounded-lg text-left">
                <p class="font-bold text-orange-800 mb-2">解決策:</p>
                <ul class="list-disc list-inside text-orange-700 text-sm space-y-1">
                    <li>ご自身のGemini APIキーまたはOpenAI APIキーをお持ちの場合は、詳細設定から入力してご利用ください。</li>
                    <li>または、明日以降に再度お試しください。</li>
                </ul>
            </div>
        `;
    }

    recipeCardsDiv.innerHTML = `
        <div class="col-span-1 md:col-span-3 bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center fade-in">
            <i class="fas fa-exclamation-circle text-4xl mb-3 text-red-400"></i>
            <h3 class="font-bold text-xl mb-2">${title}</h3>
            <p class="text-lg mb-2">${message}</p>
            <div class="text-sm mt-2">${helpText}</div>
        </div>
    `;
}

// Start
// init() is called via DOMContentLoaded event listener added at the top.
