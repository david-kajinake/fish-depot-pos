import { apiFetch } from './session.js';

let analytics = null;
let activePeriod = 'daily';
let profitLossChart;
let operationsChart;
let spoilageChart;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.analytics-tab').forEach((button) => button.addEventListener('click', () => {
        activePeriod = button.dataset.period;
        document.querySelectorAll('.analytics-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
        render();
    }));
    try {
        const response = await apiFetch('/api/analytics/');
        if (!response.ok) throw new Error('Unable to load analytics.');
        analytics = await response.json();
        render();
    } catch (error) {
        console.error(error);
        document.getElementById('analyticsLedgerBody').innerHTML = '<tr><td colspan="7">Could not load analytics.</td></tr>';
    }
});

function render() {
    const totals = analytics.totals;
    analyticsSales.textContent = money.format(totals.sales);
    analyticsExpenses.textContent = money.format(totals.expenses);
    analyticsSupplies.textContent = money.format(totals.supplies);
    analyticsSpoilageValue.textContent = money.format(totals.spoilage_value);
    analyticsSpoilageWeight.textContent = `${number.format(totals.spoilage_weight)} kg spoiled`;
    analyticsNet.textContent = money.format(totals.net_profit_loss);
    analyticsNetLabel.textContent = totals.net_profit_loss >= 0 ? 'Net profit' : 'Net loss';
    analyticsNet.closest('.analytics-kpi').classList.toggle('negative', totals.net_profit_loss < 0);
    spoilageCostNote.textContent = analytics.spoilage_cost_note;
    const rows = analytics.periods[activePeriod];
    ledgerTitle.textContent = `${activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)} financial summary`;
    renderLedger(rows);
    renderCharts(rows);
}

function renderLedger(rows) {
    analyticsLedgerBody.innerHTML = rows.length ? [...rows].reverse().map((row) => `<tr><td>${periodLabel(row.label)}</td><td>${money.format(row.sales)}</td><td>${money.format(row.expenses)}</td><td>${money.format(row.supplies)}</td><td>${number.format(row.spoilage_weight)} kg</td><td>${money.format(row.spoilage_value)}</td><td class="${row.net_profit_loss >= 0 ? 'profit' : 'loss'}">${money.format(row.net_profit_loss)}</td></tr>`).join('') : '<tr><td colspan="7">No operating data is available yet.</td></tr>';
}

function renderCharts(rows) {
    const chartRows = rows.slice(-18);
    const labels = chartRows.map((row) => periodLabel(row.label));
    profitLossChart?.destroy(); operationsChart?.destroy(); spoilageChart?.destroy();
    profitLossChart = new Chart(document.getElementById('profitLossChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Net profit / loss', data: chartRows.map((row) => row.net_profit_loss), backgroundColor: chartRows.map((row) => row.net_profit_loss >= 0 ? '#058b76' : '#d54848'), borderRadius: 6 }] }, options: financeOptions('KES') });
    operationsChart = new Chart(document.getElementById('operationsChart'), { type: 'line', data: { labels, datasets: [{ label: 'Sales', data: chartRows.map((row) => row.sales), borderColor: '#058b76', backgroundColor: '#058b76', tension: .3 }, { label: 'Expenses', data: chartRows.map((row) => row.expenses), borderColor: '#e26d57', backgroundColor: '#e26d57', tension: .3 }, { label: 'Stock supplies', data: chartRows.map((row) => row.supplies), borderColor: '#2169a8', backgroundColor: '#2169a8', tension: .3 }] }, options: financeOptions('KES') });
    spoilageChart = new Chart(document.getElementById('spoilageChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Spoilage (kg)', data: chartRows.map((row) => row.spoilage_weight), backgroundColor: '#c38b14', borderRadius: 6 }] }, options: financeOptions('kg') });
}

function financeOptions(unit) { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 11, color: '#38556a' } } }, scales: { x: { grid: { display: false }, ticks: { color: '#61798d', maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: '#e5eef4' }, ticks: { color: '#61798d', callback: (value) => unit === 'KES' ? `KES ${number.format(value)}` : `${number.format(value)} kg` } } } }; }

function periodLabel(label) { const date = new Date(`${label}T12:00:00`); if (Number.isNaN(date)) return label; if (activePeriod === 'yearly') return String(date.getFullYear()); if (activePeriod === 'monthly') return date.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' }); if (activePeriod === 'weekly') return `Week of ${date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`; return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }); }
