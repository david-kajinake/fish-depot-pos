import { apiFetch, getCurrentUser, logout } from './session.js';

let systemSettingsState = {
    statement_contacts: [],
    login_alert_contacts: [],
    receipt_selected_customers: [],
    bill_selected_customers: []
};
let allCustomers = [];
let allUsers = [];
                        
const permissionKeys = [
    { key: 'can_call_it_a_day', label: 'Call Day' },
    { key: 'can_record_sale', label: 'Sales' },
    { key: 'can_record_stock_supply', label: 'Supply' },
    { key: 'can_record_expenses', label: 'Expenses' },
    { key: 'can_record_customer_balance_debt_payment', label: 'Debts' },
    { key: 'can_send_messages_to_customers', label: 'SMS/WA' },
    { key: 'can_edit_customers_info', label: 'Edit Cust' },
    { key: 'can_edit_suppliers_info', label: 'Edit Supp' },
    { key: 'can_generate_statements', label: 'Statements' }
];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    configureRoleUi(user);
    bindTabs();
    bindToggles();
    initContactsManager();
    initCustomerPickers();
    loadSettings();

    document.getElementById('systemSettingsForm')?.addEventListener('submit', saveSystemSettings);
    document.getElementById('userSettingsForm').addEventListener('submit', saveUserSettings);
    document.getElementById('profileForm').addEventListener('submit', saveProfile);
});

function configureRoleUi(user) {
    const isAdmin = ['ADMIN', 'MANAGER'].includes(user.role) || user.is_staff || user.is_superuser;
    
    // Automation tab elements
    const automationButton = document.getElementById('automationTabButton') || document.querySelector('[data-target="automation-tab"]')?.parentElement;
    const automationPane = document.getElementById('automation-tab');
    if (isAdmin && automationButton && automationPane) {
        automationButton.hidden = false;
        automationPane.hidden = false;
    }

    // User Management tab elements
    const userMgmtButton = document.getElementById('userManagementTabButton') || document.querySelector('[data-target="users-tab"]')?.parentElement;
    const userMgmtPane = document.getElementById('users-tab');
    if (isAdmin && userMgmtButton && userMgmtPane) {
        userMgmtButton.hidden = false;
        userMgmtPane.hidden = false;
        bindCreateUserForm();
        loadUsersAndPermissions();
    }

    const usernameInput = document.getElementById('profileUsername');
    if (usernameInput) usernameInput.value = user.username || '';
}

function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.hidden = false;
                targetPane.classList.add('active');
            }
        });
    });
}

function bindToggles() {
    const toggleMap = {
        'receipt_auto_send': 'receipt_options',
        'bill_auto_send': 'bill_options',
        'statement_auto_send': 'statement_options',
        'auto_close_day': 'auto_close_options'
    };

    for (const [checkboxId, sectionId] of Object.entries(toggleMap)) {
        const checkbox = document.getElementById(checkboxId);
        const section = document.getElementById(sectionId);
        
        if (checkbox && section) {
            checkbox.addEventListener('change', (e) => {
                section.hidden = !e.target.checked;
            });
        }
    }

    // Receipt target audience
    const receiptTargetSelect = document.getElementById('receiptTargetSelect');
    const receiptSelectedContainer = document.getElementById('receiptSelectedContainer');
    if (receiptTargetSelect && receiptSelectedContainer) {
        receiptTargetSelect.addEventListener('change', (e) => {
            receiptSelectedContainer.hidden = e.target.value !== 'selected';
        });
    }

    // Bill target audience
    const billTargetSelect = document.getElementById('billTargetSelect');
    const billSelectedContainer = document.getElementById('billSelectedContainer');
    if (billTargetSelect && billSelectedContainer) {
        billTargetSelect.addEventListener('change', (e) => {
            billSelectedContainer.hidden = e.target.value !== 'selected';
        });
    }
}

// === USER MANAGEMENT & PERMISSIONS LOGIC ===
async function loadUsersAndPermissions() {
    try {
        const res = await apiFetch('/api/users/');
        if (!res.ok) throw new Error('Failed to fetch users');
        allUsers = await res.json();
        
        renderUsersTable();
        renderUsersCards();
        renderPermissionsMatrix();
        bindViewToggles();
        bindSavePermissions();
    } catch (err) {
        console.error("Error loading users/permissions:", err);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!allUsers.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => `
        <tr data-user-id="${user.id}">
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.email || '—')}</td>
            <td><span class="role-badge">${user.is_superuser ? 'Superuser' : user.is_staff ? 'Staff' : 'Operator'}</span></td>
            <td class="text-right"><button type="button" class="btn-secondary btn-sm js-view-user">View</button></td>
        </tr>
    `).join('');
    tbody.querySelectorAll('tr[data-user-id]').forEach(row => {
        row.addEventListener('click', () => openUserDetails(row.dataset.userId));
    });
}

