import { apiFetch } from './session.js';
import { initSalesForm } from './utils/salesUtils.js';

document.addEventListener('DOMContentLoaded', () => {
    

// ==========================================
    // NEW: ADD NEW SALE & CALL IT A DAY LOGIC
    // ==========================================
    const btnAddNewSale = document.getElementById("btnAddNewSale");
    const btnCallItADay = document.getElementById("btnCallItADay");
    const salesFormParentDiv = document.getElementById("sales-div");
    const btnCloseForm = document.getElementById("btnCloseForm");

    // 1. Toggle Sales Form Visibility
    btnAddNewSale.addEventListener("click", () => {
        salesFormParentDiv.hidden = false; // Show the form
    });

    if (btnCloseForm) {
        btnCloseForm.addEventListener("click", () => {
            salesFormParentDiv.style.display = "none"; // Hide the form
        });
    }

    // 2. Call it a Day Logic
    btnCallItADay.addEventListener("click", async () => {
        // Require user confirmation before taking action
        const isConfirmed = confirm(
            "Are you sure you want to Call it a day? \n\nThis will close the current day's sales operations and you won't be able to record new sales until tomorrow."
        );

        if (!isConfirmed) return; // Exit if the user click Cancel

        try {
            const response = await apiFetch('/api/days/close-day/', { 
                method: 'POST',
            });

            if (response.ok) {
                alert("Day closed successfully. Great work today!");
                
                // Disable UI elements to prevent further sales
                btnAddNewSale.disabled = true;
                btnCallItADay.disabled = true;
                salesFormParentDiv.style.display = "none";
                
                // Optionally reload the page or re-fetch past sales
                // fetchSalesByDays(); 
            } else {
                const errorData = await response.json();
                console.error("Failed to close day:", errorData);
                alert("Could not close the day. Please check the console for details.");
            }
        } catch (error) {
            console.error("Network error while closing day:", error);
            alert("A network error occurred. Please try again.");
        }
    });


    // 1. Fetch and Render Inventory (Fish Sizes)
    async function loadInventory() {
        const inventoryList = document.getElementById('inventory-list');
        try {
            const response = await apiFetch('/api/fish-sizes/');
            const data = await response.json();
            
            inventoryList.innerHTML = ''; // Clear loading text
            
            data.forEach(item => {
                // Determine progress bar width (assuming 500kg is a visual "full" capacity for the bar)
                const stockKg = parseFloat(item.current_stock_kg);
                const percent = Math.min((stockKg / 500) * 100, 100);
                
                // Show RESTOCK badge if stock falls below 50kg
                const needsRestock = stockKg < 3;
                
                const html = `
                    <div class="inventory-item">
                        <div class="inventory-icon">
                            <i class="fa-solid fa-fish"></i>
                        </div>
                        <div class="inventory-details">
                            <div class="inventory-header">
                                <h4>Tilapia ${item.name}</h4>
                                ${needsRestock ? '<span class="restock-badge">RESTOCK</span>' : ''}
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-fill" style="width: ${percent}%;"></div>
                            </div>
                            <div class="inventory-stats">
                                <span>${stockKg} kg</span>
                                <span>$${item.retail_price_per_kg}</span>
                            </div>
                        </div>
                    </div>
                `;
                inventoryList.insertAdjacentHTML('beforeend', html);
            });
        } catch (error) {
            inventoryList.innerHTML = '<div class="loading-text">Failed to load inventory.</div>';
        }
    }

    // 2. Fetch and Render Recent Transactions
    async function loadTransactions() {
        const tbody = document.getElementById('transactions-tbody');
        try {
            const response = await apiFetch('/api/sales/');
            const sales = await response.json();
            
            tbody.innerHTML = '';
            
            // Render only the top 5 most recent sales
            sales.slice(0, 5).forEach(sale => {
                const dateObj = new Date(sale.timestamp);
                const timeStr = dateObj.toLocaleDateString() + ', ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                const statusClass = sale.sale_type === 'INSTANT' ? 'status-completed' : 'status-partial';
                const statusText = sale.sale_type === 'INSTANT' ? 'Completed' : 'Partial/Late';
                
                const html = `
                    <tr>
                        <td>${sale.id.substring(0, 8).toUpperCase()}</td>
                        <td>${timeStr}</td>
                        <td>${sale.customer_display_name || 'Walk-in'}</td>
                        <td>$${parseFloat(sale.total_amount).toFixed(2)}</td>
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', html);
            });
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="5">Failed to load transactions.</td></tr>';
        }
    }

    // 3. Calculate and Render Right Column Metrics
    async function loadMetrics() {
        try {
            // Fetch all sales for Revenue & Weight
            const salesRes = await apiFetch('/api/sales/today/');
            const sales = await salesRes.json();
            
            let totalRevenue = 0;
            let totalWeight = 0;
            
            sales.forEach(sale => {
                totalRevenue += parseFloat(sale.total_amount) || "KSH0";
                sale.items.forEach(item => {
                    totalWeight += parseFloat(item.weight) || "0KGs";
                });
            });

            // Fetch Today's expenses
            const TodayExpensesData = await apiFetch('/api/expenses/today/');
            const expenses = await TodayExpensesData.json();
            
            let totalExpenses = 0;
            expenses.forEach(expense => {
                totalExpenses += parseFloat(expense.amount);
            });
            console.log(totalExpenses);

            document.getElementById('metric-sales').innerText = `$${totalRevenue.toFixed(2)}`;
            document.getElementById('metric-weight').innerText = `${totalWeight.toFixed(1)} kg`;
            document.getElementById('metric-expenses').innerText = `$${totalExpenses.toFixed(2)}`;
            
        } catch (error) {
            console.error("Failed to load metrics", error);
        }
    }

    // 4. Initialize Bar Chart (Using aggregated Daily Sales)
    async function loadChart() {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;

        try {
            const daysRes = await apiFetch('/api/days/');
            const days = await daysRes.json();
            
            // Map the last 7 days for the chart
            const chartData = days.slice(0, 7).reverse();
            const labels = chartData.map(d => {
                const date = new Date(d.date);
                return date.toLocaleDateString('en-US', { weekday: 'short' });
            });
            
            // Calculate total sales amount per day from the nested sales array
            const data = chartData.map(d => {
                return d.sales.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0);
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Sales Revenue',
                        data: data,
                        backgroundColor: '#86B6F6', // Lighter blue for bars
                        hoverBackgroundColor: '#FF6F61', // Coral on hover
                        borderRadius: 4,
                        barThickness: 30
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                        },
                        x: { 
                            grid: { display: false },
                            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Failed to load chart data", error);
        }
    }

    // Execute API calls
    initSalesForm();
    loadInventory();
    loadTransactions();
    loadMetrics();
    loadChart();
});
