import { apiFetch } from './session.js';
import { queueStatement, statementPayload, waitForStatement } from './utils/statementTasks.js';

const expenseId = window.location.pathname.split('/').filter(Boolean).at(-1);
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' });

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await apiFetch(`/api/expenses/${expenseId}/`);
        if (!response.ok) throw new Error('Expense not found.');
        const expense = await response.json();
        expenseName.textContent = expense.item_name;
        expenseMeta.textContent = `Business day: ${expense.day}`;
        const historyResponse = await apiFetch(`/api/expenses/${expenseId}/history/`);
        if (!historyResponse.ok) throw new Error('Could not load expense history.');
        const history = await historyResponse.json();
        const total = history.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        expenseTotal.textContent = money.format(total);
        expenseHistoryHeading.textContent = `${expense.item_name} history`;
        expenseHistoryBody.replaceChildren();
        if (!history.length) {
            expenseHistoryBody.innerHTML = '<tr><td colspan="3" class="empty-state">No expense history found.</td></tr>';
        } else {
            history.forEach((item) => {
                const row = document.createElement('tr');
                const date = document.createElement('td');
                const itemName = document.createElement('td');
                const amount = document.createElement('td');
                date.textContent = item.day;
                itemName.textContent = item.item_name;
                amount.className = 'text-right';
                amount.textContent = money.format(Number(item.amount));
                row.append(date, itemName, amount);
                expenseHistoryBody.append(row);
            });
        }
    } catch (error) { expenseName.textContent = error.message; }
    openExpenseStatement.onclick = () => expenseStatementModal.hidden = false;
    document.querySelectorAll('[data-close-modal]').forEach((button) => button.onclick = () => document.getElementById(button.dataset.closeModal).hidden = true);
    singleExpenseStatementForm.onsubmit = async (event) => {
        event.preventDefault();
        const status = singleExpenseStatementStatus;
        try {
            const taskId = await queueStatement(`/api/expenses/${expenseId}/send-single-expenses-statement/`, statementPayload(event.currentTarget));
            status.textContent = 'Queued. Generating PDF…';
            await waitForStatement(taskId, (task) => status.textContent = task.status || 'Generating PDF…');
            status.textContent = 'Statement emailed successfully.';
        } catch (error) { status.textContent = error.detail || error.message || 'Could not queue statement.'; }
    };
});
