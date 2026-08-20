import { google } from "googleapis";

export type Contact = {
  name: string;
  profileUrl: string;
  contactedAt: string;
};

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
// Matches the range the Chrome extension appends rows into
// (DM_CONTACTS_SHEET_RANGE in background/background.js).
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "Sheet1!A:C";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private keys stored in .env often have their newlines escaped as "\n" —
  // convert them back to real newlines or the JWT signature will fail.
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — see .env.example."
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

/**
 * Fetches DM contacts logged by the Chrome extension (name, profile URL,
 * contacted-at timestamp) from the configured Google Sheet, via a Google
 * service account — the sheet must be shared with that service account's
 * email (Viewer access) for this to work.
 */
export async function getContacts(): Promise<Contact[]> {
  if (!SHEET_ID) {
    throw new Error("Missing GOOGLE_SHEET_ID — see .env.example.");
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });

  const rows = res.data.values || [];

  // First row is the header ("Name", "URL", "Date/Time") — skip it, and
  // skip any fully-blank rows.
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => (cell || "").toString().trim().length > 0))
    .map((row) => ({
      name: row[0] || "Unknown",
      profileUrl: row[1] || "",
      contactedAt: row[2] || "",
    }));
}
