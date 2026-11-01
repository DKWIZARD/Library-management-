/* Leaf & Ledger — QR scanner integration
   Uses the existing Leaf & Ledger `books`, `members`, `save()`, `refresh()`,
   `addActivity()`, `toast()` and `showPage()` data/functions.
   No second inventory or scanner-specific LocalStorage is created. */
(() => {
  "use strict";

  const scannerState = {
    instance: null,
    running: false,
    currentBook: null,
    history: []
  };

  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[ch]);

  function loadScript(src, test) {
    return new Promise((resolve, reject) => {
      if (test()) return resolve();
      const existing = [...document.scripts].find(s => s.src === src);
      const script = existing || document.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", () => test() ? resolve() : reject(new Error("Library failed to initialise.")), {once:true});
      script.addEventListener("error", () => reject(new Error("Could not load scanner library. Check your internet connection.")), {once:true});
    });
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-qr-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/styles.css";
    link.dataset.qrStyles = "true";
    document.head.appendChild(link);
  }

  function migrateBooks() {
    // Add scanner metadata to existing records without replacing any book data.
    const used = new Set(books.map(b => b.code).filter(Boolean));
    let next = 1001;
    books.forEach(book => {
      if (!book.code) {
        let code;
        do { code = `BOOK-${String(next++).padStart(4, "0")}`; } while (used.has(code));
        book.code = code;
        used.add(code);
      }
      if (!book.location) book.location = "Not assigned";
    });
    save();
  }

  function injectNavigation() {
    const nav = document.querySelector(".sidebar .nav");
    if (!nav || nav.querySelector('[data-page="qr-scanner"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = "qr-scanner";
    button.innerHTML = "<span>▦</span> QR Scanner";
    button.addEventListener("click", () => openPage());
    nav.appendChild(button);
  }

  function injectMarkup() {
    if (byId("qr-scanner")) return;
    const main = document.querySelector(".main");
    if (!main) return;
    const section = document.createElement("section");
    section.className = "section";
    section.id = "qr-scanner";
    section.innerHTML = `
      <div class="qr-layout">
        <div class="qr-column">
          <div class="panel qr-panel">
            <div class="panel-head">
              <div><h2>Scan a book</h2><p>Use your camera or enter a book's QR code manually.</p></div>
              <span class="qr-live"><i></i> READY</span>
            </div>
            <div class="qr-camera-frame">
              <div id="reader"></div>
              <div class="qr-camera-placeholder" id="cameraPlaceholder">
                <div class="qr-camera-symbol">▦</div>
                <strong>Camera scanner</strong>
                <p>Start the camera and point it at a book's QR code.</p>
              </div>
            </div>
            <div class="qr-controls">
              <button class="btn btn-primary" id="startScanBtn" type="button">Start camera</button>
              <button class="btn btn-light" id="stopScanBtn" type="button" disabled>Stop camera</button>
            </div>
            <div class="qr-divider"></div>
            <form class="qr-manual-form" id="manualLookupForm">
              <label for="manualCode">ENTER BOOK CODE</label>
              <div class="qr-manual-row">
                <input id="manualCode" placeholder="e.g. BOOK-1001" autocomplete="off">
                <button class="btn btn-primary" type="submit">Find book</button>
              </div>
            </form>
            <p class="qr-helper">Tip: each catalogue book has its own QR code. You can print labels from the inventory below.</p>
          </div>
          <div class="panel qr-panel">
            <div class="panel-head"><div><h2>Book inventory & QR labels</h2><p>All records come directly from your main catalogue.</p></div></div>
            <div class="qr-inventory-tools"><input id="inventorySearch" placeholder="Search title, author or code…"></div>
            <div class="qr-table-scroll"><table><thead><tr><th>Book</th><th>Book code</th><th>Shelf location</th><th>Status</th><th>QR label</th></tr></thead><tbody id="inventoryBody"></tbody></table></div>
          </div>
        </div>
        <div class="qr-column">
          <div class="panel qr-panel">
            <div class="panel-head"><div><h2>Book details</h2><p>Scanned or manually searched book information.</p></div></div>
            <div class="qr-empty-result" id="emptyResult"><div>📚</div><strong>No book selected</strong><p>Scan a QR code or search by book code to view its details.</p></div>
            <div class="qr-book-result hidden" id="bookResult">
              <div class="qr-result-top"><div class="qr-book-cover" id="resultCover">📘</div><div><small id="resultCode"></small><h3 id="resultTitle"></h3><p id="resultAuthor"></p></div></div>
              <div class="qr-detail-list">
                <div><span>Category</span><strong id="resultCategory"></strong></div>
                <div><span>ISBN</span><strong id="resultIsbn"></strong></div>
                <div><span>Shelf location</span><strong id="resultLocation"></strong></div>
                <div><span>Status</span><strong id="resultStatus" class="qr-status"></strong></div>
                <div id="borrowerRow"><span>Borrower</span><strong id="resultBorrower"></strong></div>
                <div id="dueRow"><span>Due date</span><strong id="resultDue"></strong></div>
              </div>
              <div class="qr-action-area">
                <div class="qr-action-row">
                  <div><label for="memberSelect">MEMBER</label><select id="memberSelect"></select></div>
                  <div><label for="qrDueDate">DUE DATE</label><input id="qrDueDate" type="date"></div>
                </div>
                <div class="qr-action-buttons">
                  <button class="btn btn-primary" id="issueBtn" type="button">Issue book</button>
                  <button class="btn btn-light" id="returnBtn" type="button">Record return</button>
                </div>
                <p id="actionHint"></p>
              </div>
            </div>
          </div>
          <div class="panel qr-panel">
            <div class="panel-head"><div><h2>Recent scanner activity</h2><p>Recent scans and QR circulation actions.</p></div></div>
            <div class="qr-history-list" id="historyList"><div class="qr-no-history">No scanner activity yet.</div></div>
          </div>
        </div>
      </div>
    `;
    main.appendChild(section);

    const modal = document.createElement("div");
    modal.className = "qr-modal-backdrop";
    modal.id = "qrModal";
    modal.innerHTML = `
      <div class="qr-modal-card" role="dialog" aria-modal="true" aria-labelledby="qrModalTitle">
        <button class="qr-modal-close" id="closeQrModal" type="button" aria-label="Close">×</button>
        <h2 id="qrModalTitle">Book QR label</h2>
        <p class="qr-modal-subtitle" id="qrModalBookName"></p>
        <div class="qr-output" id="qrcode"></div>
        <p class="qr-modal-help">Print this label and attach it to the matching book.</p>
        <button class="btn btn-primary qr-print-btn" id="printQrBtn" type="button">Print QR label</button>
      </div>`;
    document.body.appendChild(modal);
  }

  function openPage() {
    document.querySelectorAll(".section").forEach(section => section.classList.toggle("active", section.id === "qr-scanner"));
    document.querySelectorAll(".sidebar .nav button").forEach(button => button.classList.toggle("active", button.dataset.page === "qr-scanner"));
    byId("pageEyebrow").textContent = "QUICK BOOK IDENTIFICATION";
    byId("pageTitle").textContent = "QR Book Scanner";
    byId("pageSubtitle").textContent = "Scan, issue and return books using their QR labels.";
    window.scrollTo({top:0, behavior:"smooth"});
    renderInventory();
    populateMembers();
  }

  function addHistory(title, detail, icon = "▦") {
    scannerState.history.unshift({title, detail, icon, at:new Date().toLocaleString()});
    scannerState.history = scannerState.history.slice(0, 8);
    renderHistory();
  }

  function renderHistory() {
    const target = byId("historyList");
    target.innerHTML = scannerState.history.length ? scannerState.history.map(item => `
      <div class="qr-history-item"><div class="qr-history-icon">${safe(item.icon)}</div><div><strong>${safe(item.title)}</strong><p>${safe(item.detail)}</p><time>${safe(item.at)}</time></div></div>
    `).join("") : '<div class="qr-no-history">No scanner activity yet. Your scans will appear here.</div>';
  }

  function badge(status) {
    const cls = status === "Available" ? "available" : status === "Overdue" ? "overdue" : "issued";
    return `<span class="qr-status-badge ${cls}">${safe(status)}</span>`;
  }

  function renderInventory() {
    if (!byId("inventoryBody")) return;
    const query = byId("inventorySearch").value.trim().toLowerCase();
    const filtered = books.filter(book => `${book.title} ${book.author} ${book.code} ${book.category} ${book.location}`.toLowerCase().includes(query));
    byId("inventoryBody").innerHTML = filtered.length ? filtered.map(book => `
      <tr>
        <td><strong>${safe(book.title)}</strong><small class="qr-book-author">${safe(book.author)}</small></td>
        <td><code>${safe(book.code)}</code></td>
        <td>${safe(book.location || "Not assigned")}</td>
        <td>${badge(book.status)}</td>
        <td><button class="qr-link" type="button" data-qr="${safe(book.code)}">View QR</button></td>
      </tr>`).join("") : '<tr><td colspan="5" class="qr-no-history">No matching books found.</td></tr>';
    byId("inventoryBody").querySelectorAll("[data-qr]").forEach(button => button.addEventListener("click", () => showQr(button.dataset.qr)));
  }

  function populateMembers() {
    const select = byId("memberSelect");
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Choose member…</option>' + members.filter(m => m.status === "Active").map(m => `<option value="${safe(m.name)}">${safe(m.name)}</option>`).join("");
    if (current) select.value = current;
  }

  function showBook(code, record = true) {
    const normalized = String(code || "").trim().toUpperCase();
    const book = books.find(item => String(item.code || "").toUpperCase() === normalized);
    if (!book) {
      scannerState.currentBook = null;
      byId("emptyResult").classList.remove("hidden");
      byId("bookResult").classList.add("hidden");
      toast(`No book found for code: ${normalized}`);
      return;
    }
    scannerState.currentBook = book;
    byId("emptyResult").classList.add("hidden");
    byId("bookResult").classList.remove("hidden");
    byId("resultCode").textContent = book.code;
    byId("resultTitle").textContent = book.title;
    byId("resultAuthor").textContent = book.author;
    byId("resultCover").textContent = ({green:"📗",peach:"📙",blue:"📘",yellow:"📒",pink:"📕"})[book.cover] || "📘";
    byId("resultCategory").textContent = book.category || "Other";
    byId("resultIsbn").textContent = book.isbn || "Not provided";
    byId("resultLocation").textContent = book.location || "Not assigned";
    byId("resultStatus").textContent = book.status;
    byId("resultStatus").className = `qr-status ${book.status.toLowerCase()}`;
    byId("borrowerRow").classList.toggle("hidden", !book.member);
    byId("dueRow").classList.toggle("hidden", !book.due);
    byId("resultBorrower").textContent = book.member || "";
    byId("resultDue").textContent = book.due || "";
    byId("issueBtn").disabled = book.status !== "Available";
    byId("returnBtn").disabled = book.status === "Available";
    byId("memberSelect").disabled = book.status !== "Available";
    byId("qrDueDate").disabled = book.status !== "Available";
    byId("actionHint").textContent = book.status === "Available"
      ? "Choose a member and due date to issue this book."
      : `This book is ${book.status.toLowerCase()}${book.member ? " to " + book.member : ""}. Record a return when it comes back.`;
    byId("manualCode").value = book.code;
    if (record) addHistory(`Scanned ${book.title}`, `${book.code} · ${book.status}`);
  }

  function updateSharedData(actionTitle, detail, icon) {
    save();
    refresh();
    addActivity(actionTitle, detail, icon);
    refresh();
    renderInventory();
    if (scannerState.currentBook) showBook(scannerState.currentBook.code, false);
  }

  function issueBook() {
    const book = scannerState.currentBook;
    if (!book || book.status !== "Available") return;
    const member = byId("memberSelect").value;
    const due = byId("qrDueDate").value;
    if (!member || !due) return toast("Choose a member and due date first.");
    book.status = new Date(`${due}T23:59:59`) < new Date() ? "Overdue" : "Issued";
    book.member = member;
    book.due = due;
    updateSharedData(`${member} borrowed ${book.title}`, `Issued by QR scanner · due ${due}`, "↙");
    addHistory(`${book.title} issued`, `Issued to ${member} · due ${due}`, "↙");
    toast("Book issue recorded.");
  }

  function returnBook() {
    const book = scannerState.currentBook;
    if (!book || book.status === "Available") return;
    const title = book.title;
    const member = book.member || "A library member";
    book.status = "Available";
    delete book.member;
    delete book.due;
    updateSharedData(`${title} was returned`, `${member} · return recorded via QR scanner`, "↗");
    addHistory(`${title} returned`, `Return recorded for ${member}`, "↗");
    toast("Book return recorded.");
  }

  async function showQr(code) {
    const book = books.find(item => item.code === code);
    if (!book) return;
    byId("qrModalBookName").textContent = `${book.title} · ${book.code}`;
    byId("qrcode").innerHTML = "";
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", () => typeof QRCode !== "undefined");
      new QRCode(byId("qrcode"), {text:book.code, width:190, height:190, colorDark:"#214f3d", colorLight:"#ffffff", correctLevel:QRCode.CorrectLevel.H});
    } catch (error) {
      byId("qrcode").textContent = "QR generator could not load. Check your internet connection.";
    }
    byId("qrModal").classList.add("open");
  }

  async function startScanner() {
    if (scannerState.running) return;
    try {
      await loadScript("https://unpkg.com/html5-qrcode", () => typeof Html5Qrcode !== "undefined");
      byId("cameraPlaceholder").classList.add("hidden");
      scannerState.instance = new Html5Qrcode("reader");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error("No camera found on this device.");
      const preferred = cameras.find(camera => /back|rear|environment/i.test(camera.label)) || cameras[0];
      await scannerState.instance.start(
        preferred.id,
        {fps:10, qrbox:{width:220,height:220}, aspectRatio:1},
        decoded => {
          if (decoded) {
            stopScanner();
            showBook(decoded);
          }
        },
        () => {}
      );
      scannerState.running = true;
      byId("startScanBtn").disabled = true;
      byId("stopScanBtn").disabled = false;
      toast("Camera started. Point it at a book QR code.");
    } catch (error) {
      byId("cameraPlaceholder").classList.remove("hidden");
      scannerState.instance = null;
      toast(error.message || "Unable to start camera. Allow camera permission and use HTTPS or localhost.");
    }
  }

  async function stopScanner() {
    if (scannerState.instance && scannerState.running) {
      try { await scannerState.instance.stop(); await scannerState.instance.clear(); } catch (_) {}
    }
    scannerState.instance = null;
    scannerState.running = false;
    if (byId("startScanBtn")) byId("startScanBtn").disabled = false;
    if (byId("stopScanBtn")) byId("stopScanBtn").disabled = true;
    if (byId("cameraPlaceholder")) byId("cameraPlaceholder").classList.remove("hidden");
  }

  function bindEvents() {
    byId("startScanBtn").addEventListener("click", startScanner);
    byId("stopScanBtn").addEventListener("click", stopScanner);
    byId("manualLookupForm").addEventListener("submit", event => {
      event.preventDefault();
      const code = byId("manualCode").value.trim();
      if (code) showBook(code);
      else toast("Enter a book code first.");
    });
    byId("issueBtn").addEventListener("click", issueBook);
    byId("returnBtn").addEventListener("click", returnBook);
    byId("inventorySearch").addEventListener("input", renderInventory);
    // The original book form handler runs first; assign a QR code to its new record.
    byId("bookForm").addEventListener("submit", () => {
      queueMicrotask(() => { migrateBooks(); renderInventory(); });
    });
    byId("closeQrModal").addEventListener("click", () => byId("qrModal").classList.remove("open"));
    byId("qrModal").addEventListener("click", event => {
      if (event.target === byId("qrModal")) byId("qrModal").classList.remove("open");
    });
    byId("printQrBtn").addEventListener("click", () => window.print());
    document.addEventListener("click", event => {
      const navButton = event.target.closest('.sidebar .nav button[data-page="qr-scanner"]');
      if (navButton) openPage();
    });
    window.addEventListener("beforeunload", () => { if (scannerState.running) stopScanner(); });
  }

  function init() {
    ensureStylesheet();
    migrateBooks();
    injectMarkup();
    injectNavigation();
    bindEvents();
    populateMembers();
    renderInventory();
    renderHistory();

    // Wrap the original page switcher so the dynamically added scanner page works.
    const originalShowPage = showPage;
    window.showPage = function(page) {
      if (page === "qr-scanner") return openPage();
      return originalShowPage(page);
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
