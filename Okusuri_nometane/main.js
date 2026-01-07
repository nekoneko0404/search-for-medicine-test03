const APP_KEY = 'medicine_reward_app_v2';

const state = {
    currentTab: 0,
    tabs: [
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } },
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } },
        { config: null, progress: { stamps: 0, timestamps: [], lastStampTime: null } }
    ]
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
    statusMessage: document.getElementById('status-message'),
    tabBtns: document.querySelectorAll('.tab-btn'),


};

// Initialization
async function init() {

    loadState();
    setupTabs();

    render();
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


    }
}

function showView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

// Medicine Search Logic


// Hide suggestions when clicking outside






// Settings Logic
forms.settings.addEventListener('submit', (e) => {
    e.preventDefault();
    const doses = parseInt(elements.dosesInput.value);
    const days = parseInt(elements.durationInput.value);
    const testMode = elements.testModeInput.checked;

    const currentTabState = getCurrentTabState();

    currentTabState.config = {
        dosesPerDay: doses,
        durationDays: days,
        totalSlots: doses * days,
        testMode: testMode,
        startOffset: 0
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
    const timestamps = currentTabState.progress.timestamps || [];
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
                    // Check status based on timestamps array
                    if (effectiveIndex < timestamps.length) {
                        const status = timestamps[effectiveIndex];
                        if (status === 'SKIPPED') {
                            slot.classList.add('skipped');
                            slot.textContent = 'Skip';
                        } else {
                            slot.classList.add('stamped');
                            const mark = document.createElement('div');
                            mark.className = 'stamp-mark';
                            slot.appendChild(mark);
                        }
                    } else {
                        // Not yet stamped
                        // Check if it's the next expected slot
                        if (effectiveIndex === timestamps.length) {
                            slot.classList.add('next-slot');
                        }
                        // Allow clicking future slots too (for skip)
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

    if (clickedIndex < expectedIndex) {
        // Already stamped/skipped
        return;
    }

    if (clickedIndex > expectedIndex) {
        // Skipping intermediate slots
        const skippedCount = clickedIndex - expectedIndex;
        if (confirm(`間の ${skippedCount} 回分をスキップして、ここを記録しますか？`)) {
            // Mark intermediate as SKIPPED
            for (let i = 0; i < skippedCount; i++) {
                currentTabState.progress.stamps++;
                currentTabState.progress.timestamps.push('SKIPPED');
            }
            // Proceed to stamp the clicked one
            handleStamp();
        }
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
    flashScreen,
    showBigStamp,
    showBigStamp // Increase probability
];

// Praise Messages (Parental Nudges)
const praiseMessages = [
    "ハイタッチして『ゴックン、かっこよかったよ！』",
    "ぎゅーっと抱きしめて『最後までがんばったね！』",
    "目をしっかり見て『お口を大きく開けられたね！』",
    "頭をなでながら『苦いのに挑戦してえらかったね』",
    "一緒に万歳して『お薬パワー、注入完了だね！』",
    "笑顔で『自分から準備してくれて、パパ/ママ助かっちゃった』",
    "鼻をちょんと触って『勇気の音が聞こえたよ！』",
    "肩をトントンして『座って飲めて、お兄さん/お姉さんみたい』",
    "『すごい！』と驚いた顔をして、お子様と目を合わせる",
    "手を握って『一緒にがんばれて嬉しいな』",
    "『バイバイキン！』と言いながら、空に向かって手を振る",
    "お子様のほっぺに優しく触れて『ピカピカのお口だね』",
    "親指を立てて（Good!）『今の飲み方、100点満点！』",
    "『お薬さんとお友達になれたね』と優しくささやく",
    "カレンダーを一緒に指さして『また一歩、元気に近づいたね』",
    "『お薬パワーで体が喜んでるよ』とお腹を優しくさする",
    "『魔法のゴックンだね！』と拍手する",
    "お子様の目線に合わせてしゃがみ『勇気を見せてくれてありがとう』",
    "『バイキンマンが逃げていったよ！』と窓の外を指さす",
    "『お薬のチャンピオンだ！』と王冠を乗せるジェスチャーをする",
    "『喉を通る音が聞こえたよ、上手！』と喉を優しく指さす",
    "『パパ/ママも元気が出てきた！』とお子様に抱きつく",
    "『お薬の時間を覚えててくれて、びっくりしたよ』と褒める",
    "『お水も上手に使えたね』とコップを持つ手を褒める",
    "『お薬の妖精さんが拍手してるよ』と耳をすます真似をする",
    "『今のゴックン、もう一回見たいくらい上手だった！』",
    "『お顔がキラキラしてきたね』と鏡を一緒に見る",
    "『強い心が見えたよ』と胸に手を当てる",
    "『お薬の階段、また一つ登ったね』と指で階段を作る",
    "『明日は何して遊ぼうか？』と未来の楽しい話を添える",
    "『お薬を飲む姿、動画に撮っておきたいくらいだよ』",
    "『お口の準備が早くて助かるな』と準備の早さを褒める",
    "『苦いのも、勇気でペロリだったね』",
    "『お薬のスペシャリストだね！』と敬礼する",
    "『体がどんどん強くなってるよ』と力こぶのポーズをする",
    "『お薬の冒険、今日の分はクリアだね！』",
    "『ニコニコで飲んでくれて、ママ/パパもニコニコになっちゃう』",
    "『お薬の神様が、がんばりカードを見てるよ』",
    "『自分でお薬を持てたね、すごい！』と手の動きを褒める",
    "『お薬の匂いも平気なんだね、かっこいい！』",
    "『お薬の魔法使いみたいだね』とステッキを振る真似をする",
    "『がんばった証のスタンプ、自分で押してみる？』",
    "『お薬の味がしても、最後まで飲めたね』と粘り強さを褒める",
    "『お口の中が綺麗になったね』とライトで照らす真似をして遊ぶ",
    "『お薬の達人だ！』と大げさに驚いて見せる",
    "『お薬の山、ひょいっと越えちゃったね』",
    "『勇気のしずく、全部届いたよ』",
    "『お薬のゴールまであと少し、一緒に走ろう！』",
    "『世界一のがんばり屋さんだね』とほっぺにチューする",
    "『お薬飲めたね！』と全力で喜びを表現する"
];

function triggerSurprise() {
    playHappySound();

    // Always show the nurse rabbit first
    elements.characterArea.innerHTML = '<img src="images/nurse_rabbit.png" class="character-img" />';

    // Pick a random praise message
    const praise = praiseMessages[Math.floor(Math.random() * praiseMessages.length)];
    showPraiseMessage(praise);

    // Rare Effect Check (10% chance)
    if (Math.random() < 0.1) {
        showRareEffect();
    } else {
        // Normal random effect
        const effect = surprises[Math.floor(Math.random() * surprises.length)];
        effect();
    }
}

function showPraiseMessage(message) {
    const overlay = elements.surpriseOverlay;
    const content = elements.surpriseElement;

    // Clear previous content but keep structure if needed
    // We want to show the message in a nice way, maybe overlaying the screen briefly
    // or using the existing overlay system but customized.

    // Let's use a toast-like notification or the overlay itself if it's not intrusive.
    // Since the overlay was used for "Medicine Details" and "Completion", let's use a separate container or reuse it.
    // For the "Surprise" context, usually it's visual effects on the main screen.
    // Let's add a "Praise Bubble" to the character area or floating.

    const bubble = document.createElement('div');
    bubble.className = 'praise-bubble';
    bubble.textContent = message;

    // Position near character or center
    document.body.appendChild(bubble);

    // Animate in
    requestAnimationFrame(() => {
        bubble.classList.add('show');
    });

    // Remove after a few seconds
    setTimeout(() => {
        bubble.classList.remove('show');
        setTimeout(() => bubble.remove(), 500);
    }, 6000);
}

function showRareEffect() {
    // Golden Stamp Shower
    const stampText = '👑';
    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'rare-stamp-effect';
        el.textContent = stampText;
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = -50 + 'px';
        el.style.animationDuration = (2 + Math.random() * 2) + 's';
        el.style.animationDelay = Math.random() + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    // Play special sound
    playRareSound();
}

function showBigStamp() {
    const stamps = ['💮', '💯', '👍', '👑', '🌈', '💊', '✨', '🐰', '🐻'];
    const stampText = stamps[Math.floor(Math.random() * stamps.length)];

    const stamp = document.createElement('div');
    stamp.textContent = stampText;
    stamp.className = 'big-stamp-effect';
    document.body.appendChild(stamp);
    setTimeout(() => stamp.remove(), 1500);
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

function playRareSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Arpeggio
    [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'triangle';

        const start = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
    });
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
    const icons = ['💊', '💖', '⭐', '🔷', '🌸', '✨', '🍬', '🎈', '🧸', '💊'];
    const shapes = ['■', '▲', '●', '★', '♦', '❤'];
    const colors = ['#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#FFD700', '#FF69B4'];

    const container = document.body;

    for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        const isIcon = Math.random() > 0.6; // 40% chance of icon, 60% shape

        if (isIcon) {
            el.className = 'confetti confetti-icon';
            el.textContent = icons[Math.floor(Math.random() * icons.length)];
            el.style.fontSize = (1.5 + Math.random()) + 'rem';
        } else {
            el.className = 'confetti confetti-shape';
            el.textContent = shapes[Math.floor(Math.random() * shapes.length)];
            el.style.color = colors[Math.floor(Math.random() * colors.length)];
            el.style.fontSize = (0.8 + Math.random() * 0.8) + 'rem';
        }

        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = -50 + 'px';

        // Random fall duration between 3s and 6s
        el.style.animationDuration = (3 + Math.random() * 3) + 's';
        // Random sway delay
        el.style.animationDelay = Math.random() + 's';

        container.appendChild(el);
        setTimeout(() => el.remove(), 6000);
    }
}

function showFloatingEmojis() {
    const emojis = ['🧸', '💊', '✨', '👍', '🐻', '🐰', '💖', '🎉'];
    const container = document.getElementById('app') || document.body;

    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'floating-emoji';
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];

        // Random position
        el.style.left = (10 + Math.random() * 80) + '%';
        el.style.top = (50 + Math.random() * 30) + '%';

        // Random speed (duration) between 2s and 3s (Slower)
        const duration = 2 + Math.random() * 1;
        el.style.animationDuration = `${duration}s`;

        // Random delay
        el.style.animationDelay = Math.random() * 0.5 + 's';

        container.appendChild(el);
        setTimeout(() => el.remove(), duration * 1000 + 500);
    }
}

