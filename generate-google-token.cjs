const { authenticate } = require("@google-cloud/local-auth");
const keyfilePath = process.env.GOOGLE_OAUTH_CLIENT_PATH;

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

async function main() {
  try {
    if (!keyfilePath) throw new Error("Define GOOGLE_OAUTH_CLIENT_PATH con la ruta local del cliente OAuth.");
    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath,
    });

    console.log("\n✅ AUTORIZACIÓN COMPLETADA");

    if (auth.credentials.refresh_token) {
      console.log("\n✅ REFRESH TOKEN GENERADO");
      console.log(auth.credentials.refresh_token);
    } else {
      console.log("\n⚠️ Google no devolvió refresh token.");
    }
  } catch (error) {
    console.error("\n❌ ERROR:");
    console.error(error);
  }
}

main();
