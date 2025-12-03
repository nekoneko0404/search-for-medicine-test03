# 改修計画書 (Test03 Renewal Plan)

## 1. 目的
Test03のトップページをメニュー画面に置き換え、各機能への導線を整理する。また、全ページにGoogleアナリティクスを導入し、利用状況の計測を可能にする。

## 2. 構造変更

### 2.1 トップページの置き換え
現在のトップページ（医薬品検索機能などがあるページ）をサブページ化し、新たにメニュー専用のトップページを作成する。

- **変更前**: `index.html` (現在のトップページ)
- **変更後**:
    - 現在の `index.html` -> `search.html` にリネーム（「従来のトップページ」として保存）
    - 新規作成 `index.html` -> メニューページとして新設

## 3. メニュー構成案 (新しい index.html)

新しいトップページには、以下の4つの機能へのリンクを配置する。

1.  **医薬品検索 (旧トップページ)**
    - リンク先: `search.html`
    - 説明: 従来の医薬品検索機能や添付文書検索など。

2.  **情報更新**
    - リンク先: `update/index.html`
    - 説明: 医薬品情報の更新やメンテナンス機能。

3.  **ヒヤリハット**
    - リンク先: `hiyari_app/index.html`
    - 説明: ヒヤリハット事例の共有・管理機能。

4.  **感染症サーベイランス**
    - リンク先: `../infection-surveillance-app/index.html`
    - 説明: 別システム（Infection Surveillance App）への外部リンク。

## 4. GAタグ導入計画

全HTMLページの `<head>` タグ直後（または適切な位置）に、Googleアナリティクスのトラッキングコードを導入する。

### 4.1 対象ファイル一覧
以下のHTMLファイル全てにタグを追加する。

**ルートディレクトリ**:
- `index.html` (新設するメニューページ)
- `search.html` (旧 index.html)
- `privacy.html`
- `terms.html`

**サブディレクトリ**:
- `help/index.html`
- `hiyari_app/index.html`
- `update/index.html`
- `yjcode/index.html`

### 4.2 導入コード
以下のコードを各HTMLファイルに挿入する。

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VXSZGE4HP7"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-VXSZGE4HP7');
</script>
```

## 5. 作業手順 (Todo)

1.  [ ] **バックアップ**: 既存の `search-for-medicine-test03` ディレクトリのバックアップを取得する（推奨）。
2.  [ ] **リネーム**: `index.html` を `search.html` にリネームする。
    - 注意: `search.html` 内の内部リンクやJSからの参照で `index.html` を指定している箇所があれば、必要に応じて修正する（今回は計画のみのため実装時は注意）。
3.  [ ] **新規作成**: 新しい `index.html` を作成し、メニュー画面を実装する。
4.  [ ] **GAタグ埋め込み**:
    - リストアップした全てのHTMLファイルを開く。
    - 指定のGAタグコードを貼り付ける。
5.  [ ] **動作確認**:
    - 各ページへのリンクが正しく機能するか確認する。
    - ブラウザの開発者ツール等でGAタグが読み込まれているか確認する。