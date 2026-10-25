// 閲覧用ページ共通の処理
const Site = (() => {
  async function load(name) {
    const res = await fetch(`data/${name}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`data/${name}.json を読み込めませんでした`);
    return res.json();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // 本文: 空行で段落、改行は <br>、URL はリンクにする
  function formatBody(text) {
    return String(text ?? "")
      .trim()
      .split(/\n\s*\n/)
      .map((p) => "<p>" + esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>") + "</p>")
      .join("");
  }

  function dateParts(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m, d, wd: "日月火水木金土"[new Date(y, m - 1, d).getDay()] };
  }

  function formatDate(iso) {
    if (!iso) return "";
    const { y, m, d, wd } = dateParts(iso);
    return `${y}年${m}月${d}日(${wd})`;
  }

  const dotDate = (iso) => iso.replaceAll("-", ".");

  function today() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  function header(active) {
    const links = [
      ["index.html", "トップ", "home"],
      ["diary.html", "日記", "diary"],
      ["concerts.html", "公演・チラシ", "concerts"],
    ];
    document.getElementById("site-header").innerHTML = `
      <div class="inner">
        <a class="brand" href="index.html"><span class="ja">柳本幸子</span><span class="en">Sachiko Yanamoto, soprano</span></a>
        <nav class="site-nav">${links.map(([href, label, key]) => `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`).join("")}</nav>
      </div>`;
    document.getElementById("site-footer").innerHTML = `
      <div class="inner"><span class="latin">Sachiko Yanamoto — soprano</span><span>© ${new Date().getFullYear()} 柳本幸子</span></div>`;
  }

  // 公演予定の1行(日付・公演名・会場・チラシ)。tag は "a" か "button"
  function schedRow(e, tag, attrs) {
    const { y, m, d, wd } = dateParts(e.date);
    const where = [e.time, e.venue].filter(Boolean).join(" / ");
    return `
      <li><${tag} ${attrs}>
        <span class="date"><span class="day">${d}</span><span class="ym">${y}.${String(m).padStart(2, "0")} (${wd})</span></span>
        <span>
          <span class="cat">${esc(e.category)}</span>
          <span class="t">${esc(e.title)}</span>
          ${where ? `<span class="v">${esc(where)}</span>` : ""}
        </span>
        ${e.flyer ? `<img class="thumb" src="${esc(e.flyer)}" alt="">` : "<span></span>"}
      </${tag}></li>`;
  }

  const publishedPosts = (posts) => posts.filter((p) => p.published !== false).sort((a, b) => b.date.localeCompare(a.date));
  const sortedEvents = (events) => [...events].sort((a, b) => b.date.localeCompare(a.date));

  return { load, esc, formatBody, formatDate, dotDate, dateParts, today, header, schedRow, publishedPosts, sortedEvents };
})();
