//const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel?offset=0&limit=2569&sprak=1";
const foodList = document.getElementById("foodList");
const foodListContainer = document.getElementById("foodListContainer");
const nutritionOutput = document.getElementById("nutritionOutput");
const searchInput = document.getElementById("foodInput");
const DEFAULT_SLIDER_MAX = 1000;
 // Drawer-element
 const mobileDrawer = document.getElementById("mobileDrawer");
 const drawerHandle = document.getElementById("drawerHandle");
 const drawerChev   = document.getElementById("drawerChev");
 const drawerContent = document.getElementById("drawerContent");
// Backdrop för klick-utanför-stäng
const drawerBackdrop = mobileDrawer?.querySelector(".drawer-backdrop");
drawerBackdrop?.addEventListener("click", () => {
  setDrawerOpen(false);                 // stänger och uppdaterar aria/overflow
});

const getPageChunk = () => (isMobile() ? 25 : 50);

// --- Källa: Livsmedelsverket ---
const LMV_SOURCE_URL = "https://soknaringsinnehall.livsmedelsverket.se/";
let   LMV_VERSION    = "2025-06-09"; // uppdatera vid behov

// (valfritt) Om du vill klistra in hela texten från deras sida och få ut datumet automatiskt:
function deriveLmvVersion(rawText) {
  // matchar "version YYYY-MM-DD" (skiftlägesokänsligt, tolererar extra mellanrum)
  const m = /version\s+(\d{4}-\d{2}-\d{2})/i.exec(rawText || "");
  return m ? m[1] : null;
}
// Exempel (om du vill använda regexen):
// const pasted = `Använd gärna uppgifter ... Livsmedelsdatabas version 2025-06-09. När ...`;
// const v = deriveLmvVersion(pasted); if (v) LMV_VERSION = v;


let currentList = [];
let renderedCount = 0;
let isAppending = false;
let io = null;
let sentinel = null;
let dietFilter = { type: 'all' };

let booted = false;

const nutritionCache = new Map(); // cache för /naringsvarden per livsmedels-id
const classCache = new Map();     // cache för /klassificeringar per livsmedels-id

function setDrawerOpen(open) {
  if (!isMobile()) return;
  mobileDrawer.classList.toggle("open", open);
  drawerHandle.setAttribute("aria-expanded", open ? "true" : "false");
  mobileDrawer.setAttribute("aria-hidden", open ? "false" : "true");

  document.documentElement.style.overflow = open ? "hidden" : "";
  document.body.style.overflow = open ? "hidden" : "";

  if (open) {
    drawerContent.scrollTop = 0;
    requestAnimationFrame(adjustSelectedListHeight);
  }

  // refresh the little "(n)" visibility on every toggle
  updateDrawerCount();
}

function setDrawerCount(n) {
  const el = document.getElementById('drawerCountText');
  const drawer = document.getElementById('mobileDrawer');
  if (!el || !drawer) return;

  if (n > 0 && !drawer.classList.contains('open')) {
    el.textContent = `antal poster: ${n}`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function updateDrawerCount() {
  const el = document.getElementById('drawerCount');
  if (!el) return;

  const count = (selectedFoods?.length || 0);

  // only show when drawer is CLOSED and there are items
  const drawerIsClosed = !mobileDrawer?.classList.contains('open');
  const shouldShow = isMobile() && drawerIsClosed && count > 0;

  el.textContent = shouldShow ? `(${count})` : '';
}


function getScrollRoot() {
  const left = document.querySelector('.main-left');
  if (left && (left.scrollHeight - left.clientHeight) > 2) {
    return left;                // .main-left är verkliga skrollcontainern
  }
  return null;                  // fall tillbaka till window
}

function lvFoodUrl(id) {
  // ev. sökord/kategori-parametrar behövs inte – sidan funkar fint utan
  return `https://soknaringsinnehall.livsmedelsverket.se/Home/FoodDetails/${id}`;
}

function showEmptyState() {
  nutritionOutput.innerHTML = `
    <div id="emptyState" class="empty-state">
      <h2>Välkommen till Kostplaneraren</h2>
      <p>Skriv i sökfältet ovan för att börja. Exempel: <em>ägg</em>, <em>kyckling</em>, <em>broccoli</em>.</p>

      <hr style="border:none; border-top:1px solid #eef1f1; margin:14px 0 10px;">

      <p class="source-note">
        <strong>Källa:</strong>
        <a href="${LMV_SOURCE_URL}" target="_blank" rel="noopener">Livsmedelsverkets Livsmedelsdatabas</a>
        version <span id="lmvVer">${LMV_VERSION}</span>.<br>
      </p>
    </div>
    <div id="resultsCards" hidden></div>
    <div class="loadmore-bar">
      <button id="loadMoreBtn" style="display:none;">Visa fler</button>
    </div>`;
}

function showNoHits(term) {
  nutritionOutput.innerHTML = `
    <div class="empty-state">
      <h2>Inga träffar</h2>
      <p>Hittade inget som matchar <strong>${term}</strong>. Prova ett annat ord.</p>
    </div>
    <div id="resultsCards" hidden></div>
    <div class="loadmore-bar">
      <button id="loadMoreBtn" style="display:none;">Visa fler</button>
    </div>`;
}

function clearEmptyStates() {
  // ta bort både välkomst-rutan och "inga träffar"-rutan
  document.querySelectorAll('.empty-state').forEach(el => el.remove());
}

const dietSelect = document.getElementById('dietSelect');
dietSelect?.addEventListener('change', () => {
  const v = dietSelect.value;
  // Mappning från menyvärden → interna filtertyper
  const map = {
    'alla':        'all',
    'keto_x':      'keto3',        // ≤ 3 g nettokolhydrater (fallback till total om netto saknas)
    'lchf_strikt': 'lchf5',        // ≤ 5 g netto
    'lchf_liberal':'lchf10',       // ≤ 10 g netto
    'hogprotein':  'hp20',         // ≥ 20 g protein/100 g
    'lag_fett':    'lowfat3',      // ≤ 3 g fett/100 g
    'lag_mattat':  'lowsat1_5',    // ≤ 1.5 g mättat fett/100 g
    'medelhav':    'medelhav',     // omättat ≥ 2× mättat (approx: (totalt−mättat) ≥ 2×mättat)
    'lag_socker':  'sugar5',       // ≤ 5 g socker/100 g
    'lag_salt':    'lowsalt0_3',   // ≤ 0.3 g salt/100 g
    'fiberrik':    'fiber6',       // ≥ 6 g fiber/100 g
    'lag_energi':  'lowkcal80'     // ≤ 80 kcal/100 g
  };
  dietFilter = { type: map[v] ?? 'all' };

  // Kör om aktuell sökning så listan uppdateras med filtret
  doSearch(searchInput.value);
});

const clearBtn = document.getElementById("clearSearch");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    // 0) Fånga ett bra scrollmål innan DOM ändras
    const firstCard = document.querySelector(".food-card");
    const headerH = parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--header-h')
    ) || 0;

    // Scrolla till översta kortet om det finns, annars till resultatcontainern
    const targetY = ((firstCard
        ? firstCard.getBoundingClientRect().top + window.scrollY
        : nutritionOutput.offsetTop) - Math.max(0, headerH - 8));

    // 1) Rensa fältet direkt (snappy UI)
    searchInput.value = "";
    clearBtn.style.visibility = "hidden";
    searchInput.focus();

    // 2) Scrolla med nuvarande layout kvar
    window.scrollTo({ top: targetY, behavior: "smooth" });

    // 3) Töm resultaten i nästa frame (så scrollen hinner börja)
    requestAnimationFrame(() => {
      clearTimeout(inputDebounce);
      doSearch(""); // snabb-töm: inga fetch/render av kort
    });
  });
}

