// データの読み書き先
//   PC(起動.bat)で開いたとき … 手元の server.py に保存
//   公開サイト(GitHub Pages)で開いたとき … GitHub のリポジトリに直接保存(スマホからも可)
const Store = (() => {
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const CONFIG_KEY = "sachiko-admin-github";

  // ---------- ローカル(server.py) ----------
  const local = {
    mode: "local",
    ready: () => true,
    async read(name) {
      const res = await fetch(`../data/${name}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`読み込み失敗 (${res.status})`);
      return res.json();
    },
    async write(name, data) {
      const out = await postJson(`/api/save/${name}`, data);
      if (!out.ok) throw new Error(out.error);
    },
    async uploadImage(kind, file) {
      const out = await postJson("/api/upload", { kind, filename: file.name, data: await toBase64(file) });
      if (!out.ok) throw new Error(out.error);
      return out.path;
    },
    imageUrl: (path) => "../" + path,
  };

  async function postJson(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }

  // ---------- GitHub ----------
  const shas = {}; // ファイルごとの最新版の目印(上書き事故を防ぐため保存時に送る)

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null;
    } catch {
      return null;
    }
  }

  // https://<owner>.github.io/<repo>/admin/ から owner と repo を推測する
  function guessRepo() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    if (!m) return { owner: "", repo: "" };
    const first = location.pathname.split("/").filter(Boolean)[0];
    return { owner: m[1], repo: first && first !== "admin" ? first : location.hostname };
  }

  async function api(cfg, path, options = {}) {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (res.status === 401) throw new Error("鍵(トークン)が無効か、期限が切れています。設定をやり直してください。");
    if (res.status === 403 || res.status === 404) throw new Error("このリポジトリに保存する権限がありません。鍵の設定を確認してください。");
    if (res.status === 409 || res.status === 422) throw new Error("別の場所で先に更新されていました。ページを開き直してからもう一度保存してください。");
    if (!res.ok) throw new Error(`GitHub エラー (${res.status})`);
    return res.json();
  }

  const github = {
    mode: "github",
    cfg: loadConfig(),
    ready() {
      return !!this.cfg?.token;
    },
    async connect({ owner, repo, token }) {
      const cfg = { owner: owner.trim(), repo: repo.trim(), token: token.trim() };
      const info = await api(cfg, "");
      if (!info.permissions?.push) throw new Error("この鍵では保存できません(Contents の書き込み権限が必要です)。");
      cfg.branch = info.default_branch;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      this.cfg = cfg;
    },
    forget() {
      localStorage.removeItem(CONFIG_KEY);
      this.cfg = null;
    },
    async read(name) {
      const path = `data/${name}.json`;
      const file = await api(this.cfg, `/contents/${path}?ref=${encodeURIComponent(this.cfg.branch)}&t=${Date.now()}`);
      shas[path] = file.sha;
      return JSON.parse(decodeUtf8(file.content));
    },
    async write(name, data) {
      const path = `data/${name}.json`;
      const out = await putFile(this.cfg, path, encodeUtf8(JSON.stringify(data, null, 2) + "\n"), `${LABELS[name]}を更新`, shas[path]);
      shas[path] = out.content.sha;
    },
    async uploadImage(kind, file) {
      const ext = (file.name.match(/\.\w+$/) || [".jpg"])[0].toLowerCase();
      const path = `images/${kind}/${stamp()}${ext}`;
      await putFile(this.cfg, path, await toBase64(file), "画像を追加");
      return path;
    },
    // 公開ページへの反映は1〜2分かかるので、本人用ページではリポジトリから直接表示する
    imageUrl(path) {
      if (!this.cfg || path.endsWith(".svg")) return "../" + path;
      return `https://raw.githubusercontent.com/${this.cfg.owner}/${this.cfg.repo}/${this.cfg.branch}/${path}`;
    },
  };

  const LABELS = { posts: "日記", events: "公演", profile: "プロフィール" };

  function putFile(cfg, path, base64, message, sha) {
    return api(cfg, `/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: base64, branch: cfg.branch, ...(sha ? { sha } : {}) }),
    });
  }

  function stamp() {
    const t = new Date();
    const p = (n, w = 2) => String(n).padStart(w, "0");
    return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}-${p(t.getMilliseconds(), 3)}`;
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function encodeUtf8(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function decodeUtf8(base64) {
    const bin = atob(base64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  const store = isLocal ? local : github;
  store.guessRepo = guessRepo;
  return store;
})();
