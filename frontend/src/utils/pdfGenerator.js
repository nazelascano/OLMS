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
const DEFAULT_STRIPE_COLOR = '#C62828';

const sanitizeHexColor = (value, fallback = DEFAULT_STRIPE_COLOR) => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().replace(/^#/u, '').toUpperCase();
  if (/^[0-9A-F]{6}$/u.test(normalized)) {
    return `#${normalized}`;
  }
  return fallback;
};

const hexToRgb = (hexColor = DEFAULT_STRIPE_COLOR) => {
  const normalized = sanitizeHexColor(hexColor).slice(1);
  return [
    parseInt(normalized.slice(0, 2), 16) || 0,
    parseInt(normalized.slice(2, 4), 16) || 0,
    parseInt(normalized.slice(4, 6), 16) || 0
  ];
};

const deriveStripeColor = (student = {}, gradeColorMap = {}) => {
  const direct = student.gradeColor || student.cardColor || student.stripeColor;
  if (direct) {
    return sanitizeHexColor(direct);
  }

  const gradeName = student.grade || student.gradeLevel;
  if (typeof gradeName === 'string') {
    const key = gradeName.trim().toLowerCase();
    if (key && gradeColorMap && gradeColorMap[key]) {
      return sanitizeHexColor(gradeColorMap[key]);
    }
  }

  return DEFAULT_STRIPE_COLOR;
};

const createDoc = (opts = {}) => {
  const { orientation = 'portrait', format = 'letter' } = opts;
  return new jsPDF({ orientation, unit: MM, format });
};

const getValidDateLabel = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const formatStudentFullName = (student = {}) => {
  const parts = [student.firstName, student.middleName, student.lastName]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return student.name || 'Unknown';
};

const deriveStudentLibraryId = (student = {}) => {
  return (
    student.libraryId ||
    student.libraryCardNumber ||
    (student.library && student.library.cardNumber) ||
    student.studentId ||
    'N/A'
  );
};

// (no longer using a wrapper for splitTextToSize; use doc.splitTextToSize directly)

// Draw front side of the library card on the given doc at the current page
const drawCardFront = async (doc, student, librarySettings = {}, options = {}) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 3;
  const gradeColor = deriveStripeColor(student, options.gradeColorMap || {});
  const [stripeR, stripeG, stripeB] = hexToRgb(gradeColor);

  // Use library settings with fallbacks
  const libraryName = librarySettings.libraryName || 'Odiongan National High School';
  const libraryAddress = librarySettings.libraryAddress || 'Dapawan, Odiongan, Romblon';

  // 3. Library ID box (centered)
  // Library ID label and number to the right of the photo box
  // Use the same photoSize, photoX, photoY as the photo box below
  let photoSize = 25;
  let photoX = margin;
  let photoY = (pageHeight / 2 - photoSize / 2) + 5;
  const idX = photoX + photoSize + 3 ; // 3mm gap after photo
  const idY = photoY + photoSize - 10 ;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120,120,120);
  doc.text('LIBRARY ID', idX, idY, {align:'left'});
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0,0,0);
  doc.text(student.libraryCardNumber || '', idX, idY + 7, {align:'left'});

  

  // 2. Logo, school name, and address (top right)
  try {
    const logoImg = await import('../assets/images/logo.png');
    const logoW = 14, logoH = 14;
    const logoX = pageWidth - margin - logoW;
    const logoY = margin;
    doc.addImage(logoImg.default || logoImg, 'PNG', logoX, logoY, logoW, logoH);
    // School name and address to the left of logo
    const textRight = logoX - 2;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0,0,0);
    doc.text(libraryName, textRight, logoY + 6, {align:'right'});
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80,80,80);
    doc.text(libraryAddress, textRight, logoY + 11, {align:'right'});
  } catch (e) {
    // Fallback: just text
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0,0,0,0);
    doc.text(libraryName, pageWidth - margin, margin + 6, {align:'right'});
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80,80,80);
    doc.text(libraryAddress, pageWidth - margin, margin + 11, {align:'right'});
  }
  // (removed unused centerX)
  // ...existing code...

  // 5. Name in red bar (bottom)
  const barH = 8;
  doc.setFillColor(stripeR, stripeG, stripeB);
  doc.rect(0, pageHeight-barH, pageWidth, barH, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255,255,255);
  const fullName = `${student.firstName || ''} ${student.middleName || ''} ${student.lastName || ''}`.trim() || 'Name Surname';
  doc.text(fullName, margin+2, pageHeight-barH/3, {align:'left'});

  // 6. QR code (bottom right)
  const qrSizeMm = 15;
  const qrX = pageWidth - margin - qrSizeMm;
  const qrY = pageHeight - qrSizeMm - 2;
  try {
    const qrData = (student.libraryCardNumber || '');
    const dataUrl = await QRCode.toDataURL(String(qrData));
    doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSizeMm, qrSizeMm);
  } catch (err) {
    // ignore QR errors
  }
  doc.setTextColor(0);
  
  // Define photo area (left)
  // Make the photo slightly smaller so there's room for the info block between photo and QR
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(photoX, photoY, photoSize, photoSize);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PHOTO', photoX + photoSize / 2, photoY + photoSize / 2 + 1, { align: 'center' });

  // Student ID under the photo, bold
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  

  // (removed duplicate old layout code)
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

