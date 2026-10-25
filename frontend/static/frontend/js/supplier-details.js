import { apiFetch } from './session.js';
import { queueStatement, waitForStatement } from './utils/statementTasks.js';

let currentSupplierId = null;
let currentSupplierData = null;

const authFetch = apiFetch;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Extract supplier ID from URL route (e.g., /suppliers/12/)
function getSupplierIdFromUrl() {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    return lastSegment;
}

document.addEventListener("DOMContentLoaded", () => {
    currentSupplierId = getSupplierIdFromUrl();

    if (!currentSupplierId) {
        alert("Invalid Supplier ID in URL.");
        window.location.href = '/suppliers/';
        return;
    }

    // Initial Data Fetch
    loadSupplierDetails();

    // Toggle Edit Form Visibility
    const editCard = document.getElementById('editSupplierCard');
    document.getElementById('toggleEditBtn').addEventListener('click', () => {
        editCard.classList.toggle('hidden');
        if (!editCard.classList.contains('hidden') && currentSupplierData) {
            populateEditForm(currentSupplierData);
        }
    });

    document.getElementById('closeEditBtn').addEventListener('click', () => editCard.classList.add('hidden'));
    document.getElementById('cancelEditBtn').addEventListener('click', () => editCard.classList.add('hidden'));

    // Handle Edit Form Submission
    document.getElementById('editSupplierForm').addEventListener('submit', handleSupplierUpdate);

    // Modal Events
    const statementModal = document.getElementById('statementModal');
    document.getElementById('openStatementModalBtn').addEventListener('click', () => {
        if (currentSupplierData) {
            document.getElementById('statementEmail').value = currentSupplierData.email || '';
        }
        statementModal.style.display = 'flex';
    });

    document.getElementById('closeStatementModalBtn').addEventListener('click', () => statementModal.style.display = 'none');
    document.getElementById('cancelStatementBtn').addEventListener('click', () => statementModal.style.display = 'none');

    // Handle Send Statement Submission
    document.getElementById('sendStatementForm').addEventListener('submit', handleSendStatement);
});

// Fetch Supplier Profile and History
async function loadSupplierDetails() {
    try {
        const [supplierRes, historyRes] = await Promise.all([
            authFetch(`/api/suppliers/${currentSupplierId}/`),
            authFetch(`/api/suppliers/${currentSupplierId}/history/`)
        ]);

        if (!supplierRes.ok) {
            throw new Error("Supplier not found.");
        }

        currentSupplierData = await supplierRes.json();
        const historyData = historyRes.ok ? await historyRes.json() : [];

        renderProfile(currentSupplierData);
        renderHistory(historyData);

    } catch (err) {
        console.error("Error loading supplier details:", err);
        alert("Failed to load supplier details.");
        window.location.href = '/suppliers/';
    }
}

function renderProfile(supplier) {
    document.getElementById('supplierName').innerText = supplier.name || 'Unnamed Supplier';
    document.getElementById('supplierIdBadge').innerText = `ID: #${supplier.id}`;
    document.getElementById('supplierAvatar').innerText = (supplier.name || 'S').charAt(0).toUpperCase();
    document.getElementById('supplierPhone').innerText = supplier.phone || supplier.phone_number || '—';
    document.getElementById('supplierEmail').innerText = supplier.email || '—';

    const totalWeight = parseFloat(supplier.total_weight || supplier.total_supplied_weight || 0);
    const totalCost = parseFloat(supplier.total_amount || supplier.total_supplied_cost || 0);

    document.getElementById('supplierTotalWeight').innerText = `${totalWeight.toFixed(2)} KG`;
    document.getElementById('supplierTotalCost').innerText = `KES ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderHistory(invoices) {
    const tbody = document.getElementById('historyTableBody');
    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = `<p class="text-center">No past fish supplies recorded for this vendor.</p>`;
        return;
    }
    const byDay = invoices.reduce((groups, invoice) => { const day = invoice.day || String(invoice.timestamp).slice(0, 10); (groups[day] ||= []).push(invoice); return groups; }, {});
    tbody.innerHTML = Object.entries(byDay).map(([day, entries]) => `<section class="supplier-invoice-day"><h4>${esc(new Date(`${day}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</h4><div class="supplier-invoice-cards">${entries.map(renderInvoiceCard).join('')}</div></section>`).join('');
}

function renderInvoiceCard(invoice) {
    const rows = (invoice.stock_items || []).map((item) => `<tr><td>${esc(item.fish_size_name || item.fish_size)}</td><td>${esc(item.quantity)}</td><td>${Number(item.weight || 0).toFixed(2)}</td><td>${money.format(Number(item.rate || 0))}</td><td>${money.format(Number(item.total_cost || 0))}</td></tr>`).join('') || '<tr><td colspan="5">No stock items.</td></tr>';
    return `<article class="supplier-invoice-card"><div class="supplier-invoice-meta"><span><b>ID:</b> ${esc(invoice.id)}</span><span><b>Supplier:</b> ${esc(invoice.supplier_name || invoice.supplier || currentSupplierData?.name || '—')}</span><span><b>Invoice Amount:</b> ${money.format(Number(invoice.invoice_amount || 0))}</span><span><b>Extra fees:</b> ${money.format(Number(invoice.extra_fees || 0))}</span><span><b>Invoice Total Cost:</b> ${money.format(Number(invoice.total_invoice_cost || 0))}</span></div><div class="supplier-invoice-table-wrap"><table class="supplier-invoice-table"><thead><tr><th>Size</th><th>Qty</th><th>Weight</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function populateEditForm(supplier) {
    document.getElementById('editName').value = supplier.name || '';
    document.getElementById('editPhone').value = supplier.phone || supplier.phone_number || '';
    document.getElementById('editEmail').value = supplier.email || '';
}

async function handleSupplierUpdate(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('editName').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        email: document.getElementById('editEmail').value.trim()
    };

    try {
        const response = await authFetch(`/api/suppliers/${currentSupplierId}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Supplier details updated successfully!");
            document.getElementById('editSupplierCard').classList.add('hidden');
            loadSupplierDetails(); // Refresh view
        } else {
            const err = await response.json();
            const errorMsg = err.detail || Object.values(err).flat().join(', ') || 'Failed to update supplier.';
            alert(`Error: ${errorMsg}`);
        }
    } catch (err) {
        console.error("Update error:", err);
        alert("Network error while updating supplier.");
    }
}

async function handleSendStatement(e) {
    e.preventDefault();

    const email = document.getElementById('statementEmail').value.trim();
    const submitBtn = document.getElementById('sendStatementSubmitBtn');
    const status = document.getElementById('supplierStatementStatus');

    if (!email) {
        alert("Enter a destination email address.");
        return;
    }
    const start_date = document.getElementById('supplierStatementStart').value;
    const end_date = document.getElementById('supplierStatementEnd').value;
    if (Boolean(start_date) !== Boolean(end_date)) return alert('Provide both dates or leave both blank.');

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;

        const taskId = await queueStatement(`/api/suppliers/${currentSupplierId}/send-single-supplier-statement/`, { email, ...(start_date ? { start_date, end_date } : {}) });
        await waitForStatement(taskId, (task) => status.textContent = task.status || 'Generating PDF…');
        status.textContent = 'Statement emailed successfully.';
    } catch (err) {
        console.error("Statement send error:", err);
        alert("Network error while sending statement.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Statement`;
    }
}
