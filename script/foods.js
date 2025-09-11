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

let currentList = [];
let renderedCount = 0;
let isAppending = false;
let io = null;
let sentinel = null;
let dietFilter = { type: 'all', carbMax: Infinity };

const dietSelect = document.getElementById('dietSelect');
dietSelect?.addEventListener('change', () => {
  const v = dietSelect.value;
  dietFilter =
    v === 'lchf5'  ? { type: 'lchf', carbMax: 5 } :
    v === 'lchf10' ? { type: 'lchf', carbMax: 10 } :
                     { type: 'all',  carbMax: Infinity };

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


// (valfritt) Stäng även på ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setDrawerOpen(false);
});
// Referenser för desktop-kolumnen
const rightInner = document.querySelector(".right-inner");
const selectedFoodsListEl = document.getElementById("selectedFoodsList");
const summaryEl = document.getElementById("summary");
const sidebarHeader = document.querySelector(".sidebar-header");

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

  // Töm och lägg in "Visa fler"-knapp + sentinel
  nutritionOutput.innerHTML = `
    <div id="resultsCards"></div>
    <div style="text-align:center; margin:12px 0;">
      <button id="loadMoreBtn" style="display:none;">Visa fler</button>
    </div>
  `;

  // Skapa/injicera sentinel för infinite scroll
  sentinel = document.createElement('div');
  sentinel.id = 'resultsSentinel';
  sentinel.style.height = '1px';
  nutritionOutput.appendChild(sentinel);

  // Koppla knapp
  const btn = document.getElementById('loadMoreBtn');
  btn.onclick = () => renderNextChunk(version, signal);

  setupInfiniteScroll(version, signal);
  renderNextChunk(version, signal); // första chunk
}

function renderNextChunk(version, signal) {
  if (isAppending) return;
  if (renderedCount >= currentList.length) return;

  isAppending = true;

  const start = renderedCount;
  const pageSize = getPageChunk();
  const end = Math.min(start + pageSize, currentList.length);
  const chunk = currentList.slice(start, end);

  // 🔑 Append bara nya kort – rör inte redan renderat
  renderFoodCardsAppend(chunk, version, signal).then(() => {
    renderedCount = end;
    isAppending = false;

    // Visa/hide knappen beroende på om allt är renderat
    const btn = document.getElementById('loadMoreBtn');
    if (btn) btn.style.display = (renderedCount < currentList.length) ? 'inline-block' : 'none';

    // Flytta sentinel sist så IO triggar när vi når botten igen
    if (sentinel && sentinel.parentNode !== nutritionOutput) {
      nutritionOutput.appendChild(sentinel);
    }
  });
}

function setupInfiniteScroll(version, signal) {
  // Fallback till "Visa fler"-knapp om IO saknas
  const btn = document.getElementById('loadMoreBtn');
  if (!('IntersectionObserver' in window)) {
    if (btn) btn.style.display = 'inline-block';
    return;
  }
  if (io) io.disconnect();

  io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) renderNextChunk(version, signal);
    });
  }, { root: null, rootMargin: '800px', threshold: 0 });

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


function setDrawerOpen(open) {
  if (!isMobile()) return;
  mobileDrawer.classList.toggle("open", open);
  drawerHandle.setAttribute("aria-expanded", open ? "true" : "false");
  mobileDrawer.setAttribute("aria-hidden", open ? "false" : "true");

  // Lås bakgrund vid öppen låda
  document.documentElement.style.overflow = open ? "hidden" : "";
  document.body.style.overflow = open ? "hidden" : "";

  if (open) {
    // hoppa till toppen och räkna ut maxhöjd för listan efter att panelen renderats
    drawerContent.scrollTop = 0;
    requestAnimationFrame(adjustSelectedListHeight);
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
 }
window.addEventListener("resize", syncDrawerMount);
document.addEventListener("DOMContentLoaded", syncDrawerMount);

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
    // Starta paginerad rendering av alla
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    currentSearchVersion++;

    renderInit(foodData, currentSearchVersion, currentAbortController.signal);
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
    return;
  }

  const filteredData = foodData
    .filter(item => item.namn.toLowerCase().includes(lastSearchTerm))
    .sort((a, b) => compareBySearch(a, b, lastSearchTerm));

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

async function renderFoodCardsAppend(data, version = null, signal = null) {
  const cardsRoot = document.getElementById('resultsCards') || nutritionOutput;

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
      const [nutritionData, groupName] = await Promise.all([
        fetch(nutritionUrl, signal ? { signal } : undefined).then(r => r.json()),
        fetchClassificationWithSignal(food.id, signal)
      ]);

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

      const energiKcal   = getEnergyKcal();
      const kolhydrater  = getValue("kolhydrater");
      // LCHF-filter: om inte godkänd – ta bort skelettkortet och hoppa över
      if (!passesDietFilter(kolhydrater)) {
        const skipCard = document.getElementById(`food-${food.id}`);
        if (skipCard) skipCard.remove();
        return; // rendera inte kortet
      }
      const fett         = getValue("fett");
      const protein      = getValue("protein");

      const card = document.getElementById(`food-${food.id}`);
      if (!card) return;

      card.innerHTML = `
        <h3>${food.namn} <small class="per100">(per 100 g)</small></h3>
        <p><strong>Grupp:</strong> ${groupName}</p>
        <p><strong>Energi:</strong> ${energiKcal} kcal</p>
        <p><strong>Kolhydrater:</strong> ${kolhydrater} g</p>
        <p><strong>Fett:</strong> ${fett} g</p>
        <p><strong>Protein:</strong> ${protein} g</p>
      `;

      if (lastSearchTerm && food.namn.toLowerCase() === lastSearchTerm) {
        card.classList.add("highlight");
        setTimeout(() => card.classList.remove("highlight"), 1800);
      }

      const openModal = () => showFoodModal(food, groupName, energiKcal, kolhydrater, fett, protein);
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
}

