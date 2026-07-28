const GUTENDEX_API = "https://gutendex.com/books/";
const OPEN_LIBRARY_API = "https://openlibrary.org/search.json";
const ARCHIVE_METADATA_API = "https://archive.org/metadata/";
const WIKISOURCE_API = "https://zh.wikisource.org/w/api.php";
const STORAGE_KEYS = {
  library: "shiye.library.v1",
  settings: "shiye.settings.v1",
  appTheme: "shiye.app-theme.v1",
};
const DB_NAME = "shiye-reader-content";
const DB_STORE = "books";
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  mode: "paged",
  readerTheme: "paper",
  fontSize: 19,
  lineHeight: 1.9,
  font: "serif",
};

const COVER_COLORS = ["#315f4f", "#34546d", "#7b493e", "#6d5a78", "#946b35", "#3d6568", "#6b7040"];

const BUILTIN_BOOKS = [
  {
    id: "gutenberg-24264",
    remoteId: 24264,
    provider: "gutenberg",
    readerKind: "gutenberg",
    title: "红楼梦",
    author: "曹雪芹",
    cover: "./assets/covers/hong-lou-meng.jpg",
    textUrl: "./library/hong-lou-meng.txt",
    sourceUrl: "https://www.gutenberg.org/ebooks/24264",
    language: "中文",
    rights: "公共领域",
  },
  {
    id: "gutenberg-23962",
    remoteId: 23962,
    provider: "gutenberg",
    readerKind: "gutenberg",
    title: "西游记",
    author: "吴承恩",
    cover: "./assets/covers/xi-you-ji.jpg",
    textUrl: "./library/xi-you-ji.txt",
    sourceUrl: "https://www.gutenberg.org/ebooks/23962",
    language: "中文",
    rights: "公共领域",
  },
  {
    id: "gutenberg-23863",
    remoteId: 23863,
    provider: "gutenberg",
    readerKind: "gutenberg",
    title: "水浒传",
    author: "施耐庵",
    cover: "./assets/covers/shui-hu-zhuan.jpg",
    textUrl: "./library/shui-hu-zhuan.txt",
    sourceUrl: "https://www.gutenberg.org/ebooks/23863",
    language: "中文",
    rights: "公共领域",
  },
  {
    id: "gutenberg-23950",
    remoteId: 23950,
    provider: "gutenberg",
    readerKind: "gutenberg",
    title: "三国志演义",
    author: "罗贯中",
    cover: "./assets/covers/san-guo-zhi-yan-yi.jpg",
    textUrl: "./library/san-guo-zhi-yan-yi.txt",
    sourceUrl: "https://www.gutenberg.org/ebooks/23950",
    language: "中文",
    rights: "公共领域",
  },
];

const state = {
  view: "home",
  source: "all",
  query: "",
  searchResults: [],
  searchNext: { gutenberg: null, openlibraryPage: null, wikisourceOffset: null },
  searchController: null,
  booksById: new Map(),
  library: readJSON(STORAGE_KEYS.library, []),
  settings: { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.settings, {}) },
  shelfSort: "recent",
  currentBook: null,
  currentText: "",
  progressFrame: 0,
  progressSaveTimer: 0,
  touchStart: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  applyAppTheme(localStorage.getItem(STORAGE_KEYS.appTheme) || "light");
  applyReaderSettings(false);
  refreshIcons();
  updateShelfCount();
  renderContinueReading();
  renderSearchIntro();
  renderShelf();
  loadFeatured();
  routeFromHash();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function cacheElements() {
  const ids = [
    "homeView", "searchView", "officialView", "shelfView", "searchForm", "searchInput", "featuredGrid",
    "searchGrid", "searchSummary", "loadMoreButton", "shelfGrid", "shelfSummary",
    "officialSearchForm", "officialSearchInput", "officialSearchGrid",
    "shelfToolbar", "shelfCount", "continueSection", "continueCard", "importButton",
    "mobileImportButton", "shelfImportButton", "fileInput", "themeToggle", "reader",
    "readerBack", "readerTitle", "readerAuthor", "readerModeToggle", "readerSettingsButton",
    "readerFullscreen", "readerProgressBar", "readerStage", "readerDocument", "readerPosition",
    "readerPercent", "readerHint", "readerLoading", "readerError", "readerErrorMessage",
    "readerRetry", "readerSourceLink", "pagePrev", "pageNext", "settingsDrawer",
    "drawerBackdrop", "closeSettings", "modeControl", "readerThemeControl", "fontSizeRange",
    "fontSizeOutput", "lineHeightRange", "lineHeightOutput", "fontControl", "toastRegion",
    "bookCardTemplate",
  ];
  for (const id of ids) elements[id] = document.getElementById(id);
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton && !viewButton.closest(".reader")) {
      showView(viewButton.dataset.view);
    }

    const navLink = event.target.closest("[data-nav]");
    if (navLink) {
      event.preventDefault();
      showView(navLink.dataset.nav);
    }
  });

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = elements.searchInput.value.trim();
    showView("search", false);
    if (query) performSearch(query);
    else renderSearchIntro();
  });

  elements.officialSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = elements.officialSearchInput.value.trim();
    state.query = query;
    elements.searchInput.value = query;
    renderOfficialSources(query);
    showView("official", false);
  });

  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.source = button.dataset.source;
      document.querySelectorAll(".filter-chip").forEach((item) => item.classList.toggle("active", item === button));
      if (state.query) performSearch(state.query);
    });
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.shelfSort = button.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("active", item === button));
      renderShelf();
    });
  });

  for (const container of [elements.featuredGrid, elements.searchGrid, elements.shelfGrid]) {
    container.addEventListener("click", handleBookGridClick);
  }

  elements.continueCard.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='continue']")) {
      const book = state.library.find((item) => item.id === elements.continueCard.dataset.bookId);
      if (book) openBook(book);
    }
  });

  elements.loadMoreButton.addEventListener("click", () => performSearch(state.query, true));

  for (const button of [elements.importButton, elements.mobileImportButton, elements.shelfImportButton]) {
    button.addEventListener("click", () => elements.fileInput.click());
  }
  elements.fileInput.addEventListener("change", handleFileImport);

  elements.themeToggle.addEventListener("click", () => {
    applyAppTheme(document.body.classList.contains("dark-app") ? "light" : "dark");
  });

  elements.readerBack.addEventListener("click", closeReader);
  elements.readerModeToggle.addEventListener("click", () => setReadingMode(state.settings.mode === "paged" ? "scroll" : "paged"));
  elements.readerSettingsButton.addEventListener("click", openSettings);
  elements.closeSettings.addEventListener("click", closeSettings);
  elements.drawerBackdrop.addEventListener("click", closeSettings);
  elements.pagePrev.addEventListener("click", () => turnPage(-1));
  elements.pageNext.addEventListener("click", () => turnPage(1));
  elements.readerRetry.addEventListener("click", () => state.currentBook && openBook(state.currentBook, true));

  elements.readerFullscreen.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await elements.reader.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      showToast("当前浏览器不支持全屏模式", "error");
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const icon = document.fullscreenElement ? "minimize" : "maximize";
    elements.readerFullscreen.innerHTML = `<i data-lucide="${icon}"></i>`;
    elements.readerFullscreen.title = document.fullscreenElement ? "退出全屏" : "全屏阅读";
    refreshIcons();
  });

  elements.modeControl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (button) setReadingMode(button.dataset.mode);
  });

  elements.readerThemeControl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-theme]");
    if (!button) return;
    state.settings.readerTheme = button.dataset.readerTheme;
    applyReaderSettings();
  });

  elements.fontControl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-font]");
    if (!button) return;
    preserveReaderPosition(() => {
      state.settings.font = button.dataset.font;
      applyReaderSettings();
    });
  });

  elements.fontSizeRange.addEventListener("input", () => {
    preserveReaderPosition(() => {
      state.settings.fontSize = Number(elements.fontSizeRange.value);
      applyReaderSettings();
    });
  });

  elements.lineHeightRange.addEventListener("input", () => {
    preserveReaderPosition(() => {
      state.settings.lineHeight = Number(elements.lineHeightRange.value);
      applyReaderSettings();
    });
  });

  elements.readerDocument.addEventListener("scroll", scheduleReaderProgress, { passive: true });
  elements.readerDocument.addEventListener("touchstart", handleTouchStart, { passive: true });
  elements.readerDocument.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("resize", debounce(() => preserveReaderPosition(() => {}), 120));
  window.addEventListener("hashchange", routeFromHash);
  window.addEventListener("beforeunload", saveCurrentProgress);

  document.addEventListener("keydown", (event) => {
    if (!elements.reader.classList.contains("open")) return;
    if (event.key === "Escape") {
      if (elements.settingsDrawer.classList.contains("open")) closeSettings();
      else closeReader();
      return;
    }
    if (state.settings.mode !== "paged") return;
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      turnPage(-1);
    }
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      turnPage(1);
    }
  });
}

