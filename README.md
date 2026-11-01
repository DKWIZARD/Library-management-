# Leaf & Ledger — QR Book Scanner

A responsive front-end QR book scanner and circulation desk demo for a library management project.

## Features

- Scan book QR codes using a device camera.
- Look up a book manually using its unique book code.
- View book details, category, ISBN, shelf location and circulation status.
- Issue an available book to a sample member with a due date.
- Record book returns.
- Generate and print QR labels for each sample book.
- Search the inventory and view recent activity.
- Save demo inventory and activity in browser `localStorage`.
- Responsive layout for desktop, tablet and mobile.

## Project files

```text
leaf-ledger-qr-scanner/
├── index.html
├── README.md
├── css/
│   └── styles.css
└── js/
    └── app.js
```

## Run the website

Camera access is restricted by browsers to secure contexts. Use `localhost` or HTTPS rather than opening the HTML file directly if you want to use the camera.

### Option 1: VS Code Live Server

1. Extract the ZIP file.
2. Open the extracted folder in Visual Studio Code.
3. Install the **Live Server** extension if it is not already installed.
4. Right-click `index.html` and choose **Open with Live Server**.
5. Allow camera access when your browser asks.

### Option 2: Python local server

If Python is installed, open a terminal in the extracted project folder and run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Try the demo

The sample inventory includes these book codes:

- `BOOK-1001` — The Midnight Library
- `BOOK-1002` — Atomic Habits
- `BOOK-1003` — A Brief History of Time
- `BOOK-1004` — The Alchemist
- `BOOK-1005` — Clean Code
- `BOOK-1006` — Sapiens

Use the manual book code box to test the workflow without a camera. You can also click **View QR** in the inventory to display and print the matching QR label.

Sample members: Aarav Menon, Maya Nair, Rohan Das, Ananya Shah and Ishaan Kumar.

## Libraries used

- [html5-qrcode](https://github.com/mebjas/html5-qrcode) for browser-based QR scanning.
- [QRCode.js](https://github.com/davidshimjs/qrcodejs) for QR label generation.

These libraries are loaded from public CDNs, so an internet connection is needed for scanning and QR generation.

## Important limitations

This is a front-end demonstration, not a production library system.

- Data is stored in the current browser only. It is not shared across devices or users.
- Sample member accounts are built into the demo; there is no authentication.
- Replace the localStorage logic with a backend API and database (for example Node.js + Express + MySQL) before using real library records.
- Validate permissions and circulation rules on the server in a production version.
- Camera scanning requires browser camera permission and a secure context (`localhost` or HTTPS).

## Suggested next step

Connect this front end to a backend with librarian/student login, a persistent book database, and server-side issue/return transactions.