function addFood(id, namn, energiKcal, kolhydrater, fett, protein, quantity = null) {
    const qty = quantity !== null ? quantity : (parseInt(document.getElementById("quantity" + id).value, 10) || 100);

    const existingItem = selectedFoods.find(item => item.id === id);

    if (existingItem) {
        existingItem.quantity += qty;
    } else {
        selectedFoods.push({
            id: id,
            name: namn,
            quantity: qty,
            energiKcal: energiKcal,
            kolhydrater: kolhydrater,
            fett: fett,
            protein: protein,
        });
    }

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
    let totalEnergy = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalProtein = 0;

    for (const item of selectedFoods) {

        // Omvandla gram till procent (100 g = 100%)
        const factor = item.quantity / 100;

        totalEnergy += item.energiKcal * factor;
        totalCarbs += item.kolhydrater * factor;
        totalFat += item.fett * factor;
        totalProtein += item.protein * factor;
    }

    document.getElementById("totalEnergy").textContent = "Total energi: " + totalEnergy.toFixed(1) + " kcal";
    document.getElementById("totalCarbs").textContent = "Totala kolhydrater: " + totalCarbs.toFixed(1) + " g";
    document.getElementById("totalFat").textContent = "Totalt fett: " + totalFat.toFixed(1) + " g";
    document.getElementById("totalProtein").textContent = "Totalt protein: " + totalProtein.toFixed(1) + " g";
    // Efter summering: justera listans maxhöjd (mobil/desktop)
    adjustSelectedListHeight();
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


function showFoodModal(food, group, energy, carbs, fat, protein) {
  const modal = document.getElementById("foodModal");
  const body  = document.getElementById("modalBody");

  body.innerHTML = `
    <h2>${food.namn}</h2>
    <p><strong>Grupp:</strong> ${group}</p>

    <p class="per100">
      <em>Per 100 g:</em>
      Energi: ${energy} kcal · Kolhydrater: ${carbs} g · Fett: ${fat} g · Protein: ${protein} g
    </p>

    <h3 style="margin-top:10px">Beräknat för <span id="modalQLabel">100</span> g</h3>
    <ul id="modalCalcList" style="list-style:none; padding-left:0; margin-top:6px">
      <li>Energi: <strong><span id="calcEnergy">0</span> kcal</strong></li>
      <li>Kolhydrater: <strong><span id="calcCarbs">0</span> g</strong></li>
      <li>Fett: <strong><span id="calcFat">0</span> g</strong></li>
      <li>Protein: <strong><span id="calcProtein">0</span> g</strong></li>
    </ul>

    <div class="modal-qty">
      <label for="modalQuantityNumber">Gram:</label>
      <input type="number" id="modalQuantityNumber" class="quantity-input" min="0" step="1" value="100">
      <input type="range" id="modalQuantitySlider" class="quantity-slider" min="0" step="10" max="${DEFAULT_SLIDER_MAX}" value="100">
    </div>

    <div class="modal-actions">
      <button id="modalAddBtn">Lägg till</button>
    </div>
  `;

  // refs
  const num    = document.getElementById("modalQuantityNumber");
  const sld    = document.getElementById("modalQuantitySlider");
  const qLabel = document.getElementById("modalQLabel");
  const eEl    = document.getElementById("calcEnergy");
  const cEl    = document.getElementById("calcCarbs");
  const fEl    = document.getElementById("calcFat");
  const pEl    = document.getElementById("calcProtein");

  const round1 = (n) => Math.round(n * 10) / 10;

  const updateCalc = (q) => {
    const val = Math.max(0, isNaN(q) ? 0 : Math.round(q));
    if (parseInt(num.value, 10) !== val) num.value = val;
    if (parseInt(sld.value, 10) !== val) sld.value = val;
    if (val > parseInt(sld.max, 10)) sld.max = val;

    const factor = val / 100;
    qLabel.textContent = String(val);
    eEl.textContent = round1(energy  * factor).toFixed(1);
    cEl.textContent = round1(carbs   * factor).toFixed(1);
    fEl.textContent = round1(fat     * factor).toFixed(1);
    pEl.textContent = round1(protein * factor).toFixed(1);
  };

  num.addEventListener("input", () => updateCalc(parseInt(num.value, 10) || 0));
  sld.addEventListener("input", () => updateCalc(parseInt(sld.value, 10) || 0));

  document.getElementById("modalAddBtn").onclick = () => {
    const q = parseInt(num.value, 10) || 0;
    addFood(food.id, food.namn, energy, carbs, fat, protein, q);
    closeFoodModal();
  };

    modal.classList.add('open');
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden','false');

  // Stäng med kryss
  modal.querySelector(".close").onclick = closeFoodModal;

  // Stäng genom att trycka utanför (iOS + desktop)
  modal.addEventListener('click', onModalBackdropClick);
  modal.addEventListener('touchstart', onModalBackdropClick, { passive: true });

  // Stäng med ESC
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
