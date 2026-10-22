/* JWT-only browser authentication. No Django session or cookie is used. */
const ACCESS_TOKEN_KEY = 'fish_depot.access_token';
const REFRESH_TOKEN_KEY = 'fish_depot.refresh_token';
const LOGIN_PATH = '/login/';

export function getAccessToken() { return localStorage.getItem(ACCESS_TOKEN_KEY); }
export function clearSession() { localStorage.removeItem(ACCESS_TOKEN_KEY); localStorage.removeItem(REFRESH_TOKEN_KEY); }
export function redirectToLogin() { clearSession(); if (window.location.pathname !== LOGIN_PATH) window.location.assign(LOGIN_PATH); }

async function refreshAccessToken() {
    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refresh) return null;
    const response = await fetch('/api/auth/refresh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }), credentials: 'omit' });
    if (!response.ok) return null;
    const data = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
    return data.access;
}

/** The sole authenticated API client for the decoupled web frontend. */
export async function apiFetch(url, options = {}) {
    let token = getAccessToken();
    if (!token) { redirectToLogin(); throw new Error('Authentication is required.'); }
    const request = (accessToken) => fetch(url, { ...options, credentials: 'omit', headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(options.body && !options.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let response = await request(token);
    if (response.status !== 401) return response;
    token = await refreshAccessToken();
    if (!token) { redirectToLogin(); throw new Error('Your session has expired.'); }
    response = await request(token);
    if (response.status === 401) { redirectToLogin(); throw new Error('Your session has expired.'); }
    return response;
}

export async function getCurrentUser() {
    const response = await apiFetch('/api/auth/me/');
    if (!response.ok) throw new Error('Unable to load the signed-in user.');
    return response.json();
}

export async function logout() {
    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    const access = getAccessToken();
    try {
        if (refresh && access) await fetch('/api/auth/logout/', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` }, body: JSON.stringify({ refresh }) });
    } finally {
        clearSession();
        window.location.assign(LOGIN_PATH);
    }
}

async function submitLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById('submit-btn');
    const error = document.getElementById('error-message');
    button.disabled = true; 
    button.textContent = 'Signing In...'; 
    error.style.display = 'none';

    clearSession();

    const username = form.username.value.trim();
    const password = form.password.value;    

    try {
        const response = await fetch('/api/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), credentials: 'omit' });
        const data = await response.json();


        if (!response.ok) {
            // Send failed credentials to backend to track consecutive attempts & trigger admin alert
            try {
                await fetch('/api/login-attempts/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                    credentials: 'omit'
                });
            } catch (trackingErr) {
                console.error("Failed to record login attempt:", trackingErr);
            }

            throw new Error(data.detail || 'Wrong username or password.');
        }
        

        localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
        window.location.assign('/');
    } catch (exception) {
        error.textContent = exception.message || 'Unable to sign in.';
        error.style.display = 'block';
    } finally { button.disabled = false; button.textContent = 'Sign In'; }
}

async function initialiseDashboardIdentity() {
    try {
        const user = await getCurrentUser();
        const name = document.getElementById('current-user-name');
        if (name) name.textContent = user.name || user.username;
        window.dispatchEvent(new CustomEvent('fish-depot:user-ready', { detail: user }));
    } catch (error) { console.error(error); }
}

function initialiseSession() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        if (getAccessToken()) {
            getCurrentUser().then(() => window.location.assign('/')).catch(() => clearSession());
        }
        loginForm.addEventListener('submit', submitLogin);
        return;
    }
    if (!getAccessToken()) return redirectToLogin();
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    initialiseDashboardIdentity();
}

document.addEventListener('DOMContentLoaded', initialiseSession);