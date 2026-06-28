const API = "https://de1.api.radio-browser.info/json";
const STORAGE = {
  favorites: "radio-online:favorites",
  history: "radio-online:history",
  theme: "radio-online:theme",
};

const countrySelect = document.getElementById("countrySelect");
const searchInput = document.getElementById("searchInput");
const stationList = document.getElementById("stationList");
const hostMode = document.getElementById("hostMode");
const hostLine = document.getElementById("hostLine");
const resultCount = document.getElementById("resultCount");
const audio = document.getElementById("audio");
const currentName = document.getElementById("currentName");
const currentInfo = document.getElementById("currentInfo");
const trackMeta = document.getElementById("trackMeta");
const stationTemplate = document.getElementById("stationTemplate");
const genreFilter = document.getElementById("genreFilter");
const languageFilter = document.getElementById("languageFilter");
const bitrateFilter = document.getElementById("bitrateFilter");
const sortSelect = document.getElementById("sortSelect");
const favoritesOnly = document.getElementById("favoritesOnly");
const russianGlobal = document.getElementById("russianGlobal");
const statusLine = document.getElementById("statusLine");
const historyList = document.getElementById("historyList");
const clearHistory = document.getElementById("clearHistory");
const nextStation = document.getElementById("nextStation");
const newHostLine = document.getElementById("newHostLine");
const themeSelect = document.getElementById("themeSelect");
const installBtn = document.getElementById("installBtn");

const FAVORITES = ["Russia", "Russian Federation", "United States"];
const COUNTRY_ALIASES = { Russia: "Россия", "Russian Federation": "Россия", "United States": "США" };
const FAVORITE_LIMIT = 80;
const HISTORY_LIMIT = 10;

let stations = [];
let renderedStations = [];
let currentStation = null;
let lastHostLine = "";
let deferredInstallPrompt = null;
let favoriteIds = new Set(readJson(STORAGE.favorites, []));
let history = readJson(STORAGE.history, []);

const HOST_LINES = {
  night: [
    ({ name, tags }) => `${name} уже в эфире. Неон чуть тише, мысли чуть громче — ${tags} ложится ровно в ночь.`,
    ({ name }) => `Остаёмся на связи с ${name}. Короткая пауза для города — и снова в музыку.`,
    ({ name, country }) => `${country} присылает сигнал через ночные окна. Это ${name}, включайся ближе.`,
    ({ tags }) => `Без лишних слов: ${tags} для тех, кто не спешит выключать город.`,
  ],
  day: [
    ({ name, tags }) => `${name} врывается в день. ${tags} на максимум — ловим ритм и двигаемся дальше.`,
    ({ name }) => `Включили ${name}. Хороший повод сделать громче и забрать этот темп себе.`,
    ({ country }) => `${country} на линии, и звучит бодро. Следующая волна уже заряжает маршрут.`,
    ({ tags }) => `Быстро, ярко, без пауз: ${tags} подкидывает энергии прямо сейчас.`,
  ],
  news: [
    ({ name, country }) => `${name} держит информационную линию из ${country}. Слушаем факты, контекст и голос города.`,
    ({ tags }) => `В эфире новостной радар: ${tags}. Проверяем, чем живёт этот час.`,
  ],
  retro: [
    ({ name }) => `${name} достаёт тёплый винил из памяти. Настраиваемся на ретро без пыли и суеты.`,
    ({ country, tags }) => `${country} звучит как открытка из прошлого: ${tags} и немного лампового шума.`,
  ],
  rock: [
    ({ name }) => `${name} поднимает усилители. Гитары на старте — держим громкость уверенно.`,
    ({ tags }) => `Риффы, драйв и ${tags}. Эта волна не просит разрешения быть громкой.`,
  ],
};

const FALLBACK_TAG = { night: "chill-виб", day: "свежий саунд", news: "главные темы", retro: "ретро-саунд", rock: "рок-настрой" };
const DEFAULT_HOST_LINES = {
  night: "Ночной город на связи. Выбирай волну — дальше музыка сама подскажет маршрут.",
  day: "День набирает скорость. Выбирай станцию — и добавим этому моменту громкости.",
  news: "Информационная частота готова. Выбери станцию — сверим новости по эфиру.",
  retro: "Ламповый приёмник прогрелся. Осталось выбрать волну с характером.",
  rock: "Усилители включены. Найди свою рок-волну и жми play.",
};

const safe = (value) => String(value || "").replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[m]));
const displayCountryName = (name) => COUNTRY_ALIASES[name] || name || "онлайн-эфир";
const stationId = (station) => station.stationuuid || `${station.name}-${station.url_resolved}`;

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(message, tone = "") {
  statusLine.textContent = message;
  statusLine.dataset.tone = tone;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("API error");
  return response.json();
}

function cleanTags(tags, mode) {
  const firstTags = String(tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 2).join(" / ");
  return firstTags || FALLBACK_TAG[mode];
}

