import { describe, it, expect } from 'vitest';
import { normalizeString, extractSearchTerm, formatDate } from './utils.js';

describe('normalizeString', () => {
    it('ひらがなをカタカナに変換すること', () => {
        expect(normalizeString('あいうえお')).toBe('アイウエオ');
        expect(normalizeString('ぱぴぷぺぽ')).toBe('パピプペポ');
    });

    it('全角英数字を半角に変換し、小文字にすること', () => {
        expect(normalizeString('ＡＢＣ１２３')).toBe('abc123');
    });

    it('混合文字列を正しく正規化すること', () => {
        expect(normalizeString('あいう ＡＢＣ')).toBe('アイウ abc');
    });

    it('空文字列やnullの場合に空文字列を返すこと', () => {
        expect(normalizeString('')).toBe('');
        expect(normalizeString(null)).toBe('');
    });
});

describe('extractSearchTerm', () => {
    it('品名から主要な単語を抽出すること', () => {
        expect(extractSearchTerm('アセトアミノフェン錠200mg「タケダ」')).toBe('アセトアミノフェン錠');
    });

    it('漢字を含む名称を正しく抽出すること', () => {
        expect(extractSearchTerm('葛根湯エキス顆粒')).toBe('葛根湯エキス顆粒');
    });

    it('不要な記号を除去すること', () => {
        // 現在の正規表現の仕様に基づくテスト
        expect(extractSearchTerm('【限定】アセトアミノフェン')).toBe('アセトアミノフェン');
    });
});

describe('formatDate', () => {
    it('DateオブジェクトをYYYYMMDD形式に変換すること', () => {
        const date = new Date(2026, 1, 6); // 2026-02-06
        expect(formatDate(date)).toBe('20260206');
    });
});