function routeFromHash() {
  const requested = location.hash.replace("#", "");
  if (["home", "search", "official", "shelf"].includes(requested)) showView(requested, true);
}

function showView(view, fromRoute = false) {
  if (!["home", "search", "official", "shelf"].includes(view)) view = "home";
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (!fromRoute && location.hash !== `#${view}`) history.pushState(null, "", `#${view}`);
  if (view === "shelf") renderShelf();
  if (view === "home") renderContinueReading();
  if (view === "official") renderOfficialSources(state.query);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadFeatured() {
  const builtins = BUILTIN_BOOKS.map((book) => ({ ...book, progress: existingProgress(book.id) }));
  renderBookGrid(elements.featuredGrid, builtins);
  try {
    const url = new URL(GUTENDEX_API);
    url.searchParams.set("sort", "popular");
    const data = await fetchJSON(url, {}, 15000);
    const books = dedupeBooks([...builtins, ...data.results.slice(0, 8).map(normalizeGutenbergBook)]);
    renderBookGrid(elements.featuredGrid, books);
  } catch {}
}

function renderSearchIntro() {
  state.query = "";
  state.searchResults = [];
  elements.searchSummary.textContent = "同时检索 Gutenberg、Open Library 与中文维基文库。";
  elements.loadMoreButton.classList.add("hidden");
  renderEmpty(elements.searchGrid, {
    icon: "search",
    title: "输入书名或作者开始搜索",
    text: "结果来自公共领域与自由授权书库，中文古典作品可优先尝试中文维基文库。",
  });
}

function renderOfficialSources(query = "") {
  if (!elements.officialSearchGrid) return;
  const normalizedQuery = query.trim();
  elements.officialSearchInput.value = normalizedQuery;
  const links = officialSearchLinks(normalizedQuery);
  elements.officialSearchGrid.innerHTML = links.map((link) => `
    <article class="official-platform-card ${escapeAttribute(link.accent)}">
      <div class="official-platform-top">
        <span class="official-platform-mark">${escapeHTML(link.mark)}</span>
        <span class="official-platform-badge">官方平台</span>
      </div>
      <h2>${escapeHTML(link.label)}</h2>
      <p>${escapeHTML(link.description)}</p>
      <div class="official-platform-domain">${escapeHTML(link.domain)}</div>
      <a class="primary-button official-platform-action" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHTML(link.action)}<i data-lucide="arrow-up-right"></i>
      </a>
    </article>`).join("");
  refreshIcons();
}

async function performSearch(query, append = false) {
  if (!query) return renderSearchIntro();
  state.query = query;
  elements.searchInput.value = query;
  elements.searchSummary.textContent = `正在查找“${query}”…`;

  if (state.searchController) state.searchController.abort();
  state.searchController = new AbortController();
  const signal = state.searchController.signal;

  if (!append) {
    state.searchResults = [];
    state.searchNext = { gutenberg: null, openlibraryPage: null, wikisourceOffset: null };
    renderSkeletons(elements.searchGrid, 8);
  }
  elements.loadMoreButton.classList.add("hidden");
  elements.loadMoreButton.disabled = true;

  const tasks = [];
  if (state.source === "all" || state.source === "gutenberg") {
    const nextUrl = append ? state.searchNext.gutenberg : null;
    if (!append || nextUrl) tasks.push(searchGutenberg(query, nextUrl, signal));
  }
  if (state.source === "all" || state.source === "openlibrary") {
    const page = append ? state.searchNext.openlibraryPage : 1;
    if (!append || page !== null) tasks.push(searchOpenLibrary(query, page, signal));
  }
  if (state.source === "all" || state.source === "wikisource") {
    const offset = append ? state.searchNext.wikisourceOffset : 0;
    if (!append || offset !== null) tasks.push(searchWikisource(query, offset, signal));
  }

  try {
    const progressiveTasks = tasks.map((task) => task.then((result) => {
      if (!append && state.source === "all" && !signal.aborted && result.books.length) {
        renderBookGrid(elements.searchGrid, result.books);
        elements.searchSummary.textContent = `已从 ${sourceName(result.provider)} 找到 ${result.books.length} 个结果，正在继续检索其他开放书源…`;
      }
      return result;
    }));
    const settled = await Promise.allSettled(progressiveTasks);
    if (signal.aborted) return;
    const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
    const failures = settled.filter((item) => item.status === "rejected");
    if (!successes.length && failures.length) throw failures[0].reason;

    const incoming = mergeProviderResults(successes.map((item) => item.books), query);
    for (const result of successes) {
      if (result.provider === "gutenberg") state.searchNext.gutenberg = result.next;
      if (result.provider === "openlibrary") state.searchNext.openlibraryPage = result.next;
      if (result.provider === "wikisource") state.searchNext.wikisourceOffset = result.next;
    }

    state.searchResults = append ? dedupeBooks([...state.searchResults, ...incoming]) : incoming;
    renderBookGrid(elements.searchGrid, state.searchResults);

    const count = state.searchResults.length;
    const partial = failures.length ? "，部分书源暂时不可用" : "";
    elements.searchSummary.textContent = count ? `找到 ${count} 个开放结果${partial}` : `没有找到“${query}”的开放全文`;
    if (!count) {
      renderEmpty(elements.searchGrid, {
        icon: "book-x",
        title: "暂未发现免费开放全文",
        text: "这通常意味着作品仍受版权保护，或开放书库没有收录。可以更换书名、作者或导入合法获得的 TXT。",
        action: { label: "导入 TXT", icon: "file-up", callback: () => elements.fileInput.click() },
        officialLinks: officialSearchLinks(query),
      });
    }

    const hasMore = Boolean(state.searchNext.gutenberg || state.searchNext.openlibraryPage !== null || state.searchNext.wikisourceOffset !== null);
    elements.loadMoreButton.classList.toggle("hidden", !count || !hasMore);
  } catch (error) {
    if (error.name === "AbortError") return;
    if (!append) {
      renderGridError(elements.searchGrid, "搜索服务暂时无法连接", "请检查网络后再试，已收藏和已缓存的书仍可阅读。", () => performSearch(query));
    } else {
      showToast("加载更多失败，请稍后重试", "error");
    }
    elements.searchSummary.textContent = "开放书源暂时无法连接。";
  } finally {
    elements.loadMoreButton.disabled = false;
  }
}

async function searchGutenberg(query, nextUrl, signal) {
  const url = nextUrl ? new URL(forceHTTPS(nextUrl)) : new URL(GUTENDEX_API);
  if (!nextUrl) url.searchParams.set("search", query);
  const data = await fetchJSON(url, { signal }, 14000);
  return {
    provider: "gutenberg",
    books: data.results.map(normalizeGutenbergBook),
    next: data.next ? forceHTTPS(data.next) : null,
  };
}

async function searchWikisource(query, offset = 0, signal) {
  const url = new URL(WIKISOURCE_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srnamespace", "0");
  url.searchParams.set("srlimit", "20");
  url.searchParams.set("sroffset", String(offset || 0));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const data = await fetchJSON(url, { signal }, 7000);
  const books = (data.query?.search || []).map((item) => normalizeWikisourceBook(item));
  return {
    provider: "wikisource",
    books,
    next: data.continue?.sroffset ?? null,
  };
}

async function searchOpenLibrary(query, page = 1, signal) {
  const url = new URL(OPEN_LIBRARY_API);
  url.searchParams.set("q", query);
  url.searchParams.set("mode", "ebooks");
  url.searchParams.set("has_fulltext", "true");
  url.searchParams.set("public_scan_b", "true");
  url.searchParams.set("fields", "key,title,author_name,language,cover_i,ia,public_scan_b,first_publish_year");
  url.searchParams.set("limit", "20");
  url.searchParams.set("page", String(page || 1));
  const data = await fetchJSON(url, { signal }, 10000);
  const books = (data.docs || []).filter((item) => item.public_scan_b && item.ia?.length).map(normalizeOpenLibraryBook);
  return {
    provider: "openlibrary",
    books,
    next: data.docs?.length >= 20 ? (page || 1) + 1 : null,
  };
}

function normalizeGutenbergBook(raw) {
  const author = raw.authors?.map((item) => item.name).filter(Boolean).join("、") || "作者不详";
  const formats = raw.formats || {};
  return {
    id: `gutenberg-${raw.id}`,
    remoteId: raw.id,
    provider: "gutenberg",
    readerKind: "gutenberg",
    title: raw.title || "未命名作品",
    author,
    cover: safeURL(formats["image/jpeg"]),
    textUrl: pickReadableFormat(formats),
    sourceUrl: `https://www.gutenberg.org/ebooks/${raw.id}`,
    language: languageLabel(raw.languages?.[0]),
    subjects: raw.subjects || [],
    downloads: raw.download_count || 0,
    rights: raw.copyright === false ? "公共领域" : "开放访问",
    progress: existingProgress(`gutenberg-${raw.id}`),
  };
}

function normalizeWikisourceBook(raw) {
  return {
    id: `wikisource-${raw.pageid}`,
    remoteId: raw.pageid,
    provider: "wikisource",
    readerKind: "wikisource",
    title: decodeEntities(raw.title || "未命名作品"),
    author: "中文维基文库",
    cover: "",
    textUrl: "",
    sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(raw.title.replaceAll(" ", "_"))}`,
    language: "中文",
    subjects: [],
    rights: "公共领域 / 自由授权",
    progress: existingProgress(`wikisource-${raw.pageid}`),
  };
}

function normalizeOpenLibraryBook(raw) {
  const archiveId = raw.ia?.[0];
  const workId = String(raw.key || archiveId).replace(/^\/works\//, "");
  return {
    id: `openlibrary-${workId}-${archiveId}`,
    remoteId: archiveId,
    provider: "openlibrary",
    readerKind: "archive",
    title: raw.title || "未命名作品",
    author: raw.author_name?.join("、") || "作者不详",
    cover: raw.cover_i ? `https://covers.openlibrary.org/b/id/${raw.cover_i}-L.jpg` : "",
    textUrl: "",
    sourceUrl: `https://archive.org/details/${encodeURIComponent(archiveId)}`,
    language: languageLabel(raw.language?.[0]),
    subjects: [],
    rights: "公共扫描",
    progress: existingProgress(`openlibrary-${workId}-${archiveId}`),
  };
}

function pickReadableFormat(formats) {
  const entries = Object.entries(formats || {}).filter(([, value]) => typeof value === "string" && !value.endsWith(".zip"));
  const priorities = [
    ([type]) => type.includes("text/plain") && type.includes("utf-8"),
    ([type]) => type.includes("text/plain"),
    ([type]) => type.includes("text/html") && type.includes("utf-8"),
    ([type]) => type.includes("text/html"),
  ];
  for (const match of priorities) {
    const found = entries.find(match);
    if (found) return forceHTTPS(found[1]);
  }
  return "";
}

function mergeProviderResults(groups, query) {
  const nonempty = groups.filter((group) => group.length);
  if (nonempty.length < 2) return nonempty.flat();
  const chineseQuery = /[\u3400-\u9fff]/.test(query);
  const rank = chineseQuery
    ? { wikisource: 0, openlibrary: 1, gutenberg: 2 }
    : { gutenberg: 0, openlibrary: 1, wikisource: 2 };
  const ordered = [...nonempty].sort((a, b) => (rank[a[0]?.provider] ?? 9) - (rank[b[0]?.provider] ?? 9));
  const merged = [];
  const max = Math.max(...ordered.map((group) => group.length));
  for (let index = 0; index < max; index += 1) {
    for (const group of ordered) if (group[index]) merged.push(group[index]);
  }
  return dedupeBooks(merged);
}

function dedupeBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    if (seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });
}

