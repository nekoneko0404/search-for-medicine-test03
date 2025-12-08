// 定数設定
const FOLDER_NAME = "IDWR-Insight-Data";
const PARENT_FOLDER_ID = "1QNMtQgeHELipJJgU38HJ0gEPQFGZ-gfC"; 
const SPREADSHEET_NAME = "Infection_Data_Master";
const ADMIN_EMAIL = "admin@example.com";
const INDEX_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/rapid/";
const CSV_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/jp/rapid/";

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
      'all': 'All' // 一括取得用
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

    const targetSheetName = allowedSheets[normalizedKey];
    
    const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    
    // 単体取得の場合もキャッシュを活用する
    const csvContent = getCsvDataWithCache_(ss, targetSheetName);
    
    return ContentService.createTextOutput(csvContent)
      .setMimeType(ContentService.MimeType.CSV);

  } catch (err) {
    return ContentService.createTextOutput(`Error: ${err.toString()}`)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function getAllData_() {
  const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
  const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
  
  return {
    Teiten: getCsvDataWithCache_(ss, 'Teiten'),
    ARI: getCsvDataWithCache_(ss, 'ARI'),
    Tougai: getCsvDataWithCache_(ss, 'Tougai')
  };
}

function getCsvDataWithCache_(ss, sheetName) {
  // キャッシュキーを作成
  const cacheKey = "CSV_" + sheetName;
  const cache = CacheService.getScriptCache();
  
  // キャッシュがあればそれを返す
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // キャッシュがなければシートから読み込む
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`シート「${sheetName}」が見つかりません。`);
  }
  
  const data = sheet.getDataRange().getValues();
  const csvString = convertToCsv_(data);
  
  // キャッシュに保存（最大100KBの制限があるため、try-catchで囲む）
  try {
    cache.put(cacheKey, csvString, 3600); // 1時間キャッシュ
  } catch (e) {
    Logger.log(`Cache put failed for ${sheetName}: ${e.toString()}`);
  }
  
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
 * Google Driveから過去の感染症データを取得する
 * @returns {string} 過去データのJSON文字列
 */
function getHistoryData() {
  const result = {
    data: [],
    logs: []
  };
  result.logs.push("getHistoryData started");

  try {
    const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
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
              const csvContent = file.getBlob().getDataAsString("Shift_JIS");
              result.data.push({
                year: year,
                fileName: fileName,
                content: csvContent
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

    // 1. 親フォルダ直下のファイルを検索
    processFiles(folder.getFiles(), "Root");

    // 2. 「過去週報」サブフォルダ内のファイルを検索
    const subFolders = folder.getFoldersByName("過去週報");
    if (subFolders.hasNext()) {
      const subFolder = subFolders.next();
      result.logs.push(`Subfolder Found: ${subFolder.getName()} (ID: ${subFolder.getId()})`);
      processFiles(subFolder.getFiles(), "Subfolder");
    } else {
      result.logs.push("Subfolder '過去週報' not found.");
    }

    result.data.sort((a, b) => b.year - a.year);
    result.logs.push(`Total history files loaded: ${result.data.length}`);
  } catch (e) {
    result.logs.push(`Fatal Error: ${e.toString()}`);
  }
  
  return JSON.stringify(result);
}

function updateData_() {
  try {
    Logger.log("データ更新処理を開始します。");

    const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    
    const currentYear = new Date().getFullYear();
    const indexPageUrl = `${INDEX_BASE_URL}${currentYear}/index.html`;
    const latestWeeklyPageUrl = getLatestWeeklyPageUrl_(indexPageUrl);

    const match = latestWeeklyPageUrl.match(/\/(\d{4})\/week(\d{2})\.html$/);
    if (!match) throw new Error("最新の週のURLから年と週を抽出できませんでした。");
    const year = parseInt(match[1], 10); 
    const week = parseInt(match[2], 10); 
    const weekStr = String(week).padStart(2, '0');
    
    const weeklyPath = `${CSV_BASE_URL}${year}/${weekStr}/`;
    const urls = {
      Teiten: `${weeklyPath}${year}-${weekStr}-teiten.csv`,
      Tougai: `${weeklyPath}${year}-${weekStr}-teiten-tougai.csv`, // 当該データ（県別週次推移）
      ARI: `${weeklyPath}${year}-${weekStr}-ari.csv`
    };
    
    const csvData = fetchAllCsv_(urls);
    Logger.log("全CSVデータの取得に成功しました。");

    writeCsvToSheet_(ss, 'Teiten', csvData.Teiten);
    writeCsvToSheet_(ss, 'Tougai', csvData.Tougai);
    writeCsvToSheet_(ss, 'ARI', csvData.ARI);

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
    
    // 重複チェック: すでに存在する場合は保存しない
    if (existingFiles.hasNext()) {
      Logger.log(`File ${fileName} already exists in ${subFolderName}. Skipping save.`);
    } else {
      historyFolder.createFile(fileName, csvData.Tougai, MimeType.CSV);
      Logger.log(`Saved history CSV to Drive (${subFolderName}): ${fileName}`);
    }

    // 同年の古い週のファイルを削除
    cleanUpOldWeeklyFiles_(historyFolder, year, week);

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
      csvData[key] = response.getBlob().getDataAsString('Shift_JIS');
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
  const linkRegex = /IDWR速報データ \d{4}年第(\d{1,2})週/g;
  let match, latestWeek = -1, latestLinkFileName = null; 
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const weekNumber = parseInt(match[1], 10);
    if (weekNumber > latestWeek) {
      latestWeek = weekNumber;
      latestLinkFileName = `week${String(weekNumber).padStart(2, '0')}.html`;
    }
  }
  if (latestLinkFileName) return indexPageUrl.substring(0, indexPageUrl.lastIndexOf('/') + 1) + latestLinkFileName;
  throw new Error("Latest link not found");
}