function pickHostLine(station, offset = 0) {
  const mode = hostMode.value;
  const lines = HOST_LINES[mode] || HOST_LINES.night;
  const context = { name: station.name || "эта волна", country: displayCountryName(station.country), tags: cleanTags(station.tags, mode) };
  const base = [stationId(station), station.name, mode, offset].join("");
  const seed = [...base].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let nextLine = lines[seed % lines.length](context);
  if (nextLine === lastHostLine) nextLine = lines[(seed + 1) % lines.length](context);
  lastHostLine = nextLine;
  return nextLine;
}

function refreshHostLine(station, offset = 0) {
  if (!station) {
    hostLine.textContent = DEFAULT_HOST_LINES[hostMode.value] || DEFAULT_HOST_LINES.night;
    return;
  }
  hostLine.textContent = pickHostLine(station, offset);
}

function buildCountrySelect(countries) {
  const popular = countries.filter((c) => FAVORITES.includes(c.name));
  const others = countries.filter((c) => !FAVORITES.includes(c.name));
  countrySelect.innerHTML = `
    <optgroup label="Популярные страны">${popular.map((c) => `<option value="${safe(c.name)}">⭐ ${displayCountryName(c.name)} · ${c.stationcount}</option>`).join("")}</optgroup>
    <optgroup label="Все страны">${others.map((c) => `<option value="${safe(c.name)}">${displayCountryName(c.name)} · ${c.stationcount}</option>`).join("")}</optgroup>
  `;
  countrySelect.value = popular.some((c) => c.name === "Russia") ? "Russia" : countries[0]?.name || "";
}

async function loadCountries() {
  setStatus("Загружаем каталог стран...");
  const countries = await fetchJson(`${API}/countries`);
  const top = countries.filter((c) => c.stationcount > 10).sort((a, b) => a.name.localeCompare(b.name));
  buildCountrySelect(top);
  await loadStations(countrySelect.value);
}

async function loadStations(country) {
  stationList.innerHTML = skeletonItems();
  resultCount.textContent = "…";
  setStatus("Настраиваем частоты...");
  searchInput.value = "";

  const byCountryUrl = `${API}/stations/bycountry/${encodeURIComponent(country)}?hidebroken=true&order=votes&reverse=true&limit=160`;
  const byCountry = await fetchJson(byCountryUrl);
  let merged = byCountry;

  if (country === "Russia" || country === "Russian Federation" || russianGlobal.checked) {
    const byRussian = await fetchJson(`${API}/stations/bylanguageexact/Russian?hidebroken=true&order=votes&reverse=true&limit=160`);
    merged = uniqueStations([...byCountry, ...byRussian]);
  }

  stations = merged;
  rebuildFilters();
  applyFilters();
  setStatus(`Готово: найдено ${stations.length} станций.`, "ok");
}

function uniqueStations(list) {
  const uniq = new Map();
  list.forEach((station) => uniq.set(stationId(station), station));
  return [...uniq.values()];
}

function skeletonItems() {
  return Array.from({ length: 6 }, () => '<li class="station-item skeleton"><span></span><span></span><span></span></li>').join("");
}