// Hjälpare: hämta första träffen vars namn innehåller något av nycklarna
function pickValue(nutritionData, keys) {
  const hit = nutritionData.find(n => {
    const nm = (n.namn || "").toLowerCase();
    return keys.some(k => nm.includes(k));
  });
  return hit ? Number(hit.varde) : null;
}

// (valfritt) Stäng även på ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setDrawerOpen(false);
});
// Referenser för desktop-kolumnen
const rightInner = document.querySelector(".right-inner");
const selectedFoodsListEl = document.getElementById("selectedFoodsList");
const summaryEl = document.getElementById("summary");
const sidebarHeader = document.querySelector(".sidebar-header");

function makeFinder(nutritionData){
  const rows = (nutritionData || []).map(n => ({
    key: (n.namn || "").toLowerCase().trim().replace(/\s+/g,' '),
    rawName: n.namn || "",
    value: Number(n.varde),
    unit: n.enhet || ""
  }));
  const norm = s => s.toLowerCase().trim().replace(/\s+/g,' ');
  return (aliases) => {
    const al = aliases.map(norm);
    // 1) exakt match
    let hit = rows.find(r => al.includes(r.key));
    // 2) prefix
    if (!hit) hit = rows.find(r => al.some(a => r.key.startsWith(a)));
    // 3) inkluderar, men uteslut fettsyror
    if (!hit) hit = rows.find(r => al.some(a => r.key.includes(a)) && !/fettsyra|fettsyror/.test(r.key));
    return hit ? { value: hit.value, unit: hit.unit, label: hit.rawName } : null;
  };
}


function passesDietFilter(carbsPer100) {
  return carbsPer100 <= dietFilter.carbMax;
}

function onModalBackdropClick(e) {
  // Stäng om klicket/touchen inte var inne i rutan
  if (!e.target.closest('.modal-content')) {
    closeFoodModal();
  }
}

function renderInit(list, version, signal) {
  currentList = list || [];
  renderedCount = 0;
  isAppending = false;

  clearEmptyStates();

  // Se till att scaffold finns (empty-state skapar resultsCards + knapp)
  if (!document.getElementById('resultsCards')) {
    showEmptyState();
  }
  // Rensa tidigare kort för ny rendering
  const cardsWrap = document.getElementById('resultsCards');
  if (cardsWrap) cardsWrap.innerHTML = '';
  // Se till att knappen börjar dold
  const btn = document.getElementById('loadMoreBtn');
  if (btn) btn.style.display = 'none';

  // Skapa/injicera sentinel för infinite scroll
  sentinel = document.createElement('div');
  sentinel.id = 'resultsSentinel';
  sentinel.style.height = '1px';
  nutritionOutput.appendChild(sentinel);

  // Koppla knapp
  if (btn) btn.onclick = async () => {
   btn.disabled = true;
   const oldText = btn.textContent;
   btn.textContent = 'Laddar…';
   await renderNextChunk(version, signal);
   btn.disabled = false;
   btn.textContent = oldText;
 };

  setupInfiniteScroll(version, signal);
  renderNextChunk(version, signal); // första chunk
}

async function renderNextChunk(version, signal) {
  if (isAppending) return;
  if (renderedCount >= currentList.length) return;

  isAppending = true;
  // dölj knappen medan vi arbetar, så den inte “studsar”
  const btn = document.getElementById('loadMoreBtn');
  if (btn) btn.style.display = 'none';

  const start = renderedCount;
  const pageSize = getPageChunk();
  const end = Math.min(start + pageSize, currentList.length);
  const chunk = currentList.slice(start, end);

  // 🔑 Append bara nya kort – rör inte redan renderat
  const shownInChunk = await renderFoodCardsAppend(chunk, version, signal);
  renderedCount = end;
  isAppending = false;

  clearEmptyStates();

  // Om vi fick för få i denna chunk: hämta nästa chunk automatiskt
  if (shownInChunk < 6 && renderedCount < currentList.length) {
    // fortsätt mata tills vi uppnått 6 kort eller tar slut
    return renderNextChunk(version, signal);
  }

  // Om inget kort alls synts och allt är slut → ingen träff
  const anyVisible = document.querySelector('.food-card');
  if (!anyVisible && renderedCount >= currentList.length) {
    nutritionOutput.innerHTML = `
      <div class="empty-state">
        <h2>Inga träffar för valt filter</h2>
        <p>Justera filtret eller sökordet och försök igen.</p>
      </div>
    `;
  }
  // Annars: visa knappen om det finns mer att hämta
  if (btn) btn.style.display = (renderedCount < currentList.length) ? 'inline-block' : 'none';

  // Flytta sentinel sist så IO triggar när vi når botten igen
  if (sentinel && sentinel.parentNode !== nutritionOutput) {
    nutritionOutput.appendChild(sentinel);
  }
  // Om IO finns: se till att den observerar aktuell sentinel
  if (io && sentinel) io.observe(sentinel);
}

