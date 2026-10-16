// 登入狀態與 API 呼叫（所有頁面共用）。
// 只在這台裝置存「登入權杖」，不存密碼；權杖由後端發出，一年有效，每天使用會自動續期。
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

// 沒訊號時按「儲存」，資料先放在這支手機，有網路再自動補送。
// 登出時「不」清掉：還沒送出的血壓不能因為登出就消失。
const PendingQueue = {
    key() {
        const s = Session.read();
        return s ? "bp_pending_" + s.username : null;
    },
    read() {
        try {
            const k = this.key();
            const v = k && JSON.parse(localStorage.getItem(k));
            return Array.isArray(v) ? v : [];
        } catch (e) {
            return [];
        }
    },
    write(list) {
        try {
            const k = this.key();
            if (!k) return;
            if (list.length) localStorage.setItem(k, JSON.stringify(list));
            else localStorage.removeItem(k);
        } catch (e) { /* 略過 */ }
    },
    add(params) {
        const list = this.read();
        list.push(params);
        this.write(list);
    },
    remove(requestId) {
        this.write(this.read().filter(item => item.requestId !== requestId));
    },
    count() {
        return this.read().length;
    }
};

let flushing = false;

// 把暫存的資料一筆一筆補送出去。同一筆帶同一個編號，所以重送不會變成兩筆。
// 回傳：sent 成功幾筆、dropped 因為內容有問題而放棄的（要請使用者重新輸入）、blocked 還是沒網路或登入過期。
async function flushPending() {
    const outcome = { sent: 0, dropped: [], blocked: false };
    if (flushing) return outcome;
    flushing = true;
    try {
        for (const item of PendingQueue.read()) {
            const res = await callApi("add", item, 20000);
            if (res.ok) {
                PendingQueue.remove(item.requestId);
                outcome.sent++;
            } else if (res.code === "NETWORK" || res.code === "AUTH") {
                outcome.blocked = true;
                if (res.code === "AUTH") handleAuthError(res);
                break;
            } else {
                PendingQueue.remove(item.requestId);
                outcome.dropped.push({ item, error: res.error });
            }
        }
    } finally {
        flushing = false;
    }
    return outcome;
}

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

// 超過時間沒回應就當作沒網路（Apps Script 偶爾會卡住），不會一直轉圈
async function callApi(action, params = {}, timeoutMs = 30000) {
    const body = new URLSearchParams({ action, ...params });
    const session = Session.read();
    if (session && !body.has("token")) body.set("token", session.token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(API_URL, { method: "POST", body, signal: controller.signal });
        return await res.json();
    } catch (e) {
        return { ok: false, error: "連不上伺服器，請檢查網路後再試", code: "NETWORK" };
    } finally {
        clearTimeout(timer);
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

// 字體大小：預設標準，按一下放大，再按一下回到標準；記在這台裝置上
const FontSize = {
    KEY: "bp_font",
    isLarge() {
        try { return localStorage.getItem(this.KEY) === "large"; } catch (e) { return false; }
    },
    apply(large) {
        if (large) document.documentElement.setAttribute("data-size", "large");
        else document.documentElement.removeAttribute("data-size");
    },
    set(large) {
        try {
            if (large) localStorage.setItem(this.KEY, "large");
            else localStorage.removeItem(this.KEY);
        } catch (e) { /* 略過 */ }
        this.apply(large);
        window.dispatchEvent(new Event("bp-fontchange"));
    }
};
FontSize.apply(FontSize.isLarge());

// 顯示登入者名稱並接上「放大字／登出」按鈕
function renderUser() {
    const session = Session.read();
    const nameEl = document.getElementById("userName");
    if (nameEl && session) nameEl.textContent = session.displayName || session.username || "";

    const fontBtn = document.getElementById("fontBtn");
    if (fontBtn) {
        const label = () => { fontBtn.textContent = FontSize.isLarge() ? "標準字" : "放大字"; };
        label();
        fontBtn.onclick = () => { FontSize.set(!FontSize.isLarge()); label(); };
    }

    const btn = document.getElementById("logoutBtn");
    if (btn) btn.onclick = () => { if (confirm("確定要登出嗎？\n登出後要重新輸入帳號和密碼。")) logout(); };
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(err => console.error("SW failed:", err));
    }
}
