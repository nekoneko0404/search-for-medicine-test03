function debug2026Data() {
    const folder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const subFolders = folder.getFoldersByName("過去週報");
    if (!subFolders.hasNext()) {
        Logger.log("No '過去週報' folder found.");
        return;
    }
    const historyFolder = subFolders.next();
    const files = historyFolder.getFiles();

    Logger.log("--- Checking 2026 Files ---");
    while (files.hasNext()) {
        const file = files.next();
        if (file.getName().includes("2026")) {
            Logger.log(`File: ${file.getName()} (Size: ${file.getSize()})`);
            const content = file.getBlob().getDataAsString('Shift_JIS'); // Try Shift_JIS first

            // Log first 10 lines
            const lines = content.split('\n').slice(0, 10);
            Logger.log("--- First 10 lines ---");
            lines.forEach(line => Logger.log(line));

            // Try parsing
            try {
                const parsed = parseTougaiRows_(Utilities.parseCsv(content));
                Logger.log(`Parsed Data Count: ${parsed.length}`);
                if (parsed.length > 0) {
                    Logger.log("Sample Parsed Data (First Item):");
                    Logger.log(JSON.stringify(parsed[0]));

                    // Check for specific disease history
                    const flu = parsed.find(d => d.disease === 'Influenza' && d.prefecture === '東京都');
                    if (flu) {
                        Logger.log("Influenza Tokyo History: " + JSON.stringify(flu.history));
                    }
                }
            } catch (e) {
                Logger.log("Parse Error: " + e.toString());
            }
            Logger.log("-----------------------");
        }
    }

    Logger.log("--- Checking Combined Data Generation ---");
    const combined = generateCombinedData_();
    const archive2026 = combined.archives.find(a => a.year === 2026);
    if (archive2026) {
        Logger.log("Archive 2026 Data Found.");
        const flu = archive2026.data.find(d => d.disease === 'Influenza' && d.prefecture === '東京都');
        if (flu) {
            Logger.log("Combined Influenza Tokyo History: " + JSON.stringify(flu.history));
        } else {
            Logger.log("No Influenza Tokyo data in 2026 archive.");
        }
    } else {
        Logger.log("No 2026 data in archives.");
    }
}
