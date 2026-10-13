import { apiFetch } from './session.js';

let customers = [];
let sales = [];
let recentChart;
let allTimeChart;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

document.addEventListener('DOMContentLoaded', async () => { bindUi(); await loadData(); });

function bindUi() {
    newCustomerButton.onclick = () => showModal('customerModal');
    recordPaymentButton.onclick = () => showModal('paymentModal');
    document.querySelectorAll('[data-close-modal]').forEach((button) => button.onclick = () => showModal(button.dataset.closeModal, false));
    customerSearch.oninput = (event) => renderCustomers(event.target.value);
    customerForm.onsubmit = createCustomer;
    balancePaymentForm.onsubmit = recordPayment;
    customerMessageForm.onsubmit = prepareMessage;
}

async function loadData() {
    try {
        const [customerResponse, salesResponse] = await Promise.all([apiFetch('/api/customers/'), apiFetch('/api/sales/')]);
        if (!customerResponse.ok || !salesResponse.ok) throw new Error('Unable to load customer data.');
        customers = await customerResponse.json();
        sales = await salesResponse.json();
        renderCustomers(customerSearch.value);
        populatePaymentCustomers();
        renderCharts();
    } catch (error) {
        console.error(error);
        customersTableBody.innerHTML = '<tr><td colspan="5" class="customer-empty">Could not load customers.</td></tr>';
    }
}

function active(customer) { return Boolean(customer.active_60_days); }

function renderCustomers(query = '') {
    const needle = query.toLowerCase();
    const visible = customers.filter((customer) => customer.name.toLowerCase().includes(needle));
    registeredCount.textContent = customers.length;
    activeCount.textContent = customers.filter(active).length;
    inactiveCount.textContent = customers.filter((customer) => !active(customer)).length;
    customersTableBody.innerHTML = visible.length ? visible.map((customer) => `<tr class="customer-row" data-id="${customer.id}"><td><strong>${esc(customer.name)}</strong></td><td>${esc(customer.phone || '—')}</td><td>${esc(customer.email || '—')}</td><td>${money.format(Number(customer.debt_balance || 0))}</td><td><span class="customer-status ${active(customer) ? 'active' : 'inactive'}">${active(customer) ? 'Active' : 'Inactive'}</span></td></tr>`).join('') : '<tr><td colspan="5" class="customer-empty">No customers found.</td></tr>';
    customersTableBody.querySelectorAll('.customer-row').forEach((row) => row.onclick = () => window.location.assign(`/customers/${row.dataset.id}/`));
}

function populatePaymentCustomers() {
    paymentCustomerOptions.innerHTML = customers.filter((customer) => Number(customer.debt_balance) > 0).map((customer) => `<option value="${esc(customer.name)}"></option>`).join('');
}

function renderCharts() {
    const cutoff = Date.now() - 60 * 86400000;
    const totals = (recent) => {
        const result = new Map();
        sales.filter((sale) => sale.customer && (!recent || new Date(sale.timestamp).getTime() >= cutoff)).forEach((sale) => {
            const name = sale.customer_display_name || customers.find((customer) => customer.id === sale.customer)?.name || 'Customer';
            const weight = (sale.items || []).reduce((sum, item) => sum + Number(item.weight || 0), 0);
            result.set(name, (result.get(name) || 0) + weight);
        });
        return [...result.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    };
    recentChart?.destroy(); allTimeChart?.destroy();
    recentChart = barChart('recentCustomersChart', totals(true), '#38bdf8');
    allTimeChart = barChart('allTimeCustomersChart', totals(false), '#00509e');
}

function barChart(id, data, color) {
    return new Chart(document.getElementById(id), { type: 'bar', data: { labels: data.map(([name]) => name), datasets: [{ label: 'Weight (kg)', data: data.map(([, weight]) => weight), backgroundColor: color, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'kg' } } } } });
}

async function createCustomer(event) {
    event.preventDefault();
    const body = { name: customerName.value.trim(), phone: customerPhone.value.trim() || null, email: customerEmail.value.trim() || null, debt_balance: customerDebt.value || '0.00' };
    const response = await apiFetch('/api/customers/', { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) return alert(`Could not add customer: ${JSON.stringify(await response.json())}`);
    showModal('customerModal', false); event.target.reset(); customerDebt.value = '0.00'; await loadData();
}

async function recordPayment(event) {
    event.preventDefault();
    const customer = customers.find((item) => item.name.toLowerCase() === paymentCustomer.value.trim().toLowerCase());
    if (!customer) return alert('Choose a customer name from the suggestions.');
    const response = await apiFetch(`/api/customers/${customer.id}/record-balance-payment/`, { method: 'POST', body: JSON.stringify({ amount: paymentAmount.value }) });
    if (!response.ok) return alert(`Could not record payment: ${JSON.stringify(await response.json())}`);
    showModal('paymentModal', false); event.target.reset(); await loadData();
}

function prepareMessage(event) {
    event.preventDefault();
    const group = messageGroup.value;
    const count = group === 'all' ? customers.length : customers.filter((customer) => group === 'active' ? active(customer) : !active(customer)).length;
    alert(`${count} ${group} customer recipient(s) prepared for ${messageChannel.value.toUpperCase()}. A delivery provider has not been connected yet.`);
}

function showModal(id, open = true) { document.getElementById(id).hidden = !open; }