function renderUsersCards() {
    const container = document.getElementById('usersCardsContainer');
    if (!container) return;

    if (!allUsers.length) {
        container.innerHTML = '<p class="empty-state">No users found.</p>';
        return;
    }

    container.innerHTML = allUsers.map(user => `
        <div class="user-card-item" data-user-id="${user.id}">
            <div class="user-card-header">
                <h4>${escapeHtml(user.username)}</h4>
                <span class="role-badge">${user.is_superuser ? 'Superuser' : user.is_staff ? 'Staff' : 'Operator'}</span>
            </div>
            <p class="text-muted text-sm">${escapeHtml(user.email || 'No email provided')}</p>
        </div>
    `).join('');
    container.querySelectorAll('[data-user-id]').forEach(card => {
        card.addEventListener('click', () => openUserDetails(card.dataset.userId));
    });
}

function openUserDetails(userId) {
    window.location.assign(`/settings/users/${encodeURIComponent(userId)}/`);
}

function bindViewToggles() {
    const tableBtn = document.getElementById('viewTableBtn');
    const cardsBtn = document.getElementById('viewCardsBtn');
    const tableContainer = document.getElementById('usersTableContainer');
    const cardsContainer = document.getElementById('usersCardsContainer');

    if (!tableBtn || !cardsBtn || !tableContainer || !cardsContainer) return;

    tableBtn.onclick = () => {
        tableBtn.classList.add('active-view');
        cardsBtn.classList.remove('active-view');
        tableContainer.hidden = false;
        cardsContainer.hidden = true;
        tableContainer.classList.remove('hidden');
        cardsContainer.classList.add('hidden');
    };

    cardsBtn.onclick = () => {
        cardsBtn.classList.add('active-view');
        tableBtn.classList.remove('active-view');
        tableContainer.hidden = true;
        cardsContainer.hidden = false;
        tableContainer.classList.add('hidden');
        cardsContainer.classList.remove('hidden');
    };
}

function bindCreateUserForm() {
    const toggle = document.getElementById('toggleCreateUserBtn');
    const form = document.getElementById('createUserForm');
    if (!toggle || !form || toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', () => {
        form.hidden = !form.hidden;
        toggle.innerHTML = form.hidden
            ? '<i class="fa-solid fa-user-plus"></i> Create user'
            : '<i class="fa-solid fa-xmark"></i> Cancel';
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = document.getElementById('createUserStatus');
        const data = new FormData(form);
        const payload = Object.fromEntries(data.entries());
        permissionKeys.forEach(({ key }) => { payload[key] = form.elements[key].checked; });
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        status.textContent = 'Creating user…';
        try {
            const response = await apiFetch('/api/users/', { method: 'POST', body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(Object.values(result).flat().join(' ') || 'Unable to create user.');
            form.reset();
            form.hidden = true;
            toggle.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create user';
            status.textContent = '';
            await loadUsersAndPermissions();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            submit.disabled = false;
        }
    });
}

function renderPermissionsMatrix() {
    const tbody = document.getElementById('permissionsMatrixBody');
    if (!tbody) return;

    if (!allUsers.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => `
        <tr data-user-row="${user.id}">
            <td><strong>${escapeHtml(user.username)}</strong></td>
            ${permissionKeys.map(p => `
                <td>
                    <input type="checkbox" data-user-id="${user.id}" data-perm="${p.key}" ${user[p.key] ? 'checked' : ''}${user.is_superuser ? 'disabled title="Superusers have all permissions"' : ''}>
                </td>
            `).join('')}
        </tr>
    `).join('');
}

function bindSavePermissions() {
    const saveBtn = document.getElementById('savePermissionsBtn');
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const updates = {};
            document.querySelectorAll('.permissions-matrix-table input[type="checkbox"]').forEach(chk => {
                const userId = chk.dataset.userId;
                const perm = chk.dataset.perm;
                if (!updates[userId]) updates[userId] = {};
                updates[userId][perm] = chk.checked;
            });

            for (const [userId, perms] of Object.entries(updates)) {
                const res = await apiFetch(`/api/users/${userId}/`, {
                    method: 'PATCH',
                    body: JSON.stringify(perms)
                });
                if (!res.ok) throw new Error(`Failed to update user ${userId}`);
            }

            alert('Permissions updated successfully.');
        } catch (err) {
            console.error(err);
            alert('Failed to save some permissions.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Permissions';
        }
    };
}