function flashScreen() {
    const app = document.getElementById('app') || document.body;
    app.classList.add('gradient-flash-effect');
    setTimeout(() => app.classList.remove('gradient-flash-effect'), 3000);
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

    // Get today's date for the certificate
    const today = new Date();
    const dateStr = `${today.getFullYear()}年 ${today.getMonth() + 1}月 ${today.getDate()}日`;

    content.innerHTML = `
        <div class="completion-modal certificate-modal">
            <div class="certificate-border">
                <div class="certificate-header">
                    <span class="certificate-icon">🏆</span>
                    <h2>がんばったで賞</h2>
                    <span class="certificate-icon">🏆</span>
                </div>
                
                <div class="certificate-body">
                    <p class="certificate-text">あなたは、お薬を最後までしっかり飲んで<br>病気と戦いました。</p>
                    <p class="certificate-text">その勇気とがんばりを称えます。</p>
                    
                    <div class="certificate-name-area">
                        <label>お名前:</label>
                        <input type="text" class="certificate-name-input" placeholder="ここになまえをかいてね" />
                    </div>
                    
                    <div class="certificate-date">
                        ${dateStr}
                    </div>
                    
                    <div class="certificate-signature">
                        <div>くま先生 🐻</div>
                        <div>うさぎ看護師 🐰</div>
                    </div>
                </div>

                <div class="no-print">
                    <button onclick="window.print()" class="btn-secondary" style="margin-right: 10px;">🖨️ 賞状を印刷する</button>
                    <button onclick="resetCurrentTabApp()" class="btn-primary">もういっかい！</button>
                </div>
            </div>
        </div>
    `;

    overlay.classList.remove('hidden');
    overlay.classList.add('active');

    // Trigger effects
    flashScreen();
    showFloatingEmojis();

    for (let i = 0; i < 8; i++) {
        setTimeout(spawnConfetti, i * 300);
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