function renderBookGrid(container, books) {
  container.replaceChildren();
  for (const book of books) {
    state.booksById.set(book.id, book);
    container.append(renderBookCard(book));
  }
  refreshIcons();
}

function renderBookCard(book) {
  const fragment = elements.bookCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".book-card");
  const cover = fragment.querySelector(".book-cover");
  const coverTitle = fragment.querySelector(".cover-title");
  const coverAuthor = fragment.querySelector(".cover-author");
  const coverSource = fragment.querySelector(".cover-source");
  const title = fragment.querySelector(".book-title");
  const author = fragment.querySelector(".book-author");
  const save = fragment.querySelector(".save-button");
  const progress = fragment.querySelector(".book-progress span");
  const sourceBadge = fragment.querySelector(".source-badge");
  const languageBadge = fragment.querySelector(".language-badge");

  card.dataset.bookId = book.id;
  title.textContent = book.title;
  title.title = book.title;
  author.textContent = book.author;
  coverTitle.textContent = book.title;
  coverAuthor.textContent = book.author;
  coverSource.textContent = book.provider === "wikisource" ? "WIKISOURCE" : book.provider === "openlibrary" ? "OPEN LIBRARY" : book.provider === "local" ? "LOCAL" : "GUTENBERG";
  cover.style.backgroundColor = coverColor(book.id);
  if (book.cover) {
    cover.classList.add("has-image");
    cover.style.backgroundImage = `url(${JSON.stringify(book.cover)})`;
  }
  const saved = state.library.some((item) => item.id === book.id);
  save.classList.toggle("saved", saved);
  save.title = saved ? "移出书架" : "加入书架";
  save.setAttribute("aria-label", save.title);
  save.innerHTML = `<i data-lucide="bookmark${saved ? "-check" : ""}"></i>`;
  progress.style.width = `${Math.round((book.progress || 0) * 100)}%`;
  progress.parentElement.classList.toggle("hidden", !(book.progress > 0));
  sourceBadge.textContent = sourceName(book.provider);
  languageBadge.textContent = book.language || "未知语言";
  return fragment;
}

