const APP_KEY = 'medicine_reward_app_v2';

const state = {
    currentTab: 0,
    tabs: [
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } },
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } },
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } }
    ]
};

let medsMaster = [];

// DOM Elements
const views = {
    settings: document.getElementById('settings-view'),
    main: document.getElementById('main-view')
};

const forms = {
    settings: document.getElementById('settings-form')
};

const elements = {
    dosesInput: document.getElementById('doses-per-day'),
    durationInput: document.getElementById('duration-days'),
    testModeInput: document.getElementById('test-mode'),
    grid: document.getElementById('stamp-grid'),
    remainingCount: document.getElementById('remaining-count'),
    resetBtn: document.getElementById('reset-btn'),
    surpriseOverlay: document.getElementById('surprise-overlay'),
    surpriseElement: document.getElementById('surprise-element'),
    characterArea: document.getElementById('character-area'),
    statusMessage: document.getElementById('status-message'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    medicineInputs: document.querySelectorAll('.medicine-name-input'), // NodeList of 6 inputs
    medicineInfoPreview: document.getElementById('medicine-info-preview'),
    currentMedicineDisplay: document.getElementById('current-medicine-display')
};

// Initialization
async function init() {
    await loadMedsData();
    loadState();
    setupTabs();
    setupMedicineSearch();
    setupMedicineDisplayClick();
    render();
}

async function loadMedsData() {
    try {
        const response = await fetch('data/meds_master.json');
        medsMaster = await response.json();
    } catch (e) {
        console.error('Failed to load medicine data', e);
    }
}

function loadState() {
    const saved = localStorage.getItem(APP_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        // Migration check: if old format (no tabs array), migrate to tab 0
        if (!parsed.tabs) {
            state.tabs[0].config = parsed.config;
            state.tabs[0].progress = parsed.progress;
        } else {
            state.currentTab = parsed.currentTab || 0;
            state.tabs = parsed.tabs;
        }
    }
}

function saveState() {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
}

function getCurrentTabState() {
    return state.tabs[state.currentTab];
}

function setupTabs() {
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabIndex = parseInt(btn.dataset.tab);
            switchTab(tabIndex);
        });
    });
}

function switchTab(index) {
    state.currentTab = index;
    currentWeekIndex = 0; // Reset view for the new tab
    saveState();
    render();
}

function render() {
    // Update Tab UI
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.tab) === state.currentTab);
    });

    const currentTabState = getCurrentTabState();

    // Switch View
    if (!currentTabState.config) {
        showView('settings');
        // Reset inputs
        elements.dosesInput.value = 3;
        elements.durationInput.value = 7;
        elements.testModeInput.checked = false;
        elements.medicineInputs.forEach(input => input.value = '');
        elements.medicineInfoPreview.classList.add('hidden');
        selectedMedicinesBuffer = [null, null, null, null, null, null];
    } else {
        showView('main');
        renderGrid();
        updateProgressInfo();
        updateCharacter();
        checkTimeLimit();

        // Display Medicine Names
        if (currentTabState.config.medicines && currentTabState.config.medicines.length > 0) {
            const names = currentTabState.config.medicines.map(m => m.brand_name).join('、');
            elements.currentMedicineDisplay.textContent = names;
        } else if (currentTabState.config.medicineInfo) {
            // Legacy support
            elements.currentMedicineDisplay.textContent = currentTabState.config.medicineInfo.brand_name;
        } else {
            elements.currentMedicineDisplay.textContent = `病院 ${state.currentTab + 1} (お薬情報なし)`;
        }
    }
}

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

// Medicine Search Logic
let selectedMedicinesBuffer = [null, null, null, null, null, null];

function hiraganaToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, function (match) {
        var chr = match.charCodeAt(0) + 0x60;
        return String.fromCharCode(chr);
    });
}

