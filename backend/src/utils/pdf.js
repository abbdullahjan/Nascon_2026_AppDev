'use strict';

const PDFDocument = require('pdfkit');

/**
 * Generate a PDF receipt and return it as a base64 string.
 * The PDF must:
 *   - Start with %PDF (guaranteed by PDFKit)
 *   - Contain the order_id in plain text
 *   - Contain the total formatted as "PKR X.XX" (major units, 2 decimals)
 */
function generateReceiptPDF(receiptPayload) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    const totalMajor = (receiptPayload.total_minor / 100).toFixed(2);
    const paidAt     = receiptPayload.paid_at || new Date().toISOString();

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('NaSCon \'26 — Purchase Receipt', { align: 'center' });
    doc.moveDown();

    // Order details
    doc.fontSize(12).font('Helvetica');
    doc.text(`Order ID:    ${receiptPayload.order_id}`);
    doc.text(`Customer ID: ${receiptPayload.customer_id}`);
    doc.text(`Date:        ${paidAt}`);
    doc.moveDown();

    // Items table
    doc.font('Helvetica-Bold').text('Items:', { underline: true });
    doc.font('Helvetica');
    for (const item of receiptPayload.items) {
      const lineTotal = ((item.unit_price_minor * item.quantity) / 100).toFixed(2);
      doc.text(`  ${item.variant_id}  x${item.quantity}  PKR ${lineTotal}`);
    }
    doc.moveDown();

    // Totals
    const subtotal = (receiptPayload.subtotal_minor / 100).toFixed(2);
    const discount = (receiptPayload.discount_minor / 100).toFixed(2);

    doc.text(`Subtotal: PKR ${subtotal}`);
    if (receiptPayload.discount_minor > 0) {
      doc.text(`Discount: -PKR ${discount}`);
    }
    doc.font('Helvetica-Bold').fontSize(14).text(`Total: PKR ${totalMajor}`);
    doc.moveDown();

    doc.fontSize(10).font('Helvetica').fillColor('grey')
      .text('Thank you for your purchase!', { align: 'center' });

    doc.end();
  });
}

module.exports = { generateReceiptPDF };
