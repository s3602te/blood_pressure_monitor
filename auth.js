// 登入狀態與 API 呼叫（所有頁面共用）。
// 只在這台裝置存「登入權杖」，不存密碼；權杖由後端發出，90 天內有效。
const Session = {
    KEY: "bp_session",
    read() {
        try {
            const s = JSON.parse(localStorage.getItem(this.KEY));
            return s && s.token ? s : null;
        } catch (e) {
            return null;
        }
    },
    save(session) {
        try { localStorage.setItem(this.KEY, JSON.stringify(session)); } catch (e) { /* 無痕模式等情況：略過 */ }
    },
    clear() {
        try { localStorage.removeItem(this.KEY); } catch (e) { /* 略過 */ }
    }
};

// 上次看過的紀錄存在這台裝置，歷史頁可以先秀出來、背景再更新（伺服器每次都要等 2 秒左右）。
// 以帳號分開存，登出時清掉。
const RecordCache = {
    key() {
        const s = Session.read();
        return s ? "bp_records_" + s.username : null;
    },
    read() {
        try {
            const k = this.key();
            const v = k && JSON.parse(localStorage.getItem(k));
            return v && Array.isArray(v.records) ? v : null;
        } catch (e) {
            return null;
        }
    },
    write(records) {
        try {
            const k = this.key();
            if (k) localStorage.setItem(k, JSON.stringify({ at: Date.now(), records }));
        } catch (e) { /* 略過 */ }
    },
    clear() {
        try {
            const k = this.key();
            if (k) localStorage.removeItem(k);
        } catch (e) { /* 略過 */ }
    }
};

// 背景抓最新紀錄並存起來；回傳 API 結果，順便能用來確認登入是否還有效
async function refreshRecords() {
    const result = await callApi("list");
    if (result.ok) {
        RecordCache.write(result.records);
        const session = Session.read();
        if (session && result.displayName && session.displayName !== result.displayName) {
            Session.save({ ...session, displayName: result.displayName });
        }
    }
    return result;
}

async function callApi(action, params = {}) {
    const body = new URLSearchParams({ action, ...params });
    const session = Session.read();
    if (session && !body.has("token")) body.set("token", session.token);
    try {
        const res = await fetch(API_URL, { method: "POST", body });
        return await res.json();
    } catch (e) {
        return { ok: false, error: "連不上伺服器，請檢查網路後再試", code: "NETWORK" };
    }
}

function requireLogin() {
    if (Session.read()) return true;
    location.replace("login.html");
    return false;
}

// 登入過期時回到登入頁；回傳 true 代表已處理
function handleAuthError(result) {
    if (result && result.code === "AUTH") {
        RecordCache.clear();
        Session.clear();
        location.replace("login.html");
        return true;
    }
    return false;
}

async function logout() {
    await callApi("logout");
    RecordCache.clear();
    Session.clear();
    location.replace("login.html");
}

// 顯示登入者名稱並接上「登出」按鈕
function renderUser() {
    const session = Session.read();
    const nameEl = document.getElementById("userName");
    if (nameEl && session) nameEl.textContent = session.displayName || session.username || "";
    const btn = document.getElementById("logoutBtn");
    if (btn) btn.onclick = logout;
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(err => console.error("SW failed:", err));
    }
}
