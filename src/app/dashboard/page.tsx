import { auth } from "@/auth";
import { getContacts } from "@/lib/googleSheets";
import { getMessengerUrl } from "@/lib/messenger";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage() {
  const session = await auth();

  let contacts: Awaited<ReturnType<typeof getContacts>> = [];
  let loadError: string | null = null;

  try {
    contacts = await getContacts();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load contacts.";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">ASCEND</h1>
          <p className="text-xs text-slate-500">
            Signed in as {session?.user?.name || session?.user?.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Messenger Contacts</h2>
            <p className="text-sm text-slate-500">
              People who messaged a DM keyword, logged by the FB Auto Reply extension.
            </p>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-400">
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </span>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            <p className="font-medium">Couldn&apos;t load the Google Sheet.</p>
            <p className="mt-1 text-amber-400/80">{loadError}</p>
            <p className="mt-2 text-amber-400/80">
              Check <code className="rounded bg-black/30 px-1 py-0.5">.env</code> has
              GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and
              GOOGLE_SHEET_ID set, and that the sheet is shared with the service account&apos;s
              email.
            </p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
            No contacts logged yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Profile</th>
                  <th className="px-4 py-3 font-medium">Contacted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {contacts.map((contact, i) => {
                  const messengerUrl = getMessengerUrl(contact.profileUrl);
                  return (
                    <tr key={i} className="hover:bg-slate-900/60">
                      <td className="px-4 py-3 font-medium text-slate-100">{contact.name}</td>
                      <td className="px-4 py-3">
                        {messengerUrl ? (
                          <a
                            href={messengerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
                          >
                            Message
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.profileUrl ? (
                          <a
                            href={contact.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            View profile
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{contact.contactedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
