// アラート音（ピンポーン）を生成
// 440Hz（ラ）と880Hz（高いラ）の2音を順番に鳴らす
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playPingPong() {
    const now = audioContext.currentTime;

    // 1音目: 880Hz (高いラ)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);

    osc1.frequency.value = 880;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc1.start(now);
    osc1.stop(now + 0.2);

    // 2音目: 660Hz (ミ) - 少し低い音で「ポーン」
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);

    osc2.frequency.value = 660;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0, now + 0.15);
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);
}

// 使用例:
// playPingPong();