function handleBookGridClick(event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const card = action.closest(".book-card");
  const book = state.booksById.get(card?.dataset.bookId) || state.library.find((item) => item.id === card?.dataset.bookId);
  if (!book) return;
  if (action.dataset.action === "read") openBook(book);
  if (action.dataset.action === "save") toggleShelf(book);
}

function toggleShelf(book) {
  const index = state.library.findIndex((item) => item.id === book.id);
  if (index >= 0) {
    state.library.splice(index, 1);
    writeLibrary();
    showToast(`《${book.title}》已移出书架`);
  } else {
    state.library.unshift({ ...serializableBook(book), addedAt: Date.now(), lastRead: 0, progress: book.progress || 0 });
    writeLibrary();
    showToast(`《${book.title}》已加入书架`);
  }
  refreshVisibleGrids();
}

function addToShelfIfNeeded(book) {
  const existing = state.library.find((item) => item.id === book.id);
  if (existing) return existing;
  const saved = { ...serializableBook(book), addedAt: Date.now(), lastRead: Date.now(), progress: book.progress || 0 };
  state.library.unshift(saved);
  writeLibrary();
  showToast("已自动加入书架，阅读进度会保存在本机");
  return saved;
}

function serializableBook(book) {
  return {
    id: book.id,
    remoteId: book.remoteId,
    provider: book.provider,
    readerKind: book.readerKind,
    title: book.title,
    author: book.author,
    cover: book.cover || "",
    textUrl: book.textUrl || "",
    sourceUrl: book.sourceUrl || "",
    language: book.language || "",
    rights: book.rights || "",
    localFileName: book.localFileName || "",
  };
}

function writeLibrary() {
  localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(state.library));
  updateShelfCount();
  renderContinueReading();
  if (state.view === "shelf") renderShelf();
}

function updateShelfCount() {
  elements.shelfCount.textContent = String(state.library.length);
}

