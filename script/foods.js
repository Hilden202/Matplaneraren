const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel?offset=0&limit=2500&sprak=1";
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

// (valfritt) Stäng även på ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setDrawerOpen(false);
});
// Referenser för desktop-kolumnen
const rightInner = document.querySelector(".right-inner");
const selectedFoodsListEl = document.getElementById("selectedFoodsList");
const summaryEl = document.getElementById("summary");

 function isMobile() {
   return window.matchMedia("(max-width: 600px)").matches;
 }

 function mountIntoDrawer() {
   if (!isMobile()) return;
   // flytta in om inte redan finns där
   if (!drawerContent.contains(selectedFoodsListEl)) {
     drawerContent.prepend(selectedFoodsListEl);
   }
   if (!drawerContent.contains(summaryEl)) {
     drawerContent.appendChild(summaryEl);
   }
 }

 function mountBackToRightColumn() {
   if (isMobile()) return;
  // Flytta tillbaka i rätt ordning utan placeholders (robust vid flera cykler)
  if (!rightInner.contains(selectedFoodsListEl)) {
    rightInner.prepend(selectedFoodsListEl);
  }
  if (!rightInner.contains(summaryEl)) {
    rightInner.append(summaryEl);
  }
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

fetch(url)
    .then(function (response) { return response.json(); })
    .then(function (data) {
        console.log("API-svar:", data);
        if (data.livsmedel && Array.isArray(data.livsmedel)) {
            foodData = data.livsmedel.map(function (food) {
                return {
                    id: food.nummer,
                    namn: food.namn,
                };

            });
            console.log("Bearbetad foodData:", foodData);
            renderFoodList(foodData);
        } else {
            console.error("Oväntad API-svarstruktur:", data);
        }
    })
    .catch(function (error) {
        console.error("Fel vid hämtning av data:", error);
    });

searchInput.addEventListener("input", function () {
    lastSearchTerm = searchInput.value.trim().toLowerCase();
    const searchTerm = searchInput.value.toLowerCase();

    // Avbryt tidigare sökning
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    currentSearchVersion++;
    const thisVersion = currentSearchVersion;

    const filteredData = foodData
        .filter(item => item.namn.toLowerCase().includes(searchTerm))
        .sort((a, b) => compareBySearch(a, b, searchTerm));

    renderFoodList(filteredData, thisVersion, signal);

    setTimeout(() => {
        const firstCard = document.querySelector(".food-card");
        if (firstCard) firstCard.scrollIntoView({ behavior: "smooth" });
    }, 200);
});


searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        lastSearchTerm = searchInput.value.trim().toLowerCase();

        const searchTerm = searchInput.value.toLowerCase();

        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        currentSearchVersion++;
        const thisVersion = currentSearchVersion;

        const filteredData = foodData
            .filter(item => item.namn.toLowerCase().includes(searchTerm))
            .sort((a, b) => compareBySearch(a, b, searchTerm));

        renderFoodList(filteredData, thisVersion, signal);

        setTimeout(() => {
            const firstCard = document.querySelector(".food-card");
            if (firstCard) firstCard.scrollIntoView({ behavior: "smooth" });
        }, 200);
    }
});

