import { apiFetch } from "../session.js";
export async function pollTaskStatus(taskId, btnElement) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const res = await apiFetch(`/api/tasks/status/${taskId}/`);
                if (!res.ok) return;

                const statusData = await res.json();

                if (statusData.state === 'SUCCESS') {
                    clearInterval(interval);
                    resolve(statusData.result);
                } else if (statusData.state === 'FAILURE') {
                    clearInterval(interval);
                    reject(new Error(`Failed to send statement: ${statusData.error || 'Worker error'}`));
                } else {
                    if (btnElement) btnElement.textContent = statusData.status || 'Processing...';
                }
            } catch (err) {
                clearInterval(interval);
                reject(err);
            }
        }, 10); // Poll every 10 Mileseconds
    });
}