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
    <div className="min-h-screen bg-[#06040C] relative overflow-hidden flex flex-col">
      {/* Background ambient effects */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}></div>
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #d4af37 0%, transparent 60%)' }}></div>

      <header className="relative z-10 flex items-center justify-between border-b border-[#d4af37]/10 bg-black/40 backdrop-blur-md px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 border border-[#d4af37]/40 flex items-center justify-center transform rotate-45">
            <div className="w-4 h-4 bg-[#d4af37]/20 -rotate-45 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-[#d4af37]"></div>
            </div>
          </div>
          <div>
            <h1 className="font-serif text-lg tracking-[0.2em] font-semibold text-white">ASCEND</h1>
            <p className="text-xs text-[#d4af37]/70 uppercase tracking-widest font-medium">
              {session?.user?.name || session?.user?.email}
            </p>
          </div>
        </div>
        <SignOutButton />
      </header>

      <main className="relative z-10 flex-1 mx-auto w-full max-w-6xl px-6 py-12">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-serif text-white mb-2">Private Contacts</h2>
            <p className="text-sm text-gray-400 font-light">
              High-net-worth individuals requesting access via Messenger.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/5 px-4 py-1.5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse"></span>
            <span className="text-xs uppercase tracking-[0.2em] text-[#d4af37] font-semibold">
              {contacts.length} {contacts.length === 1 ? "Record" : "Records"}
            </span>
          </div>
        </div>

        {loadError ? (
          <div className="glass-card border-red-900/50 p-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-red-400">⚠️</span>
              <p className="font-medium text-white">Integration Error: Google Sheets</p>
            </div>
            <p className="text-sm text-red-400/80 mb-4">{loadError}</p>
            <p className="text-sm text-gray-400 font-light">
              Please ensure your <code className="text-[#d4af37] bg-black/40 px-1.5 py-0.5 rounded">.env</code> is properly configured with your Service Account credentials and Sheet ID.
            </p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 border border-[#d4af37]/20 flex items-center justify-center rounded-full mb-6">
              <span className="text-[#d4af37] text-2xl opacity-50">✦</span>
            </div>
            <h3 className="text-lg font-serif text-white mb-2">No contacts pending</h3>
            <p className="text-sm text-gray-400 font-light max-w-sm">
              Your CRM is currently empty. New messenger leads will automatically populate here.
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-black/40 border-b border-[#d4af37]/10">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Client Name</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Action</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Profile URL</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Time Logged</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Lead Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {contacts.map((contact, i) => {
                    const messengerUrl = getMessengerUrl(contact.profileUrl);
                    
                    // Helper to determine styling for the Lead Event badge
                    let badgeClass = "bg-gray-500/10 text-gray-400 border-gray-500/20"; // Default
                    const ev = contact.leadEvent.toLowerCase();
                    if (ev.includes("comment")) {
                      badgeClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                    } else if (ev.includes("dm")) {
                      badgeClass = "bg-[#d4af37]/10 text-[#d4af37] border-[#d4af37]/30";
                    } else if (ev.includes("process completed") || ev.includes("complete")) {
                      badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    }
                    
                    return (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-serif text-base text-white">{contact.name}</td>
                        <td className="px-6 py-4">
                          {messengerUrl ? (
                            <a
                              href={messengerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-royal text-xs px-4 py-1.5 rounded-md"
                            >
                              Message
                            </a>
                          ) : (
                            <span className="text-gray-600 italic">Unavailable</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {contact.profileUrl ? (
                            <a
                              href={contact.profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#d4af37] hover:text-[#f1dc8e] hover:underline transition-colors"
                            >
                              View Profile
                            </a>
                          ) : (
                            <span className="text-gray-600 italic">Private</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-400 font-light text-sm">{contact.contactedAt}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold border ${badgeClass}`}>
                            {contact.leadEvent}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
