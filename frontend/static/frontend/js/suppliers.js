import { apiFetch } from './session.js';
import { queueStatement, statementPayload, waitForStatement } from './utils/statementTasks.js';

let allSuppliers = [];
let supplierChart = null;

const authFetch = apiFetch;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });

document.addEventListener("DOMContentLoaded", () => {
    initChart();
    loadSuppliersData();
    loadInvoiceHistory();

    // Modal logic
    const modal = document.getElementById('supplierModal');
    document.getElementById('addSupplierBtn').addEventListener('click', () => modal.style.display = 'flex');
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('cancelBtn').addEventListener('click', () => modal.style.display = 'none');

    // Form Submission
    document.getElementById('supplierForm').addEventListener('submit', handleAddSupplier);
    document.getElementById('openAllSuppliersStatement').onclick = () => { const modal = document.getElementById('allSuppliersStatementModal'); modal.hidden = false; modal.style.display = 'flex'; };
    document.querySelectorAll('[data-close-statement]').forEach((button) => button.onclick = () => { const modal = document.getElementById(button.dataset.closeStatement); modal.hidden = true; modal.style.display = 'none'; });
    document.getElementById('allSuppliersStatementForm').onsubmit = (event) => submitStatement(event, '/api/suppliers/send-all-suppliers-statement/', 'allSuppliersStatementStatus');

    // View Toggles
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            
            const viewType = target.dataset.view;
            const container = document.getElementById('dataContainer');
            const tableView = document.getElementById('tableView');
            const gridView = document.getElementById('gridView');

            if (viewType === 'table') {
                tableView.classList.remove('hidden');
                gridView.classList.add('hidden');
            } else {
                tableView.classList.add('hidden');
                gridView.classList.remove('hidden');
            }
        });
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allSuppliers.filter(s => 
            (s.name || '').toLowerCase().includes(query) ||
            (s.phone || s.phone_number || '').toLowerCase().includes(query) ||
            (s.email || '').toLowerCase().includes(query)
        );
        renderSuppliers(filtered);
    });
});