function rebuildFilters() {
  fillSelect(genreFilter, "Все жанры", collectTags(stations));
  fillSelect(languageFilter, "Все языки", [...new Set(stations.map((s) => s.language).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
}

function collectTags(list) {
  const tags = new Map();
  list.forEach((station) => String(station.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).forEach((tag) => tags.set(tag.toLowerCase(), tag)));
  return [...tags.values()].sort((a, b) => a.localeCompare(b)).slice(0, 80);
}

function fillSelect(select, placeholder, values) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>${values.map((value) => `<option value="${safe(value)}">${safe(value)}</option>`).join("")}`;
  if (values.includes(current)) select.value = current;
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const genre = genreFilter.value.toLowerCase();
  const language = languageFilter.value;
  const minBitrate = Number(bitrateFilter.value || 0);

  let filtered = stations.filter((station) => {
    const haystack = `${station.name} ${station.tags || ""} ${station.language || ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesGenre = !genre || String(station.tags || "").toLowerCase().includes(genre);
    const matchesLanguage = !language || station.language === language;
    const matchesBitrate = Number(station.bitrate || 0) >= minBitrate;
    const matchesFavorite = !favoritesOnly.checked || favoriteIds.has(stationId(station));
    return matchesQuery && matchesGenre && matchesLanguage && matchesBitrate && matchesFavorite;
  });

  filtered = sortStations(filtered);
  renderStations(filtered);
}

function sortStations(list) {
  return [...list].sort((a, b) => {
    if (sortSelect.value === "bitrate") return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    if (sortSelect.value === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    if (sortSelect.value === "language") return String(a.language || "").localeCompare(String(b.language || ""));
    return Number(b.votes || 0) - Number(a.votes || 0);
  });
}

function renderStations(list) {
  renderedStations = list;
  stationList.innerHTML = "";
  resultCount.textContent = list.length;

  if (!list.length) {
    stationList.innerHTML = '<li class="empty-state">Станции не найдены. Попробуй убрать фильтр или сменить страну.</li>';
    return;
  }

  list.forEach((station) => {
    const node = stationTemplate.content.firstElementChild.cloneNode(true);
    const main = node.querySelector(".station-main");
    const playBtn = node.querySelector(".station-play");
    const favoriteBtn = node.querySelector(".favorite-btn");
    const id = stationId(station);

    updateFavoriteButton(favoriteBtn, station);
    main.innerHTML = `<strong>${safe(station.name)}</strong><small>${safe(station.tags || "Без жанра")} · ${safe(station.bitrate || "?")} kbps · ${safe(station.language || "Unknown")}</small>`;
    main.setAttribute("aria-current", currentStation && stationId(currentStation) === id ? "true" : "false");

    favoriteBtn.addEventListener("click", () => toggleFavorite(station, favoriteBtn));
    main.addEventListener("click", () => playStation(station));
    playBtn.addEventListener("click", () => playStation(station));
    stationList.appendChild(node);
  });
}

function updateFavoriteButton(button, station) {
  const isFavorite = favoriteIds.has(stationId(station));
  button.textContent = isFavorite ? "★" : "☆";
  button.classList.toggle("is-favorite", isFavorite);
  button.setAttribute("aria-label", isFavorite ? "Убрать из избранного" : "Добавить в избранное");
}

function toggleFavorite(station, button) {
  const id = stationId(station);
  if (favoriteIds.has(id)) favoriteIds.delete(id);
  else favoriteIds = new Set([id, ...favoriteIds].slice(0, FAVORITE_LIMIT));
  writeJson(STORAGE.favorites, [...favoriteIds]);
  updateFavoriteButton(button, station);
  if (favoritesOnly.checked) applyFilters();
}

function playStation(station, options = {}) {
  if (!station?.url_resolved) {
    setStatus("У этой станции нет рабочей ссылки на поток.", "error");
    return;
  }

  audio.src = station.url_resolved;
  audio.play().catch(() => handlePlaybackError(station));
  currentStation = station;
  currentName.textContent = station.name || "Без названия";
  currentInfo.textContent = `${displayCountryName(station.country)} · ${station.language || "Unknown"} · ${station.bitrate || "?"} kbps`;
  trackMeta.textContent = `Источник: ${station.codec || "stream"}. Название трека появится, если поток отдаёт метаданные браузеру.`;
  setStatus(`Играет: ${station.name || "станция"}.`, "ok");
  refreshHostLine(station, options.hostOffset || 0);
  addToHistory(station);
  renderStations(renderedStations);
}

function handlePlaybackError(station) {
  setStatus("Поток не запустился. Пробуем следующую доступную волну...", "error");
  currentInfo.textContent = "Поток не запустился. Ищем замену автоматически.";
  playNext(station);
}

function playNext(fromStation = currentStation) {
  if (!renderedStations.length) return;
  const start = Math.max(0, renderedStations.findIndex((station) => stationId(station) === stationId(fromStation)));
  const next = renderedStations[(start + 1) % renderedStations.length];
  if (next && stationId(next) !== stationId(fromStation)) playStation(next, { hostOffset: 1 });
}

function addToHistory(station) {
  history = [station, ...history.filter((item) => stationId(item) !== stationId(station))].slice(0, HISTORY_LIMIT);
  writeJson(STORAGE.history, history);
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!history.length) {
    historyList.innerHTML = '<li class="empty-state">История пока пустая.</li>';
    return;
  }

  history.forEach((station) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<strong>${safe(station.name)}</strong><small>${displayCountryName(station.country)} · ${safe(station.language || "Unknown")}</small>`;
    button.addEventListener("click", () => playStation(station));
    item.appendChild(button);
    historyList.appendChild(item);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
  writeJson(STORAGE.theme, theme);
}

searchInput.addEventListener("input", applyFilters);
[genreFilter, languageFilter, bitrateFilter, sortSelect, favoritesOnly].forEach((control) => control.addEventListener("change", applyFilters));
countrySelect.addEventListener("change", () => loadStations(countrySelect.value).catch(showLoadError));
russianGlobal.addEventListener("change", () => loadStations(countrySelect.value).catch(showLoadError));
hostMode.addEventListener("change", () => refreshHostLine(currentStation));
newHostLine.addEventListener("click", () => refreshHostLine(currentStation, Date.now()));
nextStation.addEventListener("click", () => playNext());
clearHistory.addEventListener("click", () => { history = []; writeJson(STORAGE.history, history); renderHistory(); });
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

audio.addEventListener("error", () => currentStation && handlePlaybackError(currentStation));
audio.addEventListener("ended", () => playNext());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

function showLoadError() {
  stationList.innerHTML = '<li class="empty-state">Ошибка загрузки. Проверь подключение к интернету и нажми страну ещё раз.</li>';
  setStatus("Не удалось загрузить каталог. Возможно, API временно недоступен.", "error");
  resultCount.textContent = "0";
}

applyTheme(readJson(STORAGE.theme, "night"));
renderHistory();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
loadCountries().catch(showLoadError);
