// Derives an m.me deep link (opens directly into a Messenger conversation
// with that person) from the Facebook profile URL logged by the extension.
export function getMessengerUrl(profileUrl: string): string | null {
  if (!profileUrl) return null;

  let url: URL;
  try {
    url = new URL(profileUrl);
  } catch {
    return null;
  }

  if (!/(^|\.)facebook\.com$/.test(url.hostname)) return null;

  if (url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    return id ? `https://m.me/${id}` : null;
  }

  const username = url.pathname.split("/").filter(Boolean)[0];
  return username ? `https://m.me/${username}` : null;
}
