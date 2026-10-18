import { apiFetch } from './session.js';
import { queueStatement, waitForStatement } from './utils/statementTasks.js';

let currentSupplierId = null;
let currentSupplierData = null;

const authFetch = apiFetch;

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
    tbody.innerHTML = '';

    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No past fish supplies recorded for this vendor.</td></tr>`;
        return;
    }

    invoices.forEach(inv => {
        const dateFormatted = new Date(inv.timestamp || inv.created_at || Date.now()).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Parse Stock Items
        let itemsSummary = '—';
        if (inv.stock_items && inv.stock_items.length > 0) {
            itemsSummary = inv.stock_items.map(item => 
                `${item.fish_size_name || item.fish_size}: ${parseFloat(item.weight || 0).toFixed(2)}KG`
            ).join(', ');
        }

        const weight = parseFloat(inv.total_weight || 0).toFixed(2);
        const cost = parseFloat(inv.total_invoice_cost || inv.total_cost || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${inv.id}</strong></td>
            <td>${dateFormatted}</td>
            <td class="text-truncate" title="${itemsSummary}">${itemsSummary}</td>
            <td><span class="badge badge-success">${weight} KG</span></td>
            <td><strong>KES ${cost}</strong></td>
        `;
        tbody.appendChild(tr);
    });
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
