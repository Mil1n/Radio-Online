const API_MIRRORS = [
  "https://de1.api.radio-browser.info/json",
  "https://nl1.api.radio-browser.info/json",
  "https://at1.api.radio-browser.info/json",
];

const STORAGE = {
  favorites: "radio-online:favorites",
  favoriteStations: "radio-online:favorite-stations",
  history: "radio-online:history",
  theme: "radio-online:theme",
  volume: "radio-online:volume",
  muted: "radio-online:muted",
  countries: "radio-online:countries-cache",
  stations: "radio-online:stations-cache",
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
const verifiedOnly = document.getElementById("verifiedOnly");
const statusLine = document.getElementById("statusLine");
const historyList = document.getElementById("historyList");
const clearHistory = document.getElementById("clearHistory");
const nextStation = document.getElementById("nextStation");
const shuffleStation = document.getElementById("shuffleStation");
const newHostLine = document.getElementById("newHostLine");
const themeSelect = document.getElementById("themeSelect");
const installBtn = document.getElementById("installBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeControl = document.getElementById("volumeControl");
const queueList = document.getElementById("queueList");
const clearQueue = document.getElementById("clearQueue");
const exportFavorites = document.getElementById("exportFavorites");
const importFavorites = document.getElementById("importFavorites");
const importFavoritesFile = document.getElementById("importFavoritesFile");
const sleepTimer = document.getElementById("sleepTimer");
const sleepTimerStatus = document.getElementById("sleepTimerStatus");
const presetButtons = document.querySelectorAll("[data-preset]");

const FAVORITES = ["Russia", "Russian Federation", "United States"];
const COUNTRY_ALIASES = { Russia: "Россия", "Russian Federation": "Россия", "United States": "США" };
const FAVORITE_LIMIT = 120;
const HISTORY_LIMIT = 10;
const MAX_PLAYBACK_ATTEMPTS = 8;

let activeApi = API_MIRRORS[0];
let stations = [];
let renderedStations = [];
let currentStation = null;
let lastHostLine = "";
let deferredInstallPrompt = null;
let favoriteIds = new Set(readJson(STORAGE.favorites, []));
let favoriteStations = readJson(STORAGE.favoriteStations, []);
let history = readJson(STORAGE.history, []);
let failedStationIds = new Set();
let playbackAttempts = 0;
let queue = [];
let sleepTimerId = null;
let sleepTimerEndsAt = 0;
let sleepTimerTicker = null;

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

const PRESETS = {
  work: { query: "jazz chill ambient", host: "night", sort: "votes", minBitrate: "64" },
  road: { query: "pop rock dance", host: "day", sort: "votes", minBitrate: "128" },
  news: { query: "news talk", host: "news", sort: "votes", minBitrate: "64" },
  retro: { query: "retro oldies 80s 90s", host: "retro", sort: "votes", minBitrate: "64" },
  russian: { query: "", host: "day", sort: "votes", minBitrate: "64", russianGlobal: true },
  random: { randomCountry: true, host: "day", sort: "votes", minBitrate: "0" },
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
const stationId = (station) => station?.stationuuid || `${station?.name}-${station?.url_resolved}`;
const isVerified = (station) => Number(station?.lastcheckok ?? 1) === 1;

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

async function fetchJson(path) {
  const errors = [];
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  for (const base of [activeApi, ...API_MIRRORS.filter((mirror) => mirror !== activeApi)]) {
    try {
      if (base !== activeApi) setStatus(`Основной сервер недоступен. Пробуем резервный: ${base.replace("https://", "")}`, "warn");
      const response = await fetch(`${base}${normalizedPath}`);
      if (!response.ok) throw new Error(`API ${response.status}`);
      activeApi = base;
      return response.json();
    } catch (error) {
      errors.push(error);
    }
  }

  throw errors.at(-1) || new Error("API error");
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
  try {
    const countries = await fetchJson("/countries");
    const top = countries.filter((c) => c.stationcount > 10).sort((a, b) => a.name.localeCompare(b.name));
    writeJson(STORAGE.countries, top);
    buildCountrySelect(top);
  } catch (error) {
    const cached = readJson(STORAGE.countries, []);
    if (!cached.length) throw error;
    buildCountrySelect(cached);
    setStatus("Сервер недоступен. Используем сохранённый каталог стран.", "warn");
  }
  await loadStations(countrySelect.value);
}

async function loadStations(country) {
  stationList.innerHTML = skeletonItems();
  resultCount.textContent = "…";
  setStatus("Настраиваем частоты...");
  searchInput.value = "";
  failedStationIds = new Set();
  playbackAttempts = 0;

  const cacheKey = `${STORAGE.stations}:${country}:${russianGlobal.checked}`;

  try {
    const byCountry = await fetchJson(`/stations/bycountry/${encodeURIComponent(country)}?hidebroken=true&order=votes&reverse=true&limit=180`);
    let merged = byCountry;

    if (country === "Russia" || country === "Russian Federation" || russianGlobal.checked) {
      const byRussian = await fetchJson("/stations/bylanguageexact/Russian?hidebroken=true&order=votes&reverse=true&limit=180");
      merged = uniqueStations([...byCountry, ...byRussian]);
    }

    stations = merged;
    writeJson(cacheKey, stations);
    setStatus(`Готово: найдено ${stations.length} станций через ${activeApi.replace("https://", "")}.`, "ok");
  } catch (error) {
    stations = readJson(cacheKey, []);
    if (!stations.length) throw error;
    setStatus(`API временно недоступен. Показан сохранённый список: ${stations.length} станций.`, "warn");
  }

  rebuildFilters();
  applyFilters();
}

function uniqueStations(list) {
  const uniq = new Map();
  list.forEach((station) => uniq.set(stationId(station), station));
  return [...uniq.values()];
}

function skeletonItems() {
  return Array.from({ length: 6 }, () => '<li class="station-item skeleton"><span></span><span></span><span></span><span></span></li>').join("");
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
  const terms = query.split(/\s+/).filter(Boolean);
  const genre = genreFilter.value.toLowerCase();
  const language = languageFilter.value;
  const minBitrate = Number(bitrateFilter.value || 0);

  let filtered = stations.filter((station) => {
    const haystack = `${station.name} ${station.tags || ""} ${station.language || ""}`.toLowerCase();
    const matchesQuery = !terms.length || terms.some((term) => haystack.includes(term));
    const matchesGenre = !genre || String(station.tags || "").toLowerCase().includes(genre);
    const matchesLanguage = !language || station.language === language;
    const matchesBitrate = Number(station.bitrate || 0) >= minBitrate;
    const matchesFavorite = !favoritesOnly.checked || favoriteIds.has(stationId(station));
    const matchesVerified = !verifiedOnly.checked || isVerified(station);
    return matchesQuery && matchesGenre && matchesLanguage && matchesBitrate && matchesFavorite && matchesVerified;
  });

  filtered = sortStations(filtered);
  renderStations(filtered);
}

function sortStations(list) {
  return [...list].sort((a, b) => {
    if (sortSelect.value === "bitrate") return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    if (sortSelect.value === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    if (sortSelect.value === "language") return String(a.language || "").localeCompare(String(b.language || ""));
    if (sortSelect.value === "stability") return Number(b.lastcheckok || 0) - Number(a.lastcheckok || 0) || Number(b.votes || 0) - Number(a.votes || 0);
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
    const queueBtn = node.querySelector(".queue-btn");
    const id = stationId(station);
    const broken = failedStationIds.has(id);
    const verifiedLabel = isVerified(station) ? "✓ проверена" : "? не проверена";

    node.classList.toggle("is-failed", broken);
    updateFavoriteButton(favoriteBtn, station);
    main.innerHTML = `<strong>${safe(station.name)}</strong><small>${safe(station.tags || "Без жанра")} · ${safe(station.bitrate || "?")} kbps · ${safe(station.language || "Unknown")} · ${verifiedLabel}${broken ? " · пропущена" : ""}</small>`;
    main.setAttribute("aria-current", currentStation && stationId(currentStation) === id ? "true" : "false");
    main.setAttribute("aria-label", `Включить ${station.name || "станцию"}`);
    playBtn.setAttribute("aria-label", `Включить ${station.name || "станцию"}`);
    queueBtn.setAttribute("aria-label", `Добавить ${station.name || "станцию"} в очередь`);

    favoriteBtn.addEventListener("click", () => toggleFavorite(station, favoriteBtn));
    main.addEventListener("click", () => playStation(station));
    playBtn.addEventListener("click", () => playStation(station));
    queueBtn.addEventListener("click", () => addToQueue(station));
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
  if (favoriteIds.has(id)) {
    favoriteIds.delete(id);
    favoriteStations = favoriteStations.filter((item) => stationId(item) !== id);
  } else {
    favoriteIds = new Set([id, ...favoriteIds].slice(0, FAVORITE_LIMIT));
    favoriteStations = [station, ...favoriteStations.filter((item) => stationId(item) !== id)].slice(0, FAVORITE_LIMIT);
  }
  writeJson(STORAGE.favorites, [...favoriteIds]);
  writeJson(STORAGE.favoriteStations, favoriteStations);
  updateFavoriteButton(button, station);
  if (favoritesOnly.checked) applyFilters();
}

function playStation(station, options = {}) {
  if (!station?.url_resolved) {
    setStatus("У этой станции нет рабочей ссылки на поток.", "error");
    return;
  }

  if (!options.retry) playbackAttempts = 0;
  audio.src = station.url_resolved;
  audio.play().then(updatePlayPauseButton).catch(() => handlePlaybackError(station));
  currentStation = station;
  currentName.textContent = station.name || "Без названия";
  currentInfo.textContent = `${displayCountryName(station.country)} · ${station.language || "Unknown"} · ${station.bitrate || "?"} kbps`;
  trackMeta.textContent = `Источник: ${station.codec || "stream"}. ${isVerified(station) ? "Станция проходила проверку каталога." : "Каталог давно не подтверждал поток."}`;
  setStatus(`Играет: ${station.name || "станция"}.`, "ok");
  refreshHostLine(station, options.hostOffset || 0);
  addToHistory(station);
  renderStations(renderedStations);
}

function handlePlaybackError(station) {
  if (!station) return;
  const id = stationId(station);
  failedStationIds.add(id);
  playbackAttempts += 1;

  if (playbackAttempts >= MAX_PLAYBACK_ATTEMPTS) {
    setStatus(`Не удалось найти рабочий поток после ${MAX_PLAYBACK_ATTEMPTS} попыток. Попробуй снять фильтры.`, "error");
    currentInfo.textContent = "Автопоиск остановлен, чтобы не зациклиться на нерабочих потоках.";
    renderStations(renderedStations);
    return;
  }

  setStatus(`Поток не запустился. Пробуем следующую волну (${playbackAttempts + 1}/${MAX_PLAYBACK_ATTEMPTS})...`, "error");
  currentInfo.textContent = "Поток не запустился. Ищем замену автоматически.";
  playNext(station, { retry: true });
}

function playNext(fromStation = currentStation, options = {}) {
  if (queue.length) {
    const [next, ...rest] = queue;
    queue = rest;
    renderQueue();
    playStation(next, { hostOffset: 1, retry: options.retry });
    return;
  }

  const candidates = renderedStations.filter((station) => !failedStationIds.has(stationId(station)));
  if (!candidates.length) {
    setStatus("В текущем списке не осталось непроверенных вариантов. Попробуй изменить фильтры.", "error");
    return;
  }

  const start = Math.max(0, candidates.findIndex((station) => stationId(station) === stationId(fromStation)));
  const next = candidates[(start + 1) % candidates.length];
  if (next && stationId(next) !== stationId(fromStation)) playStation(next, { hostOffset: 1, retry: options.retry });
}

function playRandomStation() {
  const candidates = renderedStations.filter((station) => !failedStationIds.has(stationId(station)));
  if (!candidates.length) return;
  playStation(candidates[Math.floor(Math.random() * candidates.length)], { hostOffset: Date.now() });
}

function addToQueue(station) {
  queue = [...queue, station].slice(0, 30);
  renderQueue();
  setStatus(`${station.name || "Станция"} добавлена в очередь.`, "ok");
}

function renderQueue() {
  queueList.innerHTML = "";
  if (!queue.length) {
    queueList.innerHTML = '<li class="empty-state">Очередь пустая. Добавь станции кнопкой «+».</li>';
    return;
  }

  queue.forEach((station, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<strong>${index + 1}. ${safe(station.name)}</strong><small>${displayCountryName(station.country)} · ${safe(station.language || "Unknown")}</small>`;
    button.addEventListener("click", () => {
      queue = queue.filter((_, itemIndex) => itemIndex !== index);
      renderQueue();
      playStation(station);
    });
    item.appendChild(button);
    queueList.appendChild(item);
  });
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

function updatePlayPauseButton() {
  playPauseBtn.textContent = audio.paused ? "▶ Play" : "⏸ Pause";
}

function applyVolumeFromStorage() {
  const volume = Number(readJson(STORAGE.volume, 0.85));
  audio.volume = Math.min(1, Math.max(0, volume));
  volumeControl.value = String(Math.round(audio.volume * 100));
  audio.muted = Boolean(readJson(STORAGE.muted, false));
  muteBtn.textContent = audio.muted ? "🔇" : "🔊";
}

function exportFavoriteStations() {
  const payload = {
    app: "Radio Online",
    exportedAt: new Date().toISOString(),
    stations: favoriteStations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "radio-online-favorites.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function importFavoriteStations(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed) ? parsed : parsed.stations;
      if (!Array.isArray(imported)) throw new Error("Bad favorites file");
      favoriteStations = uniqueStations([...imported, ...favoriteStations]).slice(0, FAVORITE_LIMIT);
      favoriteIds = new Set(favoriteStations.map(stationId));
      writeJson(STORAGE.favoriteStations, favoriteStations);
      writeJson(STORAGE.favorites, [...favoriteIds]);
      applyFilters();
      setStatus(`Импортировано избранных станций: ${favoriteStations.length}.`, "ok");
    } catch {
      setStatus("Не удалось импортировать избранное: файл не похож на экспорт Radio Online.", "error");
    }
  });
  reader.readAsText(file);
}

function setSleepTimer(minutes) {
  clearSleepTimer();
  const value = Number(minutes);
  if (!value) {
    sleepTimerStatus.textContent = "Таймер выключен.";
    return;
  }

  sleepTimerEndsAt = Date.now() + value * 60 * 1000;
  sleepTimerId = setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
    updatePlayPauseButton();
    clearSleepTimer();
    sleepTimerStatus.textContent = "Таймер остановил эфир.";
  }, value * 60 * 1000);
  sleepTimerTicker = setInterval(updateSleepTimerStatus, 1000);
  updateSleepTimerStatus();
}

function clearSleepTimer() {
  clearTimeout(sleepTimerId);
  clearInterval(sleepTimerTicker);
  sleepTimerId = null;
  sleepTimerTicker = null;
  sleepTimerEndsAt = 0;
}

function updateSleepTimerStatus() {
  const remaining = Math.max(0, sleepTimerEndsAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  sleepTimerStatus.textContent = `Сонный таймер: ${minutes}:${String(seconds).padStart(2, "0")}`;
  if (remaining < 30000 && remaining > 0) audio.volume = Math.min(audio.volume, Math.max(0.05, remaining / 30000));
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  hostMode.value = preset.host;
  sortSelect.value = preset.sort;
  bitrateFilter.value = preset.minBitrate;
  searchInput.value = preset.query || "";
  if (preset.russianGlobal) russianGlobal.checked = true;
  refreshHostLine(currentStation);

  if (preset.randomCountry && countrySelect.options.length) {
    const options = [...countrySelect.options].filter((option) => option.value);
    countrySelect.value = options[Math.floor(Math.random() * options.length)].value;
    loadStations(countrySelect.value).catch(showLoadError);
    return;
  }

  if (preset.russianGlobal) loadStations(countrySelect.value).catch(showLoadError);
  else applyFilters();
}

searchInput.addEventListener("input", applyFilters);
[genreFilter, languageFilter, bitrateFilter, sortSelect, favoritesOnly, verifiedOnly].forEach((control) => control.addEventListener("change", applyFilters));
countrySelect.addEventListener("change", () => loadStations(countrySelect.value).catch(showLoadError));
russianGlobal.addEventListener("change", () => loadStations(countrySelect.value).catch(showLoadError));
hostMode.addEventListener("change", () => refreshHostLine(currentStation));
newHostLine.addEventListener("click", () => refreshHostLine(currentStation, Date.now()));
nextStation.addEventListener("click", () => playNext());
shuffleStation.addEventListener("click", playRandomStation);
clearHistory.addEventListener("click", () => { history = []; writeJson(STORAGE.history, history); renderHistory(); });
clearQueue.addEventListener("click", () => { queue = []; renderQueue(); });
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
exportFavorites.addEventListener("click", exportFavoriteStations);
importFavorites.addEventListener("click", () => importFavoritesFile.click());
importFavoritesFile.addEventListener("change", () => importFavoritesFile.files[0] && importFavoriteStations(importFavoritesFile.files[0]));
sleepTimer.addEventListener("change", () => setSleepTimer(sleepTimer.value));
presetButtons.forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));

playPauseBtn.addEventListener("click", () => {
  if (!currentStation) {
    playNext();
    return;
  }
  if (audio.paused) audio.play().catch(() => handlePlaybackError(currentStation));
  else audio.pause();
  updatePlayPauseButton();
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  writeJson(STORAGE.muted, audio.muted);
  muteBtn.textContent = audio.muted ? "🔇" : "🔊";
});

volumeControl.addEventListener("input", () => {
  audio.volume = Number(volumeControl.value) / 100;
  writeJson(STORAGE.volume, audio.volume);
});

audio.addEventListener("error", () => currentStation && handlePlaybackError(currentStation));
audio.addEventListener("ended", () => playNext());
audio.addEventListener("play", updatePlayPauseButton);
audio.addEventListener("pause", updatePlayPauseButton);

window.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (event.key === " ") {
    event.preventDefault();
    playPauseBtn.click();
  }
  if (event.key.toLowerCase() === "n") playNext();
  if (event.key === "/") {
    event.preventDefault();
    searchInput.focus();
  }
});

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
applyVolumeFromStorage();
renderHistory();
renderQueue();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
loadCountries().catch(showLoadError);
