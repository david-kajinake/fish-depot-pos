import { apiFetch } from './session.js';
import { collectSupplyItems, supplyTotals } from './utils/inventory-utils.js';

/* --- INVENTORY MODULE LOGIC --- */

let analyticsChart = null;
let allInvoicesData = [];
let fishSizesData = [];

// Global calculation function invoked by inline row input events
window.calculateRow = function(inputElement) {
    const row = inputElement.closest('tr');
    const weight = parseFloat(row.querySelector('.row-weight').value) || 0;
    const rate = parseFloat(row.querySelector('.row-rate').value) || 0;
    
    const amount = weight * rate;
    row.querySelector('.row-amount').innerText = amount.toFixed(2);
    
    window.updateGrandTotals();
};

// Calculate modal dynamic totals
window.updateGrandTotals = function() {
    const totals = supplyTotals(document.querySelectorAll('#supplyRowContainer tr'));

    document.getElementById('totalQty').innerText = totals.quantity;
    document.getElementById('totalWeight').innerText = totals.weight.toFixed(2);
    document.getElementById('totalAmount').innerText = totals.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/* --- DOM Content Loaded Initialization --- */
document.addEventListener("DOMContentLoaded", () => {
    
    // Initial Fetches using our authFetch helper
    initAnalyticsChart();
    loadLiveStock();
    fetchPastSupplyInvoices();

    // Modal Events
    const supplyModal = document.getElementById('supplyModal');
    document.getElementById('open-supply-modal-button').addEventListener('click', openSupplyModal);
    document.getElementById('close-supply-modal-button').addEventListener('click', closeSupplyModal);
    document.getElementById('cancel-modal-btn').addEventListener('click', closeSupplyModal);
    document.getElementById('add-supply-row-button').addEventListener('click', addSupplyRow);

    // Filter History Search
    document.getElementById('historySearchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterHistory(query);
    });

    // Chart Tabs
    document.querySelectorAll('.chart-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const chartType = e.target.dataset.chart;
            updateChartData(chartType);
        });
    });

    // Form Submission
    document.getElementById('supply-form').addEventListener('submit', handleInvoiceSubmission);

    /* --- Modal Handlers --- */
    async function openSupplyModal() {
        // Ensure the foreign-key dropdown is populated before a row is made.
        if (fishSizesData.length === 0) await loadLiveStock();
        supplyModal.style.display = 'flex';
        document.getElementById('supplyRowContainer').innerHTML = '';
        addSupplyRow();
        await loadSuppliers();
    }

    function closeSupplyModal() {
        supplyModal.style.display = 'none';
        document.getElementById('supply-form').reset();
        window.updateGrandTotals();
    }

    async function loadSuppliers() {
        try {
            const response = await apiFetch('/api/suppliers/');
            const suppliers = await response.json();
            const select = document.getElementById('supplierSelect');
            select.innerHTML = '<option value="">Select Supplier...</option>';
            suppliers.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });
        } catch (err) {
            console.error("Failed to load suppliers:", err);
        }
    }

    function addSupplyRow() {
        const container = document.getElementById('supplyRowContainer');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <select class="row-size" required></select>
            </td>
            <td><input type="number" class="row-qty" value="0" min="0" oninput="calculateRow(this)"></td>
            <td><input type="number" step="0.01" class="row-weight" value="0" min="0" oninput="calculateRow(this)"></td>
            <td><input type="number" step="0.01" class="row-rate" value="0" min="0" oninput="calculateRow(this)"></td>
            <td class="row-amount">0.00</td>
            <td class="text-center"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove(); updateGrandTotals();">&times;</button></td>
        `;
        container.appendChild(row);
        populateSizeDropdown(row.querySelector('.row-size'));
    }

    function populateSizeDropdown(selectElement) {
        // `fish_size` is a ForeignKey.  Only API-provided IDs are valid;
        // placeholder size numbers cause DRF's "Invalid pk" 400 response.
        selectElement.innerHTML = '<option value="">Select size...</option>';
        fishSizesData.forEach(s => {
            selectElement.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    }

    /* --- Data Fetching & UI Population --- */
    async function loadLiveStock() {
        try {
            const response = await apiFetch('/api/fish-sizes/');
            fishSizesData = await response.json();
            
            const tbody = document.getElementById('stockTableBody');
            tbody.innerHTML = '';

            let totalWeightAcc = 0;
            let totalValueAcc = 0;
            let lowStockCount = 0;

            fishSizesData.forEach(fish => {
                const stockKg = parseFloat(fish.current_stock_kg || 0);
                const buyingPrice = parseFloat(fish.last_buying_price || fish.unit_price || 0);
                const sellingPrice = parseFloat(fish.selling_price || 0);
                const estValue = stockKg * buyingPrice;

                totalWeightAcc += stockKg;
                totalValueAcc += estValue;

                let statusBadge = `<span class="badge-stock badge-success">In Stock</span>`;
                if (stockKg <= 10) {
                    statusBadge = `<span class="badge-stock badge-danger">Critical Low</span>`;
                    lowStockCount++;
                } else if (stockKg <= 30) {
                    statusBadge = `<span class="badge-stock badge-warning">Low Stock</span>`;
                    lowStockCount++;
                }

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${fish.name}</strong></td>
                        <td>${stockKg.toFixed(2)} KG</td>
                        <td>${buyingPrice.toFixed(2)}</td>
                        <td>${sellingPrice.toFixed(2)}</td>
                        <td>KES ${estValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            });

            // Update KPI cards
            document.getElementById('statTotalWeight').innerHTML = `${totalWeightAcc.toFixed(2)} <small>KG</small>`;
            document.getElementById('statTotalValue').innerText = `KES ${totalValueAcc.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById('statLowStockCount').innerText = lowStockCount;
            document.getElementById('liveStockBadge').innerText = `${fishSizesData.length} Categories Monitored`;

        } catch (err) {
            console.error("Error loading live stock:", err);
        }
    }

    async function fetchPastSupplyInvoices() {
        try {
            const response = await apiFetch('/api/supply-invoices/');
            allInvoicesData = await response.json();
            
            document.getElementById('statTotalInvoices').innerText = allInvoicesData.length;
            renderPastSupplies(allInvoicesData);
            updateChartData('day'); // Load initial chart
        } catch (err) {
            console.error("Error fetching supply invoices:", err);
            document.getElementById('past-supply-body').innerHTML = `<p class="text-center">Failed to load supply history.</p>`;
        }
    }

    function renderPastSupplies(invoices) {
        const container = document.getElementById('past-supply-body');
        container.innerHTML = '';

        if (invoices.length === 0) {
            container.innerHTML = `<p class="text-center" style="color: var(--text-muted);">No supply invoices recorded yet.</p>`;
            return;
        }

        invoices.forEach(supply => {
            const dateFormatted = new Date(supply.timestamp || Date.now()).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = 'supply-invoice-card';

            let itemsHtml = '';
            if (supply.stock_items && supply.stock_items.length > 0) {
                supply.stock_items.forEach(item => {
                    itemsHtml += `
                        <tr>
                            <td>${item.fish_size_name || item.fish_size}</td>
                            <td>${item.quantity || 0} Pcs</td>
                            <td>${parseFloat(item.weight || 0).toFixed(2)} KG</td>
                            <td>KES ${parseFloat(item.rate || 0).toFixed(2)}</td>
                            <td>KES ${parseFloat(item.total_cost || item.amount || 0).toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            card.innerHTML = `
                <div class="invoice-summary-bar">
                    <div class="invoice-meta">
                        <div>
                            <strong>${supply.supplier_name || 'Vendor'}</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${dateFormatted}</div>
                        </div>
                        <div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">REF:</span> 
                            <strong>${supply.invoice_ref || supply.id}</strong>
                        </div>
                    </div>
                    <div class="invoice-meta">
                        <div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Total Weight:</span>
                            <strong>${parseFloat(supply.total_weight || 0).toFixed(2)} KG</strong>
                        </div>
                        <div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Cost:</span>
                            <strong style="color: var(--ocean-blue);">KES ${parseFloat(supply.total_invoice_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                        </div>
                        <i class="fa-solid fa-chevron-down invoice-details-toggle"></i>
                    </div>
                </div>
                <div class="invoice-items-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Fish Size</th>
                                <th>Quantity</th>
                                <th>Weight</th>
                                <th>Rate/KG</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>
            `;

            // Toggle Expand/Collapse
            card.querySelector('.invoice-summary-bar').addEventListener('click', () => {
                card.classList.toggle('open');
            });

            container.appendChild(card);
        });
    }

    function filterHistory(query) {
        const filtered = allInvoicesData.filter(inv => {
            const supplier = (inv.supplier_name || '').toLowerCase();
            const ref = (inv.invoice_ref || inv.id || '').toString().toLowerCase();
            return supplier.includes(query) || ref.includes(query);
        });
        renderPastSupplies(filtered);
    }

    /* --- Form Submission (Using JWT authFetch) --- */
    async function handleInvoiceSubmission(e) {
        e.preventDefault();

        const invoiceData = {
            supplier: document.getElementById("supplierSelect").value,
            amount_paid_to_supplier: 0,
            stock_items: []
        };

        invoiceData.stock_items = collectSupplyItems(document.querySelectorAll("#supplyRowContainer tr"));

        if (!invoiceData.supplier) {
            alert('Select a supplier before recording this delivery.');
            return;
        }

        if (invoiceData.stock_items.length === 0) {
            alert("Add at least one item with a fish size, positive quantity, weight, and rate.");
            return;
        }

        try {
            console.log(invoiceData);
            const response = await apiFetch("/api/supply-invoices/", {
                method: "POST",
                body: JSON.stringify(invoiceData),
            });

            if (response.ok) {
                alert("Supply invoice successfully recorded and stock updated!");
                closeSupplyModal();
                loadLiveStock();
                fetchPastSupplyInvoices();
            } else {
                const errData = await response.json();
                const errors = errData.detail || Object.entries(errData)
                    .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                    .join('\n');
                console.error('Supply invoice validation failed:', errData, invoiceData);
                alert(`Could not save supply invoice.\n${errors || 'Please review the entered data.'}`);
            }
        } catch (err) {
            console.error("Submission error:", err);
            alert("Network error while processing supply invoice.");
        }
    }

    /* --- Analytics Chart Initialization & Updates --- */
    function initAnalyticsChart() {
        const ctx = document.getElementById('inventoryAnalyticsChart').getContext('2d');
        analyticsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Supply Received (KG)',
                    data: [],
                    backgroundColor: '#00509E',
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        title: { display: true, text: 'Total Weight (KG)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function updateChartData(type) {
        let labels = [];
        let values = [];

        if (type === 'day') {
            labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            values = Array(7).fill(0);

            allInvoicesData.forEach(inv => {
                if (inv.timestamp) {
                    const d = new Date(inv.timestamp);
                    const dayIdx = (d.getDay() + 6) % 7; // Convert Sun-Sat to Mon-Sun
                    values[dayIdx] += parseFloat(inv.total_weight || 0);
                }
            });
        } else if (type === 'week') {
            labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
            values = Array(4).fill(0);

            allInvoicesData.forEach(inv => {
                if (inv.timestamp) {
                    const dateNum = new Date(inv.timestamp).getDate();
                    const weekIdx = Math.min(Math.floor((dateNum - 1) / 7), 3);
                    values[weekIdx] += parseFloat(inv.total_weight || 0);
                }
            });
        } else if (type === 'month') {
            labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            values = Array(12).fill(0);

            allInvoicesData.forEach(inv => {
                if (inv.timestamp) {
                    const monthIdx = new Date(inv.timestamp).getMonth();
                    values[monthIdx] += parseFloat(inv.total_weight || 0);
                }
            });
        }

        analyticsChart.data.labels = labels;
        analyticsChart.data.datasets[0].data = values;
        analyticsChart.update();
    }
});