function setupMedicineSearch() {
    elements.medicineInputs.forEach((input, index) => {
        const list = document.getElementById(`suggestions-${index}`);

        const getMatches = (query) => {
            const queryKata = hiraganaToKatakana(query);
            return medsMaster.filter(m =>
                m.brand_name.includes(query) ||
                m.brand_name.includes(queryKata) ||
                (m.yj_code && m.yj_code.includes(query))
            );
        };

        input.addEventListener('input', () => {
            const query = input.value.trim();
            if (query.length < 2) {
                list.classList.add('hidden');
                return;
            }

            const matches = getMatches(query).slice(0, 10);

            if (matches.length > 0) {
                list.innerHTML = '';
                matches.forEach(m => {
                    const item = document.createElement('div');
                    item.className = 'suggestion-item';
                    item.textContent = m.brand_name;
                    item.addEventListener('click', () => selectMedicine(index, m));
                    list.appendChild(item);
                });
                list.classList.remove('hidden');
            } else {
                list.classList.add('hidden');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = input.value.trim();
                if (query.length < 2) return;

                const matches = getMatches(query);
                if (matches.length === 1) {
                    selectMedicine(index, matches[0]);
                }
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.add('hidden');
            }
        });
    });
}

function selectMedicine(index, medicine) {
    const input = elements.medicineInputs[index];
    const list = document.getElementById(`suggestions-${index}`);

    input.value = medicine.brand_name;
    list.classList.add('hidden');
    selectedMedicinesBuffer[index] = medicine;

    renderMedicineInfoPreview();

    // Move focus to next input if available
    if (index < elements.medicineInputs.length - 1) {
        elements.medicineInputs[index + 1].focus();
    }
}

function renderMedicineInfoPreview() {
    const infoDiv = elements.medicineInfoPreview;
    infoDiv.innerHTML = '';

    const activeMedicines = selectedMedicinesBuffer.filter(m => m !== null);

    if (activeMedicines.length === 0) {
        infoDiv.classList.add('hidden');
        return;
    }

    activeMedicines.forEach(medicine => {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';
        container.style.borderBottom = '1px solid #eee';
        container.style.paddingBottom = '10px';

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.textContent = `【${medicine.brand_name}】`;
        container.appendChild(title);

        if (medicine.good_compatibility && medicine.good_compatibility.length > 0) {
            const good = document.createElement('div');
            good.className = 'compatibility-good';
            good.textContent = '⭕ 飲み合わせが良い: ' + medicine.good_compatibility.join('、');
            container.appendChild(good);
        }

        if (medicine.bad_compatibility && medicine.bad_compatibility.length > 0) {
            const bad = document.createElement('div');
            bad.className = 'compatibility-bad';
            bad.textContent = '❌ 飲み合わせが悪い: ' + medicine.bad_compatibility.join('、');
            container.appendChild(bad);
        }

        if (medicine.taste_smell) {
            const taste = document.createElement('div');
            taste.style.marginTop = '5px';
            taste.textContent = '👅 味・におい: ' + medicine.taste_smell;
            container.appendChild(taste);
        }

        infoDiv.appendChild(container);
    });

    infoDiv.classList.remove('hidden');
}

// Settings Logic
forms.settings.addEventListener('submit', (e) => {
    e.preventDefault();
    const doses = parseInt(elements.dosesInput.value);
    const days = parseInt(elements.durationInput.value);
    const testMode = elements.testModeInput.checked;

    const currentTabState = getCurrentTabState();

    // Filter out nulls from buffer
    const medicines = selectedMedicinesBuffer.filter(m => m !== null);

    currentTabState.config = {
        dosesPerDay: doses,
        durationDays: days,
        totalSlots: doses * days,
        testMode: testMode,
        startOffset: 0,
        medicines: medicines // Store array of medicines
    };

    // Reset progress on new config
    currentTabState.progress = {
        stamps: 0,
        timestamps: [],
        lastStampTime: null
    };

    // Reset internal view state
    currentWeekIndex = 0;

    saveState();
    render();
});

// Main View Medicine Click Logic
function setupMedicineDisplayClick() {
    elements.currentMedicineDisplay.addEventListener('click', () => {
        const currentTabState = getCurrentTabState();
        if (!currentTabState.config) return;

        let medicines = [];
        if (currentTabState.config.medicines) {
            medicines = currentTabState.config.medicines;
        } else if (currentTabState.config.medicineInfo) {
            medicines = [currentTabState.config.medicineInfo];
        }

        if (medicines.length === 0) return;

        showMedicineDetailsModal(medicines);
    });
}

