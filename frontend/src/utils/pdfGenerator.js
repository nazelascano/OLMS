import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatCurrency } from './currency';

// Simple, robust PDF utilities for OLMS. Exports the functions used across the app:
// - generateLibraryCard(student)
// - generateLibraryCardsPDF(students)
// - generateTransactionReceipt(...)
// - generateReportPDF(...)
// - downloadPDF(pdf, filename)
// - printPDF(pdf)

const MM = 'mm';

const createDoc = (opts = {}) => {
  const { orientation = 'portrait', format = 'letter' } = opts;
  return new jsPDF({ orientation, unit: MM, format });
};

// (no longer using a wrapper for splitTextToSize; use doc.splitTextToSize directly)

// Draw front side of the library card on the given doc at the current page
const drawCardFront = async (doc, student) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 5;

  // Title centered at top
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Odiongan National High School ', pageWidth / 2, margin + 2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('Dapawan, Odiongan, Romblon', pageWidth / 2, margin + 6, { align: 'center' });
  doc.setFontSize(10);
  doc.text('Library Card', pageWidth / 2, margin + 12, { align: 'center' });
  
  // Define photo area (left)
  // Make the photo slightly smaller so there's room for the info block between photo and QR
  const photoSize = 25; // square photo in mm
  const photoX = margin;
  const photoY = (pageHeight / 2 - photoSize / 2) + 5;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(photoX, photoY, photoSize, photoSize);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PHOTO', photoX + photoSize / 2, photoY + photoSize / 2 + 1, { align: 'center' });

  // Student ID under the photo, bold
  const cardNoY = photoY + photoSize + 4;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(String(student.studentId || 'N/A'), photoX, cardNoY);
  

  // Right side: info area (to the right of photo)
  const gapBetween = 2;
  const infoX = photoX + photoSize + gapBetween;
  const infoY = photoY;
  // QR size and computed available width for the info block
  const qrSizeMm = 20;
  const qrX = pageWidth - margin - qrSizeMm;
  const infoMaxWidth = qrX - infoX - (gapBetween * 2); // small padding

  // Name label and bolded name (allow wrapping)
  doc.setFont('helvetica', 'bold');
  const fullName = `${student.firstName || ''} ${student.middleName || ''} ${student.lastName || ''}`.trim() || 'N/A';
  const nameLines = doc.splitTextToSize(fullName, infoMaxWidth);
  doc.setFontSize(12);
  doc.text(nameLines, infoX, infoY + 5);

  // Grade & Section
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const gradeText = `${student.grade || 'N/A'}${student.section ? ' - ' + student.section : ''}`;
  doc.text(gradeText, infoX, infoY + 20);

  // QR code on the rightmost area, align top with the name area
  const qrY = pageHeight / 2 - qrSizeMm / 2;
  try {
    const qrData = (student.libraryCardNumber || student.studentId || 'N/A');
    const dataUrl = await QRCode.toDataURL(String(qrData));
    doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);
  } catch (err) {
    console.warn('QR generation failed', err);
  }
  // no divider line — keep the front clean
  
  // Library card number 
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(student.libraryCardNumber || '', qrX , qrY + qrSizeMm + 3);
};

const drawCardBack = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 5;
  const rules = [
    '1. This card is non-transferable and must be presented when borrowing books.',
    '2. Handle books with care. Report any damage immediately.',
    '3. Return books on or before the due date.',
    '4. Overdue books: PHP 5.00 fine per day.',
    '5. Lost books must be replaced or paid for.',
    '6. Report lost cards immediately.',
    '7. Respect library quiet zones.'
  ];

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('LIBRARY RULES & REGULATIONS', pageWidth / 2, margin, { align: 'center' });

  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  const maxWidth = pageWidth - (margin * 2);
  // Start rules a bit lower to leave breathing room under the title
  
  const lineSpacing = 3;
  const boxSizeWidth = (pageWidth / 2) - margin;
  const boxSizeHeight = pageHeight - (margin * 2) - 2;
  const boxX = margin;
  const boxY = (pageHeight / 2 - boxSizeHeight / 2) + 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(boxX, boxY, boxSizeWidth, boxSizeHeight);
  let y = boxY + 3
  rules.forEach((r) => {
    const lines = doc.splitTextToSize(r, boxSizeWidth - 6);
    doc.text(lines, boxX + 2, y);
    y += lines.length + lineSpacing;
  });

  // Footer placeholders (place them within the bottom area, centered-ish)
  const footerY1 = (pageHeight/2) + 5;
  const footerY2 = footerY1 + 8;
  const footerY3 = footerY2 + 8;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const footerX = (maxWidth / 2) + 6;
  doc.text('Valid until: _____________________', footerX, footerY1);
  doc.text('Student Signature: ______________', footerX, footerY2);
  doc.text('Librarian: ______________________', footerX, footerY3);
};

export const generateLibraryCard = async (studentData = {}) => {
  // Use ID card dimensions (mm) and landscape orientation
  const doc = createDoc({ orientation: 'landscape', format: [85.6, 54] });
  await drawCardFront(doc, studentData);
  doc.addPage();
  drawCardBack(doc);
  return doc;
};

