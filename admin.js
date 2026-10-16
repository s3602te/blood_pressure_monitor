// 管理頁面：管理密碼只留在這個頁面的記憶體裡，關掉頁面就消失，不會存到瀏覽器。
(function () {
    const unlockForm = document.getElementById("unlockForm");
    const resetForm = document.getElementById("resetForm");
    const statusEl = document.getElementById("status");
    const accountSelect = document.getElementById("account");
    const newPassword = document.getElementById("newPassword");
    let adminCode = "";

    function setStatus(text, kind) {
        statusEl.textContent = text || "";
        statusEl.className = "status" + (kind ? " " + kind : "");
    }

    async function post(action, params) {
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                body: new URLSearchParams({ action, adminCode, ...params })
            });
            return await res.json();
        } catch (e) {
            return { ok: false, error: "連不上伺服器，請檢查網路後再試" };
        }
    }

    unlockForm.addEventListener("submit", async event => {
        event.preventDefault();
        const btn = document.getElementById("unlockBtn");
        if (btn.disabled) return;
        adminCode = document.getElementById("adminCode").value;
        btn.disabled = true;
        setStatus("確認中…", "info");

        const result = await post("adminList", {});
        btn.disabled = false;
        if (!result.ok) {
            adminCode = "";
            setStatus(result.error || "發生錯誤，請再試一次", "error");
            return;
        }

        accountSelect.innerHTML = "";
        result.accounts.forEach(a => {
            const opt = document.createElement("option");
            opt.value = a.username;
            opt.textContent = a.displayName && a.displayName !== a.username
                ? `${a.displayName}（${a.username}）`
                : a.username;
            accountSelect.appendChild(opt);
        });
        unlockForm.hidden = true;
        resetForm.hidden = false;
        setStatus(result.accounts.length ? "" : "目前還沒有任何帳號", result.accounts.length ? "" : "info");
    });

    resetForm.addEventListener("submit", async event => {
        event.preventDefault();
        const btn = document.getElementById("resetBtn");
        if (btn.disabled) return;
        const label = accountSelect.options[accountSelect.selectedIndex].textContent;
        const password = newPassword.value;
        btn.disabled = true;
        setStatus("重設中…", "info");

        const result = await post("adminReset", { username: accountSelect.value, newPassword: password });
        btn.disabled = false;
        if (!result.ok) {
            setStatus(result.error || "重設失敗，請再試一次", "error");
            return;
        }
        newPassword.value = "";
        setStatus(`已重設 ${label} 的密碼，新密碼是「${password}」，請告訴對方。`, "ok");
    });
})();