function showMedicineDetailsModal(medicines) {
    const overlay = elements.surpriseOverlay;
    const content = elements.surpriseElement;

    let html = '<div class="completion-modal" style="text-align: left; max-height: 80vh; overflow-y: auto;">';
    html += '<h2 style="text-align: center; margin-bottom: 20px;">お薬情報</h2>';

    medicines.forEach(medicine => {
        html += `<div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">`;
        html += `<h3 style="color: var(--primary-color); margin-bottom: 10px;">${medicine.brand_name}</h3>`;

        if (medicine.good_compatibility && medicine.good_compatibility.length > 0) {
            html += `<div class="compatibility-good">⭕ 飲み合わせが良い: ${medicine.good_compatibility.join('、')}</div>`;
        }

        if (medicine.bad_compatibility && medicine.bad_compatibility.length > 0) {
            html += `<div class="compatibility-bad">❌ 飲み合わせが悪い: ${medicine.bad_compatibility.join('、')}</div>`;
        }

        if (medicine.taste_smell) {
            html += `<div style="margin-top: 5px;">👅 味・におい: ${medicine.taste_smell}</div>`;
        }
        html += `</div>`;
    });

    html += '<div style="text-align: center;"><button class="btn-primary" id="close-modal-btn">閉じる</button></div>';
    html += '</div>';

    content.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.classList.add('active');

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        overlay.classList.add('hidden');
        overlay.classList.remove('active');
    });
}

// Logic: Time Intervals
function getMinIntervalHours(doses) {
    if (doses === 1) return 12;
    if (doses === 2) return 6;
    return 4; // 3 or more times
}

function canStamp() {
    const currentTabState = getCurrentTabState();
    if (currentTabState.config.testMode) return true;
    if (!currentTabState.progress.lastStampTime) return true;

    const last = new Date(currentTabState.progress.lastStampTime).getTime();
    const now = new Date().getTime();
    const minHours = getMinIntervalHours(currentTabState.config.dosesPerDay);

    return (now - last) >= (minHours * 60 * 60 * 1000);
}

function checkTimeLimit() {
    const currentTabState = getCurrentTabState();
    const messageEl = elements.statusMessage;

    if (currentTabState.progress.stamps >= currentTabState.config.totalSlots) {
        messageEl.textContent = "コンプリートおめでとう！";
        messageEl.className = "status-ok";
        return;
    }

    // Always show generic or encouraging message
    messageEl.textContent = "お薬飲めたかな？";
    messageEl.className = "status-ok";
}

// Current Week State (Internal UI state, not persisted)
let currentWeekIndex = 0;

function calculateCurrentWeek() {
    const currentTabState = getCurrentTabState();
    const totalDays = currentTabState.config.durationDays;
    const dosesPerDay = currentTabState.config.dosesPerDay;
    const currentStamps = currentTabState.progress.stamps;

    // Day index (0-based) of the next stamp
    let currentDayIndex = Math.floor(currentStamps / dosesPerDay);
    if (currentDayIndex >= totalDays) currentDayIndex = totalDays - 1;

    currentWeekIndex = Math.floor(currentDayIndex / 7);
}