async function loadSuppliersData() {
    try {
        // Fetch suppliers and invoices concurrently to aggregate total KGs supplied
        const [suppliersRes, invoicesRes] = await Promise.all([
            authFetch('/api/suppliers/'),
            authFetch('/api/supply-invoices/')
        ]);

        const rawSuppliers = await suppliersRes.json();
        const invoices = await invoicesRes.json();

        // Calculate total weight supplied by each vendor
        const weightMap = {};
        invoices.forEach(inv => {
            const sId = inv.supplier || inv.supplier_id; 
            if (sId) {
                weightMap[sId] = (weightMap[sId] || 0) + parseFloat(inv.total_weight || 0);
            }
        });

        // Map weights and filter for "supplied at least once" 
        // (including 0 KG for newly added ones so they remain visible, but prioritized)
        allSuppliers = rawSuppliers.map(s => ({
            ...s,
            totalSuppliedKg: weightMap[s.id] || 0
        })).sort((a, b) => b.totalSuppliedKg - a.totalSuppliedKg);

        renderSuppliers(allSuppliers);
        updateChart(allSuppliers);

    } catch (err) {
        console.error("Failed to load suppliers:", err);
        document.getElementById('suppliersTableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading suppliers</td></tr>`;
    }
}

async function loadInvoiceHistory() {
    try {
        const invoiceResponse = await authFetch('/api/supply-invoices/');
        if (!invoiceResponse.ok) throw new Error('Could not load supply history.');
        renderInvoices(await invoiceResponse.json());
    } catch (error) {
        console.error(error);
        document.getElementById('allInvoiceGroups').innerHTML = '<p class="text-center">Could not load stock supplies.</p>';
    }
}

function renderInvoices(invoices) {
    const groups = invoices.reduce((byDay, invoice) => { const day = invoice.day || String(invoice.timestamp).slice(0, 10); (byDay[day] ||= []).push(invoice); return byDay; }, {});
    document.getElementById('allInvoiceGroups').innerHTML = Object.entries(groups).map(([day, entries]) => `<section class="invoice-day-group"><h4 class="invoice-day-heading">${esc(new Date(`${day}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</h4><div class="invoice-cards">${entries.map(renderInvoiceCard).join('')}</div></section>`).join('') || '<p class="text-center">No stock supplies recorded.</p>';
}

function renderInvoiceCard(invoice) {
    const rows = (invoice.stock_items || []).map((item) => `<tr><td>${esc(item.fish_size_name || item.fish_size)}</td><td>${esc(item.quantity)}</td><td>${Number(item.weight || 0).toFixed(2)}</td><td>${money.format(Number(item.rate || 0))}</td><td>${money.format(Number(item.total_cost || 0))}</td></tr>`).join('') || '<tr><td colspan="5">No stock items.</td></tr>';
    return `<article class="invoice-card"><div class="invoice-meta"><span><b>ID:</b> ${esc(invoice.id)}</span><span><b>Supplier:</b> ${esc(invoice.supplier_name || invoice.supplier || '—')}</span><span><b>Invoice Amount:</b> ${money.format(Number(invoice.invoice_amount || 0))}</span><span><b>Extra fees:</b> ${money.format(Number(invoice.extra_fees || 0))}</span><span><b>Invoice Total Cost:</b> ${money.format(Number(invoice.total_invoice_cost || 0))}</span></div><div class="invoice-table-wrap"><table class="invoice-items-table"><thead><tr><th>Size</th><th>Qty</th><th>Weight</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

async function submitStatement(event, endpoint, statusId) {
    event.preventDefault();
    const status = document.getElementById(statusId);
    try {
        status.textContent = 'Queuing statement…';
        const taskId = await queueStatement(endpoint, statementPayload(event.currentTarget));
        await waitForStatement(taskId, (task) => status.textContent = task.status || 'Generating PDF…');
        status.textContent = 'Statement emailed successfully.';
    } catch (error) { status.textContent = error.detail || error.message || 'Could not queue statement.'; }
}

// Global scope redirect function attached to dynamic rows/cards
window.goToSupplier = function(id) {
    window.location.href = `/suppliers/${id}/`;
};

function renderSuppliers(data) {
    const tbody = document.getElementById('suppliersTableBody');
    const grid = document.getElementById('gridView');
    
    tbody.innerHTML = '';
    grid.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No suppliers found.</td></tr>`;
        grid.innerHTML = `<div class="empty-state">No suppliers found.</div>`;
        return;
    }

    data.forEach(supplier => {
        const phone = supplier.phone || supplier.phone_number || '—';
        const email = supplier.email || '—';
        const weightFormatted = supplier.totalSuppliedKg.toFixed(2);
        
        const isVerifiedActive = supplier.totalSuppliedKg > 0;
        const badgeHtml = isVerifiedActive 
            ? `<span class="badge badge-success">${weightFormatted} KG</span>` 
            : `<span class="badge badge-warning">No Supply Yet</span>`;

        // Table Row
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.onclick = () => window.goToSupplier(supplier.id);
        tr.innerHTML = `
            <td>#${supplier.id}</td>
            <td><strong>${supplier.name}</strong></td>
            <td>${phone}</td>
            <td>${email}</td>
            <td>${badgeHtml}</td>
        `;
        tbody.appendChild(tr);

        // Grid Card
        const card = document.createElement('div');
        card.className = 'supplier-card';
        card.onclick = () => window.goToSupplier(supplier.id);
        card.innerHTML = `
            <div class="card-avatar">${supplier.name.charAt(0).toUpperCase()}</div>
            <h3 class="supplier-name">${supplier.name}</h3>
            <p class="supplier-contact"><i class="fa-solid fa-phone"></i> ${phone}</p>
            <p class="supplier-contact"><i class="fa-solid fa-envelope"></i> ${email}</p>
            <div class="card-footer">
                ${badgeHtml}
            </div>
        `;
        grid.appendChild(card);
    });
}

async function handleAddSupplier(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('supplierName').value.trim(),
        phone: document.getElementById('supplierPhone').value.trim(),
        email: document.getElementById('supplierEmail').value.trim()
    };

    try {
        const token = localStorage.getItem('access_token');
        const response = await authFetch('/api/suppliers/', {
            method: 'post',
            body: JSON.stringify(payload), 
            headers:{
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.ok) {
            document.getElementById('supplierModal').style.display = 'none';
            document.getElementById('supplierForm').reset();
            loadSuppliersData(); // Refresh list to show new supplier
        } else {
            const err = await response.json();
            // Display backend validation errors cleanly
            const errorMsg = err.detail || Object.values(err).flat().join(', ') || 'Unknown error occurred.';
            alert(`Error adding supplier: ${errorMsg}`);
        }
    } catch (err) {
        console.error("Submission error:", err);
        alert("Network error while adding supplier.");
    }
}

function initChart() {
    const ctx = document.getElementById('supplierVolumeChart').getContext('2d');
    supplierChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Total Stock Supplied (KG)',
                data: [],
                backgroundColor: '#10B981', // Emerald Green
                hoverBackgroundColor: '#059669',
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
                    title: { display: true, text: 'Weight (KG)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function updateChart(data) {
    // Only chart vendors who have actually supplied stock > 0
    const activeVendors = data.filter(s => s.totalSuppliedKg > 0);
    
    supplierChart.data.labels = activeVendors.map(s => s.name);
    supplierChart.data.datasets[0].data = activeVendors.map(s => s.totalSuppliedKg);
    supplierChart.update();
}
