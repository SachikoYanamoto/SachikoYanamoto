// 本人用ページ: 日記・公演・プロフィールを編集して data/*.json に保存する
const state = { posts: [], events: [], profile: {} };
let loaded = false; // 読み込み前・失敗時に保存すると既存データを空で上書きしてしまうため
let editingPost = null; // 編集中の日記(新規なら id なしのオブジェクト)
let editingEvent = null;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const src = (path) => (path ? Store.imageUrl(path) : "");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = "toast"), isError ? 6000 : 2500);
}

// ---------- 読み込み・保存(保存先は store.js が決める) ----------
function showProblem(html) {
  $("#offline").innerHTML = html;
  $("#offline").hidden = false;
}

async function loadAll() {
  try {
    for (const name of ["posts", "events", "profile"]) state[name] = await Store.read(name);
    loaded = true;
    document.body.classList.remove("loading");
  } catch (e) {
    showProblem(Store.mode === "local"
      ? "保存用のプログラムが動いていません。<br>フォルダの中の <b>「起動.bat」</b> をダブルクリックしてから、このページを開き直してください。"
      : `データを読み込めませんでした。<br>${esc(e.message)}`);
  }
}

async function save(name) {
  if (!loaded) {
    toast("データを読み込めていないため保存できません。ページを開き直してください。", true);
    return false;
  }
  setBusy(true);
  try {
    await Store.write(name, state[name]);
    return true;
  } catch (e) {
    toast("保存できませんでした:" + e.message, true);
    return false;
  } finally {
    setBusy(false);
  }
}

// 公開サイトから保存したときは、反映まで少しかかることを伝える
const saved = (msg) => (Store.mode === "github" ? msg + "(サイトには1〜2分で反映されます)" : msg);

// 保存中はボタンを押せないようにする(二重保存の防止)
function setBusy(busy) {
  document.querySelectorAll("button[type=submit]").forEach((b) => {
    b.disabled = busy;
    b.textContent = busy ? "保存中…" : "保存する";
  });
}

// 大きな写真は長辺1800pxに縮小してから送る(サイトが重くならないように)
function shrink(file) {
  return new Promise((resolve) => {
    if (file.type === "image/gif") return resolve(file);
    const img = new Image();
    img.onload = () => {
      const max = 1800;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file), "image/jpeg", 0.88);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function upload(file, kind) {
  return Store.uploadImage(kind, await shrink(file));
}

// 画像1枚の枠(チラシ表・裏、プロフィール写真)
function renderSlot(el, path, kind, onChange) {
  el.innerHTML = path
    ? `<figure><img src="${esc(src(path))}" alt=""><button type="button" class="remove" title="外す">×</button></figure>`
    : `<label class="file-btn">画像を選ぶ<input type="file" accept="image/*" hidden></label>`;
  el.querySelector(".remove")?.addEventListener("click", () => onChange(""));
  el.querySelector("input")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    el.innerHTML = "アップロード中…";
    try {
      onChange(await upload(file, kind));
    } catch (err) {
      toast("画像を保存できませんでした:" + err.message, true);
      onChange("");
    }
  });
}

// ---------- タブ ----------
$(".tabs").addEventListener("click", (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  for (const name of ["posts", "events", "profile"]) $(`#tab-${name}`).hidden = name !== tab;
});

// ---------- 日記 ----------
function renderPosts() {
  const list = [...state.posts].sort((a, b) => b.date.localeCompare(a.date));
  $("#posts-items").innerHTML = list.length
    ? list.map((p) => `
      <li data-id="${esc(p.id)}">
        <span class="d">${p.date.replaceAll("-", "/")}</span>
        <span class="t">${esc(p.title)}${p.published === false ? '<span class="badge">下書き</span>' : ""}</span>
        <span class="edit">編集 ›</span>
      </li>`).join("")
    : `<li class="empty">まだ日記はありません</li>`;
}

function openPost(post) {
  editingPost = structuredClone(post);
  const f = $("#post-form");
  f.date.value = editingPost.date;
  f.elements.title.value = editingPost.title;
  f.body.value = editingPost.body;
  f.draft.checked = editingPost.published === false;
  $("#post-form-title").textContent = editingPost.id ? "日記を編集" : "新しい日記";
  $("#delete-post").hidden = !editingPost.id;
  renderPostImages();
  $("#posts-list").hidden = true;
  f.hidden = false;
  window.scrollTo(0, 0);
}

function renderPostImages() {
  $("#post-images").innerHTML = editingPost.images
    .map((p, i) => `<figure><img src="${esc(src(p))}" alt=""><button type="button" class="remove" data-i="${i}" title="外す">×</button></figure>`)
    .join("");
}

function closePost() {
  editingPost = null;
  $("#post-form").hidden = true;
  $("#posts-list").hidden = false;
  renderPosts();
}

$("#new-post").addEventListener("click", () => openPost({ date: today(), title: "", body: "", images: [], published: true }));
$("#posts-items").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) openPost(state.posts.find((p) => p.id === li.dataset.id));
});
$("#post-images").addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove")) return;
  editingPost.images.splice(Number(e.target.dataset.i), 1);
  renderPostImages();
});
$("#post-image-input").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  for (const file of files) {
    toast("写真をアップロード中…");
    try {
      editingPost.images.push(await upload(file, "posts"));
      renderPostImages();
    } catch (err) {
      toast("写真を保存できませんでした:" + err.message, true);
    }
  }
  toast("写真を追加しました");
});
$("#post-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  Object.assign(editingPost, {
    date: f.date.value,
    title: f.elements.title.value.trim(),
    body: f.body.value,
    published: !f.draft.checked,
  });
  const isNew = !editingPost.id;
  if (isNew) {
    editingPost.id = newId();
    state.posts.push(editingPost);
  } else {
    state.posts[state.posts.findIndex((p) => p.id === editingPost.id)] = editingPost;
  }
  if (await save("posts")) {
    toast(saved(editingPost.published ? "保存しました" : "下書きとして保存しました"));
    closePost();
  }
});
$("#delete-post").addEventListener("click", async () => {
  if (!confirm(`「${editingPost.title}」を削除します。よろしいですか?`)) return;
  state.posts = state.posts.filter((p) => p.id !== editingPost.id);
  if (await save("posts")) {
    toast(saved("削除しました"));
    closePost();
  }
});