function setupInfiniteScroll(version, signal) {
  // Fallback till "Visa fler"-knapp om IO saknas
  const btn = document.getElementById('loadMoreBtn');
  if (!('IntersectionObserver' in window)) {
    if (btn) btn.style.display = 'inline-block';
    return;
  }
  if (io) io.disconnect();

  const scrollRoot = getScrollRoot(); // 👈 dynamiskt: .main-left eller window
  io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) renderNextChunk(version, signal);
    });
  }, { root: scrollRoot, rootMargin: '800px', threshold: 0 });

  if (sentinel) io.observe(sentinel);
}


function setHeaderHeightVar() {
  const h = document.querySelector(".header-top")?.offsetHeight || 0;
  document.documentElement.style.setProperty("--header-h", `${h}px`);
}
window.addEventListener("load", setHeaderHeightVar);
window.addEventListener("resize", setHeaderHeightVar);

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function mountIntoDrawer() {
  if (!isMobile()) return;
  if (!drawerContent.contains(sidebarHeader))      drawerContent.prepend(sidebarHeader);
  if (!drawerContent.contains(selectedFoodsListEl)) drawerContent.append(selectedFoodsListEl);
  if (!drawerContent.contains(summaryEl))           drawerContent.append(summaryEl);
}

function mountBackToRightColumn() {
  if (isMobile()) return;
  const rightInner = document.querySelector(".right-inner");
  if (!rightInner.contains(sidebarHeader))        rightInner.prepend(sidebarHeader);
  if (!rightInner.contains(selectedFoodsListEl))  rightInner.append(selectedFoodsListEl);
  if (!rightInner.contains(summaryEl))            rightInner.append(summaryEl);
}


