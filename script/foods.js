const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/";

const nutritionOutput = document.getElementById("nutritionOutput");
let foodData = [];

fetch(url)
    .then(function (response) { return response.json(); })
    .then(function (data) {
        console.log("API-svar:", data);
        if (data.livsmedel && Array.isArray(data.livsmedel)) {
            foodData = data.livsmedel.map(function(food) {
                return {
                    id: food.nummer,
                    namn: food.namn,
                    livsmedelsgruppNamn: food.livsmedelsgrupp || "Okänd grupp",
                    energiKcal: food.Energi || 0,
                    kolhydrater: food.Kolhydrater || 0,
                    fett: food.fett || 0,
                    protein: food.protein || 0
                };
            });
            console.log("Bearbetad foodData:", foodData);
            renderFoodList(foodData);
        } else {
            console.error("Oväntad API-svarstruktur:", data);
        }
    })
    .catch(function(error) {
        console.error("Fel vid hämtning av data:", error);
    });

////////////////////////////////////////////////////////////////////////////////////

/* const nutritionOutput = document.getElementById("nutritionOutput");
const searchInput = document.getElementById("foodInput");
const selectedFoodsList = document.getElementById("selectedFoodsList");

const foodData = [
    {
        id: 1232,
        namn: "Banan",
        livsmedelsgruppNamn: "Frukt",
        energiKcal: 89,
        kolhydrater: 20,
        fett: 0.3,
        protein: 1.1
    },
    {
        id: 1233,
        namn: "Äpple",
        livsmedelsgruppNamn: "Frukt",
        energiKcal: 52,
        kolhydrater: 14,
        fett: 0.2,
        protein: 0.3
    }
];
 */
//////////////////////////////////////////////////////////////////////////////////////

let selectedFoods = {};

const summary = {
    totalEnergy: 0,
    totalCarbs: 0,
    totalProtein: 0,
    totalFat: 0
};

searchInput.addEventListener("input", function () {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredData = foodData.filter(function(item) {
        return item.namn.toLowerCase().includes(searchTerm);
    });
    renderFoodList(filteredData);
});

function renderFoodList(data) {
    nutritionOutput.innerHTML = "";

    data.forEach(async function(food) {
        // Hämta näringsvärden för detta livsmedel
        const nutritionUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${food.id}/naringsvarden?sprak=1`;
        
        try {
            const response = await fetch(nutritionUrl);
            const nutritionData = await response.json();

            // Plocka ut energiinnehåll, kolhydrater, fett, protein från nutritionData
            const getValue = (name) => {
                const item = nutritionData.find(n => n.namn.toLowerCase().includes(name.toLowerCase()));
                return item ? item.varde : 0;
            };

            const energiKcal = getValue("Energi, kilokalorier");
            const kolhydrater = getValue("Kolhydrater");
            const fett = getValue("Fett");
            const protein = getValue("Protein");

            const div = document.createElement("div");
            div.className = "food-card";

            div.innerHTML = 
                "<h3>" + food.namn + "</h3>" +
                "<p><strong>Grupp:</strong> " + food.livsmedelsgruppNamn + "</p>" +
                "<p><strong>Energi:</strong> " + energiKcal + " kcal</p>" +
                "<p><strong>Kolhydrater:</strong> " + kolhydrater + " g</p>" +
                "<p><strong>Fett:</strong> " + fett + " g</p>" +
                "<p><strong>Protein:</strong> " + protein + " g</p>" +
                "<label for='quantity" + food.id + "'>Gram:</label>" +
                "<input type='number' id='quantity" + food.id + "' value='100' min='1'>" +
                "<button class='add-button' " +
                "data-id='" + food.id + "' " +
                "data-name='" + food.namn + "' " +
                "data-energy='" + energiKcal + "' " +
                "data-carbs='" + kolhydrater + "' " +
                "data-fat='" + fett + "' " +
                "data-protein='" + protein + "'>Lägg till</button>";

            nutritionOutput.appendChild(div);
        } catch (error) {
            console.error("Fel vid hämtning av näringsvärden för:", food.namn, error);
        }
    });
}


function updateSummary() {
    summary.totalEnergy = 0;
    summary.totalCarbs = 0;
    summary.totalProtein = 0;
    summary.totalFat = 0;

    for (const id in selectedFoods) {
        const item = selectedFoods[id];
        const food = foodData.find(f => f.id == id);
        const factor = item.quantity / 100;

        summary.totalEnergy += food.energiKcal * factor;
        summary.totalCarbs += food.kolhydrater * factor;
        summary.totalProtein += food.protein * factor;
        summary.totalFat += food.fett * factor;
    }

    document.getElementById("totalEnergy").textContent = "Total energi: " + summary.totalEnergy.toFixed(1) + " kcal";
    document.getElementById("totalCarbs").textContent = "Totala kolhydrater: " + summary.totalCarbs.toFixed(1) + " g";
    document.getElementById("totalProtein").textContent = "Totalt protein: " + summary.totalProtein.toFixed(1) + " g";
    document.getElementById("totalFat").textContent = "Totalt fett: " + summary.totalFat.toFixed(1) + " g";
}

nutritionOutput.addEventListener("click", function (event) {
    if (event.target.classList.contains("add-button")) {
        const item = event.target;

        const id = item.dataset.id;
        const name = item.dataset.name;
        const grams = parseInt(document.getElementById("quantity" + id).value, 10) || 100;

        if (selectedFoods[id]) {
            selectedFoods[id].quantity += grams;
        } else {
            selectedFoods[id] = {
                name: name,
                quantity: grams,
            };
        }

        updateSelectedFoodsList();
        updateSummary();
    }
});

document.getElementById("clearListButton").addEventListener("click", function () {
    selectedFoods = {};
    updateSelectedFoodsList();
    updateSummary();
});

renderFoodList(foodData);