function renderShelf() {
  const sorted = [...state.library].sort((a, b) => {
    if (state.shelfSort === "title") return a.title.localeCompare(b.title, "zh-CN");
    if (state.shelfSort === "added") return (b.addedAt || 0) - (a.addedAt || 0);
    return (b.lastRead || b.addedAt || 0) - (a.lastRead || a.addedAt || 0);
  });

  elements.shelfSummary.textContent = state.library.length ? `共 ${state.library.length} 本，进度保存在当前浏览器。` : "书架还是空的。";
  elements.shelfToolbar.classList.toggle("hidden", !state.library.length);
  if (!sorted.length) {
    renderEmpty(elements.shelfGrid, {
      icon: "library-big",
      title: "书架等待第一本书",
      text: "从发现页收藏开放作品，或导入手机中的 TXT 文件。",
      action: { label: "去发现", icon: "compass", callback: () => showView("search") },
    });
    return;
  }
  renderBookGrid(elements.shelfGrid, sorted);
}

function renderContinueReading() {
  const recent = [...state.library]
    .filter((book) => book.lastRead)
    .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0))[0];
  elements.continueSection.classList.toggle("hidden", !recent);
  if (!recent) return;
  const progress = Math.round((recent.progress || 0) * 100);
  const coverStyle = recent.cover
    ? `background-image:url(${escapeAttribute(JSON.stringify(recent.cover))});background-size:cover;background-position:center`
    : `background:${coverColor(recent.id)}`;
  elements.continueCard.dataset.bookId = recent.id;
  elements.continueCard.innerHTML = `
    <div class="continue-card">
      <div class="continue-cover" style="${coverStyle}"></div>
      <div class="continue-info">
        <h3>${escapeHTML(recent.title)}</h3>
        <p>${escapeHTML(recent.author)}</p>
        <div class="progress-line"><span style="width:${progress}%"></span></div>
        <span class="continue-progress-label">已读 ${progress}%</span>
      </div>
      <button class="primary-button" type="button" data-action="continue" aria-label="继续阅读">
        <i data-lucide="book-open"></i><span>继续阅读</span>
      </button>
    </div>`;
  refreshIcons();
}

function refreshVisibleGrids() {
  if (elements.featuredGrid.children.length && !elements.featuredGrid.querySelector(".error-state")) {
    const books = [...elements.featuredGrid.querySelectorAll(".book-card")].map((card) => state.booksById.get(card.dataset.bookId)).filter(Boolean);
    renderBookGrid(elements.featuredGrid, books);
  }
  if (state.searchResults.length) renderBookGrid(elements.searchGrid, state.searchResults);
  if (state.view === "shelf") renderShelf();
}

async function handleFileImport(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast("TXT 文件请控制在 20MB 以内", "error");
    return;
  }

  try {
    showToast("正在读取本地 TXT…");
    const buffer = await file.arrayBuffer();
    const text = decodeTextBuffer(buffer);
    if (text.trim().length < 20) throw new Error("文件内容太少或编码无法识别");
    const title = file.name.replace(/\.txt$/i, "").trim() || "本地小说";
    const id = `local-${Date.now()}-${hashString(file.name + file.size).toString(36)}`;
    const book = {
      id,
      provider: "local",
      readerKind: "local",
      title,
      author: "本地导入",
      cover: "",
      textUrl: "",
      sourceUrl: "",
      language: "本地 TXT",
      rights: "个人文件",
      localFileName: file.name,
      progress: 0,
    };
    await putBookContent(id, text);
    state.library.unshift({ ...serializableBook(book), addedAt: Date.now(), lastRead: Date.now(), progress: 0 });
    writeLibrary();
    showToast(`《${title}》已导入`);
    openBook(book);
  } catch (error) {
    showToast(error.message || "TXT 导入失败", "error");
  }
}

function decodeTextBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    try {
      return new TextDecoder("gb18030").decode(buffer).replace(/^\uFEFF/, "");
    } catch {
      throw new Error("暂不支持这个 TXT 编码，请转换为 UTF-8 或 GB18030");
    }
  }
}

async function openBook(book, forceReload = false) {
  const libraryBook = addToShelfIfNeeded(book);
  state.currentBook = { ...book, ...libraryBook };
  state.currentText = "";
  elements.readerTitle.textContent = state.currentBook.title;
  elements.readerAuthor.textContent = state.currentBook.author;
  elements.readerSourceLink.href = state.currentBook.sourceUrl || "#";
  elements.readerSourceLink.classList.toggle("hidden", !state.currentBook.sourceUrl);
  elements.reader.classList.add("open");
  elements.reader.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  hideReaderError();
  showReaderLoading(true);
  applyReaderSettings(false);

  try {
    let text = forceReload ? null : await getBookContent(state.currentBook.id);
    if (!text) {
      text = await loadBookText(state.currentBook);
      await putBookContent(state.currentBook.id, text);
    }
    if (!text || text.trim().length < 20) throw new Error("开放书源没有返回可阅读的正文");
    state.currentText = text;
    renderReaderDocument(text, state.currentBook);
    showReaderLoading(false);
    await nextPaint();
    restoreReaderProgress(state.currentBook.progress || 0);
    markBookRead();
    elements.readerDocument.focus({ preventScroll: true });
  } catch (error) {
    showReaderLoading(false);
    showReaderError(friendlyReaderError(error));
  }
}

async function loadBookText(book) {
  if (book.readerKind === "local") {
    const cached = await getBookContent(book.id);
    if (!cached) throw new Error("本地正文缓存已经丢失，请重新导入 TXT 文件");
    return cached;
  }
  if (book.readerKind === "wikisource") return loadWikisourceText(book);
  if (book.readerKind === "archive") return loadArchiveText(book);
  return loadGutenbergText(book);
}