// Generate a single PDF containing many cards (front + back pages per student)
export const generateLibraryCardsPDF = async (students = []) => {
  const firstDoc = createDoc({ orientation: 'landscape', format: [85.6, 54] });
  let doc = firstDoc;
  for (let i = 0; i < students.length; i += 1) {
    const s = students[i] || {};
    if (i === 0) {
      await drawCardFront(doc, s);
      doc.addPage();
      drawCardBack(doc);
    } else {
      doc.addPage();
      await drawCardFront(doc, s);
      doc.addPage();
      drawCardBack(doc);
    }
  }
  return doc;
};


export const generateTransactionReceipt = async (transactionData = {}, studentData = {}, booksData = []) => {
  const doc = createDoc({ format: 'letter', orientation: 'portrait'});
  const pageWidth = doc.internal.pageSize.getWidth();
  const lineSpacing = 2;
  const margin = 5;
  const centerText = (pageWidth / 2) - margin;
  const headerLine = margin + 2;
  const addressLine = headerLine + lineSpacing;
  const textLine1 = addressLine + lineSpacing + 3;
  const textLine2 = textLine1 + lineSpacing + 3;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Odiongan National High School', centerText, headerLine, { align: 'center' });
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Dapawan, Odiongan, Romblon', centerText, addressLine, { align: 'center' });

  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('LIBRARY', centerText, textLine1, { align: 'center' });
  doc.text('TRANSACTION RECEIPT', centerText, textLine2, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Receipt #: ${transactionData.id || 'N/A'}`, centerText, 30);
  doc.text(`Date: ${new Date(transactionData.createdAt || Date.now()).toLocaleDateString()}`, centerText, 34);
  doc.text(`Type: ${transactionData.type || 'Borrow'}`, centerText, 38);
  // Include transaction status in the header if present
  if (transactionData.status) {
    doc.text(`Status: ${transactionData.status}`, margin, 42);
  }
  const qrSizeMm = 25;
  try {
    const qrData = (transactionData.id || 'N/A');
    const dataUrl = await QRCode.toDataURL(String(qrData));
    doc.addImage(dataUrl, 'PNG', pageWidth - qrSizeMm, 0, qrSizeMm, qrSizeMm);
  } catch (err) {
    console.warn('QR generation failed', err);
  }
  doc.text('Borrower:', 5, 30);
  doc.text(`${studentData?.firstName || ''} ${studentData?.lastName || ''}`.trim() || 'N/A', 5, 34);
  doc.text(`ID: ${studentData?.libraryCardNumber || studentData?.studentId || 'N/A'}`, 5, 38);

  doc.text('Books:', 5, 50);
  doc.text('ISBN', margin + pageWidth - ((pageWidth/3)*2), 50);
  doc.text('Copy ID:', margin + pageWidth - ((pageWidth/3)), 50);
  
  let y = 58;
  booksData.forEach((book, index) => {
    if (y > 140) {
      doc.addPage();
      y = 10;
    }
    console.log(book);
    doc.text(`${index + 1}. ${book.title || 'Unknown'}`, 5, y);
    doc.text(` ${book.isbn || 'Unknown'}`, margin + pageWidth - ((pageWidth/3)*2), y);
    doc.text(` ${book.copyId || 'Unknown'}`, margin + pageWidth - ((pageWidth/3)), y);
    y += 6;
  });

  // Print dates (due date, return date) and fine if available. Adjust vertical spacing dynamically.
  let infoY = y + 4;
  if (transactionData.dueDate) {
    doc.text(`Due Date: ${new Date(transactionData.dueDate).toLocaleDateString()}`, 5, infoY);
    infoY += 6;
  }

  if (transactionData.returnDate) {
    // Include return date on receipt when available
    doc.text(`Return Date: ${new Date(transactionData.returnDate).toLocaleDateString()}`, 5, infoY);
    infoY += 6;
  }

  if (transactionData.fineAmount) {
    doc.text(`Fine: ${formatCurrency(transactionData.fineAmount)}`, 5, infoY);
  }

  return doc;
};

export const generateReportPDF = async (reportType, data = [], options = {}) => {
  const doc = createDoc();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(reportType ? String(reportType).toUpperCase() : 'REPORT', 20, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 30;
  data.forEach((row) => {
    const line = JSON.stringify(row);
    const lines = doc.splitTextToSize(line, 180);
    doc.text(lines, 10, y);
    y += lines.length * 4 + 4;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });
  return doc;
};

export const downloadPDF = (pdfDoc, filename = 'document.pdf') => {
  try {
    if (!pdfDoc) return;
    // Prefer built-in save
    if (typeof pdfDoc.save === 'function') {
      pdfDoc.save(filename);
      return;
    }

    // Fallback to blob download
    if (typeof pdfDoc.output === 'function') {
      const blob = pdfDoc.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('Failed to download PDF', err);
  }
};

export const printPDF = (pdfDoc) => {
  try {
    if (!pdfDoc) return;
    if (typeof pdfDoc.output === 'function') {
      const blob = pdfDoc.output('blob');
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) w.onload = () => w.print();
    }
  } catch (err) {
    console.error('Failed to print PDF', err);
  }
};