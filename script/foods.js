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

const mockData = [
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
const searchInput = document.getElementById("searchInput");
const dropdown = document.getElementById("dropdown");
const nutritionOutput = document.getElementById("nutritionOutput");

searchInput.addEventListener("input", function () {
    const query = searchInput.value.toLowerCase();
    const filteredData = mockData.filter(item => item.namn.toLowerCase().includes(query));
    renderDropdown(filteredData);
});

function renderDropdown(data) {
    dropdown.innerHTML = ""; // Töm tidigare resultat

    data.forEach(item => {
        const option = document.createElement("div");
        option.className = "dropdown-item";
        option.textContent = item.namn;
        option.addEventListener("click", function () {
            searchInput.value = item.namn;
            dropdown.innerHTML = ""; // Töm dropdown när ett val görs
            renderFoodList([item]); // Visa vald produkt
        });
        dropdown.appendChild(option);
    });

    if (data.length === 0) {
        const noResult = document.createElement("div");
        noResult.className = "dropdown-item no-result";
        noResult.textContent = "Inga resultat";
        dropdown.appendChild(noResult);
    }
}

function renderFoodList(data) {
    nutritionOutput.innerHTML = ""; // Töm tidigare resultat
  
    data.forEach(item => {
        const div = document.createElement("div");
        div.className = "food-card";
      
        // Bygg HTML för varje livsmedel
        div.innerHTML = `
            <h3>${item.namn}</h3>
            <p><strong>Grupp:</strong> ${item.livsmedelsgruppNamn}</p>
            <p><strong>Energi:</strong> ${item.energiKcal} kcal</p>
            <p><strong>Kolhydrater:</strong> ${item.kolhydrater} g</p>
            <p><strong>Fett:</strong> ${item.fett} g</p>
            <p><strong>Protein:</strong> ${item.protein} g</p>
            
            <label for="quantity${item.id}">Antal:</label>
            <input type="number" id="quantity${item.id}" value="1" min="1">
            
            <button class="add-button" data-id="${item.id}" data-name="${item.namn}" data-energy="${item.energiKcal}" data-carbs="${item.kolhydrater}" data-fat="${item.fett}" data-protein="${item.protein}">Lägg till</button>
        `;
        nutritionOutput.appendChild(div);
    });
}
/////////////////////////////////////////////////////////////////////////////////////
const summary = {
    totalEnergy: 0,
    totalCarbs: 0,
    totalProtein: 0,
    totalFat: 0
};

nutritionOutput.addEventListener("click", function(event) {
    if (event.target.classList.contains("add-button")) {
        const item = event.target;
        const quantity = document.getElementById(`quantity${item.dataset.id}`).value;

        // Uppdatera summering baserat på vald livsmedel
        summary.totalEnergy += Number(item.dataset.energy) * Number(quantity);
        summary.totalCarbs += Number(item.dataset.carbs) * Number(quantity);
        summary.totalFat += Number(item.dataset.fat) * Number(quantity);
        summary.totalProtein += Number(item.dataset.protein) * Number(quantity);

        // Uppdatera UI med summan
        document.getElementById("totalEnergy").textContent = `Total energi: ${summary.totalEnergy} kcal`;
        document.getElementById("totalCarbs").textContent = `Totala kolhydrater: ${summary.totalCarbs} g`;
        document.getElementById("totalProtein").textContent = `Totalt protein: ${summary.totalProtein} g`;
        document.getElementById("totalFat").textContent = `Totalt fett: ${summary.totalFat} g`;
    }
});