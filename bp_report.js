// 請將以下 URL 換成你部署的 Web App 的 URL（支援 GET 請求）
const apiURL = "https://script.google.com/macros/s/AKfycbzrFVUBw72vURX3TTmRPmDl-cq6sSHVC_U7aFxWc70_P4RgXZOuECGzkq_Pyh7Nle81Bg/exec";

document.addEventListener('DOMContentLoaded', () => {
  fetch(apiURL)
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      
      // 後端回傳含有 9 欄位（包含建立時間與修改時間），這裡只取前 7 欄
      const displayHeaders = data.headers.slice(0, 7);
      // 取代原有表頭
      const theadRow = document.querySelector('#reportsTable thead tr');
      theadRow.innerHTML = "";
      displayHeaders.forEach(header => {
        let th = document.createElement('th');
        th.textContent = header;
        theadRow.appendChild(th);
      });

      const tbody = document.querySelector('#reportsTable tbody');
      tbody.innerHTML = "";
      data.records.forEach(row => {
        // 只取前 7 欄
        const displayRow = row.slice(0, 7);
        // 將第一欄（日期）格式調整：將 YYYY-MM-DD 改為 YYYY/MM/DD
        if (displayRow[0]) {
          displayRow[0] = displayRow[0].toString().slice(0, 10).replace(/-/g, "/");
        }
        let tr = document.createElement('tr');
        displayRow.forEach(cell => {
          let td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    })
    .catch(error => console.error('發生錯誤:', error));
});
