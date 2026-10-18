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
        expenseAmount.textContent = money.format(Number(expense.amount));
        expenseMeta.textContent = `Business day: ${expense.day}`;
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