// Grid Logic
function renderGrid() {
    // If undefined in this session (e.g. reload), calc it
    if (typeof currentWeekIndex === 'undefined') {
        currentWeekIndex = 0; // Default fallback
    }

    elements.grid.innerHTML = '';

    const currentTabState = getCurrentTabState();
    if (!currentTabState.config) return;

    // Pagination Controls
    const totalDays = currentTabState.config.durationDays;
    const totalWeeks = Math.ceil(totalDays / 7);

    // Simple Navigation above grid
    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-nav';
    prevBtn.textContent = '← 前の週';
    prevBtn.disabled = currentWeekIndex === 0;
    prevBtn.onclick = () => { currentWeekIndex--; renderGrid(); };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-nav';
    nextBtn.textContent = '次の週 →';
    nextBtn.disabled = currentWeekIndex >= totalWeeks - 1;
    nextBtn.onclick = () => { currentWeekIndex++; renderGrid(); };

    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);
    elements.grid.appendChild(controls);

    // Render Days
    const dosesPerDay = currentTabState.config.dosesPerDay;
    const currentStamps = currentTabState.progress.stamps;
    const startOffset = currentTabState.config.startOffset || 0;

    const startDay = currentWeekIndex * 7 + 1; // 1-based day
    const endDay = Math.min(startDay + 6, totalDays);

    let slotCounter = (startDay - 1) * dosesPerDay; // Stamps before this week

    for (let day = startDay; day <= endDay; day++) {
        const dayCard = document.createElement('div');
        dayCard.className = 'day-card';

        const label = document.createElement('div');
        label.className = 'day-label';
        label.textContent = `${day} 日目`;
        dayCard.appendChild(label);

        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'day-slots';

        let hasVisibleSlots = false;

        for (let dose = 0; dose < dosesPerDay; dose++) {
            const slotIndex = slotCounter;

            // Stop rendering if we exceed total slots
            if (slotIndex >= currentTabState.config.totalSlots) {
                break;
            }

            const slot = document.createElement('div');
            slot.className = 'stamp-slot';

            // Check if this slot was skipped due to late start
            if (slotIndex < startOffset) {
                // Hide skipped slots
                slot.style.visibility = 'hidden';
            } else {
                hasVisibleSlots = true;
                const effectiveIndex = slotIndex - startOffset;

                if (effectiveIndex < 0) {
                    slot.style.visibility = 'hidden';
                } else {
                    if (effectiveIndex < currentStamps) {
                        slot.classList.add('stamped');
                        const mark = document.createElement('div');
                        mark.className = 'stamp-mark';
                        slot.appendChild(mark);
                    } else {
                        if (effectiveIndex === currentStamps) {
                            slot.classList.add('next-slot');
                        }
                        slot.addEventListener('click', () => handleSlotClick(slotIndex));
                    }
                }
            }

            slotsContainer.appendChild(slot);
            slotCounter++;
        }

        // Only append day card if it has slots (or if it's a day with hidden skipped slots)
        if (slotsContainer.children.length > 0) {
            dayCard.appendChild(slotsContainer);
            elements.grid.appendChild(dayCard);
        }
    }
}

function updateProgressInfo() {
    const currentTabState = getCurrentTabState();
    if (!currentTabState.config) return;

    const startOffset = currentTabState.config.startOffset || 0;
    const remaining = (currentTabState.config.totalSlots - startOffset) - currentTabState.progress.stamps;
    elements.remainingCount.textContent = remaining;
}

function updateCharacter() {
    const img = document.createElement('img');
    img.src = 'images/doctor_bear.png';
    img.className = 'character-img';
    elements.characterArea.innerHTML = '';
    elements.characterArea.appendChild(img);
}

function handleSlotClick(clickedIndex) {
    const currentTabState = getCurrentTabState();
    const currentStamps = currentTabState.progress.stamps;
    const startOffset = currentTabState.config.startOffset || 0;

    // If this is the VERY FIRST interaction (stamps === 0 and startOffset === 0)
    // We allow clicking ANY slot on Day 1.
    if (currentStamps === 0 && startOffset === 0) {
        const dosesPerDay = currentTabState.config.dosesPerDay;
        // Check if clicked slot is on Day 1
        if (clickedIndex < dosesPerDay) {
            // If clickedIndex > 0, we are skipping.
            if (clickedIndex > 0) {
                if (confirm(`${clickedIndex + 1} 回目からスタートしますか？\n前の${clickedIndex} 回分はスキップされ、期間が延長されます。`)) {
                    // Apply Skip
                    currentTabState.config.startOffset = clickedIndex;
                    currentTabState.config.totalSlots += clickedIndex;

                    // Recalculate duration days if needed (to render enough days)
                    // New total slots / doses per day -> ceil
                    currentTabState.config.durationDays = Math.ceil(currentTabState.config.totalSlots / dosesPerDay);

                    saveState();
                    // Now proceed to stamp this slot (which is now effectively index 0)
                    handleStamp();
                    return;
                } else {
                    return; // Cancelled
                }
            } else {
                // Normal start at 0
                handleStamp();
                return;
            }
        }
    }

    // Normal behavior for subsequent clicks
    // The expected clickedIndex should be (startOffset + currentStamps)
    const expectedIndex = startOffset + currentStamps;

    if (clickedIndex !== expectedIndex) {
        return;
    }

    if (!canStamp()) {
        playErrorSound();
        alert('まだ早いよ！次のお薬の時間まで待ってね。');
        return;
    }

    handleStamp();
}

