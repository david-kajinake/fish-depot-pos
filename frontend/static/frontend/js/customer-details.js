import { apiFetch } from './session.js';
import { pollTaskStatus } from './utils/tasksUtils.js';

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
        const day = sale.day || new Date(sale.timestamp).toLocaleDateString('en-CA');
        (groups[day] ||= []).push(sale);
        return groups;
    }, {});
    customerHistoryBody.innerHTML = history.length ? Object.entries(byDay).map(([day, sales]) => `<section class="customer-sale-day"><h3>${esc(new Date(`${day}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</h3><div class="customer-sale-cards">${sales.map(renderSaleCard).join('')}</div></section>`).join('') : '<p class="customer-empty">No sales recorded.</p>';
}

function renderSaleCard(sale) {
    const rows = (sale.items || []).map((item) => {
        const amount = Number(item.weight || 0) * Number(item.rate_charged || 0);
        const fryFee = Number(item.frying_fee_applied || 0);
        return `<tr><td>${esc(item.fish_size_name || item.fish_size)}</td><td>${esc(item.quantity)}</td><td>${Number(item.weight || 0).toFixed(2)}</td><td>${money.format(Number(item.rate_charged || 0))}</td><td>${money.format(amount)}</td><td>${item.is_fried ? 'Yes' : 'No'}</td><td>${money.format(fryFee)}</td><td>${money.format(amount + fryFee)}</td></tr>`;
    }).join('') || '<tr><td colspan="8">No sale items.</td></tr>';
    return `<article class="customer-sale-card"><div class="customer-sale-meta"><span><b>ID:</b> ${esc(sale.id)}</span><span><b>Cashier:</b> ${esc(sale.cashier_display_name || '—')}</span><span><b>Customer:</b> ${esc(sale.customer_display_name || customer.name)}</span><span><b>Total Amount:</b> ${money.format(Number(sale.total_amount || 0))}</span><span><b>Amount Paid:</b> ${money.format(Number(sale.amount_paid_now || 0))}</span></div><div class="customer-sale-table-wrap"><table class="customer-sale-table"><thead><tr><th>Size</th><th>Qty</th><th>Weight</th><th>Rate</th><th>Amount: Fish price</th><th>Fried</th><th>Fry fee</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
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
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Initiating...';

        // Trigger task
        const response = await apiFetch(`/api/customers/${customerId}/send-sales-statement/`, {
            method: 'POST',
            body: JSON.stringify({
                email: customerStatementEmail.value.trim(),
                password: customerStatementPassword.value
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.password || err.email || 'Could not send statement.');
        }

        const data = await response.json();
        const taskId = data.task_id;

        // Poll Celery status
        submitBtn.textContent = 'Generating & Sending...';
        await pollTaskStatus(taskId, submitBtn);

        customerStatementModal.hidden = true;
        customerStatementPassword.value = '';
        alert('Statement successfully generated and emailed!');

    } catch (error) {
        alert(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
