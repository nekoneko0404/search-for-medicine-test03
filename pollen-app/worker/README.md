# バックグラウンド通知システムのデプロイ手順

このディレクトリには、Cloudflare Workersを利用したバックグラウンド通知システム（APIおよび定期実行バッチ）のコードが含まれています。
以下の手順に従って環境を構築・デプロイしてください。

## 1. 準備

まず、Workerディレクトリに移動し、依存パッケージをインストールします。

```powershell
cd c:\Users\kiyoshi\Github_repository\search-for-medicine\pollen-app\worker
npm install
```

## 2. VAPIDキーの生成

Web Pushに必要な暗号化キー（公開鍵・秘密鍵）を生成します。

```powershell
npx web-push generate-vapid-keys
```

出力された `Public Key` と `Private Key` を控えておいてください。

## 3. Cloudflare D1データベースの作成

通知設定を保存するデータベースを作成します。

```powershell
npx wrangler d1 create pollen-db
```

コマンド実行後に表示される `database_id`（例: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）をコピーし、
`wrangler.toml` ファイルの `database_id` の部分を書き換えてください。

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "pollen-db"
database_id = "REPLACE_WITH_YOUR_DB_ID" # ←ここを書き換える
```

## 4. データベースの初期化

テーブルを作成します。

**ローカル開発用:**
```powershell
npx wrangler d1 execute pollen-db --local --file=./schema.sql
```

**本番デプロイ用（初回のみ）:**
```powershell
npx wrangler d1 execute pollen-db --remote --file=./schema.sql
```

## 5. 環境変数の設定

生成したVAPIDキーをWorkerの環境変数（シークレット）として設定します。

```powershell
npx wrangler secret put VAPID_PRIVATE_KEY
# プロンプトが表示されたら Private Key を入力
```

```powershell
npx wrangler secret put VAPID_PUBLIC_KEY
# プロンプトが表示されたら Public Key を入力
```

※ `VAPID_SUBJECT` も変更したい場合は同様に設定してください（デフォルトは `mailto:admin@example.com` です）。

## 6. デプロイ

WorkerをCloudflare上に公開します。

```powershell
npx wrangler deploy
```

成功すると、WorkerのURLが表示されます（例: `https://pollen-worker.your-name.workers.dev`）。

## 7. フロントエンドの設定

最後に、発行されたWorkerのURLをフロントエンドのコードに設定します。

1. `../script.js` を開きます。
2. ファイル先頭付近にある `WORKER_URL` の値を、上記で発行されたURLに書き換えてください。

```javascript
// script.js
const WORKER_URL = 'https://pollen-worker.your-name.workers.dev';
```

3. フロントエンド（`index.html`など一式）をWebサーバーにデプロイします。

以上で設定は完了です。
スマートフォンでサイトにアクセスし、「通知設定」から登録を行うことで、バックグラウンド通知が機能するようになります。
