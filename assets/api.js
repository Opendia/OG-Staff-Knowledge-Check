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

window.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
};