async function loadGutenbergText(book) {
  let textUrl = book.textUrl;
  if (!textUrl && book.remoteId) {
    const detailsURL = new URL(GUTENDEX_API);
    detailsURL.searchParams.set("ids", String(book.remoteId));
    const details = await fetchJSON(detailsURL, {}, 16000);
    const raw = details.results?.[0];
    if (raw) {
      textUrl = pickReadableFormat(raw.formats);
      const saved = state.library.find((item) => item.id === book.id);
      if (saved) {
        saved.textUrl = textUrl;
        saved.cover ||= safeURL(raw.formats?.["image/jpeg"]);
        writeLibrary();
      }
      state.currentBook.textUrl = textUrl;
    }
  }
  if (!textUrl) throw new Error("这本书在开放书源中没有纯文本或网页正文");

  const response = await fetchWithTimeout(forceHTTPS(textUrl), {}, 22000);
  if (!response.ok) throw new Error(`正文请求失败（${response.status}）`);
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  const plain = contentType.includes("html") || /<html[\s>]/i.test(rawText)
    ? htmlToText(rawText)
    : rawText;
  return cleanGutenbergText(plain);
}

async function loadWikisourceText(book) {
  const url = new URL(WIKISOURCE_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("exsectionformat", "plain");
  url.searchParams.set("pageids", String(book.remoteId));
  url.searchParams.set("redirects", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const data = await fetchJSON(url, {}, 20000);
  const page = Object.values(data.query?.pages || {})[0];
  let extract = page?.extract?.trim() || "";

  if (extract.length < 120) {
    const parseURL = new URL(WIKISOURCE_API);
    parseURL.searchParams.set("action", "parse");
    parseURL.searchParams.set("pageid", String(book.remoteId));
    parseURL.searchParams.set("prop", "text");
    parseURL.searchParams.set("disableeditsection", "1");
    parseURL.searchParams.set("format", "json");
    parseURL.searchParams.set("origin", "*");
    const parsed = await fetchJSON(parseURL, {}, 20000);
    extract = wikiHTMLToText(parsed.parse?.text?.["*"] || "");
  }

  if (extract.length < 60) throw new Error("这个维基文库页面可能是目录页，请前往原始书源选择具体章节");
  return cleanWikisourceText(extract);
}

async function loadArchiveText(book) {
  if (!book.remoteId) throw new Error("公共扫描版本缺少 Internet Archive 标识");
  const metadata = await fetchJSON(`${ARCHIVE_METADATA_API}${encodeURIComponent(book.remoteId)}`, {}, 18000);
  const files = metadata.files || [];
  const textFile = files.find((file) => /_djvu\.txt$/i.test(file.name || ""))
    || files.find((file) => /\.txt$/i.test(file.name || "") && !/(meta|files|reviews|notes)\.txt$/i.test(file.name));
  if (!textFile?.name) throw new Error("这个公共扫描版本暂时没有可用的 OCR 文本");
  const textURL = `https://archive.org/download/${encodeURIComponent(book.remoteId)}/${encodeURIComponent(textFile.name).replaceAll("%2F", "/")}`;
  const response = await fetchWithTimeout(textURL, {}, 24000);
  if (!response.ok) throw new Error(`公共扫描正文请求失败（${response.status}）`);
  return (await response.text()).replace(/^\uFEFF/, "").trim();
}

function renderReaderDocument(text, book) {
  const documentFragment = document.createDocumentFragment();
  const opening = document.createElement("header");
  opening.className = "book-opening";
  const title = document.createElement("h1");
  title.textContent = book.title;
  const byline = document.createElement("p");
  byline.textContent = `${book.author} · ${sourceName(book.provider)}`;
  opening.append(title, byline);
  documentFragment.append(opening);

  const paragraphs = splitIntoParagraphs(text);
  for (const value of paragraphs) {
    const node = document.createElement(isChapterHeading(value) ? "h2" : "p");
    node.textContent = value;
    documentFragment.append(node);
  }
  elements.readerDocument.replaceChildren(documentFragment);
}

function splitIntoParagraphs(text) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .trim();
  const lines = normalized.split("\n");
  const paragraphs = [];
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) paragraphs.push(value);
    buffer = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[-=_—]{8,}$/.test(line)) {
      flush();
      continue;
    }
    if (isChapterHeading(line)) {
      flush();
      paragraphs.push(line);
      continue;
    }

    const startsIndentedParagraph = /^[\u3000 ]{2,}\S/.test(rawLine);
    if (startsIndentedParagraph && buffer) flush();
    buffer += line;
  }
  flush();
  return paragraphs;
}

function isChapterHeading(text) {
  const trimmed = text.trim();
  if (trimmed.length > 72) return false;
  return /^(第[〇零一二三四五六七八九十百千两0-9]+[回章节卷部篇].{0,45}|chapter\s+[ivxlcdm0-9]+\b.{0,40}|book\s+[ivxlcdm0-9]+\b.{0,40}|序言|前言|楔子|引子|尾声|后记)$/i.test(trimmed);
}

function cleanGutenbergText(text) {
  let cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const start = cleaned.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  if (start >= 0) cleaned = cleaned.slice(cleaned.indexOf("\n", start) + 1);
  const end = cleaned.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (end >= 0) cleaned = cleaned.slice(0, end);
  return cleaned.replace(/\n{4,}/g, "\n\n\n").trim();
}

function cleanWikisourceText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\[编辑\]/g, "")
    .replace(/本页面最后修订于[^\n]+/g, "")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function htmlToText(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script,style,noscript,nav,footer,header").forEach((node) => node.remove());
  parsed.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  parsed.querySelectorAll("p,h1,h2,h3,h4,div,section,li").forEach((node) => node.append("\n\n"));
  return parsed.body.textContent || "";
}

function wikiHTMLToText(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script,style,table,.mw-editsection,.navbox,.metadata,.ws-noexport,.noprint,sup.reference").forEach((node) => node.remove());
  parsed.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  parsed.querySelectorAll("p,h1,h2,h3,h4,li").forEach((node) => node.append("\n\n"));
  return parsed.body.textContent || "";
}

function closeReader() {
  saveCurrentProgress();
  closeSettings();
  elements.reader.classList.remove("open");
  elements.reader.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.currentBook = null;
  state.currentText = "";
  renderContinueReading();
  if (state.view === "shelf") renderShelf();
}

function showReaderLoading(show) {
  elements.readerLoading.classList.toggle("hidden", !show);
  elements.readerDocument.classList.toggle("hidden", show);
}

function showReaderError(message) {
  elements.readerErrorMessage.textContent = message;
  elements.readerError.classList.remove("hidden");
  elements.readerDocument.classList.add("hidden");
  refreshIcons();
}