function setDrawerCount(n) {
  const el = document.getElementById('drawerCountText');
  const drawer = document.getElementById('mobileDrawer');
  if (!el || !drawer) return;

  const isOpen = drawer.classList.contains('open');

  if (n > 0 && !isOpen) {
    el.textContent = `(antal poster: ${n})`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}


 // Toggle på klick (bara på mobil)
 drawerHandle?.addEventListener("click", () => {
   if (!isMobile()) return;
   const nowOpen = !mobileDrawer.classList.contains("open");
   setDrawerOpen(nowOpen);
 });

 // Flytta in/ut vid start & vid resize
 function syncDrawerMount() {
   if (isMobile()) {
     mountIntoDrawer();
   } else {
     setDrawerOpen(false);
     mountBackToRightColumn();
     // återställ ev. overflow på desktop
     document.documentElement.style.overflow = "";
     document.body.style.overflow = "";
   }
   // efter mount: justera höjdbegränsning
   requestAnimationFrame(adjustSelectedListHeight);

  // Root kan ha ändrats (mobil ↔ desktop), bygg om IO
  setupInfiniteScroll(currentSearchVersion, currentAbortController?.signal);

 }
window.addEventListener("resize", () => {
  syncDrawerMount();
  updateDrawerCount();
});
document.addEventListener("DOMContentLoaded", () => {
  syncDrawerMount();       // flytta in denna
  showEmptyState();        // din välkomstvy
  booted = true;
  updateDrawerCount();     // initiera "(n)" direkt
});

let foodData = [];
let selectedFoods = [];
let currentSearchVersion = 0;
let lastSearchTerm = "";
let currentAbortController = null;
let inputDebounce = null;

// Hjälp-funktion: jämför två namn utifrån ett sökord
function compareBySearch(a, b, term) {
  const t = term.toLowerCase();
  const an = a.namn.toLowerCase();
  const bn = b.namn.toLowerCase();

  const aExact = an === t;
  const bExact = bn === t;
  if (aExact !== bExact) return bExact - aExact; // exact match först

  const aStarts = an.startsWith(t);
  const bStarts = bn.startsWith(t);
  if (aStarts !== bStarts) return bStarts - aStarts; // börjar med term härnäst

  const ai = an.indexOf(t);
  const bi = bn.indexOf(t);
  if (ai !== bi) return ai - bi; // lägre index först

  if (an.length !== bn.length) return an.length - bn.length; // kortare namn först
  return an.localeCompare(bn, 'sv'); // stabil alfabetisk ordning (svenska)
}

const summary = {
    totalEnergy: 0,
    totalCarbs: 0,
    totalFat: 0,
    totalProtein: 0
};

function getValue(food, namn) {
    if (!food.naringsvarden) return 0;

    const item = food.naringsvarden.find(n => n.namn.toLowerCase().includes(namn.toLowerCase()));
    return item ? item.varde : 0;
}

async function fetchClassification(foodId) {
    const classificationUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${foodId}/klassificeringar?sprak=1`;

    try {
        const response = await fetch(classificationUrl);
        const data = await response.json();

        // Kontrollera om klassificeringar finns
        if (data && data.length > 0) {

            const groupName = data[0].namn;
            return groupName;
        } else {
            return "Ingen klassificering tillgänglig";
        }
    } catch (error) {
        console.error("Fel vid hämtning av klassificeringar:", error);
        return "Fel vid hämtning";
    }

}

async function fetchAllFoods() {
  const limit = 2500;   // sidstorlek
  let offset = 0;
  let all = [];

  while (true) {
    const res = await fetch(
      `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel?offset=${offset}&limit=${limit}&sprak=1`
    );
    const data = await res.json();

    const batch = (data.livsmedel || []).map(food => ({
      id: food.nummer,
      namn: food.namn
    }));

    all.push(...batch);

    if (batch.length < limit) break; // sista sidan nådd
    offset += limit;
  }
  return all;
}

fetchAllFoods()
  .then(list => {
    foodData = list;
    
    // Låt tom-state ligga kvar tills användaren söker.
    // Om du vill återställa tom-state när data kommit första gången:
    if (!document.getElementById('resultsCards')) {
      showEmptyState();
    }
  })
  .catch(err => console.error("Fel vid hämtning av alla livsmedel:", err));


function scrollToResultsTop() {
  // Om .main-left skrollar (overflow-y:auto), skrolla den.
  const left = document.querySelector('.main-left');
  if (left && left.scrollHeight > left.clientHeight) {
    if (left.scrollTop < 120) return;
    left.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // Annars: skrolla fönstret
  if (window.scrollY < 120) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function doSearch(rawTerm) {
  const searchTerm = (rawTerm || "").toLowerCase();
  lastSearchTerm = searchTerm.trim();

  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  currentSearchVersion++;

  if (!lastSearchTerm) {
    // Tillbaka till hela listan (paginerat)
    renderInit(foodData, currentSearchVersion, currentAbortController.signal);
    scrollToResultsTop();   // ⬅️ skrolla upp även vid tom sökning
    return;
  }

  const filteredData = foodData
    .filter(item => item.namn.toLowerCase().includes(lastSearchTerm))
    .sort((a, b) => compareBySearch(a, b, lastSearchTerm));

  if (filteredData.length === 0) {
    showNoHits(lastSearchTerm);
    return;
  }

  renderInit(filteredData, currentSearchVersion, currentAbortController.signal);
  scrollToResultsTop();
}

// Init: visa/dölj kryss
if (clearBtn) clearBtn.style.visibility = searchInput.value ? "visible" : "hidden";

searchInput.addEventListener("input", function () {
  const term = searchInput.value;
  if (clearBtn) clearBtn.style.visibility = term ? "visible" : "hidden";
  clearTimeout(inputDebounce);
  inputDebounce = setTimeout(() => doSearch(term), 150); // 150ms debounce
});

searchInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    clearTimeout(inputDebounce);
    doSearch(searchInput.value);
  }
});

function buildFilterPredicate(filterType) {
  switch (filterType) {
    case 'keto3':   return n => (n.netCarbs ?? n.carbs) <= 3;
    case 'lchf5':   return n => (n.netCarbs ?? n.carbs) <= 5;
    case 'lchf10':  return n => (n.netCarbs ?? n.carbs) <= 10;
    case 'hp20':    return n => n.protein >= 20;
    case 'lowfat3':   return n => n.fat <= 3;
    case 'lowsat1_5': return n => (n.satFat ?? Infinity) <= 1.5;
    case 'medelhav':  return n => {
      // Approx: omättat ≈ totalt fett − mättat fett
      if (!Number.isFinite(n.fat) || !Number.isFinite(n.satFat)) return false;
      const unsat = Math.max(0, n.fat - n.satFat);
      return unsat >= 2 * n.satFat;
    };
    case 'sugar5':    return n => (n.sugar ?? 0) <= 5;
    case 'lowsalt0_3':return n => (n.salt  ?? Infinity) <= 0.3;
    case 'fiber6':    return n => (n.fiber ?? 0) >= 6;
    case 'lowkcal80': return n => n.kcal <= 80;
    // kvar från tidigare om du använder dem någon annanstans
    case 'lean':      return n => n.protein >= 20 && n.fat <= 5;
    case 'lc50':      return n => n.kcal <= 50;
    case 'hf15':      return n => n.fat >= 15;
    case 'fiber5':    return n => (n.fiber ?? 0) >= 5;
    case 'all':
    default:        return _ => true;
  }
}

async function renderFoodCardsAppend(data, version = null, signal = null) {
  const cardsRoot = document.getElementById('resultsCards') || nutritionOutput;
  const cardsWrap = document.getElementById('resultsCards');
  if (cardsWrap && cardsWrap.hasAttribute('hidden')) cardsWrap.removeAttribute('hidden');

  let shownInChunk = 0;
  // Skelettkort
  for (const food of data) {
    const card = document.createElement("div");
    card.className = "food-card";
    card.id = `food-${food.id}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    card.innerHTML = `
      <h3>${food.namn}</h3>
      <p class="loading">Laddar näringsvärden...</p>
    `;
    if (lastSearchTerm && food.namn.toLowerCase() === lastSearchTerm) {
      card.classList.add("highlight");
    }
    cardsRoot.appendChild(card);
  }

  // Hjälpare för klassificering (samma som hos dig)
  const fetchClassificationWithSignal = async (id, s) => {
    const url = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${id}/klassificeringar?sprak=1`;
    const res = await fetch(url, s ? { signal: s } : undefined);
    const data = await res.json();
    return (data && data.length > 0) ? data[0].namn : "Ingen klassificering tillgänglig";
  };

  // Fyll korten
  await Promise.all(data.map(async (food) => {
    const nutritionUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${food.id}/naringsvarden?sprak=1`;
    try {
        const nutritionData = nutritionCache.get(food.id)
        ?? await fetch(nutritionUrl, signal ? { signal } : undefined).then(r => r.json());
        nutritionCache.set(food.id, nutritionData);

      if (version !== null && version !== currentSearchVersion) return;

      const getEnergyKcal = () => {
        const item = nutritionData.find(n =>
          n.namn.toLowerCase().includes("energi") &&
          n.enhet && n.enhet.toLowerCase().includes("kcal")
        );
        return item ? item.varde : 0;
      };
      const getValue = (name) => {
        const item = nutritionData.find(n => n.namn.toLowerCase().includes(name.toLowerCase()));
        return item ? item.varde : 0;
      };

      // skapa "find" för just detta livsmedels nutritionData
      const find = makeFinder(nutritionData);

      // Normaliserad karta med svenska alias (utökad lite för robusthet)
      const norm = {
        energy_kcal:      find(['energi (kcal)']),
        energy_kj:        find(['energi (kj)']),
        carbs_g:          find(['kolhydrater, tillgängliga','kolhydrater','kolhydrat']),
        sugars_g:         find(['sockerarter, totalt','sockerarter','socker']),
        free_sugar_g:     find(['fritt socker']),
        added_sugar_g:    find(['tillsatt socker']),
        // Livsmedelsverket använder ofta "Fibrer" eller "Kostfiber"
        fiber_g:          find(['fibrer','kostfiber','fiber']),
        fat_g:            find(['fett, totalt','fett totalt','fett (g)']),
        fat_saturated_g:  find(['summa mättade fettsyror','summa mättade']),
        fat_mono_g:       find(['summa enkelomättade fettsyror','summa enkelomättade']),
        fat_poly_g:       find(['summa fleromättade fettsyror','summa fleromättade']),
        protein_g:        find(['protein']),
        salt_g:           find(['salt, nacl']),
        sodium_mg:        find(['natrium, na']),
        cholesterol_mg:   find(['kolesterol']),
        water_g:          find(['vatten']),
        alcohol_g:        find(['alkohol']),
      };

      // Kärnvärden (med fallback för fett)
      const energiKcal  = norm.energy_kcal?.value ?? getEnergyKcal();
      const kolhydrater = norm.carbs_g?.value ?? 0;

      let fett = norm.fat_g?.value;
      if (!Number.isFinite(fett)) {
        const parts = [
          norm.fat_saturated_g?.value,
          norm.fat_mono_g?.value,
          norm.fat_poly_g?.value
        ].filter(Number.isFinite);
        if (parts.length) fett = +(parts.reduce((a,b)=>a+b,0).toFixed(1));
      }
      fett = Number.isFinite(fett) ? fett : 0;

      const protein = norm.protein_g?.value ?? 0;
      const fiber   = norm.fiber_g?.value ?? null;
      const sugar   = norm.sugars_g?.value ?? null;

      // ——— härledda värden som filter behöver ———
      const salt_g = norm.salt_g?.value ?? (norm.sodium_mg ? (norm.sodium_mg.value / 1000) * 2.5 : null); // Na mg → salt g
      const satFat_g = norm.fat_saturated_g?.value ?? null;
      const netCarbs_g = (Number.isFinite(kolhydrater) && Number.isFinite(fiber))
        ? Math.max(0, +(kolhydrater - fiber).toFixed(1))
        : null;

      // Filtrera enligt valt filter
      const predicate = buildFilterPredicate(dietFilter.type || 'all');
      const pass = predicate({
        kcal: energiKcal,
        carbs: kolhydrater,
        fat: fett,
        protein: protein,
        fiber: fiber,
        sugar: sugar,
        salt:  salt_g,
        satFat: satFat_g,
        netCarbs: netCarbs_g
      });
      if (!pass) {
        document.getElementById(`food-${food.id}`)?.remove();
        return;
      }
      shownInChunk++;

      const groupName = classCache.get(food.id)
      ?? await fetchClassificationWithSignal(food.id, signal);
      classCache.set(food.id, groupName);


      const addedSugar_g = norm.added_sugar_g?.value ?? null;
      const freeSugar_g  = norm.free_sugar_g?.value  ?? null;
      // välj “tillsatt socker” först, annars fritt/total
      const sugarLabel = norm.added_sugar_g?.label ?? norm.free_sugar_g?.label ?? norm.sugars_g?.label;
      const sugarValue = addedSugar_g ?? freeSugar_g ?? norm.sugars_g?.value ?? null;

      const proteinPer100kcal = energiKcal > 0 ? +( (protein / (energiKcal / 100)).toFixed(1) ) : null;
      const cholesterol_mg = norm.cholesterol_mg?.value ?? null;

      // liten formatter
      const f1 = n => Number.isFinite(n) ? (Math.round(n * 10) / 10) : null;

      // ——— bygg chips ———
      const chips = [];
      if (Number.isFinite(fiber))         chips.push(`<span class="chip">${norm.fiber_g?.label ?? 'Fibrer'}: ${f1(fiber)} g</span>`);
      if (Number.isFinite(sugarValue))    chips.push(`<span class="chip">${sugarLabel ?? 'Socker'}: ${f1(sugarValue)} g</span>`);
      if (Number.isFinite(salt_g))        chips.push(`<span class="chip">Salt: ${f1(salt_g)} g</span>`);
      if (Number.isFinite(satFat_g))      chips.push(`<span class="chip">Mättat fett: ${f1(satFat_g)} g</span>`);
      if (Number.isFinite(netCarbs_g))    chips.push(`<span class="chip">Netto-kolhydrater: ${f1(netCarbs_g)} g</span>`);
      if (Number.isFinite(proteinPer100kcal)) chips.push(`<span class="chip">Protein/100 kcal: ${f1(proteinPer100kcal)} g</span>`);
      if (Number.isFinite(cholesterol_mg))    chips.push(`<span class="chip">Kolesterol: ${Math.round(cholesterol_mg)} mg</span>`);

      // (valfritt) begränsa hur många som syns för att undvika “chip-sallad”
      const extrasHtml = chips.length ? `<div class="extras">${chips.slice(0, 4).join('')}</div>` : '';



      const card = document.getElementById(`food-${food.id}`);
      if (!card) return;
     
      card.innerHTML = `
        <h3>${food.namn} <small class="per100">(per 100 g)</small></h3>
        <p><strong>Grupp:</strong> ${groupName}</p>
        <p><strong>Energi:</strong> ${energiKcal} kcal</p>
        <p><strong>Kolhydrater:</strong> ${kolhydrater} g</p>
        <p><strong>Fett:</strong> ${fett} g</p>
        <p><strong>Protein:</strong> ${protein} g</p>
        ${extrasHtml}
      `;

      if (lastSearchTerm && food.namn.toLowerCase() === lastSearchTerm) {
        card.classList.add("highlight");
        setTimeout(() => card.classList.remove("highlight"), 1800);
      }

      // Samla allt vi vill visa/beräkna i modalen (per 100 g)
      const detail = {
        energy_kcal:  energiKcal,
        carbs_g:      kolhydrater,
        fat_g:        fett,
        protein_g:    protein,
        fiber_g:      fiber,
        sugar_g:      sugarValue,
        sugar_label:  sugarLabel,
        salt_g:       salt_g,
        satFat_g:     satFat_g,
        netCarbs_g:   netCarbs_g
      };

      // Öppna modalen med objektet istället för 6 separata parametrar
      const openModal = () => showFoodModal(food, groupName, detail);
      card.addEventListener("click", openModal);

      card.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openModal(); }
      });

    } catch (err) {
      if (err.name === "AbortError") return;
      if (version !== null && version !== currentSearchVersion) return;
      const card = document.getElementById(`food-${food.id}`);
      if (card) {
        const loading = card.querySelector(".loading");
        if (loading) loading.textContent = "Kunde inte hämta näringsvärden.";
      }
    }
  }));
  return shownInChunk;
}