export const generateLibraryCard = async (studentData = {}, librarySettings = {}, options = {}) => {
  // Use ID card dimensions (mm) and landscape orientation
  const doc = createDoc({ orientation: 'landscape', format: [85.6, 54] });
  await drawCardFront(doc, studentData, librarySettings, options);
  doc.addPage();
  drawCardBack(doc);
  return doc;
};

// Generate a single PDF containing many cards (front + back pages per student)
export const generateLibraryCardsPDF = async (students = [], librarySettings = {}, options = {}) => {
  const firstDoc = createDoc({ orientation: 'landscape', format: [85.6, 54] });
  let doc = firstDoc;
  for (let i = 0; i < students.length; i += 1) {
    const s = students[i] || {};
    if (i === 0) {
      await drawCardFront(doc, s, librarySettings, options);
      doc.addPage();
      drawCardBack(doc);
    } else {
      doc.addPage();
      await drawCardFront(doc, s, librarySettings, options);
      doc.addPage();
      drawCardBack(doc);
    }
  }
  return doc;
};


export const generateTransactionReceipt = async (transactionData = {}, studentData = {}, booksData = [], librarySettings = {}) => {
  const doc = createDoc({ format: 'letter', orientation: 'portrait'});
  const pageWidth = doc.internal.pageSize.getWidth();
  const lineSpacing = 2;
  const margin = 5;
  const centerText = (pageWidth / 2) - margin;
  const headerLine = margin + 2;
  const addressLine = headerLine + lineSpacing;
  const textLine1 = addressLine + lineSpacing + 3;
  const textLine2 = textLine1 + lineSpacing + 3;

  // Use library settings with fallbacks
  const libraryName = librarySettings.libraryName || 'Odiongan National High School';
  const libraryAddress = librarySettings.libraryAddress || 'Dapawan, Odiongan, Romblon';

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(libraryName, centerText, headerLine, { align: 'center' });
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(libraryAddress, centerText, addressLine, { align: 'center' });

  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('LIBRARY', centerText, textLine1, { align: 'center' });
  doc.text('TRANSACTION RECEIPT', centerText, textLine2, { align: 'center' });

  doc.setFontSize(8);
  const drawLabelValue = (label, value, x, y, align = 'left') => {
    const printableValue = String(value ?? '').trim() || 'N/A';

    const labelString = `${label} `;
    doc.setFont('helvetica', 'normal');
    const labelWidth = doc.getTextWidth(labelString);

    doc.setFont('helvetica', 'bold');
    const valueWidth = doc.getTextWidth(printableValue);

    if (align === 'center') {
      const gap = 1.5;
      doc.setFont('helvetica', 'normal');
      doc.text(labelString, x, y, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(printableValue, x + labelWidth / 2 + gap, y);
      return;
    }

    let startX = x;
    if (align === 'right') {
      startX = x - (labelWidth + valueWidth);
    }

    doc.setFont('helvetica', 'normal');
    doc.text(labelString, startX, y);

    doc.setFont('helvetica', 'bold');
    doc.text(printableValue, startX + labelWidth, y);
  };

  drawLabelValue('Receipt #:', transactionData.id || 'N/A', centerText + 3, 30, 'center');
  drawLabelValue(
    'Date:',
    new Date(transactionData.createdAt || Date.now()).toLocaleDateString(),
    centerText,
    34,
    'center'
  );
  drawLabelValue('Type:', transactionData.type || 'Borrow', centerText, 38, 'center');
  // Include transaction status in the header if present
  if (transactionData.status) {
    drawLabelValue('Status:', transactionData.status, margin, 42);
  }
  const qrSizeMm = 25;
  try {
    const qrData = (transactionData.id || 'N/A');
    const dataUrl = await QRCode.toDataURL(String(qrData));
    doc.addImage(dataUrl, 'PNG', pageWidth - qrSizeMm, 0, qrSizeMm, qrSizeMm);
  } catch (err) {
    console.warn('QR generation failed', err);
  }
  const borrowerName = `${studentData?.firstName || ''} ${studentData?.lastName || ''}`.trim()
    || studentData?.fullName
    || 'N/A';
  const borrowerId = studentData?.libraryCardNumber || studentData?.studentId || 'N/A';

  drawLabelValue('Borrower:', borrowerName, 5, 30);
  drawLabelValue('ID:', borrowerId, 5, 34);

  doc.setFont('helvetica', 'normal');

  doc.setFont('helvetica', 'normal');

  doc.text('Books:', 5, 50);
  doc.text('ISBN', margin + pageWidth - ((pageWidth/3)*2), 50);
  doc.text('Copy ID:', margin + pageWidth - ((pageWidth/3)), 50);
  
  let y = 58;
  booksData.forEach((book, index) => {
    if (y > 140) {
      doc.addPage();
      y = 10;
    }
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

const addStudentListHeader = (doc, options = {}) => {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerY = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Student List Report', margin, headerY);

  const dateRange = [];
  const startLabel = getValidDateLabel(options.startDate);
  const endLabel = getValidDateLabel(options.endDate);
  if (startLabel || endLabel) {
    dateRange.push(`Date Range: ${startLabel || 'N/A'} - ${endLabel || 'N/A'}`);
  }

  const filterParts = [];
  const filters = options.studentFilters || {};
  if (filters.grade) filterParts.push(`Grade: ${filters.grade}`);
  if (filters.section) filterParts.push(`Section: ${filters.section}`);
  if (filters.schoolYear) filterParts.push(`School Year: ${filters.schoolYear}`);
  if (filterParts.length > 0) {
    dateRange.push(filterParts.join(' | '));
  }

  if (dateRange.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(dateRange, margin, headerY + 8);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, headerY, { align: 'right' });
};

const drawStudentListTable = (doc, students = [], options = {}) => {
  const margin = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  const columns = [
    { key: 'libraryId', label: 'Library ID', width: 28 },
    { key: 'name', label: 'Name', width: 55 },
    { key: 'gradeSection', label: 'Grade & Section', width: 35 },
    { key: 'email', label: 'Email', width: 55 },
    { key: 'phone', label: 'Phone', width: 32 },
  ];

  const lineHeight = 6;
  let y = margin + 20;

  const drawTableHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    let x = margin;
    columns.forEach((col) => {
      doc.text(col.label, x, y);
      x += col.width;
    });
    doc.setLineWidth(0.3);
    doc.line(margin, y + 1, margin + columns.reduce((sum, col) => sum + col.width, 0), y + 1);
    y += lineHeight;
  };

  const ensureSpace = (rowHeight) => {
    if (y + rowHeight <= pageHeight - margin) {
      return;
    }
    doc.addPage();
    y = margin;
    addStudentListHeader(doc, options);
    y += 20;
    drawTableHeader();
  };

  drawTableHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  students.forEach((student, index) => {
    const rowData = {
      libraryId: deriveStudentLibraryId(student),
      name: formatStudentFullName(student),
      gradeSection:
        student.grade && student.section
          ? `${student.grade} - ${student.section}`
          : student.grade || student.section || 'N/A',
      email: student.email || 'N/A',
      phone: student.phoneNumber || student.parentPhone || 'N/A',
    };

    const wrapped = columns.map((col) => {
      const text = String(rowData[col.key] ?? '') || 'N/A';
      const lines = doc.splitTextToSize(text, col.width - 2);
      return { lines, height: Math.max(lines.length * (lineHeight - 2), lineHeight) };
    });

    const rowHeight = Math.max(...wrapped.map((w) => w.height)) + 2;
    ensureSpace(rowHeight);

    let x = margin;
    wrapped.forEach(({ lines }, colIndex) => {
      doc.text(lines, x, y, { baseline: 'top' });
      x += columns[colIndex].width;
    });

    y += rowHeight;

    if ((index + 1) % 15 === 0) {
      doc.setDrawColor(200);
      doc.setLineWidth(0.1);
      doc.line(margin, y - 1, margin + columns.reduce((sum, col) => sum + col.width, 0), y - 1);
    }
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  y += 4;
  ensureSpace(lineHeight);
  doc.text(`Total Students: ${students.length}`, margin, y);
};

const generateStudentListReportPDF = async (students = [], options = {}) => {
  const doc = createDoc({ orientation: 'portrait', format: 'letter' });
  addStudentListHeader(doc, options);
  drawStudentListTable(doc, students, options);
  return doc;
};

export const generateReportPDF = async (reportType, data = [], options = {}) => {
  if (reportType === 'student-list') {
    return generateStudentListReportPDF(data, options);
  }

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