function hideReaderError() {
  elements.readerError.classList.add("hidden");
  elements.readerDocument.classList.remove("hidden");
}

function friendlyReaderError(error) {
  if (error?.name === "AbortError") return "连接开放书源超时，请稍后重试。";
  if (/Failed to fetch|NetworkError/i.test(error?.message || "")) return "浏览器无法连接正文服务器。请检查网络，或打开原始书源。";
  return error?.message || "暂时无法读取正文，可以稍后重试或前往原始书源。";
}

function openSettings() {
  elements.settingsDrawer.classList.add("open");
  elements.drawerBackdrop.classList.add("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  elements.settingsDrawer.classList.remove("open");
  elements.drawerBackdrop.classList.remove("open");
  elements.settingsDrawer.setAttribute("aria-hidden", "true");
}

function setReadingMode(mode) {
  if (!['paged', 'scroll'].includes(mode)) return;
  const ratio = getReaderProgress();
  state.settings.mode = mode;
  applyReaderSettings();
  requestAnimationFrame(() => requestAnimationFrame(() => restoreReaderProgress(ratio)));
  showToast(mode === "paged" ? "已切换为左右翻页" : "已切换为上下滚动");
}

function applyReaderSettings(save = true) {
  const { mode, readerTheme, fontSize, lineHeight, font } = state.settings;
  document.documentElement.style.setProperty("--reader-font-size", `${fontSize}px`);
  document.documentElement.style.setProperty("--reader-line-height", String(lineHeight));
  document.documentElement.style.setProperty(
    "--reader-font-family",
    font === "sans" ? '"Noto Sans SC", "Microsoft YaHei", sans-serif' : '"Noto Serif SC", "Songti SC", SimSun, serif',
  );
  elements.reader.dataset.theme = readerTheme;
  elements.reader.dataset.mode = mode;
  elements.readerDocument.classList.toggle("paged", mode === "paged");
  elements.readerDocument.classList.toggle("scroll", mode === "scroll");
  elements.readerHint.textContent = mode === "paged" ? "点击两侧、左右滑动或使用方向键翻页" : "上下滑动阅读";
  elements.readerModeToggle.innerHTML = `<i data-lucide="${mode === "paged" ? "columns-2" : "move-vertical"}"></i>`;
  elements.readerModeToggle.title = mode === "paged" ? "切换为上下滚动" : "切换为左右翻页";
  elements.fontSizeRange.value = String(fontSize);
  elements.fontSizeOutput.value = `${fontSize}px`;
  elements.lineHeightRange.value = String(lineHeight);
  elements.lineHeightOutput.value = Number(lineHeight).toFixed(1);
  elements.modeControl.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  elements.readerThemeControl.querySelectorAll("[data-reader-theme]").forEach((button) => button.classList.toggle("active", button.dataset.readerTheme === readerTheme));
  elements.fontControl.querySelectorAll("[data-font]").forEach((button) => button.classList.toggle("active", button.dataset.font === font));
  if (save) localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  refreshIcons();
}

function preserveReaderPosition(callback) {
  const isOpen = elements.reader.classList.contains("open") && state.currentText;
  const ratio = isOpen ? getReaderProgress() : 0;
  callback();
  if (isOpen) requestAnimationFrame(() => requestAnimationFrame(() => restoreReaderProgress(ratio)));
}

function turnPage(direction) {
  if (state.settings.mode !== "paged" || !state.currentText) return;
  const amount = elements.readerDocument.clientWidth * direction;
  elements.readerDocument.scrollBy({ left: amount, behavior: "smooth" });
}

function handleTouchStart(event) {
  if (state.settings.mode !== "paged" || event.touches.length !== 1) return;
  state.touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() };
}

function handleTouchEnd(event) {
  if (state.settings.mode !== "paged" || !state.touchStart || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - state.touchStart.x;
  const dy = touch.clientY - state.touchStart.y;
  const elapsed = Date.now() - state.touchStart.time;
  state.touchStart = null;
  if (elapsed < 650 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) turnPage(dx < 0 ? 1 : -1);
}

function getReaderProgress() {
  const documentElement = elements.readerDocument;
  if (!state.currentText) return 0;
  if (state.settings.mode === "paged") {
    const max = Math.max(0, documentElement.scrollWidth - documentElement.clientWidth);
    return max ? clamp(documentElement.scrollLeft / max, 0, 1) : 0;
  }
  const max = Math.max(0, documentElement.scrollHeight - documentElement.clientHeight);
  return max ? clamp(documentElement.scrollTop / max, 0, 1) : 0;
}

function restoreReaderProgress(ratio) {
  const documentElement = elements.readerDocument;
  const safeRatio = clamp(Number(ratio) || 0, 0, 1);
  if (state.settings.mode === "paged") {
    const max = Math.max(0, documentElement.scrollWidth - documentElement.clientWidth);
    const pageWidth = Math.max(1, documentElement.clientWidth);
    documentElement.scrollLeft = Math.round((max * safeRatio) / pageWidth) * pageWidth;
  } else {
    const max = Math.max(0, documentElement.scrollHeight - documentElement.clientHeight);
    documentElement.scrollTop = max * safeRatio;
  }
  updateReaderProgress();
}

function scheduleReaderProgress() {
  if (state.progressFrame) return;
  state.progressFrame = requestAnimationFrame(() => {
    state.progressFrame = 0;
    updateReaderProgress();
  });
}

function updateReaderProgress() {
  if (!state.currentBook || !state.currentText) return;
  const ratio = getReaderProgress();
  const percent = Math.round(ratio * 100);
  elements.readerProgressBar.style.width = `${percent}%`;
  elements.readerPercent.textContent = `${percent}%`;

  if (state.settings.mode === "paged") {
    const totalPages = Math.max(1, Math.ceil(elements.readerDocument.scrollWidth / elements.readerDocument.clientWidth));
    const currentPage = Math.min(totalPages, Math.round(elements.readerDocument.scrollLeft / elements.readerDocument.clientWidth) + 1);
    elements.readerPosition.textContent = `第 ${currentPage} / ${totalPages} 页`;
  } else {
    elements.readerPosition.textContent = `阅读进度 ${percent}%`;
  }

  const libraryBook = state.library.find((item) => item.id === state.currentBook.id);
  if (libraryBook) {
    libraryBook.progress = ratio;
    libraryBook.lastRead = Date.now();
    state.currentBook.progress = ratio;
    clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = setTimeout(writeLibrary, 600);
  }
}

function saveCurrentProgress() {
  if (!state.currentBook || !state.currentText) return;
  const libraryBook = state.library.find((item) => item.id === state.currentBook.id);
  if (!libraryBook) return;
  libraryBook.progress = getReaderProgress();
  libraryBook.lastRead = Date.now();
  localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(state.library));
}

