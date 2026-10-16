(function () {
    registerServiceWorker();
    if (!requireLogin()) return;
    renderUser();

    const form = document.getElementById("bpForm");
    const submitBtn = document.getElementById("submitBtn");
    const dateInput = document.getElementById("date");
    const dialog = document.getElementById("resultDialog");
    const dialogTitle = document.getElementById("resultTitle");
    const dialogDetail = document.getElementById("resultDetail");
    const dialogOk = document.getElementById("resultOk");
    const pendingBox = document.getElementById("pendingBox");
    const pendingText = document.getElementById("pendingText");
    const pendingRetry = document.getElementById("pendingRetry");
    let closeTimer = null;

    // 每次填寫一個專屬編號，送出失敗重試用同一個，伺服器才認得出「這是同一筆」；成功後換新的
    const newRequestId = () => (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    let requestId = newRequestId();

    function localToday() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    // 結果用畫面正中央的視窗通知，小螢幕不用往下捲也看得到
    function showResult(kind, title, detail) {
        dialog.dataset.kind = kind;
        dialogTitle.textContent = title;
        dialogDetail.textContent = detail || "";
        dialog.hidden = false;
        dialogOk.focus();
        clearTimeout(closeTimer);
        if (kind === "ok") closeTimer = setTimeout(closeResult, 4000); // 成功 4 秒後自動關閉；其他要按「好」才關
    }

    function closeResult() {
        clearTimeout(closeTimer);
        dialog.hidden = true;
    }

    dialogOk.addEventListener("click", closeResult);
    dialog.addEventListener("click", event => { if (event.target === dialog) closeResult(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !dialog.hidden) closeResult(); });

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const now = new Date();
    document.getElementById("todayText").textContent =
        `今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日（週${weekdays[now.getDay()]}）`;

    dateInput.value = localToday();
    dateInput.max = localToday();

    // 還沒送出的暫存資料：顯示提醒，並在有網路時自動補送
    function updatePendingBox() {
        const n = PendingQueue.count();
        pendingBox.hidden = n === 0;
        if (n) pendingText.textContent = `有 ${n} 筆血壓還沒上傳，目前先存在這支手機。連上網路後會自動補送，請不要重複輸入。`;
    }

    async function sendPending(manual) {
        if (!PendingQueue.count()) return;
        pendingRetry.disabled = true;
        const outcome = await flushPending();
        pendingRetry.disabled = false;
        updatePendingBox();

        if (outcome.dropped.length) {
            const lines = outcome.dropped.map(d => `${d.item.date}　${d.item.systolic}/${d.item.diastolic}：${d.error || "無法儲存"}`);
            showResult("error", "有資料沒辦法儲存", lines.join("\n") + "\n請重新輸入一次。");
        } else if (outcome.sent) {
            showResult("ok", `已補送 ${outcome.sent} 筆`, "先前暫存的血壓已經上傳完成。");
        } else if (manual && outcome.blocked) {
            showResult("warn", "還是連不上網路", "資料還在這支手機裡沒有遺失，有網路時會再自動補送。");
        }
        if (outcome.sent) refreshRecords();
    }

    pendingRetry.addEventListener("click", () => sendPending(true));
    window.addEventListener("online", () => sendPending(false));
    setInterval(() => sendPending(false), 30000);
    updatePendingBox();

    // 確認登入還有效（過期就回登入頁），同時先把歷史紀錄抓好，之後打開歷史頁就不用等
    refreshRecords().then(result => {
        if (handleAuthError(result)) return;
        renderUser();
        if (result.ok) sendPending(false);
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const params = { ...Object.fromEntries(new FormData(form)), requestId };
        submitBtn.disabled = true;
        submitBtn.textContent = "儲存中…";

        const result = await callApi("add", params, 20000);
        submitBtn.disabled = false;
        submitBtn.textContent = "儲存紀錄";

        if (handleAuthError(result)) return;

        if (result.code === "NETWORK") {
            // 沒訊號：先存在手機，補送時帶著「當初按下儲存的時間」，早上／晚上才不會算錯
            PendingQueue.add({ ...params, clientAt: Date.now() });
            requestId = newRequestId();
            updatePendingBox();
            showResult("warn", "已暫存在手機", "現在連不上網路，資料先存在這支手機裡，有網路時會自動補送，請不要重複輸入。");
            const keepDate = dateInput.value;
            form.reset();
            dateInput.value = keepDate;
            return;
        }

        if (!result.ok) {
            showResult("error", "沒有儲存成功", result.error || "請再試一次");
            return;
        }

        if (result.duplicate) {
            showResult("ok", "已經儲存過了", "這筆資料剛剛已經存好，不會重複記錄。");
        } else {
            showResult("ok", "已儲存", `收縮壓 ${params.systolic} / 舒張壓 ${params.diastolic}，脈搏 ${params.pulse}`);
        }
        requestId = newRequestId();
        refreshRecords(); // 背景更新歷史紀錄，不用等
        const keepDate = dateInput.value;
        form.reset();
        dateInput.value = keepDate;
    });
})();
