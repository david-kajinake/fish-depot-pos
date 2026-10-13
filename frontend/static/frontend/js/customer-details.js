import { apiFetch } from './session.js';

const customerId = window.location.pathname.split('/').filter(Boolean).at(-1);
let customer;
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

document.addEventListener('DOMContentLoaded', async () => { bind(); await load(); });

function bind() {
    showCustomerEdit.onclick = () => customerEditPanel.hidden = false;
    cancelCustomerEdit.onclick = () => customerEditPanel.hidden = true;
    showDetailPayment.onclick = () => detailPaymentPanel.hidden = false;
    cancelDetailPayment.onclick = () => detailPaymentPanel.hidden = true;
    showCustomerStatement.onclick = () => customerStatementModal.hidden = false;
    closeCustomerStatement.onclick = cancelCustomerStatement.onclick = () => customerStatementModal.hidden = true;
    customerEditForm.onsubmit = save;
    detailPaymentForm.onsubmit = pay;
    sendCustomerStatementForm.onsubmit = sendStatement;
    detailMessageForm.onsubmit = (event) => {
        event.preventDefault();
        alert(`Customer message prepared for ${detailMessageChannel.value.toUpperCase()}. Delivery integration is not connected yet.`);
    };
}

async function load() {
    try {
        const [customerResponse, historyResponse] = await Promise.all([
            apiFetch(`/api/customers/${customerId}/`), apiFetch(`/api/customers/${customerId}/history/`)
        ]);
        if (!customerResponse.ok || !historyResponse.ok) throw new Error('Customer not found.');
        customer = await customerResponse.json();
        render(await historyResponse.json());
    } catch (error) {
        console.error(error);
        window.location.assign('/customers/');
    }
}

function render(history) {
    detailCustomerName.textContent = customer.name;
    customerAvatar.textContent = customer.name.charAt(0).toUpperCase();
    detailStatus.textContent = customer.active_60_days ? 'Active' : 'Inactive';
    detailStatus.className = `customer-status ${customer.active_60_days ? 'active' : 'inactive'}`;
    detailDebt.textContent = money.format(Number(customer.debt_balance));
    detailWeight.textContent = `${Number(customer.total_weight_sold || 0).toFixed(2)} kg`;
    detailSpent.textContent = money.format(Number(customer.total_spent || 0));
    detailContact.textContent = [customer.phone, customer.email].filter(Boolean).join(' · ') || '—';
    editCustomerName.value = customer.name;
    editCustomerPhone.value = customer.phone || '';
    editCustomerEmail.value = customer.email || '';
    customerStatementEmail.value = customer.email || '';

    const byDay = history.reduce((groups, sale) => {
        const day = new Date(sale.timestamp).toLocaleDateString('en-KE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        (groups[day] ||= []).push(sale);
        return groups;
    }, {});
    customerHistoryBody.innerHTML = history.length ? Object.entries(byDay).map(([day, sales]) => [
        `<tr class="history-day"><th colspan="5">${esc(day)}</th></tr>`,
        ...sales.map((sale) => `<tr><td>${new Date(sale.timestamp).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</td><td>#${esc(sale.id).slice(0, 8)}</td><td>${esc((sale.items || []).map((item) => `Size ${item.fish_size_name || item.fish_size} × ${item.quantity}`).join(', '))}</td><td>${(sale.items || []).reduce((sum, item) => sum + Number(item.weight || 0), 0).toFixed(2)} kg</td><td>${money.format(Number(sale.total_amount))}</td></tr>`)
    ].join('')).join('') : '<tr><td colspan="5" class="customer-empty">No sales recorded.</td></tr>';
}

async function save(event) {
    event.preventDefault();
    const response = await apiFetch(`/api/customers/${customerId}/`, { method: 'PATCH', body: JSON.stringify({ name: editCustomerName.value.trim(), phone: editCustomerPhone.value.trim() || null, email: editCustomerEmail.value.trim() || null }) });
    if (!response.ok) return alert('Could not save customer details.');
    customerEditPanel.hidden = true;
    await load();
}

async function pay(event) {
    event.preventDefault();
    const response = await apiFetch(`/api/customers/${customerId}/record-balance-payment/`, { method: 'POST', body: JSON.stringify({ amount: detailPaymentAmount.value }) });
    if (!response.ok) return alert(`Could not record payment: ${JSON.stringify(await response.json())}`);
    detailPaymentPanel.hidden = true;
    event.target.reset();
    await load();
}

async function sendStatement(event) {
    event.preventDefault();
    const response = await apiFetch(`/api/customers/${customerId}/send-sales-statement/`, { method: 'POST', body: JSON.stringify({ email: customerStatementEmail.value.trim(), password: customerStatementPassword.value }) });
    if (!response.ok) return alert(`Could not send statement: ${JSON.stringify(await response.json())}`);
    customerStatementModal.hidden = true;
    customerStatementPassword.value = '';
    alert('Statement sent successfully.');
}
