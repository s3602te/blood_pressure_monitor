(function () {
    registerServiceWorker();
    if (Session.read()) {
        location.replace("index.html");
        return;
    }

    callApi("ping"); // 先喚醒伺服器，等一下按登入就不用等冷啟動

    const form = document.getElementById("authForm");
    const statusEl = document.getElementById("status");
    const submitBtn = document.getElementById("submitBtn");
    const passwordInput = document.getElementById("password");
    const inviteInput = document.getElementById("inviteCode");
    const registerOnly = form.querySelectorAll("[data-register]");
    let mode = "login";

    function setStatus(text, kind) {
        statusEl.textContent = text || "";
        statusEl.className = "status" + (kind ? " " + kind : "");
    }

    function setMode(next) {
        mode = next;
        const isRegister = mode === "register";
        registerOnly.forEach(el => { el.hidden = !isRegister; });
        inviteInput.required = isRegister;
        passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
        submitBtn.textContent = isRegister ? "建立帳號" : "登入";
        setStatus("");
    }

    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener("change", () => setMode(radio.value));
    });

    const toggle = document.getElementById("togglePassword");
    toggle.addEventListener("click", () => {
        const show = passwordInput.type === "password";
        passwordInput.type = show ? "text" : "password";
        toggle.textContent = show ? "隱藏" : "顯示";
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const params = {
            username: form.username.value.trim(),
            password: form.password.value
        };
        if (mode === "register") {
            params.displayName = form.displayName.value.trim();
            params.inviteCode = form.inviteCode.value.trim();
        }

        submitBtn.disabled = true;
        setStatus(mode === "register" ? "建立中…" : "登入中…", "info");

        const result = await callApi(mode, params);
        if (result.ok) {
            Session.save({ token: result.token, username: result.username, displayName: result.displayName });
            location.replace("index.html");
            return;
        }
        setStatus(result.error || "發生錯誤，請再試一次", "error");
        submitBtn.disabled = false;
    });
})();
