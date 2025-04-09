/* const url = "https://dataportal.livsmedelsverket.se/livsmedel/livsmedel/sok?namn=banan";

const nutritionOutput = document.getElementById("nutritionOutput");

fetch(url, {
    headers: {
        "Accept": "application/json"
    }
})
.then(function (response) { return response.json() })
.then(function (livsmedel) {
    console.log(livsmedel); // kolla vad du får
    // här kan du sedan loopa och rendera saker
})
.catch(error => {
    console.error("Fel vid hämtning:", error);
});
 */

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

/////////////////////////////////////////////////////////////////////////////////
const nutritionOutput = document.getElementById("nutritionOutput"); 
const searchInput = document.getElementById("foodInput");
const dropdown = document.getElementById("dropdown");
const selectedFoodsList = document.getElementById("selectedFoodsList");


searchInput.addEventListener("input", function () {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredData = foodData.filter(item => item.namn.toLowerCase().includes(searchTerm));
    renderFoodList(filteredData);
});


function renderFoodList(data) {
    nutritionOutput.innerHTML = ""; // Clear previous results

    data.forEach(item => {
        const div = document.createElement("div");
        div.className = "food-card";

        // Build HTML for each food item
        div.innerHTML = `
            <h3>` + item.namn + `</h3>
            <p><strong>Grupp:</strong> ` + item.livsmedelsgruppNamn + `</p>
            <p><strong>Energi:</strong> ` + item.energiKcal + ` kcal</p>
            <p><strong>Kolhydrater:</strong> ` + item.kolhydrater + ` g</p>
            <p><strong>Fett:</strong> ` + item.fett + ` g</p>
            <p><strong>Protein:</strong> ` + item.protein + ` g</p>
            
            <label for="quantity` + item.id + `">Antal:</label>
            <input type="number" id="quantity` + item.id + `" value="1" min="1">
            
            <button class="add-button" data-id="` + item.id + `" data-name="` + item.namn + `" data-energy="` + item.energiKcal + `" data-carbs="` + item.kolhydrater + `" data-fat="` + item.fett + `" data-protein="` + item.protein + `">Lägg till</button>
        `;
        nutritionOutput.appendChild(div);
    });
}

// Render all food items immediately
renderFoodList(foodData);

/////////////////////////////////////////////////////////////////////////////////////
const summary = {
    totalEnergy: 0,
    totalCarbs: 0,
    totalProtein: 0,
    totalFat: 0
};

function updateSelectedFoodsList() {
    const ul = document.getElementById("foodList");
    ul.innerHTML = "";

    for (const [, food] of Object.entries(selectedFoodsList)) {
        const li = document.createElement("li");
        li.textContent = food.name + " - Antal: " + food.quantity + "st";
        ul.appendChild(li);
    }
}

nutritionOutput.addEventListener("click", function (event) {
    if (event.target.classList.contains("add-button")) {
        const item = event.target;
        const id = item.dataset.id;
        const name = item.dataset.name;
        const quantity = parseInt(document.getElementById(`quantity${id}`).value, 10);

        // If the food item already exists, update the quantity
        if (selectedFoodsList[id]) {
            selectedFoodsList[id].quantity += quantity;
        } else {
            // Otherwise, add it as a new object
            selectedFoodsList[id] = {
                name: name,
                quantity: quantity,
            };
        }

        updateSelectedFoodsList();

        // Update the summary based on the selected food item
        summary.totalEnergy += Number(item.dataset.energy) * Number(quantity);
        summary.totalCarbs += Number(item.dataset.carbs) * Number(quantity);
        summary.totalFat += Number(item.dataset.fat) * Number(quantity);
        summary.totalProtein += Number(item.dataset.protein) * Number(quantity);

        // Update the UI with the totals
        document.getElementById("totalEnergy").textContent = "Total energi: " + summary.totalEnergy.toFixed(2) + " kcal";
        document.getElementById("totalCarbs").textContent = "Totala kolhydrater: " + summary.totalCarbs.toFixed(2) + " g";
        document.getElementById("totalProtein").textContent = "Totalt protein: " + summary.totalProtein.toFixed(2) + " g";
        document.getElementById("totalFat").textContent = "Totalt fett: " + summary.totalFat.toFixed(2) + " g";
    }
});

document.getElementById("clearListButton").addEventListener("click", function () {
    // Töm objektet som lagrar valda livsmedel
    for (const key in selectedFoodsList) {
        delete selectedFoodsList[key];
    }

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
