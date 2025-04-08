function updateStress() {
    // 使用 querySelector 取得 name 為 "stress" 的 input
    document.getElementById("stressValue").innerText = document.querySelector('input[name="stress"]').value;
}

document.getElementById("bpForm").addEventListener("submit", function (event) {
    event.preventDefault(); // 阻止預設的跳轉行為

    let formData = new FormData(this); // 獲取表單數據

    fetch(this.action, {
        method: "POST",
        body: formData
    })
        .then(response => response.text())
        .then(result => {
            alert("數據已成功儲存到帥哥的 Google 試算表！"); // 彈出成功提示 "數據已成功儲存到 Google 試算表！"
            document.getElementById("bpForm").reset(); // 清空表單
        })
        .catch(error => console.error("發生錯誤: ", error));
});


