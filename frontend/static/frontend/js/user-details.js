import { apiFetch, getCurrentUser } from './session.js';

const permissions = [
    ['can_call_it_a_day', 'Call it a day'],
    ['can_record_sale', 'Record sales'],
    ['can_record_stock_supply', 'Record stock supplies'],
    ['can_record_expenses', 'Record expenses'],
    ['can_record_customer_balance_debt_payment', 'Record balance payments'],
    ['can_send_messages_to_customers', 'Send customer messages'],
    ['can_edit_customers_info', 'Edit customer details'],
    ['can_edit_suppliers_info', 'Edit supplier details'],
    ['can_generate_statements', 'Generate statements'],
];

const userId = window.location.pathname.split('/').filter(Boolean).at(-1);
let selectedUser;

function setStatus(message, isError = false) {
    const output = document.getElementById('formStatus');
    output.textContent = message;
    output.classList.toggle('error', isError);
}

function renderPermissions(user) {
    document.getElementById('permissions').innerHTML = permissions.map(([key, label]) => `
        <label class="permission-option"><input type="checkbox" name="${key}" ${user[key] ? 'checked' : ''}>${label}</label>
    `).join('');
}

function populate(user) {
    selectedUser = user;
    document.getElementById('operatorHeading').textContent = user.name || user.username;
    document.getElementById('operatorAvatar').textContent = (user.name || user.username || '?').trim().charAt(0).toUpperCase();
    const status = document.getElementById('operatorStatus');
    status.textContent = user.is_disabled ? 'Disabled — sign-in and operations blocked' : 'Active operator';
    status.classList.toggle('disabled', Boolean(user.is_disabled));
    ['username', 'name', 'email', 'phone', 'role'].forEach(key => { document.getElementById(key).value = user[key] || ''; });
    document.getElementById('is_disabled').checked = Boolean(user.is_disabled);
    renderPermissions(user);
}

async function loadOperator() {
    const current = await getCurrentUser();
    const canManage = current.is_superuser || ['ADMIN', 'MANAGER'].includes(current.role);
    if (!canManage) { window.location.assign('/settings/'); return; }
    const response = await apiFetch(`/api/users/${encodeURIComponent(userId)}/`);
    if (!response.ok) throw new Error('The operator could not be found.');
    populate(await response.json());
}

async function saveOperator(event) {
    event.preventDefault();
    if (!selectedUser) return;
    const form = event.currentTarget;
    const payload = {
        username: form.username.value.trim(), name: form.name.value.trim(), email: form.email.value.trim(),
        phone: form.phone.value.trim(), is_disabled: form.is_disabled.checked,
    };
    permissions.forEach(([key]) => { payload[key] = form.elements[key].checked; });
    if (form.password.value) payload.password = form.password.value;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; setStatus('Saving changes…');
    try {
        const response = await apiFetch(`/api/users/${encodeURIComponent(userId)}/`, { method: 'PATCH', body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(Object.values(result).flat().join(' ') || 'Unable to save changes.');
        form.password.value = '';
        populate(result);
        setStatus('Changes saved.');
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('operatorForm');
    const toggle = document.getElementById('toggleOperatorForm');
    form.addEventListener('submit', saveOperator);
    toggle.addEventListener('click', () => {
        form.hidden = !form.hidden;
        toggle.innerHTML = form.hidden
            ? '<i class="fa-solid fa-pen-to-square"></i> Edit user\'s info'
            : '<i class="fa-solid fa-xmark"></i> Cancel editing';
    });
    loadOperator().catch(error => setStatus(error.message, true));
});