function addFood(id, namn, energiKcal, kolhydrater, fett, protein, quantity = null, extras = {}) {
  const qty = quantity !== null ? quantity : (parseInt(document.getElementById("quantity" + id).value, 10) || 100);

  const existingItem = selectedFoods.find(item => item.id === id);

  if (existingItem) {
    existingItem.quantity += qty;
  } else {
    selectedFoods.push({
      id, name: namn, quantity: qty,
      energiKcal, kolhydrater, fett, protein,
      // nya fält (kan vara null)
      fiber:    extras.fiber ?? null,
      sugar:    extras.sugar ?? null,
      sugar_label: extras.sugar_label ?? null,
      salt:     extras.salt ?? null,
      satFat:   extras.satFat ?? null,
      netCarbs: extras.netCarbs ?? null
    });
  }
  setDrawerCount(selectedFoods.length);
  updateSelectedFoodsList();
  adjustSelectedListHeight();
  updateSummary();
}


function updateSelectedFoodsList() {
    foodList.innerHTML = "";

    for (let i = 0; i < selectedFoods.length; i++) {
        const item = selectedFoods[i];


        const maxLength = 35; // Max längd för namn i listan
        let trimmedName = item.name.length > maxLength
            ? item.name.substring(0, maxLength - 3) + "..."
            : item.name;

        const sliderMax = Math.max(DEFAULT_SLIDER_MAX, item.quantity);

        foodList.innerHTML +=
        `<li class="food-list-item">
            <input type="range" min="0" max="${sliderMax}" step="10"
                    value="${item.quantity}"
                    class="quantity-slider"
                    oninput="onSlider(${i}, this)">
            <input type="number" min="0" step="1"
                    value="${item.quantity}"
                    class="quantity-input"
                    oninput="onNumber(${i}, this)">
            <span class="food-amount">${item.quantity} g ${trimmedName}</span>
            <button class="adjust-button remove" onclick="removeFood(${i})" title="Ta bort">
                <i class="fa-solid fa-trash"></i>
            </button>
        </li>`;

    }
    setDrawerCount(selectedFoods.length);
    updateSummary();
}

