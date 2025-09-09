const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel?offset=0&limit=2500&sprak=1";
const foodList = document.getElementById("foodList");
const foodListContainer = document.getElementById("foodListContainer");
const nutritionOutput = document.getElementById("nutritionOutput");
const searchInput = document.getElementById("foodInput");

let foodData = [];
let selectedFoods = [];
let currentSearchVersion = 0;

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
    const searchTerm = searchInput.value.toLowerCase();
    currentSearchVersion++;
    const thisVersion = currentSearchVersion;

    const filteredData = foodData
        .filter(item => item.namn.toLowerCase().includes(searchTerm))
        .sort((a, b) => {
            const aIndex = a.namn.toLowerCase().indexOf(searchTerm);
            const bIndex = b.namn.toLowerCase().indexOf(searchTerm);
            return aIndex - bIndex;
        });

    renderFoodList(filteredData, thisVersion);

    // ⬇️ Scrolla till första food-card efter render
    setTimeout(() => {
        const firstCard = document.querySelector(".food-card");
        if (firstCard) {
            firstCard.scrollIntoView({ behavior: "smooth" });
        }
    }, 200);
});

searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
    }
});


async function renderFoodList(data, version = null) {
    nutritionOutput.innerHTML = "";

    for (const food of data) {
        // Om en nyare sökning startats – avbryt denna render
        if (version !== null && version !== currentSearchVersion) return;

        const nutritionUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${food.id}/naringsvarden?sprak=1`;

        try {
            const response = await fetch(nutritionUrl);
            const nutritionData = await response.json();

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

            const groupName = await fetchClassification(food.id);
            const energiKcal = getEnergyKcal();
            const kolhydrater = getValue("kolhydrater");
            const fett = getValue("fett");
            const protein = getValue("protein");


            // Kolla igen innan vi renderar
            if (version !== null && version !== currentSearchVersion) return;

            const div = document.createElement("div");
            div.className = "food-card";
            div.innerHTML =
                "<h3>" + food.namn + "</h3>" +
                "<p><strong>Grupp:</strong> " + groupName + "</p>" +
                "<p><strong>Energi:</strong> " + energiKcal + " kcal</p>" +
                "<p><strong>Kolhydrater:</strong> " + kolhydrater + " g</p>" +
                "<p><strong>Fett:</strong> " + fett + " g</p>" +
                "<p><strong>Protein:</strong> " + protein + " g</p>" +
                "<button class='add-button' " +
                "data-id='" + food.id + "' " +
                "data-name='" + food.namn + "' " +
                "data-group='" + groupName + "' " +
                "data-energy='" + energiKcal + "' " +
                "data-carbs='" + kolhydrater + "' " +
                "data-fat='" + fett + "' " +
                "data-protein='" + protein + "'>Lägg till</button>";

            nutritionOutput.appendChild(div);

            const button = div.querySelector(".add-button");
            button.addEventListener("click", function () {
                showFoodModal(food, groupName, energiKcal, kolhydrater, fett, protein);
            });

        } catch (error) {
            console.error("Fel vid hämtning av näringsvärden för:", food.namn, error);
        }
    }
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

        foodList.innerHTML +=
            "<li class='food-list-item'>" +
            "<button class='adjust-button' onclick='removeFood(" + i + ")'> x </button>" +
            "<button class='adjust-button' onclick='decreaseQuantity(" + i + ")'> - </button>" +
            "<button class='adjust-button' onclick='increaseQuantity(" + i + ")'> + </button>" +
            "<span class='food-amount'>" + item.quantity + " g " + trimmedName + "</span>" +
            "</li>";
    }

    foodList.innerHTML += "</ul>";
    updateSummary();
}


function removeFood(index) {
    selectedFoods.splice(index, 1);
    updateSelectedFoodsList();
}

function increaseQuantity(index) {
    selectedFoods[index].quantity += 10;
    updateSelectedFoodsList();
}

function decreaseQuantity(index) {
    selectedFoods[index].quantity -= 10;
    if (selectedFoods[index].quantity <= 0) {
        selectedFoods.splice(index, 1);
    }
    updateSelectedFoodsList();
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
    <label>Gram:</label>
    <input type="number" id="modalQuantity" value="100" min="1">
    <button id="modalAddBtn">Lägg till</button>
  `;
  document.getElementById("modalAddBtn").onclick = () => {
    const q = parseInt(document.getElementById("modalQuantity").value, 10) || 100;
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
    updateSummary();
});

renderFoodList(foodData);