// ---------- 公演 ----------
function renderEvents() {
  const list = [...state.events].sort((a, b) => b.date.localeCompare(a.date));
  $("#events-items").innerHTML = list.length
    ? list.map((ev) => `
      <li data-id="${esc(ev.id)}">
        ${ev.flyer ? `<img class="thumb" src="${esc(src(ev.flyer))}" alt="">` : `<span class="thumb"></span>`}
        <span class="d">${ev.date.replaceAll("-", "/")}</span>
        <span class="t">${esc(ev.title)}<span class="badge">${esc(ev.category)}</span></span>
        <span class="edit">編集 ›</span>
      </li>`).join("")
    : `<li class="empty">まだ公演はありません</li>`;
}

const EVENT_FIELDS = ["date", "time", "category", "title", "venue", "performers", "program", "description"];

function openEvent(ev) {
  editingEvent = structuredClone(ev);
  const f = $("#event-form");
  for (const k of EVENT_FIELDS) f.elements[k].value = editingEvent[k] ?? "";
  $("#event-form-title").textContent = editingEvent.id ? "公演を編集" : "公演を追加";
  $("#delete-event").hidden = !editingEvent.id;
  renderFlyers();
  $("#events-list").hidden = true;
  f.hidden = false;
  window.scrollTo(0, 0);
}

function renderFlyers() {
  document.querySelectorAll("#event-form .flyer-slot").forEach((el) => {
    const key = el.dataset.slot;
    renderSlot(el, editingEvent[key], "flyers", (path) => {
      editingEvent[key] = path;
      renderFlyers();
    });
  });
}

function closeEvent() {
  editingEvent = null;
  $("#event-form").hidden = true;
  $("#events-list").hidden = false;
  renderEvents();
}

$("#new-event").addEventListener("click", () =>
  openEvent({ date: today(), time: "", category: "コンサート", title: "", venue: "", performers: "", program: "", description: "", flyer: "", flyerBack: "" })
);
$("#events-items").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) openEvent(state.events.find((ev) => ev.id === li.dataset.id));
});
$("#event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  for (const k of EVENT_FIELDS) editingEvent[k] = f.elements[k].value.trim();
  if (!editingEvent.id) {
    editingEvent.id = newId();
    state.events.push(editingEvent);
  } else {
    state.events[state.events.findIndex((ev) => ev.id === editingEvent.id)] = editingEvent;
  }
  if (await save("events")) {
    toast(saved("保存しました"));
    closeEvent();
  }
});
$("#delete-event").addEventListener("click", async () => {
  if (!confirm(`「${editingEvent.title}」を削除します。よろしいですか?`)) return;
  state.events = state.events.filter((ev) => ev.id !== editingEvent.id);
  if (await save("events")) {
    toast(saved("削除しました"));
    closeEvent();
  }
});

// 編集をやめる(書きかけがあれば確認)
document.querySelectorAll("[data-cancel]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (!confirm("保存せずに戻りますか?")) return;
    if (editingPost) closePost();
    if (editingEvent) closeEvent();
  })
);

// ---------- プロフィール ----------
const PROFILE_FIELDS = ["name", "nameEn", "role", "catchphrase", "bio", "contact"];

function renderProfile() {
  const f = $("#profile-form");
  for (const k of PROFILE_FIELDS) f.elements[k].value = state.profile[k] ?? "";
  renderPhoto();
}
function renderPhoto() {
  renderSlot($('#profile-form [data-slot="photo"]'), state.profile.photo, "profile", (path) => {
    state.profile.photo = path;
    renderPhoto();
  });
}
$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  for (const k of PROFILE_FIELDS) state.profile[k] = e.target.elements[k].value.trim();
  if (await save("profile")) toast(saved("プロフィールを保存しました"));
});

// 保存せずにページを閉じようとしたら確認
window.addEventListener("beforeunload", (e) => {
  if (editingPost || editingEvent) e.preventDefault();
});

// ---------- 初回設定(公開サイトで開いたときだけ) ----------
function showSetup() {
  const guess = Store.guessRepo();
  const f = $("#setup-form");
  f.elements.owner.value = guess.owner;
  f.elements.repo.value = guess.repo;
  $(".tabs").hidden = true;
  $("main").hidden = true;
  $("#setup").hidden = false;
  document.body.classList.remove("loading");
}

$("#setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector("button");
  btn.disabled = true;
  btn.textContent = "確認中…";
  try {
    await Store.connect({ owner: f.elements.owner.value, repo: f.elements.repo.value, token: f.elements.token.value });
    location.reload();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = "この端末で使えるようにする";
  }
});

$("#forget").addEventListener("click", () => {
  if (!confirm("この端末の設定(鍵)を消します。もう一度使うには設定し直しが必要です。よろしいですか?")) return;
  Store.forget();
  location.reload();
});

(async () => {
  if (Store.mode === "github") {
    if (!Store.ready()) return showSetup();
    $("#forget").hidden = false;
  }
  await loadAll();
  renderPosts();
  renderEvents();
  renderProfile();
})();