function updateQuantity(index, newValue, labelElement) {
  const quantity = parseInt(newValue, 10);
  selectedFoods[index].quantity = quantity;

  // Uppdatera direkt etiketten som visas
  const name = selectedFoods[index].name;
  const maxLength = 35;
  const trimmedName = name.length > maxLength
      ? name.substring(0, maxLength - 3) + "..."
      : name;

  labelElement.textContent = `${quantity} g ${trimmedName}`;

  // Uppdatera summeringen direkt
  updateSummary();
}


function removeFood(index) {
    selectedFoods.splice(index, 1);
    updateSelectedFoodsList();
    adjustSelectedListHeight();
}

function increaseQuantity(index) {
    selectedFoods[index].quantity += 10;
    updateSelectedFoodsList();
    adjustSelectedListHeight();
}

function decreaseQuantity(index) {
    selectedFoods[index].quantity -= 10;
    if (selectedFoods[index].quantity <= 0) {
        selectedFoods.splice(index, 1);
    }
    updateSelectedFoodsList();
    adjustSelectedListHeight();
}

function updateSummary() {
  // Totals
  let totalEnergy = 0, totalCarbs = 0, totalFat = 0, totalProtein = 0;
  let totalFiber = 0, totalSugar = 0, totalSalt = 0, totalSatFat = 0, totalNetCarbs = 0;

  for (const item of selectedFoods) {
    const f = (item.quantity || 0) / 100;

    totalEnergy  += (item.energiKcal   || 0) * f;
    totalCarbs   += (item.kolhydrater  || 0) * f;
    totalFat     += (item.fett         || 0) * f;
    totalProtein += (item.protein      || 0) * f;

    if (Number.isFinite(item.fiber))     totalFiber    += item.fiber    * f;
    if (Number.isFinite(item.sugar))     totalSugar    += item.sugar    * f;
    if (Number.isFinite(item.salt))      totalSalt     += item.salt     * f;
    if (Number.isFinite(item.satFat))    totalSatFat   += item.satFat   * f;

    // Netto-kolhydrater: använd lagrat värde om det finns, annars carbs - fiber
    if (Number.isFinite(item.netCarbs)) {
      totalNetCarbs += item.netCarbs * f;
    } else if (Number.isFinite(item.kolhydrater) && Number.isFinite(item.fiber)) {
      totalNetCarbs += Math.max(0, item.kolhydrater - item.fiber) * f;
    }
  }

  const fmt1 = n => (Math.round(n * 10) / 10).toFixed(1);

  document.getElementById("totalEnergy").textContent  = `Total energi: ${fmt1(totalEnergy)} kcal`;
  document.getElementById("totalCarbs").textContent   = `Totala kolhydrater: ${fmt1(totalCarbs)} g`;
  document.getElementById("totalFat").textContent     = `Totalt fett: ${fmt1(totalFat)} g`;
  document.getElementById("totalProtein").textContent = `Totalt protein: ${fmt1(totalProtein)} g`;

  // Kommatecken-separerad rad med extra-summeringar
  const parts = [];
  if (totalFiber > 0)     parts.push(`Fiber: ${fmt1(totalFiber)} g`);
  if (totalSugar > 0)     parts.push(`Socker: ${fmt1(totalSugar)} g`);
  if (totalSalt > 0)      parts.push(`Salt: ${fmt1(totalSalt)} g`);
  if (totalSatFat > 0)    parts.push(`Mättat fett: ${fmt1(totalSatFat)} g`);
  if (totalNetCarbs > 0)  parts.push(`Netto-kolhydrater: ${fmt1(totalNetCarbs)} g`);

  let metaEl = document.getElementById("summaryMeta");
  if (!metaEl) {
    metaEl = document.createElement("p");
    metaEl.id = "summaryMeta";
    metaEl.className = "summary-meta";
    document.getElementById("summary").appendChild(metaEl);
  }
  metaEl.textContent = parts.join(', ');

  // Håller höjder i schack på mobil/desktop
  adjustSelectedListHeight();
  updateDrawerCount();
}

