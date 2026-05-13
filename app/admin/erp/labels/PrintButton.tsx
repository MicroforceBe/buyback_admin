// app/admin/erp/labels/PrintButton.tsx
"use client";

export default function PrintButton() {
  function printLabelOnly() {
    const label = document.querySelector(".label-sheet");

    if (!label) {
      window.alert("Geen label gevonden om te printen.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=600,height=400");

    if (!printWindow) {
      window.alert("Popup geblokkeerd. Sta popups toe om te printen.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Print label</title>
          <style>
            @page {
              size: 89mm 36mm;
              margin: 0;
            }

            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: white;
              width: 89mm;
              min-width: 89mm;
            }

            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            * {
              box-sizing: border-box;
            }

            .label-sheet {
              width: 89mm !important;
              height: 36mm !important;
              min-width: 89mm !important;
              min-height: 36mm !important;
              max-width: 89mm !important;
              max-height: 36mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              page-break-after: avoid;
              page-break-before: avoid;
              page-break-inside: avoid;
            }

            .label-card {
              width: 89mm !important;
              height: 36mm !important;
              margin: 0 !important;
              border: none !important;
              background: white;
              color: #111827;
              font-family: Arial, sans-serif;
              display: grid;
              grid-template-columns: 1fr 18mm;
              overflow: hidden;
            }

            .label-left {
              padding: 1.2mm 2mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              min-width: 0;
            }

            .label-model {
              font-size: 12px;
              font-weight: 800;
              line-height: 1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .label-sub {
              margin-top: 0.5mm;
              font-size: 8px;
              font-weight: 600;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .label-lines {
              margin-top: 1.2mm;
            }

            .label-row {
              display: grid;
              grid-template-columns: 24mm 1fr;
              column-gap: 2mm;
              align-items: center;
              width: 100%;
            }

            .label-text {
              width: 24mm;
              overflow: hidden;
            }

            .label-caption {
              font-size: 5.5px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 700;
            }

            .label-value {
              margin-top: 0.2mm;
              font-size: 8px;
              font-weight: 700;
              line-height: 1.1;
              word-break: break-all;
            }

            .label-barcode-wrap {
              width: 100%;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: flex-start;
            }

            .label-barcode {
              width: 100%;
              height: 6mm;
              max-height: 6mm;
              display: block;
            }

            .label-divider {
              margin: 0.8mm 0;
              border-top: 1px solid #d1d5db;
            }

            .label-footer {
              margin-top: auto;
              border-top: 1px solid #d1d5db;
              padding-top: 0.5mm;
              text-align: center;
              font-size: 6px;
              text-transform: uppercase;
              color: #475569;
              font-weight: 700;
            }

            .label-right {
              border-left: 1px solid #d1d5db;
              padding: 1mm;
              display: flex;
              flex-direction: column;
              align-items: stretch;
              justify-content: space-between;
              overflow: hidden;
            }

            .label-logo {
              border: 1px solid #111827;
              padding: 0.5mm 0.6mm;
              font-size: 5px;
              font-weight: 800;
              letter-spacing: 0.4px;
              text-align: center;
              width: 100%;
            }

            .label-side-content {
              display: flex;
              flex-direction: column;
              gap: 1.8mm;
            }

            .label-side-block {
              width: 100%;
              border-top: 1px solid #d1d5db;
              padding-top: 0.7mm;
            }

            .label-side-title {
              font-size: 5px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 700;
            }

            .label-side-value {
              margin-top: 0.3mm;
              font-size: 11px;
              font-weight: 900;
              line-height: 1;
            }

            .label-ce {
              align-self: flex-end;
              font-size: 7px;
              font-weight: 800;
              letter-spacing: -0.4px;
              line-height: 1;
            }
          </style>
        </head>
        <body>
          ${label.outerHTML}
          <script>
            window.onload = function () {
              setTimeout(function () {
                window.focus();
                window.print();
                setTimeout(function () {
                  window.close();
                }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <button
      type="button"
      onClick={printLabelOnly}
      className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
    >
      Print label
    </button>
  );
}
