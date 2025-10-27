# Google Apps Script(GAS)を利用したデータ取得APIの作成手順

この手順では、GoogleスプレッドシートのデータをJSON形式で返すWeb APIを作成します。これにより、CORS（Cross-Origin Resource Sharing）ポリシーによるエラーを回避し、どのウェブページからでも安全にデータを取得できるようになります。

## ステップ1: Google Apps Script エディタを開く

1.  データが格納されているGoogleスプレッドシートを開きます。
2.  上部のメニューから **[拡張機能]** > **[Apps Script]** を選択します。
3.  新しいブラウザタブでApps Scriptエディタが開きます。

## ステップ2: スクリプトを記述する

1.  エディタにデフォルトで表示されている `function myFunction() { ... }` というコードをすべて削除します。
2.  以下のスクリプトをコピーして、エディタに貼り付けます。

```javascript
function doGet(e) {
  // 対象のスプレッドシートIDを指定
  const SPREADSHEET_ID = '1yhDbdCbnmDoXKRSj_CuLgKkIH2ohK1LD';
  
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行を除外（必要に応じて調整）
    const headers = data.shift();
    
    const json = data.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    
    const output = ContentService.createTextOutput(JSON.stringify(json))
      .setMimeType(ContentService.MimeType.JSON);
      
    // CORS対応ヘッダーを設定
    output.setHeader('Access-Control-Allow-Origin', '*');
    
    return output;
    
  } catch (error) {
    const errorOutput = ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
    errorOutput.setHeader('Access-Control-Allow-Origin', '*');
    return errorOutput;
  }
}
```

## ステップ3: スクリプトをデプロイする

1.  スクリプトを保存します（フロッピーディスクのアイコンをクリック）。
2.  エディタ右上の青い **[デプロイ]** ボタンをクリックし、**[新しいデプロイ]** を選択します。
3.  歯車のアイコン（「種類の選択」）をクリックし、**[ウェブアプリ]** を選択します。
4.  以下の設定を行います。
    *   **説明:** （任意）医薬品データ取得APIなど
    *   **次のユーザーとして実行:** **自分**
    *   **アクセスできるユーザー:** **全員**
5.  **[デプロイ]** ボタンをクリックします。
6.  **承認が必要です** という画面が表示されたら、**[アクセスを承認]** をクリックします。
7.  自分のGoogleアカウントを選択し、**[詳細]** > **[（安全でないページ）に移動]** をクリックして、アクセスを許可します。
8.  デプロイが完了すると、**ウェブアプリのURL**が表示されます。このURLをコピーしてください。これが新しいAPIのエンドポイントになります。

## ステップ4: HTMLファイルを更新する

コピーしたウェブアプリのURLを使って、`index.html`、`update.html`、`yjcode.html`のデータ取得部分を修正する必要があります。

この後の手順で、私（Roo）がファイルの修正を行いますので、作成した**ウェブアプリのURL**を教えてください。