// === DYNAMIC CONTACTS MANAGER ===
function initContactsManager() {
    document.querySelectorAll('.contacts-manager').forEach(manager => {
        const key = manager.dataset.contactTarget;
        const triggerBtn = manager.querySelector('.add-contact-trigger');
        const inlineForm = manager.querySelector('.contact-inline-form');
        const inputVal = manager.querySelector('.contact-input-val');
        const saveBtn = manager.querySelector('.save-contact-btn');
        const cancelBtn = manager.querySelector('.cancel-contact-btn');

        if (!triggerBtn || !inlineForm || !inputVal || !saveBtn || !cancelBtn) return;

        triggerBtn.onclick = () => {
            inlineForm.hidden = false;
            inputVal.value = '';
            inputVal.focus();
        };

        cancelBtn.onclick = () => {
            inlineForm.hidden = true;
        };

        saveBtn.onclick = () => {
            const val = inputVal.value.trim();
            if (!val) return;
            if (!systemSettingsState[key]) systemSettingsState[key] = [];
            if (!systemSettingsState[key].includes(val)) {
                systemSettingsState[key].push(val);
                renderContacts(key);
            }
            inlineForm.hidden = true;
        };
    });
}

function renderContacts(key) {
    const listId = key === 'statement_contacts' ? 'statementContactsList' : 'loginContactsList';
    const container = document.getElementById(listId);
    if (!container) return;

    container.innerHTML = '';
    const contacts = systemSettingsState[key] || [];

    contacts.forEach((contact, index) => {
        const badge = document.createElement('span');
        badge.className = 'contact-badge';
        badge.innerHTML = `
            ${escapeHtml(contact)}
            <button type="button" class="remove-contact-btn" title="Remove">&times;</button>
        `;
        badge.querySelector('.remove-contact-btn').onclick = () => {
            if (confirm(`Are you sure you want to remove "${contact}" from the contact list?`)) {
                systemSettingsState[key].splice(index, 1);
                renderContacts(key);
            }
        };
        container.appendChild(badge);
    });
}

// === CUSTOMER PICKERS FOR RECEIPTS & BILLS ===
async function initCustomerPickers() {
    try {
        const res = await apiFetch('/api/customers/');
        if (res.ok) {
            allCustomers = await res.json();
            renderCustomerPicker('receipt');
            renderCustomerPicker('bill');
        }
    } catch (e) {
        console.error("Failed to load customers for picker", e);
    }

    document.getElementById('receiptCustomerSearch')?.addEventListener('input', (e) => {
        renderCustomerPicker('receipt', e.target.value.toLowerCase());
    });
    document.getElementById('billCustomerSearch')?.addEventListener('input', (e) => {
        renderCustomerPicker('bill', e.target.value.toLowerCase());
    });
}

