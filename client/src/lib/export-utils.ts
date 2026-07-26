export function copyToClipboard(
  text: string,
  options?: { toast?: any; successMessage?: string; errorMessage?: string }
): void {
  const showToast = options?.toast;
  navigator.clipboard.writeText(text).then(() => {
    if (showToast) {
      showToast({
        title: options?.successMessage ? "Success" : "Copied",
        description: options?.successMessage || "Table copied to clipboard!",
      });
    }
  }).catch(() => {
    if (showToast) {
      showToast({
        title: "Error",
        description: options?.errorMessage || "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  });
}

export function printHtmlTable(
  title: string,
  htmlContent: string,
  options?: {
    width?: number;
    height?: number;
    extraCss?: string;
    autoClose?: boolean;
    useLandscape?: boolean;
    onBeforePrint?: (win: Window) => void;
  }
): void {
  const width = options?.width ?? 600;
  const height = options?.height ?? 900;
  const printWindow = window.open('', '', `height=${height},width=${width}`);
  if (!printWindow) return;

  const landscapeCss = options?.useLandscape ? '@page { size: landscape; }' : '';
  printWindow.document.write(`<html><head><title>${title}</title>`);
  printWindow.document.write(`<style>
    body{font-family:Arial,sans-serif;margin:20px;}
    table{width:100%;border-collapse:collapse;margin-top:20px;}
    th,td{border:1px solid #ccc;padding:8px;text-align:left;}
    th{background-color:#f0f0f0;font-weight:bold;}
    .header{text-align:center;margin-bottom:20px;}
    .footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}
    .totals{font-weight:bold;background-color:#f0f0f0;}
    ${landscapeCss}
    ${options?.extraCss || ''}
  </style></head><body>`);
  printWindow.document.write(htmlContent);
  printWindow.document.write('</body></html>');
  printWindow.document.close();
  printWindow.focus();

  if (options?.onBeforePrint) {
    options.onBeforePrint(printWindow);
  }

  if (options?.autoClose) {
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  } else {
    setTimeout(() => printWindow.print(), 500);
  }
}