async function renderFoodList(data, version = null, signal = null) {
    nutritionOutput.innerHTML = "";

    // Skelettkort direkt
    for (const food of data) {
        const card = document.createElement("div");
        card.className = "food-card";
        card.id = `food-${food.id}`;
        card.innerHTML =
          `<h3>${food.namn}</h3>
           <p class="loading">Laddar näringsvärden...</p>
           <button class="add-button" disabled>Lägg till</button>`;

        // highlight direkt om exakt match
        if (lastSearchTerm && food.namn.toLowerCase() === lastSearchTerm) {
            card.classList.add("highlight");
        }
        nutritionOutput.appendChild(card);
    }

    // Hjälpare för klassificering med signal
    const fetchClassificationWithSignal = async (id, s) => {
        const url = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${id}/klassificeringar?sprak=1`;
        const res = await fetch(url, s ? { signal: s } : undefined);
        const data = await res.json();
        return (data && data.length > 0) ? data[0].namn : "Ingen klassificering tillgänglig";
    };

    // Fyll på korten asynkront, utan att rubba ordningen
    data.forEach(async (food) => {
        const nutritionUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${food.id}/naringsvarden?sprak=1`;

        try {
            const [nutritionData, groupName] = await Promise.all([
                fetch(nutritionUrl, signal ? { signal } : undefined).then(r => r.json()),
                fetchClassificationWithSignal(food.id, signal)
            ]);

            // Om sökningen är utdaterad: avbryt uppdatering
            if (version !== null && version !== currentSearchVersion) return;

            const getEnergyKcal = () => {
                const item = nutritionData.find(n =>
                    n.namn.toLowerCase().includes("energi") &&
                    n.enhet && n.enhet.toLowerCase().includes("kcal")
                );
                return item ? item.varde : 0;
            };
            const getValue = (name) => {
                const item = nutritionData.find(n =>
                    n.namn.toLowerCase().includes(name.toLowerCase())
                );
                return item ? item.varde : 0;
            };

            const energiKcal = getEnergyKcal();
            const kolhydrater = getValue("kolhydrater");
            const fett = getValue("fett");
            const protein = getValue("protein");

            const card = document.getElementById(`food-${food.id}`);
            if (!card) return;

            card.innerHTML =
            `<h3>${food.namn} <small class="per100">(per 100 g)</small></h3>
            <p><strong>Grupp:</strong> ${groupName}</p>
            <p><strong>Energi:</strong> ${energiKcal} kcal</p>
            <p><strong>Kolhydrater:</strong> ${kolhydrater} g</p>
            <p><strong>Fett:</strong> ${fett} g</p>
            <p><strong>Protein:</strong> ${protein} g</p>
            <button class="add-button" ...>Lägg till</button>`;

               if (lastSearchTerm && food.namn.toLowerCase() === lastSearchTerm) {
                    card.classList.add("highlight");
                    setTimeout(() => card.classList.remove("highlight"), 1800);
}

            const button = card.querySelector(".add-button");
            button.disabled = false;
            button.addEventListener("click", function () {
                showFoodModal(food, groupName, energiKcal, kolhydrater, fett, protein);
            });

        } catch (err) {
            // Avbrutet? Gör inget, visa inte fel.
            if (err.name === 'AbortError') return;
            if (version !== null && version !== currentSearchVersion) return;

            const card = document.getElementById(`food-${food.id}`);
            if (!card) return;
            const loading = card.querySelector(".loading");
            if (loading) loading.textContent = "Kunde inte hämta näringsvärden.";
        }
    });
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

    foodList.innerHTML += "</ul>";
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
  const body = document.getElementById("modalBody");
    body.innerHTML = `
    <h2>${food.namn}</h2>
    <p><strong>Grupp:</strong> ${group}</p>
    <p><strong>Energi:</strong> ${energy} kcal</p>
    <p><strong>Kolhydrater:</strong> ${carbs} g</p>
    <p><strong>Fett:</strong> ${fat} g</p>
    <p><strong>Protein:</strong> ${protein} g</p>

    <div class="modal-qty">
        <label for="modalQuantityNumber">Gram:</label>
        <input type="number" id="modalQuantityNumber" class="quantity-input" min="0" step="1" value="100">
        <input type="range" id="modalQuantitySlider" class="quantity-slider" min="0" step="10" max="${DEFAULT_SLIDER_MAX}" value="100">
    </div>

    <button id="modalAddBtn">Lägg till</button>
    `;

    const num = document.getElementById("modalQuantityNumber");
    const sld = document.getElementById("modalQuantitySlider");

    // live-synk mellan inputs
    const syncModal = (q) => {
    const val = Math.max(0, isNaN(q) ? 0 : Math.round(q));
    if (parseInt(num.value,10) !== val) num.value = val;
    if (parseInt(sld.value,10) !== val) sld.value = val;
    };

    num.addEventListener("input", () => {
    // låt slidern växa om man skriver in större värde än max
    const q = parseInt(num.value, 10) || 0;
    if (q > parseInt(sld.max,10)) sld.max = q;
    syncModal(q);
    });

    sld.addEventListener("input", () => syncModal(parseInt(sld.value, 10) || 0));


    document.getElementById("modalAddBtn").onclick = () => {
    const q = parseInt(num.value, 10) || 0;
    addFood(food.id, food.namn, energy, carbs, fat, protein, q);
    closeFoodModal();
    };

  const span = modal.querySelector(".close");
  span.onclick = closeFoodModal;
  window.onclick = (e) => e.target === modal && closeFoodModal();
  modal.style.display = "block";
}

function closeFoodModal() {
  document.getElementById("foodModal").style.display = "none";
}


document.getElementById("clearListButton").addEventListener("click", function () {
    selectedFoods = [];
    updateSelectedFoodsList();
    adjustSelectedListHeight();
    updateSummary();
});

renderFoodList(foodData);
 // Synka mount och höjder vid init
 syncDrawerMount();
 adjustSelectedListHeight();

function adjustSelectedListHeight() {
  const list = document.getElementById("selectedFoodsList");
  const summary = document.getElementById("summary");
  const container = isMobile()
    ? drawerContent
    : document.querySelector(".main-right"); // 🔑 mät högerkolumnen (100vh)
  if (!container || !list || !summary) return;

  const containerHeight = container.clientHeight || container.getBoundingClientRect().height;
  const summaryHeight = summary.getBoundingClientRect().height;

  // 📱 Mobil (drawer): begränsa så panelen inte trycks
  if (isMobile()) {
    const hardCap = Math.max(0, containerHeight - summaryHeight - 20);
    const earlyCap = 200; // ~2 rader innan scroll
    const maxListHeight = Math.min(earlyCap, hardCap);
    list.style.maxHeight = maxListHeight + "px";
    list.style.overflowY = "auto";
    return;
  }

  // 🖥️ Desktop: låt listan växa tills Summering når botten, därefter scroll
  const padding = 200; // liten luft mellan listan och summering
  const maxListHeight = Math.max(0, containerHeight - summaryHeight - padding);
  if (list.scrollHeight > maxListHeight) {
    list.style.maxHeight = maxListHeight + "px";
  } else {
    list.style.maxHeight = "none"; // väx fritt när det finns plats
  }
  list.style.overflowY = "auto";
 }