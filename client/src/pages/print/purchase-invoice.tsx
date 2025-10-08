import { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";

const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  // Helper to get the correct API URL for public requests
  const getApiUrl = (endpoint: string) => {
    return useRelativeUrls() ? endpoint : `${API_BASE_URL}${endpoint}`;
  };

  const url = getApiUrl(endpoint);
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }
  return responseData;
};

interface PurchaseInvoiceData {
  company: any;
  supplier: any;
  invoice: any;
  items: any[];
  notes: string;
}

function PurchaseInvoiceTemplate({ data }: { data: PurchaseInvoiceData }) {
  if (!data) return null;
  const { company, supplier, invoice, items, notes } = data;
  
  // Refs for keyboard navigation
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  // Set ref for input elements
  const setInputRef = (key: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[key] = el;
  };
  
  // Auto-calculate totals
  const calculateTotals = () => {
    let totalQuantity = 0;
    let totalAmount = 0;
    
    items.forEach((_, idx) => {
      const quantityInput = inputRefs.current[`quantity-${idx}`];
      const totalInput = inputRefs.current[`total-${idx}`];
      
      if (quantityInput) {
        totalQuantity += parseFloat(quantityInput.value) || 0;
      }
      if (totalInput) {
        totalAmount += parseFloat(totalInput.value) || 0;
      }
    });
    
    // Update total fields
    const totalQuantityInput = inputRefs.current['totalQuantity'];
    const totalAmountInput = inputRefs.current['totalAmount'];
    
    if (totalQuantityInput) {
      totalQuantityInput.value = totalQuantity.toFixed(3);
    }
    if (totalAmountInput) {
      totalAmountInput.value = totalAmount.toFixed(2);
    }
  };
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentRow: number, currentCol: 'quantity' | 'unitPrice' | 'total') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      let nextKey = '';
      
      if (currentCol === 'quantity') {
        // Move to unit price in same row
        nextKey = `unitPrice-${currentRow}`;
      } else if (currentCol === 'unitPrice') {
        // Move to total in same row
        nextKey = `total-${currentRow}`;
      } else if (currentCol === 'total') {
        // Move to quantity in next row, or total quantity if last row
        if (currentRow < items.length - 1) {
          nextKey = `quantity-${currentRow + 1}`;
        } else {
          nextKey = 'totalQuantity';
        }
      }
      
      // Focus next input
      if (nextKey && inputRefs.current[nextKey]) {
        inputRefs.current[nextKey]?.focus();
        inputRefs.current[nextKey]?.select();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Move to same column in next row
      if (currentRow < items.length - 1) {
        const nextKey = `${currentCol}-${currentRow + 1}`;
        inputRefs.current[nextKey]?.focus();
        inputRefs.current[nextKey]?.select();
      } else if (currentCol === 'quantity') {
        // If at last row quantity, move to total quantity
        inputRefs.current['totalQuantity']?.focus();
        inputRefs.current['totalQuantity']?.select();
      } else if (currentCol === 'total') {
        // If at last row total, move to total amount
        inputRefs.current['totalAmount']?.focus();
        inputRefs.current['totalAmount']?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Move to same column in previous row
      if (currentRow > 0) {
        const prevKey = `${currentCol}-${currentRow - 1}`;
        inputRefs.current[prevKey]?.focus();
        inputRefs.current[prevKey]?.select();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // Move to previous column in same row
      if (currentCol === 'unitPrice') {
        inputRefs.current[`quantity-${currentRow}`]?.focus();
        inputRefs.current[`quantity-${currentRow}`]?.select();
      } else if (currentCol === 'total') {
        inputRefs.current[`unitPrice-${currentRow}`]?.focus();
        inputRefs.current[`unitPrice-${currentRow}`]?.select();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      // Move to next column in same row
      if (currentCol === 'quantity') {
        inputRefs.current[`unitPrice-${currentRow}`]?.focus();
        inputRefs.current[`unitPrice-${currentRow}`]?.select();
      } else if (currentCol === 'unitPrice') {
        inputRefs.current[`total-${currentRow}`]?.focus();
        inputRefs.current[`total-${currentRow}`]?.select();
      }
    } else if (e.key === 'Tab') {
      // Let Tab work naturally but ensure proper focus
      if (!e.shiftKey) {
        // Tab forward - same as Enter
        e.preventDefault();
        let nextKey = '';
        
        if (currentCol === 'quantity') {
          nextKey = `unitPrice-${currentRow}`;
        } else if (currentCol === 'unitPrice') {
          nextKey = `total-${currentRow}`;
        } else if (currentCol === 'total') {
          if (currentRow < items.length - 1) {
            nextKey = `quantity-${currentRow + 1}`;
          } else {
            nextKey = 'totalQuantity';
          }
        }
        
        if (nextKey && inputRefs.current[nextKey]) {
          inputRefs.current[nextKey]?.focus();
          inputRefs.current[nextKey]?.select();
        }
      } else {
        // Shift+Tab backward
        e.preventDefault();
        let prevKey = '';
        
        if (currentCol === 'unitPrice') {
          prevKey = `quantity-${currentRow}`;
        } else if (currentCol === 'total') {
          prevKey = `unitPrice-${currentRow}`;
        } else if (currentCol === 'quantity' && currentRow > 0) {
          prevKey = `total-${currentRow - 1}`;
        }
        
        if (prevKey && inputRefs.current[prevKey]) {
          inputRefs.current[prevKey]?.focus();
          inputRefs.current[prevKey]?.select();
        }
      }
    }
  };
  
  // Auto-focus first quantity input on mount
  useEffect(() => {
    if (items.length > 0) {
      setTimeout(() => {
        inputRefs.current['quantity-0']?.focus();
        inputRefs.current['quantity-0']?.select();
      }, 100);
    }
  }, [items.length]);
  
  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + P to focus on first quantity field
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (items.length > 0) {
          inputRefs.current['quantity-0']?.focus();
          inputRefs.current['quantity-0']?.select();
        }
      }
      // Escape to clear current inputs and focus on first quantity field
      if (e.key === 'Escape') {
        e.preventDefault();
        // Clear all input values
        Object.keys(inputRefs.current).forEach(key => {
          if (inputRefs.current[key]) {
            inputRefs.current[key]!.value = '';
          }
        });
        // Focus first quantity field
        if (items.length > 0) {
          inputRefs.current['quantity-0']?.focus();
          inputRefs.current['quantity-0']?.select();
        }
      }
      // Ctrl/Cmd + S to focus on total quantity field
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        inputRefs.current['totalQuantity']?.focus();
        inputRefs.current['totalQuantity']?.select();
      }
      // Ctrl/Cmd + T to focus on total amount field
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        inputRefs.current['totalAmount']?.focus();
        inputRefs.current['totalAmount']?.select();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [items.length]);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Logo and Invoice Number */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Logo and Company Info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src={logo} alt="Logo" style={{ height: 60, marginBottom: 8 }} />
          <div style={{ fontWeight: "bold", fontSize: 18 }}>{company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 14 }}>{company?.address1}{company?.address2 ? ", " + company.address2 : ""}</div>
          {company?.compRegNo && <div style={{ fontSize: 14 }}>Company Reg No: {company.compRegNo}</div>}
          {company?.vatNo && <div style={{ fontSize: 14 }}>VAT No: {company.vatNo}</div>}
        </div>
        {/* Invoice Number and Title */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 26, color: '#1a237e', marginBottom: 4 }}>
            P.INVOICE
          </div>
          <div style={{ fontWeight: 400, fontSize: 16, marginTop: 8 }}>Date: {invoice?.date ? new Date(invoice.date).toLocaleDateString() : "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Invoice No: {invoice?.id ?? "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Our Ref No: {invoice?.refNumber ?? "-"}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Supplier Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Supplier :</div>
        <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold" }}>{supplier?.supplier_name || "SUPPLIER"}</div>
        {supplier?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{supplier.address}</div>}
        {supplier?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {supplier.vat_number}</div>}
      </div>
      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Product</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Quantity</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Unit Price</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Total</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td style={{ border: "1px solid #888", padding: 4 }}>{item.productName || item.description || "-"}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>
                <input 
                  ref={setInputRef(`quantity-${idx}`)}
                  type="number" 
                  min="0"
                  step="0.001"
                  style={{ 
                    border: "none", 
                    background: "transparent", 
                    textAlign: "center", 
                    width: "100%",
                    fontSize: "inherit",
                    fontFamily: "inherit"
                  }}
                  className="no-print-border"
                  placeholder="0"
                  onKeyDown={(e) => handleKeyDown(e, idx, 'quantity')}
                  onChange={(e) => {
                    // Auto-calculate total when quantity changes
                    const quantity = parseFloat(e.target.value) || 0;
                    const unitPriceInput = inputRefs.current[`unitPrice-${idx}`];
                    const totalInput = inputRefs.current[`total-${idx}`];
                    
                    if (unitPriceInput && totalInput) {
                      const unitPrice = parseFloat(unitPriceInput.value) || 0;
                      const total = quantity * unitPrice;
                      totalInput.value = total.toFixed(2);
                    }
                    
                    // Recalculate grand totals
                    setTimeout(calculateTotals, 10);
                  }}
                  onFocus={(e) => e.target.select()}
                />
              </td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>
                <input 
                  ref={setInputRef(`unitPrice-${idx}`)}
                  type="number" 
                  min="0"
                  step="0.01"
                  style={{ 
                    border: "none", 
                    background: "transparent", 
                    textAlign: "center", 
                    width: "100%",
                    fontSize: "inherit",
                    fontFamily: "inherit"
                  }}
                  className="no-print-border"
                  placeholder="0.00"
                  onKeyDown={(e) => {
                    // Handle navigation first
                    if (e.key === 'Enter') {
                      handleKeyDown(e, idx, 'unitPrice');
                      return;
                    }
                    // Only prevent negative numbers and invalid characters
                    if (e.key === '-' || ['e', 'E', '+'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    // Auto-calculate total when unit price changes
                    const unitPrice = parseFloat(e.target.value) || 0;
                    const quantityInput = inputRefs.current[`quantity-${idx}`];
                    const totalInput = inputRefs.current[`total-${idx}`];
                    
                    if (quantityInput && totalInput) {
                      const quantity = parseFloat(quantityInput.value) || 0;
                      const total = quantity * unitPrice;
                      totalInput.value = total.toFixed(2);
                    }
                    
                    // Recalculate grand totals
                    setTimeout(calculateTotals, 10);
                  }}
                  onFocus={(e) => e.target.select()}
                  onPaste={(e) => {
                    // Get pasted data and validate it's a non-negative number
                    const pasteData = e.clipboardData.getData('text/plain');
                    if (isNaN(Number(pasteData)) || Number(pasteData) < 0) {
                      e.preventDefault();
                    }
                  }}
                />
              </td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>
                <input 
                  ref={setInputRef(`total-${idx}`)}
                  type="number" 
                  min="0"
                  step="0.01"
                  style={{ 
                    border: "none", 
                    background: "transparent", 
                    textAlign: "center", 
                    width: "100%",
                    fontSize: "inherit",
                    fontFamily: "inherit"
                  }}
                  className="no-print-border"
                  placeholder="0.00"
                  onKeyDown={(e) => {
                    // Handle navigation first
                    if (e.key === 'Enter') {
                      handleKeyDown(e, idx, 'total');
                      return;
                    }
                    // Only prevent negative numbers and invalid characters
                    if (e.key === '-' || ['e', 'E', '+'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    // When total is manually changed, calculate unit price if quantity exists
                    const total = parseFloat(e.target.value) || 0;
                    const quantityInput = inputRefs.current[`quantity-${idx}`];
                    const unitPriceInput = inputRefs.current[`unitPrice-${idx}`];
                    
                    if (quantityInput && unitPriceInput) {
                      const quantity = parseFloat(quantityInput.value) || 0;
                      if (quantity > 0) {
                        const unitPrice = total / quantity;
                        unitPriceInput.value = unitPrice.toFixed(4); // More precision for unit price
                      }
                    }
                    
                    // Recalculate grand totals
                    setTimeout(calculateTotals, 10);
                  }}
                  onFocus={(e) => e.target.select()}
                  onPaste={(e) => {
                    // Get pasted data and validate it's a non-negative number
                    const pasteData = e.clipboardData.getData('text/plain');
                    if (isNaN(Number(pasteData)) || Number(pasteData) < 0) {
                      e.preventDefault();
                    }
                  }}
                />
              </td>
              <td style={{ border: "1px solid #888", padding: 4 }}>{item.remarks || "-"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #888", padding: 4 }}>TOTAL</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>
              <input 
                ref={setInputRef('totalQuantity')}
                type="number" 
                min="0"
                step="0.001"
                style={{ 
                  border: "none", 
                  background: "transparent", 
                  textAlign: "center", 
                  width: "100%",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  fontWeight: "bold"
                }}
                className="no-print-border"
                placeholder="0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Move to total amount field
                    inputRefs.current['totalAmount']?.focus();
                    inputRefs.current['totalAmount']?.select();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Move to last row quantity
                    if (items.length > 0) {
                      inputRefs.current[`quantity-${items.length - 1}`]?.focus();
                      inputRefs.current[`quantity-${items.length - 1}`]?.select();
                    }
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    // Move to total amount
                    inputRefs.current['totalAmount']?.focus();
                    inputRefs.current['totalAmount']?.select();
                  }
                }}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  // Auto-calculate individual quantities proportionally if needed
                  // This is optional - you might want to implement this logic
                }}
              />
            </td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>X</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>
              <input 
                ref={setInputRef('totalAmount')}
                type="number" 
                min="0"
                step="0.01"
                style={{ 
                  border: "none", 
                  background: "transparent", 
                  textAlign: "center", 
                  width: "100%",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  fontWeight: "bold"
                }}
                className="no-print-border"
                placeholder="0.00"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Focus back to first quantity field for next entry cycle
                    if (items.length > 0) {
                      inputRefs.current['quantity-0']?.focus();
                      inputRefs.current['quantity-0']?.select();
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Move to total quantity
                    inputRefs.current['totalQuantity']?.focus();
                    inputRefs.current['totalQuantity']?.select();
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    // Move to first quantity field
                    if (items.length > 0) {
                      inputRefs.current['quantity-0']?.focus();
                      inputRefs.current['quantity-0']?.select();
                    }
                  }
                }}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  // Auto-calculate individual totals proportionally if needed
                  // This is optional - you might want to implement this logic
                }}
              />
            </td>
            <td style={{ border: "1px solid #888", padding: 4 }}></td>
          </tr>
        </tbody>
      </table>
      {/* Notes */}
      {notes && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#888", fontStyle: "italic", border: "1px solid #888", borderTop: "none", padding: 8 }}>
          {notes.split("\n").map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#444" }}>
        <div>Invoice Time: {invoice?.date ? new Date(invoice.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>
      {/* Keyboard shortcuts help */}
      <div style={{ marginTop: 16, padding: 8, background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 4, fontSize: 12, color: "#6c757d" }} className="no-print">
        <strong>Keyboard Shortcuts:</strong>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: 4 }}>
          <span>• Enter: Next field</span>
          <span>• Ctrl+P: First quantity</span>
          <span>• Arrow keys: Navigate</span>
          <span>• Ctrl+S: Total quantity</span>
          <span>• Tab/Shift+Tab: Forward/Back</span>
          <span>• Ctrl+T: Total amount</span>
          <span>• Escape: Clear & reset</span>
          <span>• Auto-calculation enabled</span>
        </div>
      </div>
      
      <button
        onClick={() => window.print()}
        style={{ marginTop: 24, padding: "6px 18px", fontSize: 16, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Print
      </button>
      <button
        onClick={() => {
          if (window.confirm("Are you sure you want to close this invoice? Any unsaved changes will be lost.")) {
            window.close();
          }
        }}
        style={{ marginTop: 24, marginLeft: 12, padding: "6px 18px", fontSize: 16, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Close
      </button>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .no-print-border input {
            border: none !important;
            outline: none !important;
            background: transparent !important;
          }
        }
        .no-print-border input {
          outline: none;
        }
        .no-print-border input:focus {
          outline: 1px solid #007bff;
          outline-offset: -1px;
        }
      `}</style>
    </div>
  );
}

export default function PurchaseInvoicePrintPage() {
  const [match, params] = useRoute("/print/purchase-invoice/:invoiceId");
  const invoiceId = params?.invoiceId;
  const [data, setData] = useState<PurchaseInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxDetails, setTaxDetails] = useState({ withTax: false, taxPercentage: '0' });

  useEffect(() => {
    if (!invoiceId) return;
    publicApiRequest("GET", `/api/purchase-invoices/${invoiceId}/print`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load purchase invoice");
        setLoading(false);
      });
  }, [invoiceId]);

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setTaxDetails({
        withTax: !!settings.withTax,
        taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : '0',
      });
    });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error: {error}</div>;
  }
  if (!data) {
    return <div>No data found</div>;
  }
  return <PurchaseInvoiceTemplate data={data} />;
} 