// 定数設定
const FOLDER_NAME = "IDWR-Insight-Data";
const PARENT_FOLDER_ID = "1iUWcwIEcvyZSzEjO8YHatV38WIVSuGg2"; // IDWR-Insight-Data フォルダのID
const SPREADSHEET_NAME = "Infection_Data_Master";
const ADMIN_EMAIL = "admin@example.com";
const INDEX_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/jp/rapid/";
const CSV_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/jp/rapid/";
const CACHE_FILE_NAME = "combined_data_cache_v5.json"; // キャッシュファイル名 (v5に更新して再生成を強制)

function doGet(e) {
  try {
    const sheetNameInput = e.parameter.type || 'Teiten';
    
    // 入力検証（ホワイトリスト）
    const allowedSheets = {
      'teiten': 'Teiten',
      'ari': 'ARI',
      'trend': 'Trend',
      'tougai': 'Tougai',
      'history': 'History', // 新しくhistoryタイプを追加
      'all': 'All', // 一括取得用
      'combined': 'CombinedData', // 新しくcombinedタイプを追加
      'latest': 'LatestData' // 最新データ取得用
    };
    
    const normalizedKey = sheetNameInput.toLowerCase();
    if (!allowedSheets.hasOwnProperty(normalizedKey)) {
      throw new Error(`不正なシート名です: ${sheetNameInput}`);
    }
    
    // historyタイプの場合は、getHistoryData関数を呼び出す
    if (normalizedKey === 'history') {
      return ContentService.createTextOutput(getHistoryData())
        .setMimeType(ContentService.MimeType.JSON);
    }

    // allタイプの場合は、主要データをまとめてJSONで返す
    if (normalizedKey === 'all') {
      return ContentService.createTextOutput(JSON.stringify(getAllData_()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // combinedタイプの場合は、ファイルキャッシュを利用して高速化
    if (normalizedKey === 'combined') {
      // 1. ファイルキャッシュからの読み込みを試みる
      const cachedContent = getFileCache_();
      if (cachedContent) {
        return ContentService.createTextOutput(cachedContent)
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // 2. キャッシュがない場合は生成して保存し、返す
      const combinedResult = generateCombinedData_();
      const jsonString = JSON.stringify(combinedResult);
      saveFileCache_(jsonString); // 次回のために保存

      return ContentService.createTextOutput(jsonString)
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (normalizedKey === 'latest') {
      const latestData = getAllData_();
      return ContentService.createTextOutput(JSON.stringify(latestData))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const targetSheetName = allowedSheets[normalizedKey];
    
    const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    
    // 単体取得の場合もキャッシュを活用する
    const csvContent = getCsvDataWithCache_(ss, targetSheetName);
    
    return ContentService.createTextOutput(csvContent)
      .setMimeType(ContentService.MimeType.CSV);

  } catch (err) {
    // エラーの詳細とスタックトレースを含める
    const errorResponse = {
      status: 'error',
      message: err.toString(),
      stack: err.stack
    };
    // JSONとしてエラーを返すとクライアント側で扱いやすいが、
    // 現状のクライアント実装に合わせてテキストで返す（ただし詳細を含める）
    return ContentService.createTextOutput(`Error: ${err.toString()}\nStack: ${err.stack}`)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function getAllData_() {
  const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
  
  return {
    Teiten: getCsvDataWithCache_(ss, 'Teiten'),
    ARI: getCsvDataWithCache_(ss, 'ARI'),
    Tougai: getCsvDataWithCache_(ss, 'Tougai')
  };
}

function getCsvDataWithCache_(ss, sheetName) {
  // シートから読み込む
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`シート「${sheetName}」が見つかりません。`);
  }
  
  const data = sheet.getDataRange().getValues();
  const csvString = convertToCsv_(data);
    
  return csvString;
}

function convertToCsv_(data) {
  return data.map(row => row.map(cell => {
    let cellStr = String(cell);
    if (cellStr.includes('"') || cellStr.includes(',') || cellStr.includes('\n')) {
      cellStr = '"' + cellStr.replace(/"/g, '""') + '"';
    }
    return cellStr;
  }).join(',')).join('\n');
}

function main() {
  try {
    updateData_();
  } catch (e) {
    Logger.log("main実行中にエラーが発生しました: " + e.toString());
  }
}

/**
 * Google Driveから過去の感染症データを取得する（外部呼び出し用）
 * @returns {string} 過去データのJSON文字列
 */
function getHistoryData() {
  return JSON.stringify(getHistoryDataAsObject_());
}

/**
 * Google Driveから過去の感染症データを取得する（内部処理用）
 * @returns {Object} 過去データのオブジェクト
 */
function getHistoryDataAsObject_() {
  const result = {
    data: [],
    logs: []
  };
  result.logs.push("getHistoryData started");

  try {
    const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    result.logs.push(`Target Folder: ${FOLDER_NAME} (ID: ${folder.getId()})`);
    
    const processFiles = (fileIterator, location) => {
      while (fileIterator.hasNext()) {
        const file = fileIterator.next();
        const fileName = file.getName();
        
        if (fileName.toLowerCase().includes('teiten-tougai')) {
          try {
            let year = 0;
            const yearMatch = fileName.match(/(20\d{2})/);
            if (yearMatch) year = parseInt(yearMatch[1], 10);
            
            if (year > 0) {
              let csvContent;
              try {
                // まず Shift_JIS で読み込みを試みる
                csvContent = file.getBlob().getDataAsString("Shift_JIS");
                
                // Shift_JIS で正しく読めたか検証 (キーワードチェック)
                // "週", "報告", "定点" などのキーワードが含まれているか
                // 含まれていない場合、または replacement character が多い場合は失敗とみなす
                if (!csvContent.includes("週") && !csvContent.includes("報告")) {
                   Logger.log(`DEBUG_CODE_GS: ${fileName} read as Shift_JIS but keywords not found. Trying UTF-8.`);
                   throw new Error("Invalid Shift_JIS content suspected");
                }
                Logger.log(`DEBUG_CODE_GS: Successfully read ${fileName} as Shift_JIS.`);
              } catch (e_sjis) {
                // Shift_JISで失敗または不正と判断された場合、UTF-8 で読み込みを試みる
                try {
                  csvContent = file.getBlob().getDataAsString("UTF-8");
                  Logger.log(`DEBUG_CODE_GS: Successfully read ${fileName} as UTF-8.`);
                } catch (e_utf8) {
                  Logger.log(`DEBUG_CODE_GS: Failed to read ${fileName} as UTF-8 as well: ${e_utf8.toString()}. Falling back to default.`);
                  csvContent = file.getBlob().getDataAsString(); 
                }
              }

              // ファイル名とサイズをログ出力（ユーザー確認用）
              result.logs.push(`Found file: ${fileName} (Size: ${file.getSize()} bytes, Year: ${year})`);
              
              const parsedData = parseTougaiRows_(Utilities.parseCsv(csvContent));
              result.data.push({
                year: year,
                data: parsedData
              });
              result.logs.push(`Matched & Read in ${location}: ${fileName} (Year: ${year})`);
            } else {
              result.logs.push(`Skipped in ${location} (No year): ${fileName}`);
            }
          } catch (e) {
            result.logs.push(`Error reading ${fileName} in ${location}: ${e.toString()}`);
          }
        }
      }
    };

    // 1. 親フォルダ直下のファイルを検索 (Teiten, Tougai, ARIなど)
    // processFiles(folder.getFiles(), "Root"); // Rootには通常historyファイルはないはずだが念のため？いや、過去週報フォルダだけ見ればよい

    // 2. 「過去週報」サブフォルダ内のファイルを検索
    const subFolders = folder.getFoldersByName("過去週報");
    if (subFolders.hasNext()) {
      const subFolder = subFolders.next();
      result.logs.push(`Subfolder Found: ${subFolder.getName()} (ID: ${subFolder.getId()})`);
      processFiles(subFolder.getFiles(), "Subfolder");
    } else {
      result.logs.push("Subfolder '過去週報' not found.");
    }

    // 重複排除: 同じ年のファイルが複数ある場合、更新日時が新しいものを採用
    const yearMap = new Map();
    result.data.forEach(item => {
      if (!yearMap.has(item.year)) {
        yearMap.set(item.year, item);
      } else {
        const existing = yearMap.get(item.year);
        // 既存データのサイズチェック（簡易）: dataの長さで判断
        if (item.data.length > existing.data.length) {
             yearMap.set(item.year, item);
             result.logs.push(`Replaced year ${item.year} with larger file: ${item.fileName}`);
        } else {
             result.logs.push(`Skipping duplicate/smaller file for year ${item.year}: ${item.fileName}`);
        }
      }
    });
    result.data = Array.from(yearMap.values());

    result.data.sort((a, b) => b.year - a.year);
    result.logs.push(`Total history files loaded: ${result.data.length}`);
  } catch (e) {
    result.logs.push(`Fatal Error: ${e.toString()}`);
  }
  
  return result;
}

function updateData_() {
  try {
    Logger.log("データ更新処理を開始します。");

    const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    
    const currentYear = new Date().getFullYear();
    const indexPageUrl = `${INDEX_BASE_URL}${currentYear}/index.html`;
    const latestWeeklyPageUrl = getLatestWeeklyPageUrl_(indexPageUrl);

    const match = latestWeeklyPageUrl.match(/\/(\d{4})\/(\d{2})\/index\.html$/);
    if (!match) throw new Error("最新の週のURLから年と週を抽出できませんでした。URL: " + latestWeeklyPageUrl);
    const year = parseInt(match[1], 10); 
    const week = parseInt(match[2], 10); 
    const weekStr = String(week).padStart(2, '0');

    // 履歴用CSVファイルを「過去週報」フォルダに保存
    const subFolderName = "過去週報";
    let historyFolder;
    const subFolders = folder.getFoldersByName(subFolderName);
    if (subFolders.hasNext()) {
      historyFolder = subFolders.next();
    } else {
      historyFolder = folder.createFolder(subFolderName);
    }

    const fileName = `${year}-${weekStr}-teiten-tougai.csv`;
    const existingFiles = historyFolder.getFilesByName(fileName);
    
    // 重複チェック: すでに存在する場合はスキップ
    if (existingFiles.hasNext()) {
      Logger.log(`File ${fileName} already exists in ${subFolderName}. Skipping download.`);
      // キャッシュ更新だけして終了（既存ファイルを含めてキャッシュ再生成）
      updateCache_();
      return { year, week, skipped: true };
    }
    
    // --- 更新が必要な場合のみ、以下の処理を実行 ---

    const weeklyPath = `${CSV_BASE_URL}${year}/${weekStr}/`;
    const urls = {
      Teiten: `${weeklyPath}${year}-${weekStr}-teiten.csv`,
      Tougai: `${weeklyPath}${year}-${weekStr}-teiten-tougai.csv`,
      ARI: `${weeklyPath}${year}-${weekStr}-ari.csv`
    };
    
    const csvData = fetchAllCsv_(urls);
    Logger.log("全CSVデータの取得に成功しました。");

    writeCsvToSheet_(ss, 'Teiten', csvData.Teiten);
    writeCsvToSheet_(ss, 'Tougai', csvData.Tougai);
    writeCsvToSheet_(ss, 'ARI', csvData.ARI);

    // HTMLかどうかのチェック
    if (csvData.Tougai.trim().startsWith('<') || csvData.Tougai.includes('<!DOCTYPE html>')) {
        Logger.log("Error: Fetched Tougai data appears to be HTML. Aborting save.");
        throw new Error("Fetched data is HTML, not CSV.");
    }

    // ファイルが存在しないこと是確認済みのため、そのまま作成
    historyFolder.createFile(fileName, csvData.Tougai, MimeType.CSV);
    Logger.log(`Saved history CSV to Drive (${subFolderName}): ${fileName}`);
    
    // 同年の古い週のファイルを削除
    cleanUpOldWeeklyFiles_(historyFolder, year, week);

    // キャッシュファイルの更新（combinedデータ）
    updateCache_();

    Logger.log("データ更新処理が正常に終了しました。");

    return { year, week };

  } catch (e) {
    const errorMessage = "データ更新処理中にエラーが発生しました: " + e.toString();
    Logger.log(errorMessage);
    throw e;
  }
}

function getOrCreateSpreadsheet_(folder, name) {
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  } else {
    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ss;
  }
}

function writeCsvToSheet_(ss, sheetName, csvContent) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();
  const data = Utilities.parseCsv(csvContent);
  if (data && data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
}

function fetchAllCsv_(urls) {
  const requests = Object.values(urls).map(url => ({ url: url, muteHttpExceptions: true }));
  const responses = UrlFetchApp.fetchAll(requests);
  const csvData = {};
  
  responses.forEach((response, i) => {
    const key = Object.keys(urls)[i];
    if (response.getResponseCode() == 200) {
      const blob = response.getBlob();
      let text = '';
      
      // まず Shift_JIS で試す (従来のファイルがShift_JISだったため)
      try {
        text = blob.getDataAsString('Shift_JIS');
        // キーワードチェック: 正しくデコードできていれば "週" や "報告" が含まれるはず
        if (!text.includes('週') && !text.includes('報告')) {
           // 失敗とみなしてエラーを投げる -> catchブロックへ
           throw new Error('Shift_JIS decoding seems incorrect');
        }
      } catch (e) {
        // Shift_JISで失敗した場合、UTF-8で試す
        try {
          text = blob.getDataAsString('UTF-8');
        } catch (e2) {
          // UTF-8もだめならデフォルト（UTF-8）
          text = blob.getDataAsString();
        }
      }
      csvData[key] = text;
    } else {
      throw new Error("CSV取得失敗: " + key);
    }
  });
  return csvData;
}

function getOrCreateFolder_(parentFolderId, targetFolderName) {
  try {
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    const folders = parentFolder.getFoldersByName(targetFolderName);
    if (folders.hasNext()) return folders.next();
    return parentFolder.createFolder(targetFolderName);
  } catch (e) {
    throw new Error(`親フォルダ(ID: ${parentFolderId})にアクセスできません。`);
  }
}

function cleanUpOldWeeklyFiles_(folder, currentYear, currentWeek) {
  const files = folder.getFiles();
  // ファイル名パターン: YYYY-WW-teiten-tougai.csv
  const pattern = /^(\d{4})-(\d{2})-teiten-tougai\.csv$/i;
  
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    const match = name.match(pattern);
    
    if (match) {
      const fileYear = parseInt(match[1], 10);
      const fileWeek = parseInt(match[2], 10);
      
      // 同じ年で、かつ現在の週より古い場合は削除 (ゴミ箱へ移動)
      if (fileYear === currentYear && fileWeek < currentWeek) {
        try {
          file.setTrashed(true);
          Logger.log(`Deleted old file: ${name}`);
        } catch (e) {
          Logger.log(`Failed to delete file ${name}: ${e.toString()}`);
        }
      }
    }
  }
}

function getLatestWeeklyPageUrl_(indexPageUrl) {
  const response = UrlFetchApp.fetch(indexPageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("Index fetch failed");
  const htmlContent = response.getContentText();
  
  // リンクのhref属性と週番号を抽出する正規表現
  // <a>タグの内部で完結するようにし、他のリンク（#mainなど）を誤検知しないようにする
  const linkRegex = /<a[^>]*\bhref="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*?IDWR速報データ \d{4}年第(\d{1,2})週/g;
  
  let match, latestWeek = -1, latestLinkUrl = null; 
  
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const href = match[1];
    const weekNumber = parseInt(match[2], 10);
    
    if (weekNumber > latestWeek) {
      latestWeek = weekNumber;
      latestLinkUrl = href;
    }
  }
  
  if (latestLinkUrl) {
    // 相対パスの場合は絶対パスに変換
    if (!latestLinkUrl.startsWith('http')) {
      const baseUrl = indexPageUrl.substring(0, indexPageUrl.lastIndexOf('/') + 1);
      let fullUrl = baseUrl + latestLinkUrl;
      // /./ を / に置換してパスを正規化
      fullUrl = fullUrl.replace(/\/\.\//g, '/');
      return fullUrl;
    }
    return latestLinkUrl;
  }
  
  throw new Error("Latest link not found");
}

/**
 * Combinedデータを生成する
 */
function generateCombinedData_() {
  const current = getLatestDataAsObject_();
  const historyDataObj = getHistoryDataAsObject_();
  
  return {
    current: current,
    archives: historyDataObj.data
  };
}

function getLatestDataAsObject_() {
  const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
  
  const teitenRows = getDataValuesWithCache_(ss, 'Teiten');
  const ariRows = getDataValuesWithCache_(ss, 'ARI');
  const tougaiRows = getDataValuesWithCache_(ss, 'Tougai');

  const influenzaData = parseTeitenRows_(teitenRows, 'Influenza');
  const covid19Data = parseTeitenRows_(teitenRows, 'COVID-19');
  const ariDataParsed = parseAriRows_(ariRows, 'ARI');
  
  const allData = [...influenzaData, ...covid19Data, ...ariDataParsed];
  const historyData = parseTougaiRows_(tougaiRows);
  const alerts = generateAlerts_(allData);

  // メタデータ抽出 (Teitenシートのヘッダーから日付情報を探索)
  let dateInfo = '';
  if (teitenRows.length > 0) {
    // 最初の数行・数列を走査して、日付パターンを含むセルを探す
    const datePattern = /\d{4}年\d{1,2}週/;
    outerLoop:
    for (let i = 0; i < Math.min(teitenRows.length, 5); i++) {
      for (let j = 0; j < Math.min(teitenRows[i].length, 5); j++) {
        const cellValue = String(teitenRows[i][j]);
        if (datePattern.test(cellValue)) {
          dateInfo = cellValue;
          break outerLoop;
        }
      }
    }
    // 見つからなかった場合、A1セルをフォールバックとして使用（ただし空でない場合）
    if (!dateInfo && teitenRows[0][0]) {
        dateInfo = String(teitenRows[0][0]);
    }
  }

  return {
      data: allData,
      history: historyData,
      summary: { alerts },
      meta: { dateInfo }
  };
}

function getDataValuesWithCache_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
     return [];
  }
  return sheet.getDataRange().getValues();
}

/**
 * キャッシュファイルを生成・更新する
 */
function updateCache_() {
  try {
    const data = generateCombinedData_();
    const jsonString = JSON.stringify(data);
    saveFileCache_(jsonString);
    Logger.log("Combined data cache updated successfully.");
  } catch (e) {
    Logger.log("Failed to update cache: " + e.toString());
  }
}

/**
 * ドライブ上のキャッシュファイルに保存する
 */
function saveFileCache_(content) {
  const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const files = folder.getFilesByName(CACHE_FILE_NAME);
  
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(content);
  } else {
    folder.createFile(CACHE_FILE_NAME, content, MimeType.PLAIN_TEXT);
  }
}

/**
 * ドライブ上のキャッシュファイルから読み込む
 */
function getFileCache_() {
  try {
    const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const files = folder.getFilesByName(CACHE_FILE_NAME);
    if (files.hasNext()) {
      const file = files.next();
      const content = file.getBlob().getDataAsString();
      
      // デバッグ用ログ: 取得したコンテンツの先頭を表示
      Logger.log(`Cache file '${CACHE_FILE_NAME}' content. Length: ${content.length}. Start: ${content.substring(0, Math.min(content.length, 100))}`);

      if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
          Logger.log(`WARNING: Cache file '${CACHE_FILE_NAME}' content appears to be HTML.`);
      }
      return content;
    }
    return null;
  } catch (e) {
    Logger.log("Error reading file cache: " + e.toString());
    return null;
  }
}

// --- Parsing Logic Ported from main.js ---

const ALL_DISEASES = [
    { key: 'Influenza', name: 'インフルエンザ' },
    { key: 'COVID-19', name: 'COVID-19' },
    { key: 'ARI', name: '急性呼吸器感染症' },
    { key: 'RSV', name: 'ＲＳウイルス感染症' },
    { key: 'PharyngoconjunctivalFever', name: '咽頭結膜熱' },
    { key: 'AGS_Pharyngitis', name: 'Ａ群溶血性レンサ球菌咽頭炎' },
    { key: 'InfectiousGastroenteritis', name: '感染性胃腸炎' },
    { key: 'Chickenpox', name: '水痘' },
    { key: 'HandFootMouthDisease', name: '手足口病' },
    { key: 'ErythemaInfectiosum', name: '伝染性紅斑' },
    { key: 'ExanthemSubitum', name: '突発性発しん' },
    { key: 'Herpangina', name: 'ヘルパンギーナ' },
    { key: 'Mumps', name: '流行性耳下腺炎' },
    { key: 'AcuteHemorrhagicConjunctivitis', name: '急性出血性結膜炎' },
    { key: 'EpidemicKeratoconjunctivitis', name: '流行性角結膜炎' },
    { key: 'BacterialMeningitis', name: '細菌性髄膜炎' },
    { key: 'AsepticMeningitis', name: '無菌性髄膜炎' },
    { key: 'MycoplasmaPneumonia', name: 'マイコプラズマ肺炎' },
    { key: 'ChlamydiaPneumonia', name: 'クラミジア肺炎' },
    { key: 'RotavirusGastroenteritis', name: '感染性胃腸炎（ロタウイルス）' }
];

function parseTeitenRows_(rows, diseaseName) {
    if (!rows || rows.length < 5) {
        return [];
    }

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const diseaseHeaderRow = rows[2];
    const subHeaderRow = rows[3];

    let searchKeys = [diseaseName];
    if (diseaseName === 'Influenza') searchKeys.push('インフルエンザ');
    if (diseaseName === 'COVID-19') searchKeys.push('新型コロナウイルス感染症', 'COVID-19');

    let diseaseColumnIndex = -1;

    for (let i = 1; i < diseaseHeaderRow.length; i++) {
        const cellValue = diseaseHeaderRow[i] || '';
        if (searchKeys.some(key => cellValue.includes(key))) {
            for (let j = i; j < subHeaderRow.length; j++) {
                if ((subHeaderRow[j] || '').includes('定当')) {
                    diseaseColumnIndex = j;
                    break;
                }
            }
            break;
        }
    }

    if (diseaseColumnIndex === -1) {
        return [];
    }

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= diseaseColumnIndex) continue;

        const prefName = String(row[0] || '').trim();
        const value = parseFloat(row[diseaseColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseAriRows_(rows, diseaseName) {
    if (!rows || rows.length < 5) return [];

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const valueColumnIndex = 2;

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();
        const value = parseFloat(row[valueColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseTougaiRows_(rows) {
    if (!rows || rows.length < 10) return [];

    const historyData = [];
    const diseaseSections = {};

    for (let i = 0; i < rows.length; i++) {
        const firstCell = String(rows[i][0] || '').trim();

        ALL_DISEASES.forEach(disease => {
            if (firstCell === disease.name || (firstCell.includes(disease.name) && firstCell.length < disease.name.length + 5)) {
                if (diseaseSections[disease.key] === undefined) {
                    diseaseSections[disease.key] = i;
                }
            }
        });
    }

    ALL_DISEASES.forEach(disease => {
        if (diseaseSections[disease.key] !== undefined) {
            historyData.push(...extractHistoryFromSection_(rows, diseaseSections[disease.key], disease.key, disease.name));
        }
    });

    return historyData;
}

function extractHistoryFromSection_(rows, startRowIndex, diseaseKey, displayDiseaseName) {
    const results = [];
    let weekHeaderRowIndex = -1;
    let typeHeaderRowIndex = -1;

    for (let i = startRowIndex + 1; i < Math.min(rows.length, startRowIndex + 20); i++) {
        const row = rows[i];
        const rowStr = row.join(',');

        if (rowStr.includes('週')) {
            const weekMatches = rowStr.match(/(\d{1,2})週/g);
            if (weekMatches && weekMatches.length > 5) {
                weekHeaderRowIndex = i;
                if (i + 1 < rows.length) {
                    typeHeaderRowIndex = i + 1;
                }
                break;
            }
        }
    }

    const weekColumns = [];
    let singleWeekNum = null;

    if (weekHeaderRowIndex !== -1 && typeHeaderRowIndex !== -1) {
        const weekHeaderRow = rows[weekHeaderRowIndex];
        const typeHeaderRow = rows[typeHeaderRowIndex];

        for (let j = 0; j < weekHeaderRow.length; j++) {
            const weekText = String(weekHeaderRow[j] || '');
            const typeText = String(typeHeaderRow[j] || '');
            const weekMatch = weekText.match(/(\d{1,2})週/);

            if (weekMatch && (typeText.includes('定当') || typeText.includes('定点当たり'))) {
                weekColumns.push({
                    week: parseInt(weekMatch[1]),
                    colIndex: j
                });
            }
        }
    }

    if (weekColumns.length === 0) {
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const rowStr = rows[i].join('');
            const match = rowStr.match(/(\d{4})年(\d{1,2})週/);
            if (match) {
                singleWeekNum = parseInt(match[2]);
                break;
            }
        }

        if (singleWeekNum) {
            let foundHeader = false;
            for (let i = startRowIndex + 1; i < Math.min(rows.length, startRowIndex + 10); i++) {
                const row = rows[i];
                const prevRow = rows[i - 1];

                for (let j = 0; j < row.length; j++) {
                    const cell = String(row[j] || '');
                    if (cell.includes('定当') || cell.includes('定点当たり')) {
                        const prevCell = prevRow ? String(prevRow[j] || '') : '';
                        const weekPattern = new RegExp(`${singleWeekNum}週`);

                        if (prevCell.match(weekPattern)) {
                            weekColumns.push({
                                week: singleWeekNum,
                                colIndex: j
                            });
                            typeHeaderRowIndex = i;
                            foundHeader = true;
                            break;
                        }
                    }
                }
                if (foundHeader) break;
            }
        }

        if (weekColumns.length === 0) {
            return [];
        }
    }

    for (let i = typeHeaderRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();

        if (!prefName) continue;

        const isNextSection = ALL_DISEASES.some(d => d.key !== diseaseKey && prefName.includes(d.name));
        if (isNextSection || prefName.includes('報告数・定点当たり')) {
            break;
        }

        const validPrefectures = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '総数'
        ];
        
        if (validPrefectures.includes(prefName)) {
            const history = weekColumns.map(wc => {
                const val = parseFloat(row[wc.colIndex]);
                return { week: wc.week, value: isNaN(val) ? null : val };
            });

            results.push({
                disease: diseaseKey,
                prefecture: prefName === '総数' ? '全国' : prefName,
                history: history
            });
        }
    }
    return results;
}

function generateAlerts_(data) {
    const comments = [];
    const diseasesForAlerts = ALL_DISEASES.filter(d => ['Influenza', 'COVID-19', 'ARI'].includes(d.key));

    diseasesForAlerts.forEach(diseaseObj => {
        const diseaseKey = diseaseObj.key;
        const nationalData = data.find(item => item.disease === diseaseKey && item.prefecture === '全国');
        if (nationalData) {
            const value = nationalData.value;
            let level = 'normal';
            let message = '全国的に平常レベルです。';

            if (diseaseKey === 'Influenza') {
                if (value >= 30.0) { level = 'alert'; message = '全国的に警報レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '全国的に注意報レベルです。'; }
                else if (value >= 1.0) { level = 'normal'; message = '全国的に流行入りしています。'; }
            } else if (diseaseKey === 'COVID-19') {
                if (value >= 15.0) { level = 'alert'; message = '高い感染レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '注意が必要です。'; }
            } else if (diseaseKey === 'ARI') {
                if (value >= 120.0) { level = 'alert'; message = '流行レベルです。'; }
                else if (value >= 80.0) { level = 'warning'; message = '注意が必要です。'; }
            }

            comments.push({ disease: diseaseKey, level, message });
        }
    });
    return comments;
}
