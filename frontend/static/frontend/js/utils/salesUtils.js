// Shared sales UI functions. API authentication is centralized in session.js.
import { apiFetch } from '../session.js';

// Shared Cart State
let stockCart = [];
let outsideCart = [];

/**
 * Initializes form tabs, input listeners, and cart actions.
 * Call this from home.js or sales_terminal.js.
 */
export function initSalesForm() {
    loadFishSizeOptions();
    loadCustomerOptions();
    setupTabSwitching();
    setupLiveCalculationListeners();
    setupCartActions();
}

/* ===================================================
   TAB SWITCHING LOGIC
   =================================================== */
function setupTabSwitching() {
    const btnTabStock = document.getElementById('btnTabStock');
    const btnTabOutside = document.getElementById('btnTabOutside');
    const tabStockContent = document.getElementById('tabStockContent');
    const tabOutsideContent = document.getElementById('tabOutsideContent');

    btnTabStock?.addEventListener('click', () => {
        btnTabStock.classList.add('active');
        btnTabOutside.classList.remove('active');
        tabStockContent.style.display = 'block';
        tabOutsideContent.style.display = 'none';
    });

    btnTabOutside?.addEventListener('click', () => {
        btnTabOutside.classList.add('active');
        btnTabStock.classList.remove('active');
        tabOutsideContent.style.display = 'block';
        tabStockContent.style.display = 'none';
    });
}
/* ===================================================
   LIVE CALCULATION & UI TOGGLES
   =================================================== */
function setupLiveCalculationListeners() {
    const stockWeight = document.getElementById('stockWeight');
    const stockRate = document.getElementById('stockRate');
    const stockIsFried = document.getElementById('stockIsFried');
    const stockFryingFee = document.getElementById('stockFryingFee');

    // Toggle Frying Fee field enablement
    stockIsFried?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        stockFryingFee.disabled = !isChecked;
        if (!isChecked) stockFryingFee.value = 0;
        updateStockLineTotalPreview();
    });

    // Dynamic Line Total Preview
    [stockWeight, stockRate, stockFryingFee].forEach(input => {
        input?.addEventListener('input', updateStockLineTotalPreview);
    });
}

function updateStockLineTotalPreview() {
    const weight = parseFloat(document.getElementById('stockWeight').value) || 0;
    const rate = parseFloat(document.getElementById('stockRate').value) || 0;
    const isFried = document.getElementById('stockIsFried').checked;
    const fryFee = isFried ? (parseFloat(document.getElementById('stockFryingFee').value) || 0) : 0;

    const amount = Math.round(weight * rate);
    const lineTotal = amount + fryFee;

    const display = document.getElementById('stockLineTotalDisplay');
    if (display) display.innerText = `KSH ${lineTotal}`;
}

/* ===================================================
   3. CART MANAGEMENT LOGIC
   =================================================== */
function setupCartActions() {
    // Add to Stock Cart
    document.getElementById('btnAddStockToCart')?.addEventListener('click', addStockItemToCart);
    
    // Add to Outside Cart
    document.getElementById('btnAddOutsideToCart')?.addEventListener('click', addOutsideItemToCart);

    // Complete Checkout Buttons
    document.getElementById('btnCompleteStockSale')?.addEventListener('click', submitStockSale);
    document.getElementById('btnCompleteOutsideSale')?.addEventListener('click', submitOutsideFrying);
}

function addStockItemToCart() {
    const fishSize = document.getElementById('stockFishSize').value;
    const qty = parseInt(document.getElementById('stockQty').value) || 1;
    const weight = parseFloat(document.getElementById('stockWeight').value) || 0;
    const rate = parseFloat(document.getElementById('stockRate').value) || 0;
    const isFried = document.getElementById('stockIsFried').checked;
    const fryFee = isFried ? (parseFloat(document.getElementById('stockFryingFee').value) || 0) : 0;

    if (!fishSize || weight <= 0 || rate <= 0) {
        alert("Please fill in Fish Size, Weight, and Rate.");
        return;
    }

    const amount = Math.round(weight * rate);
    const total = amount + fryFee;

    stockCart.push({
        fish_size: fishSize,
        quantity: qty,
        weight: weight,
        rate_charged: rate,
        amount: amount,
        is_fried: isFried,
        frying_fee_applied: fryFee,
        total: total
    });

    renderStockCart();
    resetStockInputs();
}

function addOutsideItemToCart() {
    const source = document.getElementById('outsideSource').value.trim();
    const fishSize = document.getElementById('outsideFishSize').value;
    const qty = parseInt(document.getElementById('outsideQty').value) || 1;
    const fee = parseFloat(document.getElementById('outsideFee').value) || 0;

    if (!source || fee <= 0) {
        alert("Please provide the Source/Customer Name and the Total Frying Fee.");
        return;
    }

    outsideCart.push({
        source: source,
        fish_size: fishSize || null,
        quantity: qty,
        total_fee: fee
    });

    renderOutsideCart();
    resetOutsideInputs();
}

/* ===================================================
   4. RENDER TABLES & TOTALS
   =================================================== */
function renderStockCart() {
    const tbody = document.getElementById('stockCartTableBody');
    const totalDisplay = document.getElementById('stockCartTotalDisplay');
    if (!tbody) return;

    tbody.innerHTML = '';
    let grandTotal = 0;

    if (stockCart.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No items added to stock cart yet.</td></tr>';
        totalDisplay.innerText = "0.00";
        return;
    }

    stockCart.forEach((item, index) => {
        grandTotal += item.total;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Size ${item.fish_size}</td>
            <td>${item.quantity}</td>
            <td>${item.weight} kg</td>
            <td>${item.rate_charged}</td>
            <td>${item.frying_fee_applied}</td>
            <td><strong>KSH ${item.total}</strong></td>
            <td class="text-center">
                <button type="button" class="btn-remove-row" data-index="${index}">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    totalDisplay.innerText = grandTotal.toFixed(2);

    // Event listeners for remove buttons
    tbody.querySelectorAll('.btn-remove-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            stockCart.splice(index, 1);
            renderStockCart();
        });
    });
}

