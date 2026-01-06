const APP_KEY = 'medicine_reward_app_v2';

const state = {
    config: null, // { dosesPerDay, durationDays, totalSlots, testMode }
    progress: {
        stamps: 0,
        timestamps: [],
        lastStampTime: null
    }
};

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
    statusMessage: document.getElementById('status-message')
};

// Initialization
function init() {
    loadState();
    render();
}

function loadState() {
    const saved = localStorage.getItem(APP_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        state.config = parsed.config;
        state.progress = parsed.progress;
    }
}

function saveState() {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
}

function render() {
    // Switch View
    if (!state.config) {
        showView('settings');
    } else {
        showView('main');
        renderGrid();
        updateProgressInfo();
        updateCharacter();
        checkTimeLimit();
    }
}

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

// Settings Logic
forms.settings.addEventListener('submit', (e) => {
    e.preventDefault();
    const doses = parseInt(elements.dosesInput.value);
    const days = parseInt(elements.durationInput.value);
    const testMode = elements.testModeInput.checked;

    state.config = {
        dosesPerDay: doses,
        durationDays: days,
        totalSlots: doses * days,
        testMode: testMode
    };

    // Reset progress on new config
    state.progress = {
        stamps: 0,
        timestamps: [],
        lastStampTime: null
    };

    // Reset internal view state
    currentWeekIndex = 0;

    saveState();
    render();
});

// Logic: Time Intervals
function getMinIntervalHours(doses) {
    if (doses === 1) return 12;
    if (doses === 2) return 6;
    return 4; // 3 or more times
}

function canStamp() {
    if (state.config.testMode) return true;
    if (!state.progress.lastStampTime) return true;

    const last = new Date(state.progress.lastStampTime).getTime();
    const now = new Date().getTime();
    const minHours = getMinIntervalHours(state.config.dosesPerDay);

    return (now - last) >= (minHours * 60 * 60 * 1000);
}

function checkTimeLimit() {
    const messageEl = elements.statusMessage;

    if (state.progress.stamps >= state.config.totalSlots) {
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
    const totalDays = state.config.durationDays;
    const dosesPerDay = state.config.dosesPerDay;
    const currentStamps = state.progress.stamps;

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

    // Pagination Controls
    const totalDays = state.config.durationDays;
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
    const dosesPerDay = state.config.dosesPerDay;
    const currentStamps = state.progress.stamps;
    const startOffset = state.config.startOffset || 0;

    const startDay = currentWeekIndex * 7 + 1; // 1-based day
    const endDay = Math.min(startDay + 6, totalDays);

    let slotCounter = (startDay - 1) * dosesPerDay; // Stamps before this week

    for (let day = startDay; day <= endDay; day++) {
        const dayCard = document.createElement('div');
        dayCard.className = 'day-card';

        const label = document.createElement('div');
        label.className = 'day-label';
        label.textContent = `${day}日目`;
        dayCard.appendChild(label);

        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'day-slots';

        for (let dose = 0; dose < dosesPerDay; dose++) {
            const slotIndex = slotCounter;
            const slot = document.createElement('div');
            slot.className = 'stamp-slot';

            // Check if this slot was skipped due to late start
            if (slotIndex < startOffset) {
                // Hide skipped slots
                slot.style.visibility = 'hidden';
            } else {
                // Adjust index for display/logic relative to effective stamps
                // But wait, currentStamps counts actual stamps.
                // If we skipped 2, startOffset is 2.
                // The first clickable slot is index 2.
                // If currentStamps is 0 (no actual stamps yet, but we are about to start),
                // we need to handle the click.

                // Actually, if we have skipped slots, we treat them as "done" for the sake of indexing?
                // No, the requirement is "erase" them.
                // And "add to end".
                // So `totalSlots` increased.
                // `currentStamps` tracks how many *actual* stamps we have.
                // But the grid position `slotIndex` is absolute (0 to totalSlots-1).

                // If I start at slot 2 (0-indexed), I want slot 0 and 1 to be hidden.
                // Slot 2 is the first one I stamp.
                // When I stamp slot 2, `stamps` becomes 1? Or do we count the skipped ones?
                // If we count skipped ones as "done", then `stamps` would be 3.
                // But the user said "erase".
                // If I "erase" them, they don't count towards the goal?
                // "1回目、2回目は消して、最後に2枠足してください" -> Erase 1st/2nd, add 2 slots at end.
                // This implies the *total number of stamps to collect* remains the same.
                // So `stamps` should start at 0.
                // And the slot at `startOffset` corresponds to `stamps === 0`.

                // So:
                // Slot Index: 0 (Hidden), 1 (Hidden), 2 (Visible, corresponds to Stamp 0)
                // Slot Index 3 (Visible, corresponds to Stamp 1)
                // ...

                // Logic:
                // Effective Slot Index = slotIndex - startOffset

                const effectiveIndex = slotIndex - startOffset;

                if (effectiveIndex < 0) {
                    // Should be covered by `slotIndex < startOffset` check above, 
                    // but just in case logic drifts.
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
                        // We pass the absolute slotIndex to handleSlotClick
                        // But handleSlotClick needs to know it's a valid click.
                        slot.addEventListener('click', () => handleSlotClick(slotIndex));
                    }
                }
            }

            slotsContainer.appendChild(slot);
            slotCounter++;
        }

        dayCard.appendChild(slotsContainer);
        elements.grid.appendChild(dayCard);
    }
}

