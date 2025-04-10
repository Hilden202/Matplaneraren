const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/";

const nutritionOutput = document.getElementById("nutritionOutput");
let foodData = [];

fetch(url)
    .then(function (response) { return response.json(); })
    .then(function (data) {
        console.log("API-svar:", data); // 👈 Logga hela API-svaret
        if (data.livsmedel && Array.isArray(data.livsmedel)) {
            foodData = data.livsmedel.map(function(food) {
                return {
                    id: food.id,
                    namn: food.namn,
                    livsmedelsgruppNamn: food.livsmedelsgruppNamn,
                    energiKcal: food.energiKcal,
                    kolhydrater: food.kolhydrater,
                    fett: food.fett,
                    protein: food.protein
                };
            });
            console.log("Bearbetad foodData:", foodData); // 👈 Kontrollera bearbetad data
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
]; */

////////////////////////////////////////////////////////////////////////////////////

const searchInput = document.getElementById("foodInput");
const selectedFoodsList = document.getElementById("selectedFoodsList");
const foodDropdown = document.getElementById("dropdown");

let selectedFoods = {}; // Använd ett objekt för att lagra valda livsmedel

searchInput.addEventListener("input", function () {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredData = foodData.filter(function(item) {
        return item.namn.toLowerCase().includes(searchTerm);
    });
    renderFoodList(filteredData);
});

function renderFoodList(data) {
    nutritionOutput.innerHTML = "";

    data.forEach(function(food) {
        const div = document.createElement("div");
        div.className = "food-card";

        div.innerHTML = 
            "<h3>" + food.namn + "</h3>" +
            "<p><strong>Grupp:</strong> " + food.livsmedelsgruppNamn + "</p>" +
            "<p><strong>Energi:</strong> " + food.energiKcal + " kcal</p>" +
            "<p><strong>Kolhydrater:</strong> " + food.kolhydrater + " g</p>" +
            "<p><strong>Fett:</strong> " + food.fett + " g</p>" +
            "<p><strong>Protein:</strong> " + food.protein + " g</p>" +
            "<label for='quantity" + food.id + "'>Gram:</label>" +
            "<input type='number' id='quantity" + food.id + "' value='100' min='1'>" +
            "<button class='add-button' " +
            "data-id='" + food.id + "' " +
            "data-name='" + food.namn + "' " +
            "data-energy='" + food.energiKcal + "' " +
            "data-carbs='" + food.kolhydrater + "' " +
            "data-fat='" + food.fett + "' " +
            "data-protein='" + food.protein + "'>Lägg till</button>";

        nutritionOutput.appendChild(div);
    });
}

renderFoodList(foodData);

const summary = {
    totalEnergy: 0,
    totalCarbs: 0,
    totalProtein: 0,
    totalFat: 0
};

function updateSelectedFoodsList() {
    const ul = document.getElementById("foodList");
    ul.innerHTML = "";  // Töm listan innan vi lägger till nya rader

    // Iterera genom varje objekt i selectedFoods och skapa en ny lista
    for (const id in selectedFoods) {
        const food = selectedFoods[id];
        const li = document.createElement("li");

        // Lägg till namnet och mängden på varje rad
        li.textContent = `${food.name} - ${food.quantity}g`;

        // Lägg till raderna i listan
        ul.appendChild(li);
    }
}

nutritionOutput.addEventListener("click", function (event) {
    if (event.target.classList.contains("add-button")) {
        const item = event.target;
        
        // Logga item.dataset.id för att se om vi får rätt id
        console.log("Button clicked. Data-id:", item.dataset.id);

        const id = item.dataset.id; // Förväntat att detta är ett nummer eller sträng
        const name = item.dataset.name;
        const grams = parseInt(document.getElementById("quantity" + id).value, 10) || 100;

        console.log(`Adding food: ID=${id}, Name=${name}, Grams=${grams}`);

        // Om vi får rätt ID här, fortsätt som tidigare
        if (selectedFoods[id]) {
            selectedFoods[id].quantity += grams;
        } else {
            selectedFoods[id] = {
                name: name,
                quantity: grams,
            };
        }

        updateSelectedFoodsList();
    }
});

document.getElementById("clearListButton").addEventListener("click", function () {
    // Töm objektet som lagrar valda livsmedel
    selectedFoods = {}; // Rensa selectedFoods istället för selectedFoodsList

    // Uppdatera matlistan i gränssnittet
    updateSelectedFoodsList();

    // Återställ summeringen
    summary.totalEnergy = 0;
    summary.totalCarbs = 0;
    summary.totalProtein = 0;
    summary.totalFat = 0;

    // Uppdatera summeringssektionen i gränssnittet
    document.getElementById("totalEnergy").textContent = "Total energi: 0 kcal";
    document.getElementById("totalCarbs").textContent = "Totala kolhydrater: 0 g";
    document.getElementById("totalProtein").textContent = "Totalt protein: 0 g";
    document.getElementById("totalFat").textContent = "Totalt fett: 0 g";
});

console.log(selectedFoods); // Debugga och kolla på arrayen