function renderCustomerPicker(type, query = '') {
    const listContainer = document.getElementById(`${type}CustomerList`);
    const tagsContainer = document.getElementById(`${type}CustomerTags`);
    const stateKey = `${type}_selected_customers`;
    if (!listContainer || !tagsContainer) return;

    const filtered = allCustomers.filter(c => c.name.toLowerCase().includes(query));
    
    listContainer.innerHTML = '';
    filtered.forEach(cust => {
        const isChecked = systemSettingsState[stateKey].includes(cust.id);
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" value="${cust.id}" ${isChecked ? 'checked' : ''}>
            ${escapeHtml(cust.name)} (${escapeHtml(cust.phone || 'No phone')})
        `;
        
        label.querySelector('input').onchange = (e) => {
            const id = cust.id;
            if (e.target.checked) {
                if (!systemSettingsState[stateKey].includes(id)) {
                    systemSettingsState[stateKey].push(id);
                }
            } else {
                systemSettingsState[stateKey] = systemSettingsState[stateKey].filter(cId => cId !== id);
            }
            renderSelectedCustomerTags(type);
        };
        listContainer.appendChild(label);
    });

    renderSelectedCustomerTags(type);
}

function renderSelectedCustomerTags(type) {
    const tagsContainer = document.getElementById(`${type}CustomerTags`);
    const stateKey = `${type}_selected_customers`;
    if (!tagsContainer) return;

    tagsContainer.innerHTML = '';
    systemSettingsState[stateKey].forEach(id => {
        const cust = allCustomers.find(c => c.id === id);
        if (!cust) return;

        const tag = document.createElement('span');
        tag.className = 'selected-tag';
        tag.innerHTML = `
            ${escapeHtml(cust.name)}
            <button type="button" class="remove-tag-btn" title="Remove">&times;</button>
        `;
        tag.querySelector('.remove-tag-btn').onclick = () => {
            if (confirm(`Are you sure you want to remove "${cust.name}" from selected customers?`)) {
                systemSettingsState[stateKey] = systemSettingsState[stateKey].filter(cId => cId !== id);
                renderSelectedCustomerTags(type);
                renderCustomerPicker(type, document.getElementById(`${type}CustomerSearch`)?.value.toLowerCase() || '');
            }
        };
        tagsContainer.appendChild(tag);
    });
}

// === DATA LOADING & SAVING ===
async function loadSettings() {
    try {
        const userRes = await apiFetch('/api/settings/user/me/');
        if (userRes.ok) {
            const userData = await userRes.json();
            populateForm(document.getElementById('userSettingsForm'), userData);
        }
    } catch (e) { console.error("Failed to load user settings:", e); }

    const sysForm = document.getElementById('systemSettingsForm');
    if (sysForm) {
        try {
            const sysRes = await apiFetch('/api/settings/system/');
            if (sysRes.ok) {
                const sysData = await sysRes.json();
                
                systemSettingsState.statement_contacts = Array.isArray(sysData.statement_contacts) ? sysData.statement_contacts : [];
                systemSettingsState.login_alert_contacts = Array.isArray(sysData.login_alert_contacts) ? sysData.login_alert_contacts : [];
                systemSettingsState.receipt_selected_customers = Array.isArray(sysData.receipt_selected_customers) ? sysData.receipt_selected_customers : [];
                systemSettingsState.bill_selected_customers = Array.isArray(sysData.bill_selected_customers) ? sysData.bill_selected_customers : [];

                populateForm(sysForm, sysData);
                
                renderContacts('statement_contacts');
                renderContacts('login_alert_contacts');
                renderCustomerPicker('receipt');
                renderCustomerPicker('bill');

                ['receipt_auto_send', 'bill_auto_send', 'statement_auto_send', 'auto_close_day'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.checked) el.dispatchEvent(new Event('change'));
                });

                if (document.getElementById('receiptTargetSelect')?.value === 'selected') {
                    document.getElementById('receiptSelectedContainer').hidden = false;
                }
                if (document.getElementById('billTargetSelect')?.value === 'selected') {
                    document.getElementById('billSelectedContainer').hidden = false;
                }
            }
        } catch (e) { console.error("Failed to load system settings:", e); }
    }
}

function populateForm(form, data) {
    for (const key in data) {
        const input = form.elements[key];
        if (input) {
            if (input.type === 'checkbox') input.checked = data[key];
            else input.value = data[key];
        }
    }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    ['receipt_auto_send', 'bill_auto_send', 'statement_auto_send', 'auto_close_day'].forEach(key => {
        data[key] = !!data[key];
    });

    data.statement_contacts = systemSettingsState.statement_contacts;
    data.login_alert_contacts = systemSettingsState.login_alert_contacts;
    data.receipt_selected_customers = systemSettingsState.receipt_selected_customers;
    data.bill_selected_customers = systemSettingsState.bill_selected_customers;

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        const res = await apiFetch('/api/settings/system/', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        alert('System settings updated successfully.');
    } catch (err) {
        alert('Error saving system settings.');
    } finally {
        btn.innerHTML = 'Save Automation Settings';
        btn.disabled = false;
    }
}

async function saveUserSettings(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    data.notification_sound = !!data.notification_sound;

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        const res = await apiFetch('/api/settings/user/me/', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        
        window.dispatchEvent(new CustomEvent('userSettingsUpdated', { detail: data }));
        alert('Display settings updated.');
    } catch (err) {
        alert('Error saving display settings.');
    } finally {
        btn.innerHTML = 'Apply Display Changes';
        btn.disabled = false;
    }
}

async function saveProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    if (!data.password) delete data.password;

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        btn.disabled = true;
        const res = await apiFetch('/api/users/profile/', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        alert('Profile updated successfully.');
        if (data.password) await logout();
    } catch (err) {
        alert('Error updating profile.');
    } finally {
        btn.innerHTML = 'Update Profile';
        btn.disabled = false;
    }
}
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