function handleStamp() {
    const currentTabState = getCurrentTabState();
    currentTabState.progress.stamps++;
    currentTabState.progress.timestamps.push(new Date().toISOString());
    currentTabState.progress.lastStampTime = new Date().toISOString();
    saveState();

    // Trigger Surprise
    triggerSurprise();

    // Recalculate which week to show (if we just finished a week)
    const dosesPerDay = currentTabState.config.dosesPerDay;
    const startOffset = currentTabState.config.startOffset || 0;

    // Current visual slot index is (startOffset + stamps - 1)
    const currentVisualIndex = startOffset + currentTabState.progress.stamps - 1;
    const currentDay0Indexed = Math.floor(currentVisualIndex / dosesPerDay);
    const newWeekIndex = Math.floor(currentDay0Indexed / 7);

    if (newWeekIndex !== currentWeekIndex) {
        // We might want to auto-advance? 
        // Or if we filled the last slot of the current view?
        // Let's check max slot visible
        const currentEndDay0Indexed = (currentWeekIndex * 7) + 6;
        if (currentDay0Indexed > currentEndDay0Indexed) {
            currentWeekIndex++;
        }
    }

    render();

    // Check completion
    if ((currentTabState.progress.stamps + startOffset) >= currentTabState.config.totalSlots) {
        setTimeout(triggerCompletion, 1000);
    }
}

// Reset Logic
elements.resetBtn.addEventListener('click', () => {
    if (confirm('本当にリセットしますか？これまでの記録は消えてしまいます。')) {
        const currentTabState = getCurrentTabState();
        currentTabState.config = null;
        currentTabState.progress = { stamps: 0, timestamps: [], lastStampTime: null };
        currentWeekIndex = 0;
        saveState();
        render();
    }
});

// Surprise System
const surprises = [
    spawnConfetti,
    showFloatingEmojis,
    flashScreen
];

function triggerSurprise() {
    playHappySound();
    elements.characterArea.innerHTML = '<img src="images/nurse_rabbit.png" class="character-img" />';
    const effect = surprises[Math.floor(Math.random() * surprises.length)];
    effect();
}

function playHappySound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = 523.25 + Math.random() * 523.25;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 2, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
}

function playErrorSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
}

function spawnConfetti() {
    const colors = ['#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA'];
    for (let i = 0; i < 50; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = -10 + 'px';
        el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }
}

function showFloatingEmojis() {
    const emojis = ['🌟', '💊', '✨', '👍', '🐻', '🐰', '💖', '🎉'];
    const container = document.getElementById('app');
    for (let i = 0; i < 10; i++) {
        const el = document.createElement('div');
        el.className = 'floating-emoji';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.left = (20 + Math.random() * 60) + '%';
        el.style.top = (50 + Math.random() * 20) + '%';
        el.style.animationDelay = Math.random() * 0.5 + 's';
        container.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }
}

function flashScreen() {
    const app = document.getElementById('app');
    app.classList.add('flash-effect');
    setTimeout(() => app.classList.remove('flash-effect'), 500);
}

function triggerCompletion() {
    playFanfare();

    const overlay = document.getElementById('surprise-overlay');
    const content = document.getElementById('surprise-element');

    // Expose reset function for the modal
    window.resetCurrentTabApp = () => {
        const currentTabState = getCurrentTabState();
        currentTabState.config = null;
        currentTabState.progress = { stamps: 0, timestamps: [], lastStampTime: null };
        currentWeekIndex = 0;
        saveState();
        location.reload();
    };

    content.innerHTML = `
        <div class="completion-modal">
            <img src="images/party_cat.png" style="width: 150px; margin-bottom: 20px;">
            <h1 style="font-size: 3rem; margin-bottom: 10px;">🎉</h1>
            <h2>おめでとう！</h2>
            <p>ぜんぶのスタンプがあつまったよ！</p>
            <p>すごいね！がんばったね！</p>
            <button onclick="resetCurrentTabApp()" class="btn-primary" style="margin-top: 20px;">もういっかい！</button>
        </div>
    `;

    overlay.classList.remove('hidden');
    overlay.classList.add('active');

    for (let i = 0; i < 5; i++) {
        setTimeout(spawnConfetti, i * 500);
    }
}

function playFanfare() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = now + i * 0.1;
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.5);
        osc.start(start);
        osc.stop(start + 0.5);
    });
}

// Ensure correct week on initial load
window.addEventListener('load', () => {
    // If state is loaded, calculate where we are
    const currentTabState = getCurrentTabState();
    if (currentTabState && currentTabState.config && currentTabState.progress.stamps > 0) {
        calculateCurrentWeek();
    }
});

// Start
init();
