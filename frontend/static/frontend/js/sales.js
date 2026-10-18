import { apiFetch } from './session.js';
import { initSalesForm } from './utils/salesUtils.js';
import { queueStatement, statementPayload, waitForStatement } from './utils/statementTasks.js';

let businessDays = [];
let trendChart;
let sizeChart;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const dayKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
const displayDate = (date) => new Intl.DateTimeFormat('en-KE', { dateStyle: 'full', timeZone: 'Africa/Nairobi' }).format(new Date(`${date}T12:00:00`));

document.addEventListener('DOMContentLoaded', async () => {
    initSalesForm();
    configureSaleFormPanel();
    configureStatementRequest();
    document.querySelectorAll('.chart-tab').forEach((button) => button.addEventListener('click', () => {
        document.querySelectorAll('.chart-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
        renderTrendChart(button.dataset.period);
    }));
    await loadSalesData();
});

function configureSaleFormPanel() {
    const panel = document.getElementById('saleFormPanel');
    const open = () => { panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    document.getElementById('toggleSaleForm').addEventListener('click', open);
    document.getElementById('closeSaleForm').addEventListener('click', () => { panel.hidden = true; });
}

function configureStatementRequest() {
    openSalesStatement.onclick = () => salesStatementModal.hidden = false;
    document.querySelectorAll('[data-close-statement]').forEach((button) => button.onclick = () => document.getElementById(button.dataset.closeStatement).hidden = true);
    salesStatementForm.onsubmit = async (event) => {
        event.preventDefault();
        const status = salesStatementStatus;
        try {
            status.textContent = 'Queuing statement…';
            const taskId = await queueStatement('/api/sales/send-sales-statement/', statementPayload(event.currentTarget));
            status.textContent = `Queued. Task ${taskId.slice(0, 8)} is processing…`;
            await waitForStatement(taskId, (task) => status.textContent = task.status || 'Generating PDF…');
            status.textContent = 'Statement emailed successfully.';
        } catch (error) { status.textContent = error.detail || error.message || 'Could not queue statement.'; }
    };
}

async function loadSalesData() {
    try {
        const response = await apiFetch('/api/days/');
        if (!response.ok) throw new Error('Unable to load the sales ledger.');
        businessDays = await response.json();
        businessDays.sort((left, right) => right.date.localeCompare(left.date));
        renderLedger();
        renderTrendChart('week');
        renderSizeChart();
    } catch (error) {
        console.error('Sales ledger error:', error);
        document.getElementById('todaySalesBody').innerHTML = '<tr><td colspan="6" class="table-message">Could not load sales.</td></tr>';
        document.getElementById('pastSalesGroups').innerHTML = '<p class="table-message">Could not load sales history.</p>';
    }
}

function renderLedger() {
    const today = dayKey(new Date());
    const currentDay = businessDays.find((day) => day.date === today) || { date: today, sales: [], outside_fryings: [] };
    document.getElementById('todayDate').textContent = displayDate(today);
    renderToday(currentDay.sales || []);
    renderPastDays(businessDays.filter((day) => day.date !== today));
}
todaySaleCount
function renderToday(sales) {
    const outsideFryings = (businessDays.find((day) => day.date === dayKey(new Date())) || {}).outside_fryings || [];
    const entries = ledgerEntries(sales, outsideFryings);
    const revenue = entries.reduce((total, entry) => total + entry.amount, 0);
    const weight = sales.reduce((total, sale) => total + (sale.items || []).reduce((itemTotal, item) => itemTotal + Number(item.weight || 0), 0), 0);
    document.getElementById('todaySaleCount').textContent = entries.length;
    document.getElementById('todayRevenue').textContent = money.format(revenue);
    document.getElementById('todayOutsideFrying').textContent = 
    document.getElementById('todayWeight').textContent = `${weight.toFixed(2)} kg`;
    const body = document.getElementById('todaySalesBody');
    if (!entries.length) {
        body.innerHTML = '<tr><td colspan="6" class="table-message">No sales have been recorded today.</td></tr>';
        return;
    }
    body.innerHTML = entries.map(renderLedgerRow).join('');
}

function renderPastDays(days) {
    const container = document.getElementById('pastSalesGroups');
    if (!days.length) {
        container.innerHTML = '<p class="table-message">No sales from previous business days.</p>';
        return;
    }
    container.innerHTML = days.map((day) => {
        const entries = ledgerEntries(day.sales || [], day.outside_fryings || []);
        const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
        const items = entries.map((entry) => `<li><small>${entry.time}</small><span>${escapeHtml(entry.customer)}<br><small>${escapeHtml(entry.description)}</small></span><strong>${money.format(entry.amount)}</strong></li>`).join('') || '<li><small>No sales or frying jobs</small></li>';
        return `<article class="sales-day-group"><div class="sales-day-heading"><span>${displayDate(day.date)}</span><span>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${money.format(total)}</span></div><ul>${items}</ul></article>`;
    }).join('');
}

function ledgerEntries(sales, outsideFryings) {
    const saleEntries = sales.map((sale) => {
        const fryingFee = (sale.items || []).reduce((sum, item) => sum + Number(item.frying_fee_applied || 0), 0);
        const fishItems = (sale.items || []).map((item) => `Size ${item.fish_size_name || item.fish_size} × ${item.quantity}`).join(', ') || 'No fish items';
        return { id: sale.id, time: new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }).format(new Date(sale.timestamp)), customer: sale.customer_display_name || 'Walk-in', description: `${fishItems}${fryingFee ? ` · Frying fee: ${money.format(fryingFee)}` : ''}`, amount: Number(sale.total_amount || 0), status: sale.sale_type === 'INSTANT' ? 'Paid' : 'Partial', isOutside: false };
    });
    const outsideEntries = outsideFryings.map((frying) => ({ id: `outside-${frying.id}`, time: '—', customer: frying.source, description: `Outside frying · ${frying.quantity} piece${Number(frying.quantity) === 1 ? '' : 's'}`, amount: Number(frying.total_fee || 0), status: 'Frying', isOutside: true }));
    return [...saleEntries, ...outsideEntries];
}

