import { jsPDF } from "jspdf";
import logo from "@/public/printlogo.png";
import { formatQuantity } from "./utils";
import { apiRequest } from "./queryClient";
import { fetchCustomerReturnInvoices } from "./customer-return-invoice";
import { fetchCustomerDiscountInvoices } from "./customer-discount-invoice";

interface InvoicePdfData {
  company: any;
  customer: any;
  sale: any;
  items: any[];
  invoiceFooter?: string;
}

function base64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function generateInvoicePdfBlob(invoiceData: InvoicePdfData): Blob {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(invoiceData.company?.companyName || "TROPIFRUIT UK LTD", 20, 22);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(invoiceData.company?.address1 || "3 Dolphin Way, Purfleet, RM19 1NZ", 20, 28);

  if (invoiceData.company?.compRegNo) {
    doc.setFontSize(10);
    doc.text(`Company Reg No: ${invoiceData.company.compRegNo}`, 20, 34);
  }
  if (invoiceData.company?.vatNo) {
    doc.setFontSize(10);
    doc.text(`VAT No: ${invoiceData.company.vatNo}`, 20, 40);
  }
  if (invoiceData.company?.email) {
    doc.setFontSize(10);
    doc.text(invoiceData.company.email, 20, 46);
  }

  const logoW = 36;
  const logoH = 22;
  const logoX = pageWidth - 60;
  const logoY = 16;
  try {
    doc.addImage(logo, 'PNG', logoX, logoY, logoW, logoH);
  } catch {
    doc.setFillColor(240, 240, 240);
    doc.rect(logoX, logoY, logoW, logoH, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("LOGO", logoX + logoW / 2, logoY + 12, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  doc.setFontSize(7);
  const textCenter = logoX + logoW / 2;
  let textY = 42;

  doc.setFont("helvetica", "normal");
  doc.text("Stand 100 New Spitalfields Market", textCenter, textY, { align: 'center' });
  textY += 3.5;
  doc.text("Leyton London E10 5SH", textCenter, textY, { align: 'center' });
  textY += 3.5;
  doc.setFont("helvetica", "bold");
  doc.text("Tel 0208 558 5065 Fax 0208 539 4749", textCenter, textY, { align: 'center' });
  textY += 3.5;

  doc.setFont("helvetica", "normal");
  doc.text("Stand 73 New Spitalfields Market", textCenter, textY, { align: 'center' });
  textY += 3.5;
  doc.text("Leyton London E10 5SH", textCenter, textY, { align: 'center' });
  textY += 3.5;
  doc.setFont("helvetica", "bold");
  doc.text("Tel 0208 558 0909 Fax 0208 558 0707", textCenter, textY, { align: 'center' });

  doc.setLineWidth(0.5);
  doc.setDrawColor(204, 204, 204);
  doc.line(20, 65, pageWidth - 20, 65);

  let yPos = 67;

  doc.setLineWidth(0.5);
  doc.rect(20, yPos + 5, 90, 26);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(invoiceData.customer?.customer_name || "CUSTOMER", 25, yPos + 15);

  if (invoiceData.customer?.address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const addressLines = doc.splitTextToSize(invoiceData.customer.address, 80);
    doc.text(addressLines, 25, yPos + 22);
  }

  if (invoiceData.sale?.gateNumber) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Others/Gate: ${invoiceData.sale.gateNumber}`, 20, yPos + 45);
  }

  const metadataRight = pageWidth - 20;
  const metadataWidth = 80;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Date: ${invoiceData.sale?.date ? new Date(invoiceData.sale.date).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")}`,
    metadataRight,
    yPos + 7,
    { align: "right", maxWidth: metadataWidth },
  );
  if ((invoiceData.sale?.isCustomerReturn || invoiceData.sale?.isCustomerDiscount) && invoiceData.sale?.originalInvoiceDate) {
    doc.setFontSize(10);
    doc.text(
      `(${new Date(`${invoiceData.sale.originalInvoiceDate}T00:00:00`).toLocaleDateString("en-GB")})`,
      metadataRight,
      yPos + 12,
      { align: "right", maxWidth: metadataWidth },
    );
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 35, 126);
  const documentNumberLabel = invoiceData.sale?.isCustomerReturn
    ? "Return No"
    : invoiceData.sale?.isCustomerDiscount ? "Discount Invoice No" : "Invoice No";
  doc.text(
    `${documentNumberLabel}: ${invoiceData.sale?.invoice_number || invoiceData.sale?.invoiceNumber}`,
    metadataRight,
    yPos + 19,
    { align: "right", maxWidth: metadataWidth },
  );
  if ((invoiceData.sale?.isCustomerReturn || invoiceData.sale?.isCustomerDiscount) && invoiceData.sale?.originalInvoiceNumber) {
    doc.setFontSize(10);
    doc.text(
      `(Invoice: ${invoiceData.sale.originalInvoiceNumber})`,
      metadataRight,
      yPos + 24,
      { align: "right", maxWidth: metadataWidth },
    );
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Cust_type: ${invoiceData.sale?.paymentMode || invoiceData.sale?.payment_mode || invoiceData.sale?.customer_type || "account"}`,
    metadataRight,
    yPos + 28,
    { align: "right", maxWidth: metadataWidth },
  );

  if (invoiceData.sale?.isCustomerReturn) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.rect(20, 97, 38, 7);
    doc.text("CREDIT NOTE", 39, 101.8, { align: "center" });
    doc.setFont("helvetica", "normal");
  }

  yPos = 106;
  const tableStartX = 20;
  const tableWidth = pageWidth - 40;
  const colWidths = [90, 20, 35, 35];
  const rowHeight = 8;

  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(204, 204, 204);
  doc.rect(tableStartX, yPos, tableWidth, rowHeight, 'F');
  doc.setLineWidth(0.5);
  doc.rect(tableStartX, yPos, tableWidth, rowHeight);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Product", tableStartX + 2, yPos + 6);
  doc.text("Qty", tableStartX + colWidths[0] + colWidths[1] / 2, yPos + 6, { align: 'center' });
  doc.text("U.Price", tableStartX + colWidths[0] + colWidths[1] + colWidths[2] / 2, yPos + 6, { align: 'center' });
  doc.text("Total", tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2, yPos + 6, { align: 'center' });

  let headerX = tableStartX;
  colWidths.forEach((width, index) => {
    if (index > 0) doc.line(headerX, yPos, headerX, yPos + rowHeight);
    headerX += width;
  });

  yPos += rowHeight;
  doc.setFont("helvetica", "normal");

  (invoiceData.items || []).forEach((item: any) => {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(10);
    const productName = item.productName || item.description || "-";
    const originalInvoiceDetails = (
      (invoiceData.sale?.isCustomerReturn || invoiceData.sale?.isCustomerDiscount)
      && invoiceData.sale?.originalInvoiceNumber
    )
      ? [
          invoiceData.sale.originalInvoiceDate
            ? new Date(`${invoiceData.sale.originalInvoiceDate}T00:00:00`).toLocaleDateString("en-GB")
            : "",
          `Invoice: ${invoiceData.sale.originalInvoiceNumber}`,
          item.notes || "",
        ].filter(Boolean).join(", ")
      : "";
    const productLabel = originalInvoiceDetails
      ? `${productName} (${originalInvoiceDetails})`
      : item.notes ? `${productName} - ${item.notes}` : productName;
    const wrappedLines = doc.splitTextToSize(productLabel, colWidths[0] - 4);
    const lineH = 4.5;
    const actualRowHeight = Math.max(rowHeight, wrappedLines.length * lineH + 2);

    if (item.highlighted) {
      doc.setFillColor(255, 243, 163);
      doc.rect(tableStartX, yPos, tableWidth, actualRowHeight, 'F');
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(tableStartX, yPos, tableWidth, actualRowHeight);

    wrappedLines.forEach((line: string, i: number) => {
      doc.text(line, tableStartX + 2, yPos + 5 + i * lineH);
    });

    const textCenterY = yPos + actualRowHeight / 2 + 1.5;
    doc.setFontSize(11);
    doc.text(formatQuantity(item.quantity || 0), tableStartX + colWidths[0] + colWidths[1] / 2, textCenterY, { align: 'center' });
    doc.text(`${(item.unitPrice || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] / 2, textCenterY, { align: 'center' });
    doc.text(`£${(item.totalPrice || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2, textCenterY, { align: 'center' });

    let rowX = tableStartX;
    colWidths.forEach((width, colIndex) => {
      if (colIndex > 0) doc.line(rowX, yPos, rowX, yPos + actualRowHeight);
      rowX += width;
    });

    yPos += actualRowHeight;
  });

  doc.setFillColor(245, 245, 245);
  doc.rect(tableStartX, yPos, tableWidth, rowHeight, 'F');
  doc.rect(tableStartX, yPos, tableWidth, rowHeight);

  doc.setFont("helvetica", "bold");
  doc.text("SUB TOTAL", tableStartX + 2, yPos + 6);
  doc.text(formatQuantity(invoiceData.items.reduce((a: number, b: any) => a + (Number(b.quantity) || 0), 0)), tableStartX + colWidths[0] + colWidths[1] / 2, yPos + 6, { align: 'center' });
  doc.text("X", tableStartX + colWidths[0] + colWidths[1] + colWidths[2] / 2, yPos + 6, { align: 'center' });
  doc.text(`£${(invoiceData.sale?.subtotal || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2, yPos + 6, { align: 'center' });

  let subtotalX = tableStartX;
  colWidths.forEach((width, colIndex) => {
    if (colIndex > 0) doc.line(subtotalX, yPos, subtotalX, yPos + rowHeight);
    subtotalX += width;
  });

  yPos += rowHeight;

  const notesWidth = tableWidth * 0.6;
  const totalsWidth = tableWidth * 0.4;
  const totalsX = tableStartX + notesWidth;
  doc.setFontSize(9);
  const invoiceRemarks = String(invoiceData.sale?.notes || "").trim();
  const remarkLines = invoiceRemarks
    ? doc.splitTextToSize(`Remarks: ${invoiceRemarks}`, notesWidth - 4)
    : [];
  const invoiceFooter = invoiceData.invoiceFooter || "";
  const footerLines = invoiceFooter
    ? doc.splitTextToSize(invoiceFooter, notesWidth - 4)
    : [];
  const notesBoxHeight = Math.max(
    20,
    5 + remarkLines.length * 4 + (footerLines.length ? 3 + footerLines.length * 4 : 0),
  );

  doc.setFillColor(255, 255, 255);
  doc.rect(tableStartX, yPos, notesWidth, notesBoxHeight);
  doc.setTextColor(136, 136, 136);

  let noteY = yPos + 5;
  if (remarkLines.length) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(remarkLines, tableStartX + 2, noteY);
    noteY += remarkLines.length * 4 + 3;
  }
  if (footerLines.length) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(136, 136, 136);
    doc.text(footerLines, tableStartX + 2, noteY);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  doc.rect(totalsX, yPos, totalsWidth, 10);
  doc.text("Porterage", totalsX + 2, yPos + 7);
  doc.text(`£${(invoiceData.sale?.porterage || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 7, { align: 'right' });

  doc.setFont("helvetica", "bold");
  doc.rect(totalsX, yPos + 10, totalsWidth, 10);
  doc.text("TOTAL", totalsX + 2, yPos + 17);
  doc.text(`£${((invoiceData.sale?.total_amount || invoiceData.sale?.totalAmount) || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 17, { align: 'right' });

  doc.setFont("helvetica", "normal");
  if (invoiceData.sale?.customer_type === "cash") {
    const paymentMode = invoiceData.sale?.payment_mode || invoiceData.sale?.paymentMode || "cash";
    const displayMode = paymentMode === 'cash' ? 'Cash' :
      paymentMode === 'bank' ? 'Card' :
        paymentMode === 'bank_transfer' ? 'Bank Transfer' :
          paymentMode === 'cheque' ? 'Cheque' : paymentMode;
    doc.rect(totalsX, yPos + 20, totalsWidth, 10);
    doc.text("PAID", totalsX + 2, yPos + 27);
    doc.text(`${displayMode} £${(invoiceData.sale?.paid_amount || invoiceData.sale?.paidAmount || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 27, { align: 'right' });
  }

  yPos += notesBoxHeight + 30;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(68, 68, 68);
  if (invoiceData.sale?.isCustomerDiscount) {
    doc.setFont("helvetica", "bold");
    doc.text(
      `Original quantity: ${formatQuantity(invoiceData.sale.originalQuantity || 0)} | Average price after discount: £${Number(invoiceData.sale.averagePriceAfterDiscount || 0).toFixed(2)}`,
      20,
      yPos,
      { maxWidth: pageWidth - 40 },
    );
    doc.setFont("helvetica", "normal");
    yPos += 12;
  }
  doc.text(`Invoice Time: ${invoiceData.sale?.date ? new Date(invoiceData.sale.date).toLocaleString() : "-"}`, pageWidth - 20, yPos, { align: 'right' });
  doc.text(`Current Time: ${new Date().toLocaleString()}`, pageWidth - 20, yPos + 10, { align: 'right' });

  return doc.output('blob');
}

export async function sendInvoicePdfEmail(
  invoiceNumber: string,
  extraEmails?: string[],
): Promise<void> {
  const [invoiceData, settings] = await Promise.all([
    apiRequest("GET", `/api/sales/${invoiceNumber}/invoice`),
    apiRequest("GET", "/api/settings").catch(() => ({})),
  ]);
  invoiceData.invoiceFooter = settings.invoiceFooter || "";

  const customerEmails: string[] = [];
  if (invoiceData.customer?.email) {
    invoiceData.customer.email.split(',').forEach((e: string) => {
      const trimmed = e.trim();
      if (trimmed) customerEmails.push(trimmed);
    });
  }
  if (extraEmails) {
    extraEmails.forEach(e => {
      const trimmed = e.trim();
      if (trimmed && !customerEmails.includes(trimmed)) customerEmails.push(trimmed);
    });
  }

  if (customerEmails.length === 0) {
    throw new Error("No email addresses available");
  }

  const pdfBlob = generateInvoicePdfBlob(invoiceData);
  const base64PDF = await base64FromBlob(pdfBlob);

  await apiRequest('POST', '/api/send-email', {
    to: customerEmails,
    subject: `Invoice - ${invoiceNumber}`,
    body: `Please find attached invoice ${invoiceNumber}.`,
    attachment: {
      filename: `invoice-${invoiceNumber}.pdf`,
      content: base64PDF,
      contentType: 'application/pdf'
    }
  });
}

export async function sendCustomerReturnPdfEmail(returnId: number): Promise<void> {
  const [returnData] = await fetchCustomerReturnInvoices([String(returnId)]);
  if (!returnData) {
    throw new Error("Customer return could not be loaded");
  }

  const customerEmails: string[] = [];
  const emailValue = returnData.customer.email;
  if (typeof emailValue === "string") {
    emailValue.split(",").forEach(email => {
      const trimmed = email.trim();
      if (trimmed) customerEmails.push(trimmed);
    });
  }
  if (customerEmails.length === 0) {
    throw new Error("No email addresses available");
  }

  const returnNumber = String(returnData.sale.invoice_number);
  const base64PDF = await base64FromBlob(generateInvoicePdfBlob(returnData));
  await apiRequest("POST", "/api/send-email", {
    to: customerEmails,
    subject: `Customer Return - ${returnNumber}`,
    body: `Please find attached customer return ${returnNumber}.`,
    attachment: {
      filename: `customer-return-${returnNumber}.pdf`,
      content: base64PDF,
      contentType: "application/pdf",
    },
  });
}

function downloadInvoicePdf(invoiceData: InvoicePdfData, filename: string): void {
  const url = URL.createObjectURL(generateInvoicePdfBlob(invoiceData));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCustomerReturnPdf(returnId: number): Promise<void> {
  const [returnData] = await fetchCustomerReturnInvoices([String(returnId)]);
  if (!returnData) throw new Error("Customer return could not be loaded");
  downloadInvoicePdf(returnData, `customer-return-${returnData.sale.invoice_number}.pdf`);
}

async function getCustomerDiscountPdfData(discountId: number): Promise<InvoicePdfData> {
  const [discountData] = await fetchCustomerDiscountInvoices([String(discountId)]);
  if (!discountData) throw new Error("Customer discount could not be loaded");
  return discountData;
}

export async function downloadCustomerDiscountPdf(discountId: number): Promise<void> {
  const discountData = await getCustomerDiscountPdfData(discountId);
  downloadInvoicePdf(discountData, `customer-discount-${discountData.sale.invoice_number}.pdf`);
}

export async function sendCustomerDiscountPdfEmail(discountId: number): Promise<void> {
  const discountData = await getCustomerDiscountPdfData(discountId);
  const customerEmails: string[] = [];
  const emailValue = discountData.customer.email;
  if (typeof emailValue === "string") {
    emailValue.split(",").forEach(email => {
      const trimmed = email.trim();
      if (trimmed) customerEmails.push(trimmed);
    });
  }
  if (customerEmails.length === 0) throw new Error("No email addresses available");

  const discountNumber = String(discountData.sale.invoice_number);
  const base64PDF = await base64FromBlob(generateInvoicePdfBlob(discountData));
  await apiRequest("POST", "/api/send-email", {
    to: customerEmails,
    subject: `Customer Discount - ${discountNumber}`,
    body: `Please find attached customer discount ${discountNumber}.`,
    attachment: {
      filename: `customer-discount-${discountNumber}.pdf`,
      content: base64PDF,
      contentType: "application/pdf",
    },
  });
}
