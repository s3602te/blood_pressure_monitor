function updateStress() {
    // 使用 querySelector 取得 name 為 "stress" 的 input
    document.getElementById("stressValue").innerText = document.querySelector('input[name="stress"]').value;
}
