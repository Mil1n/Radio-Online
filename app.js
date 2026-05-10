const API = "https://de1.api.radio-browser.info/json";

const countrySelect = document.getElementById("countrySelect");
const searchInput = document.getElementById("searchInput");
const stationList = document.getElementById("stationList");
const resultCount = document.getElementById("resultCount");
const audio = document.getElementById("audio");
const currentName = document.getElementById("currentName");
const currentInfo = document.getElementById("currentInfo");
const stationTemplate = document.getElementById("stationTemplate");

const FAVORITES = ["Russia", "Russian Federation", "United States"];
const COUNTRY_ALIASES = { Russia: "Россия", "Russian Federation": "Россия", "United States": "США" };

let stations = [];

const safe = (v) => String(v || "").replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[m]));
const displayCountryName = (name) => COUNTRY_ALIASES[name] || name;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Radio-Online-Demo" } });
  if (!response.ok) throw new Error("API error");
  return response.json();
}

function buildCountrySelect(countries) {
  const popular = countries.filter((c) => FAVORITES.includes(c.name));
  const others = countries.filter((c) => !FAVORITES.includes(c.name));

  const popularOptions = popular
    .map((c) => `<option value="${safe(c.name)}">⭐ ${displayCountryName(c.name)} · ${c.stationcount}</option>`)
    .join("");
  const otherOptions = others
    .map((c) => `<option value="${safe(c.name)}">${displayCountryName(c.name)} · ${c.stationcount}</option>`)
    .join("");

  countrySelect.innerHTML = `
    <optgroup label="Популярные страны">${popularOptions}</optgroup>
    <optgroup label="Все страны">${otherOptions}</optgroup>
  `;

  countrySelect.value = popular.some((c) => c.name === "Russia") ? "Russia" : countries[0]?.name || "";
}

async function loadCountries() {
  const countries = await fetchJson(`${API}/countries`);
  const top = countries.filter((c) => c.stationcount > 10).sort((a, b) => a.name.localeCompare(b.name));
  buildCountrySelect(top);
  await loadStations(countrySelect.value);
}

async function loadStations(country) {
  stationList.innerHTML = "<li>Загрузка станций...</li>";

  const byCountryUrl = `${API}/stations/bycountry/${encodeURIComponent(country)}?hidebroken=true&order=votes&reverse=true&limit=120`;
  const byCountry = await fetchJson(byCountryUrl);

  const isRussia = country === "Russia" || country === "Russian Federation";
  let merged = byCountry;

  if (isRussia) {
    const byRussian = await fetchJson(`${API}/stations/bylanguageexact/Russian?hidebroken=true&order=votes&reverse=true&limit=120`);
    const uniq = new Map();
    [...byCountry, ...byRussian].forEach((s) => uniq.set(s.stationuuid, s));
    merged = [...uniq.values()];
  }

  stations = merged;
  renderStations(stations);
}

function renderStations(list) {
  stationList.innerHTML = "";
  resultCount.textContent = list.length;

  if (!list.length) {
    stationList.innerHTML = "<li>Станции не найдены.</li>";
    return;
  }

  list.forEach((station) => {
    const node = stationTemplate.content.firstElementChild.cloneNode(true);
    const main = node.querySelector(".station-main");
    const playBtn = node.querySelector(".station-play");

    main.innerHTML = `<strong>${safe(station.name)}</strong><small>${safe(station.tags || "Без жанра")} · ${safe(station.bitrate || "?")} kbps · ${safe(station.language || "Unknown")}</small>`;

    const play = () => {
      audio.src = station.url_resolved;
      audio.play().catch(() => {
        currentInfo.textContent = "Поток не запустился. Выбери другую станцию.";
      });
      currentName.textContent = station.name;
      currentInfo.textContent = `${displayCountryName(station.country)} · ${station.language || "Unknown"}`;
    };

    main.addEventListener("click", play);
    playBtn.addEventListener("click", play);
    stationList.appendChild(node);
  });
}

searchInput.addEventListener("input", (e) => {
  const query = e.target.value.trim().toLowerCase();
  const filtered = stations.filter((s) =>
    `${s.name} ${s.tags || ""} ${s.language || ""}`.toLowerCase().includes(query)
  );
  renderStations(filtered);
});

countrySelect.addEventListener("change", () => loadStations(countrySelect.value));

loadCountries().catch(() => {
  stationList.innerHTML = "<li>Ошибка загрузки. Проверь подключение к интернету.</li>";
});