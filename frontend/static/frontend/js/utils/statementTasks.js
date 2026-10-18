import { apiFetch } from '../session.js';

export async function queueStatement(endpoint, payload) {
    const response = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (!response.ok) throw await response.json();
    const data = await response.json();
    return data.task_id;
}

export async function waitForStatement(taskId, onProgress = () => {}) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await apiFetch(`/api/tasks/status/${taskId}/`);
        if (!response.ok) throw await response.json();
        const task = await response.json();
        onProgress(task);
        if (task.state === 'SUCCESS') return task;
        if (task.state === 'FAILURE') throw new Error(task.error || 'Statement task failed.');
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('The statement is still processing. Check back shortly.');
}

export function statementPayload(form) {
    const email = form.querySelector('[name="email"]').value.trim();
    const start = form.querySelector('[name="start_date"]')?.value;
    const end = form.querySelector('[name="end_date"]')?.value;
    return { email, ...(start && end ? { start_date: start, end_date: end } : {}) };
}