function renderOutsideCart() {
    const tbody = document.getElementById('outsideCartTableBody');
    const totalDisplay = document.getElementById('outsideCartTotalDisplay');
    if (!tbody) return;

    tbody.innerHTML = '';
    let grandTotal = 0;

    if (outsideCart.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No items added to frying cart yet.</td></tr>';
        totalDisplay.innerText = "0.00";
        return;
    }

    outsideCart.forEach((item, index) => {
        grandTotal += item.total_fee;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.source}</td>
            <td>${item.fish_size ? 'Size ' + item.fish_size : '-'}</td>
            <td>${item.quantity}</td>
            <td><strong>KSH ${item.total_fee}</strong></td>
            <td class="text-center">
                <button type="button" class="btn-remove-row" data-index="${index}">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    totalDisplay.innerText = grandTotal.toFixed(2);

    tbody.querySelectorAll('.btn-remove-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            outsideCart.splice(index, 1);
            renderOutsideCart();
        });
    });
}

/* ===================================================
   5. BACKEND SUBMISSIONS (API Calls)
   =================================================== */
async function submitStockSale() {
    if (stockCart.length === 0) {
        alert("Your stock cart is empty!");
        return;
    }

    const customerName = document.getElementById('stockCustomer').value.trim();
    const grandTotal = stockCart.reduce((sum, item) => sum + item.total, 0);
    const amountPaidNow = Number(document.getElementById('stockAmountPaidNow').value);
    if (!Number.isFinite(amountPaidNow) || amountPaidNow < 0) {
        alert('Amount paid now cannot be negative.');
        return;
    }
    if (amountPaidNow !== grandTotal && !customerName) {
        alert('Enter the customer name when payment differs from the stock total.');
        return;
    }

    // Payload formatted for SaleSerializer
    const payload = {
        customer_name: customerName,
        sale_type: amountPaidNow === grandTotal ? "INSTANT" : "LATE",
        total_amount: grandTotal,
        amount_paid_now: amountPaidNow,
        items: stockCart.map(item => ({
            fish_size: item.fish_size,
            quantity: item.quantity,
            weight: item.weight,
            rate_charged: item.rate_charged,
            is_fried: item.is_fried,
            frying_fee_applied: item.frying_fee_applied
        }))
    };

    try {
        const response = await apiFetch('/api/sales/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Stock Sale recorded successfully!");
            stockCart = [];
            renderStockCart();
            document.getElementById('stockCustomer').value = '';
            document.getElementById('stockAmountPaidNow').value = 0;
        } else {
            const err = await response.json();
            alert("Error saving sale: " + JSON.stringify(err));
        }
    } catch (error) {
        console.error("Submission failed:", error);
    }
}

async function submitOutsideFrying() {
    if (outsideCart.length === 0) {
        alert("Your frying cart is empty!");
        return;
    }

    // Payload formatted for OutsideFryingBulkSerializer
    const payload = {
        items: outsideCart.map(item => ({
            source: item.source,
            quantity: item.quantity,
            total_fee: item.total_fee
        }))
    };

    try {
        const response = await apiFetch('/api/outside-frying/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Outside Frying order recorded successfully!");
            outsideCart = [];
            renderOutsideCart();
            document.getElementById('outsideSource').value = '';
        } else {
            const err = await response.json();
            alert("Error saving order: " + JSON.stringify(err));
        }
    } catch (error) {
        console.error("Submission failed:", error);
    }
}

/* ===================================================
   6. RESET HELPERS
   =================================================== */
function resetStockInputs() {
    document.getElementById('stockFishSize').value = '';
    document.getElementById('stockQty').value = 1;
    document.getElementById('stockWeight').value = '';
    document.getElementById('stockRate').value = '';
    document.getElementById('stockIsFried').checked = false;
    document.getElementById('stockFryingFee').value = 0;
    document.getElementById('stockFryingFee').disabled = true;
    document.getElementById('stockLineTotalDisplay').innerText = 'KSH 0';
}

function resetOutsideInputs() {
    document.getElementById('outsideFishSize').value = '';
    document.getElementById('outsideQty').value = 1;
    document.getElementById('outsideFee').value = '';
}

async function loadFishSizeOptions() {
    const selects = [document.getElementById('stockFishSize'), document.getElementById('outsideFishSize')].filter(Boolean);
    if (!selects.length) return;
    try {
        const response = await apiFetch('/api/fish-sizes/');
        if (!response.ok) throw new Error('Could not load fish sizes.');
        const sizes = await response.json();
        selects.forEach((select) => {
            const label = select.id === 'outsideFishSize' ? 'Select Size (Optional)' : 'Select Size';
            select.innerHTML = `<option value="">${label}</option>`;
            sizes.forEach((size) => select.insertAdjacentHTML('beforeend', `<option value="${size.id}">Size ${size.name}</option>`));
        });
    } catch (error) {
        console.error('Fish sizes could not be loaded:', error);
    }
}

async function loadCustomerOptions() {
    const datalist = document.getElementById('saleCustomerOptions');
    if (!datalist) return;
    try {
        const response = await apiFetch('/api/customers/');
        if (!response.ok) throw new Error('Could not load customers.');
        const customers = await response.json();
        datalist.innerHTML = customers
            .map((customer) => `<option value="${escapeHtml(customer.name)}"></option>`)
            .join('');
    } catch (error) {
        console.error('Customer suggestions could not be loaded:', error);
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}