function syncRow(index, qty, numberEl, sliderEl, labelEl) {
  // 1) Normalisera och spara
  const q = Math.max(0, isNaN(qty) ? 0 : Math.round(qty));
  selectedFoods[index].quantity = q;

  // 2) Håll kontrollerna i synk
  if (numberEl && numberEl.value != q) numberEl.value = q;
  if (sliderEl) {
    const max = parseInt(sliderEl.max, 10) || 0;
    if (q > max) sliderEl.max = q;   // låt slidern “växa” med värdet
    if (sliderEl.value != q) sliderEl.value = q;
  }

  // 3) Uppdatera etiketten
  const name = selectedFoods[index].name;
  const maxLength = 35;
  const trimmedName = name.length > maxLength ? name.substring(0, maxLength - 3) + "..." : name;
  if (labelEl) labelEl.textContent = `${q} g ${trimmedName}`;

  // 4) Uppdatera summeringen direkt
  updateSummary();
}

function onSlider(index, sliderEl) {
  const li = sliderEl.closest("li");
  const numberEl = li.querySelector(".quantity-input");
  const labelEl  = li.querySelector(".food-amount");
  syncRow(index, parseInt(sliderEl.value, 10), numberEl, sliderEl, labelEl);
}

function onNumber(index, numberEl) {
  const li = numberEl.closest("li");
  const sliderEl = li.querySelector(".quantity-slider");
  const labelEl  = li.querySelector(".food-amount");
  syncRow(index, parseInt(numberEl.value, 10), numberEl, sliderEl, labelEl);
}


function showFoodModal(food, group, d) {
  const modal = document.getElementById("foodModal");
  const body  = document.getElementById("modalBody");

  // Bygg extra-rader (de hamnar i ett <details>-block längre ner)
  const extraRows = [];
  if (Number.isFinite(d.fiber_g))     extraRows.push(`<li class="extra">Fiber: <strong><span id="calcFiber">0</span> g</strong></li>`);
  if (Number.isFinite(d.sugar_g))     extraRows.push(`<li class="extra">${d.sugar_label ?? 'Tillsatt socker'}: <strong><span id="calcSugar">0</span> g</strong></li>`);
  if (Number.isFinite(d.salt_g))      extraRows.push(`<li class="extra">Salt: <strong><span id="calcSalt">0</span> g</strong></li>`);
  if (Number.isFinite(d.satFat_g))    extraRows.push(`<li class="extra">Mättat fett: <strong><span id="calcSatFat">0</span> g</strong></li>`);
  if (Number.isFinite(d.netCarbs_g))  extraRows.push(`<li class="extra">Netto-kolhydrater: <strong><span id="calcNetCarbs">0</span> g</strong></li>`);

  const extrasHtml = extraRows.length
  ? `
  <details class="nutr-extras">
  <summary>Fler näringsvärden</summary>
  <ul class="modal-extras">${extraRows.join('')}</ul>
  </details>`
  : '';
  
  const lvUrl = lvFoodUrl(food.id);
  const sourceDate = window.lvReleaseDateText || ""; // om du redan läser ut datumet globalt

  body.innerHTML = `
    <h2>${food.namn}</h2>
    <p><strong>Grupp:</strong> ${group}</p>

    <p class="per100">
      <em>Per 100 g:</em>
      Energi: ${d.energy_kcal} kcal · Kolhydrater: ${d.carbs_g} g · Fett: ${d.fat_g} g · Protein: ${d.protein_g} g
    </p>

    <h3 style="margin-top:10px">Beräknat för <span id="modalQLabel">100</span> g</h3>
    <ul id="modalCalcList" class="modal-main" style="list-style:none; padding-left:0; margin-top:6px">
      <li>Energi: <strong><span id="calcEnergy">0</span> kcal</strong></li>
      <li>Kolhydrater: <strong><span id="calcCarbs">0</span> g</strong></li>
      <li>Fett: <strong><span id="calcFat">0</span> g</strong></li>
      <li>Protein: <strong><span id="calcProtein">0</span> g</strong></li>
    </ul>
    ${extrasHtml}

    <div class="modal-qty">
      <label for="modalQuantityNumber">Gram:</label>
      <input type="number" id="modalQuantityNumber" class="quantity-input" min="0" step="1" value="100">
      <input type="range" id="modalQuantitySlider" class="quantity-slider" min="0" step="10" max="${DEFAULT_SLIDER_MAX}" value="100">
    </div>
<div class="modal-actions">
  <button id="modalAddBtn">Lägg till</button>
  <a class="btn-secondary external"
     href="${lvUrl}"
     target="_blank"
     rel="noopener noreferrer"
     aria-label="Öppna fullständiga näringsvärden för ${food.namn} hos Livsmedelsverket (ny flik)">
     Visa hos Livsmedelsverket
  </a>
</div>

<p class="modal-source">
  Källa: Livsmedelsverkets Livsmedelsdatabas${sourceDate ? `, version ${sourceDate}` : ``}.
</p>
    </div>
  `;

  const num    = document.getElementById("modalQuantityNumber");
  const sld    = document.getElementById("modalQuantitySlider");
  const qLabel = document.getElementById("modalQLabel");

  const eEl = document.getElementById("calcEnergy");
  const cEl = document.getElementById("calcCarbs");
  const fEl = document.getElementById("calcFat");
  const pEl = document.getElementById("calcProtein");

  const fiEl = document.getElementById("calcFiber");
  const suEl = document.getElementById("calcSugar");
  const saEl = document.getElementById("calcSalt");
  const sfEl = document.getElementById("calcSatFat");
  const ncEl = document.getElementById("calcNetCarbs");

  const round1 = (n) => Math.round(n * 10) / 10;

  const updateCalc = (q) => {
    const val = Math.max(0, isNaN(q) ? 0 : Math.round(q));
    if (parseInt(num.value, 10) !== val) num.value = val;
    if (parseInt(sld.value, 10) !== val) sld.value = val;
    if (val > parseInt(sld.max, 10)) sld.max = val;

    const f = val / 100;
    qLabel.textContent = String(val);

    eEl.textContent = round1(d.energy_kcal  * f).toFixed(1);
    cEl.textContent = round1(d.carbs_g      * f).toFixed(1);
    fEl.textContent = round1(d.fat_g        * f).toFixed(1);
    pEl.textContent = round1(d.protein_g    * f).toFixed(1);

    if (fiEl && Number.isFinite(d.fiber_g))    fiEl.textContent = round1(d.fiber_g * f).toFixed(1);
    if (suEl && Number.isFinite(d.sugar_g))    suEl.textContent = round1(d.sugar_g * f).toFixed(1);
    if (saEl && Number.isFinite(d.salt_g))     saEl.textContent = round1(d.salt_g  * f).toFixed(1);
    if (sfEl && Number.isFinite(d.satFat_g))   sfEl.textContent = round1(d.satFat_g * f).toFixed(1);
    if (ncEl && Number.isFinite(d.netCarbs_g)) ncEl.textContent = round1(d.netCarbs_g * f).toFixed(1);
  };

  num.addEventListener("input", () => updateCalc(parseInt(num.value, 10) || 0));
  sld.addEventListener("input", () => updateCalc(parseInt(sld.value, 10) || 0));

  document.getElementById("modalAddBtn").onclick = () => {
    const q = parseInt(num.value, 10) || 0;
    addFood(
      food.id, food.namn,
      d.energy_kcal, d.carbs_g, d.fat_g, d.protein_g,
      q,
      { fiber: d.fiber_g, sugar: d.sugar_g, sugar_label: d.sugar_label, salt: d.salt_g, satFat: d.satFat_g, netCarbs: d.netCarbs_g }
    );
    closeFoodModal();
  };

  modal.classList.add('open');
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden','false');

  modal.querySelector(".close").onclick = closeFoodModal;
  modal.addEventListener('click', onModalBackdropClick);
  modal.addEventListener('touchstart', onModalBackdropClick, { passive: true });

  const onEsc = (ev) => { if (ev.key === 'Escape') closeFoodModal(); };
  document.addEventListener('keydown', onEsc);
  modal._onEsc = onEsc;

  updateCalc(100);
}