function renderLedgerRow(entry) {
    return `<tr><td>${entry.time}</td><td>#${escapeHtml(entry.id).slice(0, 8)}</td><td>${escapeHtml(entry.customer)}</td><td>${escapeHtml(entry.description)}</td><td><strong>${money.format(entry.amount)}</strong></td><td><span class="sale-status ${entry.status === 'Partial' ? 'partial' : ''}">${entry.status}</span></td></tr>`;
}

function renderTrendChart(period) {
    const ordered = [...businessDays].sort((left, right) => left.date.localeCompare(right.date));
    const format = period === 'week' ? { weekday: 'short' } : { month: 'short', day: 'numeric' };
    const recent = ordered.slice(period === 'week' ? -7 : -30);
    const labels = recent.map((day) => new Intl.DateTimeFormat('en-KE', { ...format, timeZone: 'Africa/Nairobi' }).format(new Date(`${day.date}T12:00:00`)));
    const values = recent.map((day) => ledgerEntries(day.sales || [], day.outside_fryings || []).reduce((sum, entry) => sum + entry.amount, 0));
    trendChart?.destroy();
    trendChart = new Chart(document.getElementById('salesTrendChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Sales revenue', data: values, backgroundColor: '#00509e', hoverBackgroundColor: '#ff6f61', borderRadius: 6 }] }, options: chartOptions('KES') });
}

function renderSizeChart() {
    const totals = new Map();
    businessDays.flatMap((day) => day.sales || []).flatMap((sale) => sale.items || []).forEach((item) => {
        const size = `Size ${item.fish_size_name || item.fish_size}`;
        totals.set(size, (totals.get(size) || 0) + Number(item.quantity || 0));
    });
    sizeChart?.destroy();
    sizeChart = new Chart(document.getElementById('sizeSalesChart'), { type: 'doughnut', data: { labels: [...totals.keys()], datasets: [{ data: [...totals.values()], backgroundColor: ['#00509e', '#38bdf8', '#ff6f61', '#0ea5a4', '#7dd3fc', '#ffb4ab'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#17324d' } } } } });
}

function chartOptions(unit) {
    return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64809a' } }, y: { beginAtZero: true, grid: { color: '#d8e8f2' }, ticks: { color: '#64809a', callback: (value) => `${unit} ${value}` } } } };
}