function markBookRead() {
  const libraryBook = state.library.find((item) => item.id === state.currentBook.id);
  if (!libraryBook) return;
  libraryBook.lastRead = Date.now();
  writeLibrary();
}

function renderSkeletons(container, count) {
  container.innerHTML = Array.from({ length: count }, () => `
    <article class="skeleton-card" aria-hidden="true">
      <div class="book-cover"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </article>`).join("");
}

function renderEmpty(container, { icon, title, text, action, officialLinks = [] }) {
  container.innerHTML = `
    <div class="empty-state">
      <div>
        <i data-lucide="${icon}"></i>
        <h2>${escapeHTML(title)}</h2>
        <p>${escapeHTML(text)}</p>
        ${action ? `<button class="primary-button empty-action" type="button"><i data-lucide="${action.icon}"></i>${escapeHTML(action.label)}</button>` : ""}
        ${officialLinks.length ? `
          <div class="official-source-panel">
            <span class="official-source-title"><i data-lucide="external-link"></i>去官方平台搜索</span>
            <div class="official-source-links">
              ${officialLinks.map((link) => `<a class="official-source-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="${link.icon}"></i>${escapeHTML(link.label)}</a>`).join("")}
            </div>
            <small>官方页面可能需要登录或按平台规则付费</small>
          </div>` : ""}
      </div>
    </div>`;
  if (action) container.querySelector(".empty-action").addEventListener("click", action.callback);
  refreshIcons();
}

function renderGridError(container, title, text, retry) {
  container.innerHTML = `
    <div class="error-state">
      <div>
        <i data-lucide="cloud-off"></i>
        <h2>${escapeHTML(title)}</h2>
        <p>${escapeHTML(text)}</p>
        <button class="secondary-button retry-grid" type="button"><i data-lucide="refresh-cw"></i>重新加载</button>
      </div>
    </div>`;
  container.querySelector(".retry-grid").addEventListener("click", retry);
  refreshIcons();
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${type === "error" ? "circle-alert" : "check-circle-2"}"></i><span>${escapeHTML(message)}</span>`;
  elements.toastRegion.append(toast);
  refreshIcons();
  setTimeout(() => toast.remove(), 3200);
}

function applyAppTheme(theme) {
  document.body.classList.toggle("dark-app", theme === "dark");
  localStorage.setItem(STORAGE_KEYS.appTheme, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "dark" ? "#151b19" : "#f5f7f4");
  elements.themeToggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`;
  elements.themeToggle.title = theme === "dark" ? "切换到明亮主题" : "切换到深色主题";
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

async function fetchJSON(url, options = {}, timeout = 15000) {
  const response = await fetchWithTimeout(url, options, timeout);
  if (!response.ok) throw new Error(`书源请求失败（${response.status}）`);
  return response.json();
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("Request timed out", "AbortError"));
    }, timeout);
  });
  try {
    return await Promise.race([fetch(url, { ...options, signal: controller.signal }), timeoutPromise]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  }
}

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function sourceName(provider) {
  if (provider === "wikisource") return "中文维基文库";
  if (provider === "openlibrary") return "Open Library";
  if (provider === "local") return "本地 TXT";
  return "Gutenberg";
}

function officialSearchLinks(query) {
  const normalizedQuery = query.trim();
  const keyword = encodeURIComponent(normalizedQuery);
  const hasQuery = Boolean(normalizedQuery);
  return [
    {
      label: "起点中文网",
      icon: "book-open",
      mark: "起",
      accent: "qidian",
      domain: "qidian.com",
      description: hasQuery ? `在起点搜索“${normalizedQuery}”` : "男频、女频与经典网文阅读平台",
      action: hasQuery ? "搜索此作品" : "打开起点中文网",
      url: hasQuery ? `https://www.qidian.com/soushu/${keyword}/` : "https://www.qidian.com/",
    },
    {
      label: "番茄小说",
      icon: "flame",
      mark: "番",
      accent: "fanqie",
      domain: "fanqienovel.com",
      description: hasQuery ? `在番茄搜索“${normalizedQuery}”` : "正版小说与原创作品阅读平台",
      action: hasQuery ? "搜索此作品" : "打开番茄小说",
      url: hasQuery ? `https://fanqienovel.com/search?keyword=${keyword}` : "https://fanqienovel.com/",
    },
    {
      label: "七猫小说",
      icon: "cat",
      mark: "七",
      accent: "qimao",
      domain: "qimao.com",
      description: hasQuery ? `在七猫搜索“${normalizedQuery}”` : "正版网文与有声内容平台",
      action: hasQuery ? "搜索此作品" : "打开七猫小说",
      url: hasQuery ? `https://www.qimao.com/search/index/?keyword=${keyword}` : "https://www.qimao.com/",
    },
  ];
}

function languageLabel(code) {
  const labels = { zh: "中文", en: "英文", fr: "法文", de: "德文", es: "西班牙文", ja: "日文", ru: "俄文" };
  return labels[code] || (code ? code.toUpperCase() : "未知语言");
}

function existingProgress(id) {
  return state.library.find((item) => item.id === id)?.progress || 0;
}

function coverColor(id) {
  return COVER_COLORS[Math.abs(hashString(id)) % COVER_COLORS.length];
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return hash;
}

function safeURL(value) {
  if (!value) return "";
  try {
    const url = new URL(forceHTTPS(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function forceHTTPS(value) {
  return String(value || "").replace(/^http:\/\//i, "https://");
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, "&#96;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getBookContent(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function putBookContent(id, text) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(text, id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
