import { apiFetch } from './session.js';
import { queueStatement, waitForStatement } from './utils/statementTasks.js';

let allExpenses = [];
let timeChartInstance = null;
let itemChartInstance = null;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const esc = (val) => String(val ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.addEventListener('DOMContentLoaded', () => {
    bindUI();
    loadData();
});

function bindUI() {
    // Modal Toggles
    document.getElementById('openExpenseBtn').onclick = () => toggleModal('expenseModal', true);
    document.getElementById('openStatementBtn').onclick = () => toggleModal('statementModal', true);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.onclick = () => toggleModal(btn.dataset.closeModal, false);
    });

    // Form Submissions
    document.getElementById('expenseForm').onsubmit = handleExpenseSubmit;
    document.getElementById('statementForm').onsubmit = handleStatementSubmit;

    // Chart Controls
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTimeChart(e.target.dataset.timeTab);
        };
    });

    document.getElementById('itemTimeframeSelect').onchange = (e) => {
        renderItemChart(e.target.value);
    };
}

async function loadData() {
    try {
        const res = await apiFetch('/api/expenses/');
        if (!res.ok) throw new Error('Failed to load expenses');
        allExpenses = await res.json();
        
        renderExpenseList();
        populateDatalist();
        renderTimeChart('weekly');
        renderItemChart('week');
    } catch (err) {
        console.error(err);
        document.getElementById('expensesTableBody').innerHTML = '<tr><td colspan="3" class="empty-state">Could not load expenses.</td></tr>';
    }
}

function renderExpenseList() {
    const tbody = document.getElementById('expensesTableBody');
    if (!allExpenses.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No expenses recorded yet.</td></tr>';
        return;
    }

    // Group by Day
    const grouped = allExpenses.reduce((groups, exp) => {
        const dateObj = new Date(exp.timestamp || exp.created_at || new Date());
        const dayStr = dateObj.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
        (groups[dayStr] ||= []).push(exp);
        return groups;
    }, {});

    let html = '';
    for (const [dayStr, items] of Object.entries(grouped)) {
        html += `<tr class="day-header"><td colspan="3">${esc(dayStr)}</td></tr>`;
        items.forEach(exp => {
            const timeStr = new Date(exp.timestamp || exp.created_at || new Date()).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
            html += `
                <tr class="expense-row" data-id="${esc(exp.id)}">
                    <td>${timeStr}</td>
                    <td><strong>${esc(exp.item_name)}</strong></td>
                    <td class="text-right">${money.format(Number(exp.amount))}</td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;
    tbody.querySelectorAll('.expense-row').forEach((row) => row.onclick = () => window.location.assign(`/expenses/${row.dataset.id}/`));
}

function populateDatalist() {
    const items = [...new Set(allExpenses.map(e => e.item_name))].sort();
    document.getElementById('expenseItemOptions').innerHTML = items.map(item => `<option value="${esc(item)}"></option>`).join('');
}

// === FORMS ===

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const payload = {
        item_name: document.getElementById('expenseItemName').value.trim(),
        amount: parseFloat(document.getElementById('expenseAmount').value)
    };

    try {
        const res = await apiFetch('/api/expenses/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw await res.json();
        
        e.target.reset();
        toggleModal('expenseModal', false);
        await loadData();
    } catch (err) {
        alert('Error saving expense: ' + (err.detail || JSON.stringify(err)));
    }
}

async function handleStatementSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('stmtSubmitBtn');
    const payload = {
        email: document.getElementById('stmtEmail').value.trim(),
        start_date: document.getElementById('stmtFrom').value,
        end_date: document.getElementById('stmtTo').value,
    };
    if (!payload.email || !payload.start_date || !payload.end_date) return alert('Email and both dates are required.');

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        const status = document.getElementById('expenseStatementStatus');
        const taskId = await queueStatement('/api/expenses/send-all-expenses-statement/', payload);
        status.textContent = 'Queued. Generating PDF…';
        await waitForStatement(taskId, (task) => status.textContent = task.status || 'Generating PDF…');
        status.textContent = 'Statement emailed successfully.';

        e.target.reset();
        toggleModal('statementModal', false);
    } catch (err) {
        alert('Failed to generate statement: ' + (err.password || err.detail || 'Invalid request.'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Generate';
    }
}

function toggleModal(id, open) {
    const modal = document.getElementById(id);
    if (modal) {
        if (open) modal.removeAttribute('hidden');
        else modal.setAttribute('hidden', '');
    }
}

// === CHARTS ===

function renderTimeChart(mode) {
    if (timeChartInstance) timeChartInstance.destroy();
    
    const dataMap = new Map();
    allExpenses.forEach(exp => {
        const d = new Date(exp.timestamp || exp.created_at || new Date());
        let key = '';
        
        if (mode === 'weekly') {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            key = days[d.getDay()];
        } else if (mode === 'monthly') {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            key = months[d.getMonth()];
        } else if (mode === 'yearly') {
            key = d.getFullYear().toString();
        }
        
        dataMap.set(key, (dataMap.get(key) || 0) + Number(exp.amount));
    });

    let labels = [];
    if (mode === 'weekly') labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    else if (mode === 'monthly') labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    else labels = [...dataMap.keys()].sort();

    const data = labels.map(l => dataMap.get(l) || 0);

    const ctx = document.getElementById('timeChart').getContext('2d');
    timeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Amount (KES)',
                data: data,
                borderColor: '#00509E',
                backgroundColor: 'rgba(0, 80, 158, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderItemChart(timeframe) {
    if (itemChartInstance) itemChartInstance.destroy();

    const now = new Date();
    let cutoff = new Date(0); // All time default

    if (timeframe === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeframe === 'week') {
        cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 7);
    } else if (timeframe === 'month') {
        cutoff = new Date(now);
        cutoff.setMonth(now.getMonth() - 1);
    }

    const filtered = allExpenses.filter(exp => {
        const d = new Date(exp.timestamp || exp.created_at || new Date());
        return d >= cutoff;
    });

    const itemMap = new Map();
    filtered.forEach(exp => {
        const name = exp.item_name || 'Unknown';
        itemMap.set(name, (itemMap.get(name) || 0) + Number(exp.amount));
    });

    // Sort top items
    const sorted = [...itemMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const labels = sorted.map(i => i[0]);
    const data = sorted.map(i => i[1]);

    const ctx = document.getElementById('itemChart').getContext('2d');
    itemChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Amount (KES)',
                data: data,
                backgroundColor: '#ff6f61',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true }
            }
        }
    });
}