function updateProgressInfo() {
    // Total slots is adjusted total. Stamps is actual stamps.
    // Remaining = Total (adjusted) - Stamps - StartOffset?
    // No, if I skipped 2, Total increased by 2.
    // Say original 21. Skip 2. New Total 23.
    // I need to stamp 21 times.
    // Stamps starts at 0.
    // Remaining = 21.
    // Formula: Remaining = (TotalSlots - StartOffset) - Stamps

    const startOffset = state.config.startOffset || 0;
    const remaining = (state.config.totalSlots - startOffset) - state.progress.stamps;
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
    const currentStamps = state.progress.stamps;
    const startOffset = state.config.startOffset || 0;

    // If this is the VERY FIRST interaction (stamps === 0 and startOffset === 0)
    // We allow clicking ANY slot on Day 1.
    if (currentStamps === 0 && startOffset === 0) {
        const dosesPerDay = state.config.dosesPerDay;
        // Check if clicked slot is on Day 1
        if (clickedIndex < dosesPerDay) {
            // If clickedIndex > 0, we are skipping.
            if (clickedIndex > 0) {
                if (confirm(`${clickedIndex + 1}回目からスタートしますか？\n前の${clickedIndex}回分はスキップされ、期間が延長されます。`)) {
                    // Apply Skip
                    state.config.startOffset = clickedIndex;
                    state.config.totalSlots += clickedIndex;

                    // Recalculate duration days if needed (to render enough days)
                    // New total slots / doses per day -> ceil
                    state.config.durationDays = Math.ceil(state.config.totalSlots / dosesPerDay);

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
    state.progress.stamps++;
    state.progress.timestamps.push(new Date().toISOString());
    state.progress.lastStampTime = new Date().toISOString();
    saveState();

    // Trigger Surprise
    triggerSurprise();

    // Recalculate which week to show (if we just finished a week)
    const dosesPerDay = state.config.dosesPerDay;
    const startOffset = state.config.startOffset || 0;

    // Current visual slot index is (startOffset + stamps - 1)
    const currentVisualIndex = startOffset + state.progress.stamps - 1;
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
    // We need to collect (Total - Offset) stamps?
    // Or just check if we reached the last slot?
    // The last slot index is TotalSlots - 1.
    // We just stamped. `stamps` incremented.
    // If (stamps + startOffset) >= TotalSlots
    if ((state.progress.stamps + startOffset) >= state.config.totalSlots) {
        setTimeout(triggerCompletion, 1000);
    }
}

// Reset Logic
elements.resetBtn.addEventListener('click', () => {
    if (confirm('本当にリセットしますか？これまでの記録は消えてしまいます。')) {
        state.config = null;
        state.progress = { stamps: 0, timestamps: [], lastStampTime: null };
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

    content.innerHTML = `
        <div class="completion-modal">
            <img src="images/party_cat.png" style="width: 150px; margin-bottom: 20px;">
            <h1 style="font-size: 3rem; margin-bottom: 10px;">🎉</h1>
            <h2>おめでとう！</h2>
            <p>ぜんぶのスタンプがあつまったよ！</p>
            <p>すごいね！がんばったね！</p>
            <button onclick="localStorage.removeItem(APP_KEY); location.reload()" class="btn-primary" style="margin-top: 20px;">もういっかい！</button>
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
    if (state.config && state.progress.stamps > 0) {
        calculateCurrentWeek();
    }
});

// Start
init();
