const SUPA_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);

const $ = (id) => document.getElementById(id);
const drawer = $("drawer");
const panel = $("drawer-panel");
let session = null;
let profile = null;

function hourKey(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
  return x.toISOString().slice(0, 13) + ":00Z";
}

function tick() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("hour-key").textContent = "edition " + hourKey(now);
}
setInterval(tick, 1000); tick();

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function loadEdition() {
  const { data } = await sb.from("desk_editions").select("*, desk_slips(title, body, author_id)").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  $("headline").textContent = data.headline;
  $("lede").textContent = data.lede;
  const pin = $("pin");
  if (data.desk_slips) {
    pin.classList.remove("hidden");
    pin.innerHTML = `<p class="kicker">Pinned slip</p><h3>${escapeHtml(data.desk_slips.title)}</h3><p>${escapeHtml(data.desk_slips.body)}</p>`;
  } else {
    pin.classList.add("hidden");
    pin.innerHTML = "";
  }
}

async function loadWall() {
  const { data } = await sb.from("desk_slips").select("id, title, body, created_at, author_id, desk_profiles(handle, display_name)").eq("is_public", true).order("created_at", { ascending: false }).limit(48);
  const grid = $("wall-grid");
  if (!data || !data.length) {
    grid.innerHTML = `<article class="card" style="--r:-1deg"><h3>Empty wall</h3><p>Sign in, write a slip, and mark it public.</p></article>`;
    return;
  }
  grid.innerHTML = data.map((s, i) => {
    const who = s.desk_profiles?.handle || "anon";
    const rot = ((i % 5) - 2) * 0.7;
    return `<article class="card" style="--r:${rot}deg"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p><div class="meta">@${escapeHtml(who)} · ${new Date(s.created_at).toLocaleString()}</div></article>`;
  }).join("");
}

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  profile = null;
  if (session) {
    const p = await sb.from("desk_profiles").select("*").eq("id", session.user.id).maybeSingle();
    profile = p.data;
  }
  $("auth-btn").textContent = session ? (profile?.handle ? "@" + profile.handle : "Account") : "Sign in";
  $("desk-btn").style.display = session ? "" : "none";
}

function openDrawer(mode) {
  drawer.hidden = false;
  if (mode === "auth") renderAuth();
  if (mode === "desk") renderDesk();
  if (mode === "wall") {
    drawer.hidden = true;
    document.getElementById("wall").scrollIntoView({ behavior: "smooth" });
  }
}

function closeDrawer() { drawer.hidden = true; }

drawer.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); });
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openDrawer(b.dataset.open)));
$("auth-btn").addEventListener("click", () => {
  if (session) openDrawer("desk");
  else openDrawer("auth");
});

function renderAuth() {
  panel.innerHTML = `
    <button class="close" type="button" aria-label="Close">×</button>
    <p class="kicker">Key</p>
    <h2 style="font-family:Fraunces,serif;margin:0 0 8px">Sign in to the desk</h2>
    <p style="color:var(--ink-soft)">Email and a password. Your slips stay until you delete them.</p>
    <form id="auth-form">
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" /></div>
      <div class="field"><label>Password</label><input name="password" type="password" required minlength="6" autocomplete="current-password" /></div>
      <p class="err" id="auth-err"></p>
      <div class="row">
        <button class="ink" name="intent" value="in" type="submit">Sign in</button>
        <button class="ghost" name="intent" value="up" type="submit">Create desk</button>
      </div>
    </form>`;
  panel.querySelector(".close").onclick = closeDrawer;
  panel.querySelector("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const intent = e.submitter?.value || "in";
    const fd = new FormData(e.target);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const err = $("auth-err");
    err.textContent = "";
    const fn = intent === "up" ? sb.auth.signUp({ email, password }) : sb.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    if (error) { err.textContent = error.message; return; }
    if (intent === "up") err.textContent = "Check your email if confirmation is on. Otherwise you are in.";
    await refreshAuth();
    if (session) renderDesk();
  });
}

async function renderDesk() {
  if (!session) return renderAuth();
  const { data: slips } = await sb.from("desk_slips").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  panel.innerHTML = `
    <button class="close" type="button">×</button>
    <p class="kicker">Your desk</p>
    <h2 style="font-family:Fraunces,serif;margin:0 0 4px">${escapeHtml(profile?.display_name || "Writer")}</h2>
    <p style="color:var(--ink-soft);margin-top:0">@${escapeHtml(profile?.handle || "pending")}</p>
    <form id="slip-form">
      <div class="field"><label>Title</label><input name="title" maxlength="140" required /></div>
      <div class="field"><label>Slip</label><textarea name="body" maxlength="8000" required></textarea></div>
      <label class="check"><input type="checkbox" name="is_public" /> Mark public — print it on the wall</label>
      <p class="err" id="slip-err"></p>
      <div class="row" style="margin-top:12px">
        <button class="ink" type="submit">File slip</button>
        <button class="ghost" type="button" id="out">Sign out</button>
      </div>
    </form>
    <div class="slip-list">${(slips || []).map((s) => `
      <div class="slip" data-id="${s.id}">
        <strong>${escapeHtml(s.title)}</strong>
        <div class="meta">${s.is_public ? "public" : "private"} · ${new Date(s.created_at).toLocaleString()}</div>
        <p>${escapeHtml(s.body)}</p>
        <button class="ghost" type="button" data-del="${s.id}">Remove</button>
      </div>`).join("") || "<p>No slips yet.</p>"}</div>`;
  panel.querySelector(".close").onclick = closeDrawer;
  panel.querySelector("#out").onclick = async () => { await sb.auth.signOut(); await refreshAuth(); closeDrawer(); };
  panel.querySelector("#slip-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await sb.from("desk_slips").insert({
      author_id: session.user.id,
      title: String(fd.get("title")).trim(),
      body: String(fd.get("body")).trim(),
      is_public: fd.get("is_public") === "on"
    });
    const box = panel.querySelector("#slip-err");
    if (error) { box.textContent = error.message; return; }
    await loadWall();
    renderDesk();
  });
  panel.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    await sb.from("desk_slips").delete().eq("id", b.dataset.del);
    await loadWall();
    renderDesk();
  }));
}

sb.auth.onAuthStateChange(async () => { await refreshAuth(); });

(async function boot() {
  await refreshAuth();
  await loadEdition();
  await loadWall();
})();
