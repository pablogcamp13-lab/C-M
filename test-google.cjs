require("dotenv").config();

const { google } = require("googleapis");

const {
  GOOGLE_SHEET_ID,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
} = process.env;

async function testGoogle() {
  let testSheetId = null;
  let testDriveFileId = null;

  try {
    // =========================
    // AUTENTICACIÓN OAUTH
    // =========================

    const auth = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN,
    });

    const sheets = google.sheets({
      version: "v4",
      auth,
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    // =========================
    // 1. LECTURA SHEETS
    // =========================

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEET_ID,
    });

    console.log(
      "✅ LECTURA SHEETS OK:",
      spreadsheet.data.properties.title
    );

    // =========================
    // 2. ESCRITURA SHEETS
    // =========================

    const testSheetName = `__TEST_OAUTH_${Date.now()}`;

    const addSheetResponse =
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: testSheetName,
                },
              },
            },
          ],
        },
      });

    testSheetId =
      addSheetResponse.data.replies[0].addSheet.properties.sheetId;

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `'${testSheetName}'!A1:B2`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          ["PRUEBA", "RESULTADO"],
          ["OAuth Sheets", "OK"],
        ],
      },
    });

    console.log("✅ ESCRITURA SHEETS OK");

    // Eliminar pestaña temporal
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId: testSheetId,
            },
          },
        ],
      },
    });

    testSheetId = null;

    console.log("✅ LIMPIEZA SHEETS OK");

    // =========================
    // 3. LECTURA DRIVE
    // =========================

    const folder = await drive.files.get({
      fileId: GOOGLE_DRIVE_FOLDER_ID,
      fields: "id,name,mimeType",
    });

    console.log(
      "✅ LECTURA DRIVE OK:",
      folder.data.name
    );

    // =========================
    // 4. ESCRITURA DRIVE
    // =========================

    const file = await drive.files.create({
      requestBody: {
        name: "__TEST_OAUTH__.txt",
        parents: [GOOGLE_DRIVE_FOLDER_ID],
        mimeType: "text/plain",
      },
      media: {
        mimeType: "text/plain",
        body: "OAuth Google Drive funcionando correctamente",
      },
      fields: "id,name",
    });

    testDriveFileId = file.data.id;

    console.log(
      "✅ ESCRITURA DRIVE OK:",
      file.data.name
    );

    // Eliminar archivo temporal
    await drive.files.delete({
      fileId: testDriveFileId,
    });

    testDriveFileId = null;

    console.log("✅ LIMPIEZA DRIVE OK");

    console.log(
      "\n🎯 GOOGLE SHEETS + DRIVE: LECTURA Y ESCRITURA VALIDADAS"
    );
  } catch (error) {
    console.error("\n❌ ERROR DE VALIDACIÓN");

    console.error(
      error.response?.data || error.message
    );
  }
}

testGoogle();