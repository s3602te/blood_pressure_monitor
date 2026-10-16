(function () {
    registerServiceWorker();
    if (!requireLogin()) return;
    renderUser();

    const form = document.getElementById("bpForm");
    const statusEl = document.getElementById("status");
    const submitBtn = document.getElementById("submitBtn");
    const dateInput = document.getElementById("date");

    function localToday() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    function setStatus(text, kind) {
        statusEl.textContent = text || "";
        statusEl.className = "status" + (kind ? " " + kind : "");
    }

    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const now = new Date();
    document.getElementById("todayText").textContent =
        `今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日（週${weekdays[now.getDay()]}）`;

    dateInput.value = localToday();
    dateInput.max = localToday();

    // 確認登入還有效（過期就回登入頁），同時先把歷史紀錄抓好，之後打開歷史頁就不用等
    refreshRecords().then(result => {
        if (handleAuthError(result)) return;
        renderUser();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (submitBtn.disabled) return;

        const params = Object.fromEntries(new FormData(form));
        submitBtn.disabled = true;
        setStatus("儲存中…", "info");

        const result = await callApi("add", params);
        submitBtn.disabled = false;

        if (handleAuthError(result)) return;
        if (!result.ok) {
            setStatus(result.error || "儲存失敗，請再試一次", "error");
            return;
        }

        setStatus(
            result.duplicate
                ? "這筆資料剛剛已經儲存過了"
                : `已儲存：${params.systolic} / ${params.diastolic}，脈搏 ${params.pulse}`,
            "ok"
        );
        refreshRecords(); // 背景更新歷史紀錄，不用等
        const keepDate = dateInput.value;
        form.reset();
        dateInput.value = keepDate;
        document.getElementById("systolic").focus();
    });
})();
