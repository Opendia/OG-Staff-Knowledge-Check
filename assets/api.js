// Talks to the Google Apps Script backend.
// Sent as text/plain so the browser makes a "simple" request Google accepts.
window.api = async function (action, data) {
  const url = (window.STAFF_TEST_API || "").trim();
  if (!url) throw new Error("This site isn't connected yet. An admin needs to add the Google script link to assets/config.js.");
  let res;
  try {
    res = await fetch(url, { method: "POST", body: JSON.stringify(Object.assign({ action }, data || {})) });
  } catch (e) {
    throw new Error("Couldn't reach the server. Check your internet connection and try again.");
  }
  let out;
  try { out = await res.json(); } catch (e) { throw new Error("The server sent back something unexpected. Check the script is deployed as a web app with access set to Anyone."); }
  if (!out.ok) throw new Error(out.error || "Something went wrong.");
  return out;
};

window.store = {
  get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
  set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
  del(k, s) { try { (s ? sessionStorage : localStorage).removeItem(k); } catch (e) {} }
};

window.cookie = {
  get(k) {
    const m = document.cookie.split("; ").find(c => c.indexOf(k + "=") === 0);
    return m ? decodeURIComponent(m.slice(k.length + 1)) : "";
  },
  set(k, v, days) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = k + "=" + encodeURIComponent(v) + "; Max-Age=" + Math.round(days * 86400) + "; Path=" + cookiePath() + "; SameSite=Strict" + secure;
  },
  del(k) { document.cookie = k + "=; Max-Age=0; Path=" + cookiePath() + "; SameSite=Strict"; }
};
// Scope the cookie to this site's folder (e.g. /repo-name/) rather than the whole github.io domain.
function cookiePath() { const p = location.pathname; return p.slice(0, p.lastIndexOf("/") + 1) || "/"; }

window.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
};
