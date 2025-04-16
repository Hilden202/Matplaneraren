const url = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/?page=1&pageSize=100";

const nutritionOutput = document.getElementById("nutritionOutput");
const searchInput = document.getElementById("foodInput");

function getValue(food, namn) {
    if (!food.naringsvarden) return 0;

    const item = food.naringsvarden.find(n => n.namn.toLowerCase().includes(namn.toLowerCase()));
    return item ? item.varde : 0;
}

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
               
               let selectedFoods = [];
               
               const summary = {
                   totalEnergy: 0,
                   totalCarbs: 0,
                   totalFat: 0,
                   totalProtein: 0
                };
                
                searchInput.addEventListener("input", function () {
                    const searchTerm = searchInput.value.toLowerCase();
                    const filteredData = foodData.filter(function(item) {
                        return item.namn.toLowerCase().includes(searchTerm);
                    });
                    renderFoodList(filteredData);
                    
                });
                
                async function fetchClassification(foodId) {
                    const classificationUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${foodId}/klassificeringar?sprak=1`;
                
                    try {
                        const response = await fetch(classificationUrl);
                        const data = await response.json();
                
                        // Kontrollera om klassificeringar finns
                        if (data && data.length > 0) {
                            // Exempel: hämta det första klassificeringsnamnet
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
                

                function renderFoodList(data) {
                    nutritionOutput.innerHTML = ""; // Töm innan rendering
                
                    data.forEach(async function(food) {
                        const nutritionUrl = `https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel/${food.id}/naringsvarden?sprak=1`;
                        
                        try {
                            const response = await fetch(nutritionUrl);
                            const nutritionData = await response.json();
                            
                            const getValue = (name) => {
                                const item = nutritionData.find(n => n.namn.toLowerCase().includes(name.toLowerCase()));
                                return item ? item.varde : 0;
                            };
                            
                            const groupName = await fetchClassification(food.id);
                            const energiKcal = getValue("energi");
                            const kolhydrater = getValue("kolhydrater");
                            const fett = getValue("fett");
                            const protein = getValue("protein");
                            
                            const div = document.createElement("div");
                            div.className = "food-card";
                            div.innerHTML = 
                                "<h3>" + food.namn + "</h3>" +
                                "<p><strong>Grupp:</strong> " + groupName + "</p>" +
                                "<p><strong>Energi:</strong> " + energiKcal + " kcal</p>" +
                                "<p><strong>Kolhydrater:</strong> " + kolhydrater + " g</p>" +
                                "<p><strong>Fett:</strong> " + fett + " g</p>" +
                                "<p><strong>Protein:</strong> " + protein + " g</p>" +
                                "<label for='quantity" + food.id + "'>Gram:</label>" +
                                "<input type='number' id='quantity" + food.id + "' value='100' min='1'>" +
                                "<button class='add-button' " +
                                "data-id='" + food.id + "' " +
                                "data-name='" + food.namn + "' " +
                                "data-group='" + groupName + "' " +
                                "data-energy='" + energiKcal + "' " +
                                "data-carbs='" + kolhydrater + "' " +
                                "data-fat='" + fett + "' " +
                                "data-protein='" + protein + "'>Lägg till</button>";
                            
                            nutritionOutput.appendChild(div);
                
                            // Lägg till eventlyssnare för knappen
                            const button = div.querySelector(".add-button");
                            button.addEventListener("click", function () {
                                const quantity = document.getElementById("quantity" + food.id).value;
                                const selectedFood = {
                                    id: food.id,
                                    namn: food.namn,
                                    energiKcal: energiKcal,
                                    kolhydrater: kolhydrater,
                                    fett: fett,
                                    protein: protein,
                                    gram: quantity
                                };
                            });
                
                        } catch (error) {
                            console.error("Fel vid hämtning av näringsvärden för:", food.namn, error);
                        }
                    });
                }

                function updateSelectedFoodsList() {
                    foodList.innerHTML = "<h3>Valda livsmedel</h3><ul>";
                
                    for (let i = 0; i < selectedFoods.length; i++) {
                        const item = selectedFoods[i];
                
                        foodList.innerHTML += `
                            <li>
                                <button onclick="removeFood(${i})"> x </button>
                                <button onclick="increaseQuantity(${i})"> + </button>
                                <button onclick="decreaseQuantity(${i})"> - </button>
                                ${item.quantity} g ${item.name}
                            </li>
                        `;
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
                        const food = foodData.find(f => f.id === item.id);
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
                
                
                
                nutritionOutput.addEventListener("click", function (event) {
                    if (event.target.classList.contains("add-button")) {
                        const item = event.target;
                        
                        const id = item.dataset.id;
                        const name = item.dataset.name;
                        const grams = parseInt(document.getElementById("quantity" + id).value, 10) || 100;
                        
                        const existingItem = selectedFoods.find(item => item.id === id);

                        if (existingItem) {
                            existingItem.quantity += grams;
                        } else {
                            selectedFoods.push({
                                id: id,
                                name: name,
                                quantity: grams,
                                energiKcal: parseFloat(item.dataset.energy),
                                kolhydrater: parseFloat(item.dataset.carbs),
                                fett: parseFloat(item.dataset.fat),
                                protein: parseFloat(item.dataset.protein),
                            });
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
                