function closeFoodModal() {
  const modal = document.getElementById("foodModal");
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('hidden','');
  modal.setAttribute('aria-hidden','true');
  modal.removeEventListener('click', onModalBackdropClick);
  modal.removeEventListener('touchstart', onModalBackdropClick);

  if (modal._onEsc) {
    document.removeEventListener('keydown', modal._onEsc);
    delete modal._onEsc;
  }
  // Inga overflow-återställningar behövs, eftersom vi aldrig låste dem.
}

document.getElementById("clearListButton").addEventListener("click", function () {
    selectedFoods = [];
    updateSelectedFoodsList();
    adjustSelectedListHeight();
    updateSummary();
});

 // Synka mount och höjder vid init
 syncDrawerMount();
 adjustSelectedListHeight();

function adjustSelectedListHeight() {
  const list = document.getElementById("selectedFoodsList");
  const summary = document.getElementById("summary");
  const container = isMobile() ? drawerContent : document.querySelector(".main-right");
  if (!container || !list || !summary) return;

  const containerHeight = container.clientHeight || container.getBoundingClientRect().height;
  const summaryHeight   = summary.getBoundingClientRect().height;
  const headerHeight    = sidebarHeader ? (sidebarHeader.getBoundingClientRect().height || 0) : 0;

  if (isMobile()) {
    const hardCap = Math.max(0, containerHeight - summaryHeight - headerHeight - 20);
    const earlyCap = 200;
    const maxListHeight = Math.min(earlyCap, hardCap);
    list.style.maxHeight = maxListHeight + "px";
    list.style.overflowY = "auto";
    return;
  }

  const gutter = 12; // liten luft
  const maxListHeight = Math.max(0, containerHeight - summaryHeight - headerHeight - gutter);
  list.style.maxHeight = (list.scrollHeight > maxListHeight ? maxListHeight : "none");
  list.style.overflowY = "auto";
}

// Scrolla för att ändra alla range-sliders (även de som skapas senare)
document.addEventListener('wheel', (e) => {
  const slider = e.target.closest('input[type="range"]');
  if (!slider) return;                 // ignorera allt som inte är ett range

  e.preventDefault();                  // stoppa sid-/panelscroll
  const min  = slider.min  ? Number(slider.min)  : 0;
  const max  = slider.max  ? Number(slider.max)  : 100;
  const step = slider.step ? Number(slider.step) : 1;

  // upp = öka, ned = minska
  const dir  = e.deltaY < 0 ? 1 : -1;
  const mult = e.shiftKey ? 10 : 1;   // håll Shift för stora steg (valfritt)

  const next = Math.max(min, Math.min(max, Number(slider.value) + dir * step * mult));
  if (next !== Number(slider.value)) {
    slider.value = next;
    // trigga din befintliga oninput-logik (onSlider)
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, { passive: false });
