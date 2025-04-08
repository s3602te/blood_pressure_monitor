// 請將以下 URL 換成你部署的 Web App 的 URL（支援 GET 請求）
const apiURL = "https://script.google.com/macros/s/AKfycbzrFVUBw72vURX3TTmRPmDl-cq6sSHVC_U7aFxWc70_P4RgXZOuECGzkq_Pyh7Nle81Bg/exec";

let currentPage = 1; // 當前頁數
const itemsPerPage = 7; // 每頁顯示的項目數量
let allRecords = []; // 儲存所有數據

document.addEventListener('DOMContentLoaded', () => { // 當 DOM 完全加載後執行
  // 使用 querySelector 取得 name 為 "stress" 的 input
  fetch(apiURL) // 發送 GET 請求到 Google Apps Script Web App
    .then(response => response.json()) // 獲取 JSON 數據
    .then(data => { // 解析 JSON 數據
      if (data.error) {
        throw new Error(data.error); // 如果有錯誤，則拋出錯誤
      }

      // 設定表頭（只取前 7 欄）
      const displayHeaders = data.headers.slice(0, 7);
      const theadRow = document.querySelector('#reportsTable thead tr'); // 取得表頭行
      theadRow.innerHTML = ""; // 清空表頭內容
      // 創建表頭元素並加入到表頭行中
      displayHeaders.forEach(header => {
        let th = document.createElement('th'); // 創建表頭元素
        th.textContent = header; // 設定表頭文字
        theadRow.appendChild(th);
      });

      // 處理所有資料，並格式化日期 (僅保留 MM/DD)
      allRecords = data.records.map(row => { // 取得每一行資料
        const displayRow = row.slice(0, 7); // 只取前 7 欄
        // 將日期格式化為 MM/DD 格式
        if (displayRow[0]) { // 確保日期存在
          displayRow[0] = displayRow[0].toString().slice(5, 10).replace(/-/g, "/"); // 取出 MM/DD
        }
        return displayRow; // 返回格式化後的行
      });

      renderTable(); // 渲染表格
      generateChart(); // 生成圖表
    })
    .catch(error => console.error('發生錯誤:', error)); // 捕獲錯誤並顯示在控制台
  // 監聽表單提交事件
});

// 渲染分頁表格（依據當前頁數）
function renderTable() {
  const tbody = document.querySelector('#reportsTable tbody'); // 取得表格的 tbody 部分
  tbody.innerHTML = ""; // 清空表格內容
  const startIndex = (currentPage - 1) * itemsPerPage; // 計算起始索引
  // 計算結束索引，並取得當前頁的資料
  const endIndex = startIndex + itemsPerPage; // 計算結束索引
  // 如果當前頁數超過總頁數，則設為最後一頁
  const pageRecords = allRecords.slice(startIndex, endIndex); 

  pageRecords.forEach(row => { // 遍歷每一行資料
    let tr = document.createElement('tr'); // 創建表格行元素
    row.forEach(cell => { // 遍歷每一個儲存格
      let td = document.createElement('td'); // 創建儲存格元素
      // 如果儲存格是數字，則加上單位
      td.textContent = cell; // 設定儲存格文字
      tr.appendChild(td); // 將儲存格加入到行中
    });
    tbody.appendChild(tr); // 將行加入到表格中
  }); // 更新分頁按鈕狀態
  updatePaginationButtons(); // 更新分頁按鈕狀態
}

// 更新分頁按鈕（頁數以 "1/2" 格式呈現）
function updatePaginationButtons() {
  const totalPages = Math.ceil(allRecords.length / itemsPerPage); // 計算總頁數
  document.getElementById("pageInfo").textContent = `${currentPage}/${totalPages}`; // 更新頁數顯示
  document.getElementById("prevPage").disabled = currentPage === 1; // 禁用上一頁按鈕（如果當前頁數是 1）
  document.getElementById("nextPage").disabled = currentPage === totalPages; // 禁用下一頁按鈕（如果當前頁數是最後一頁）
  // 更新按鈕的可用狀態
}

// 切換到下一頁
function nextPage() {
  const totalPages = Math.ceil(allRecords.length / itemsPerPage); // 計算總頁數
  // 如果當前頁數小於總頁數，則切換到下一頁
  if (currentPage < totalPages) {
    currentPage++; // 增加當前頁數
    renderTable(); // 渲染表格
  // 更新分頁按鈕狀態
  }
}

// 切換到上一頁
function prevPage() {
  if (currentPage > 1) { // 如果當前頁數大於 1，則切換到上一頁
    currentPage--; // 減少當前頁數
    renderTable(); // 渲染表格
    // 更新分頁按鈕狀態
  }
}

// 使用 Chart.js 產生長條圖（資料來源為最近 7 筆資料，並加上平均值）
function generateChart() {
  const labels = []; // 儲存 X 軸標籤
  // 取得最近 7 筆資料的標籤和數據
  const systolicData = []; // 儲存收縮壓數據
  const diastolicData = []; // 儲存舒張壓數據
  // 取得最近 7 筆資料
  const last7Records = allRecords.slice(-7); // 取得最後 7 筆資料
  // 取得最近 7 筆資料的標籤和數據

  last7Records.forEach(row => { // 遍歷每一行資料
    // 將日期格式化為 MM/DD 格式
    labels.push(row[0]);  // 將日期加入到標籤中
    // 將收縮壓和舒張壓數據加入到數據中
    systolicData.push(parseInt(row[1])); // 將收縮壓數據加入到數據中
    diastolicData.push(parseInt(row[2])); // 將舒張壓數據加入到數據中
  }); // 取得最近 7 筆資料的標籤和數據

  // 計算最近 7 天的平均值
  const avgSystolic = Math.round(systolicData.reduce((a, b) => a + b, 0) / systolicData.length);    // 計算收縮壓的平均值
  const avgDiastolic = Math.round(diastolicData.reduce((a, b) => a + b, 0) / diastolicData.length);   // 計算舒張壓的平均值

  // 在 X 軸加上「平均」這個條形
  labels.push("平均");  // 將「平均」加入到標籤中
  // 將平均值加入到數據中
  systolicData.push(avgSystolic);   // 將收縮壓的平均值加入到數據中
  diastolicData.push(avgDiastolic); // 將舒張壓的平均值加入到數據中

  const ctx = document.getElementById('bpChart').getContext('2d');  // 取得圖表的上下文
  // 創建圖表實例
  new Chart(ctx, {
    type: 'bar',    // 設定圖表類型為長條圖
    data: { // 設定圖表數據
      labels: labels,   // 設定 X 軸標籤
      datasets: [   // 設定數據集
        {
          label: '收縮壓 (SYS)',    // 設定數據集標籤
          // 設定顏色：當標籤為「平均」時，使用金色，否則使用藍色
          backgroundColor: labels.map(label => label === "平均" ? "#FFD700" : "#007BFF"),
          borderColor: '#0056b3',   // 設定邊框顏色
          data: systolicData    // 設定數據
        },
        {
          label: '舒張壓 (DIA)',    // 設定數據集標籤
          // 設定顏色：當標籤為「平均」時，使用橘色，否則使用綠色
          backgroundColor: labels.map(label => label === "平均" ? "#FFA500" : "#28a745"),
          borderColor: '#218838',   // 設定邊框顏色
          data: diastolicData   // 設定數據
        }
      ] 
    },
    options: {  // 設定圖表選項
      responsive: true, // 設定圖表為響應式
      scales: { // 設定坐標軸
        y: {    // 設定 Y 軸
          beginAtZero: true , // 從 0 開始
        }
      }
    }
  });
}
