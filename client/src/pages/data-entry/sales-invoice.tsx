import { useState, useEffect, useRef, useRef as useRefReact } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PaymentDetailsDrawer from "@/components/layout/payment-details-drawer";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";
import type { Sale, RegularProduct, NonProduct, Customer, SaleItem } from "@shared/schema";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO, subDays } from 'date-fns';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import jsPDF from "jspdf";
import logo from "@/public/printlogo.png";

interface BackendSalePayload {
  invoice_number: string;
  customer_id: number;
  customer_type: string;
  payment_status: string;
  subtotal: number;
  porterage: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  vehicle_details: string | null;
  gate_number: string | null;
  notes: string | null;
  status: string;
  date?: string; // Business date
  items: Array<{
    product_id: number | null;
    non_product_id: number | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    notes: string | null;
    created_at: string;
  }>;
}

// Add StockItem type
interface StockItem {
  id: number;
  productCode: string;
  description: string;
  productType: 'regular' | 'non';
  currentStock: number;
  reorderLevel: number;
  unitOfSale: string | null;
  location: string | null;
}

interface HeldInvoice {
  holdId: string;
  customerId: string;
  vehicleDetails?: string;
  gateNumber?: string;
  notes: string;
  saleItems: any[];
  holdTime: string;
}

// Extend the Sale type to include createdBy and createdByUsername
interface SaleWithUser extends Sale {
  createdBy?: number;
  createdByUsername?: string;
}

const SalesInvoice = () => {
  const skipAutoHoldRef = useRef(false);
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
  const [locationStr, setLocation] = useLocation();
  const [isReadOnly, setIsReadOnly] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { currentDate: businessDate } = useBusinessDate();
  const { canEditInvoice, isInvoiceLocked, canEditPaymentMode } = useInvoicePermissions();
  // const navigate = useNavigate(); // Removed useNavigate

  // Use the latest location from useLocation






  // Log at the top of the component

  // State for current sale and items
  const [currentSale, setCurrentSale] = useState<SaleWithUser | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<"regular" | "non_product">("regular");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<string>("");
  const [itemUnitPrice, setItemUnitPrice] = useState<string>("");
  const [itemNotes, setItemNotes] = useState<string>("");
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [vehicleDetails, setVehicleDetails] = useState<string>("");
  const [gateNumber, setGateNumber] = useState<string>("");
  const [isGateNumberFromCustomer, setIsGateNumberFromCustomer] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  // Stock search state
  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<(RegularProduct | NonProduct & { productType: 'regular' | 'non' })[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(-1);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Add this state at the top of your component (with other useState hooks)
  const [printDeliveryNote, setPrintDeliveryNote] = useState(false);
  const [printPackingList, setPrintPackingList] = useState(false);

  const [taxDetails, setTaxDetails] = useState({ withTax: false, taxPercentage: '0' });
  const [porterageDetails, setPorterageDetails] = useState({ withPorterage: false, porterageCharge: '0.00' });
  const [applyPorterage, setApplyPorterage] = useState(true); // Track if porterage should be applied to this invoice
  const [isEditingPorterage, setIsEditingPorterage] = useState(false);
  const [customPorterage, setCustomPorterage] = useState<string>(porterageDetails.porterageCharge);
  const [invoicePrintFormat, setInvoicePrintFormat] = useState("A4");
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editableDate, setEditableDate] = useState<Date | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showOutstanding, setShowOutstanding] = useState(false);
  const [outstandingData, setOutstandingData] = useState<any>(null);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [outstandingError, setOutstandingError] = useState<string | null>(null);

  const handleShowOutstanding = async () => {
    if (!selectedCustomer) {
      toast({ title: 'No customer selected', description: 'Please select a customer first.' });
      return;
    }
    setOutstandingLoading(true);
    setOutstandingError(null);
    setShowOutstanding(true);
    try {
      // Fetch customer info
      const customer = customers?.find(c => c.id === selectedCustomer.id) || selectedCustomer;
      // Fetch outstanding invoices
      const outstandingRes = await apiRequest("GET", `/api/customers/${customer.id}/outstanding_invoices`);
      const outstanding = Array.isArray(outstandingRes)
        ? outstandingRes.reduce((sum, inv) => sum + (inv.totalAmount - (inv.paidAmount || 0)), 0)
        : 0;
      // Fetch last payment
      const payments = await apiRequest("GET", `/api/payments/history?customerId=${customer.id}`);
      let lastPayment = null;
      if (Array.isArray(payments) && payments.length > 0) {
        const sorted = payments.slice().sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        lastPayment = sorted[0];
      }
      setOutstandingData({
        customer,
        outstanding,
        lastPayment,
      });
    } catch (err: any) {
      setOutstandingError('Failed to fetch outstanding details.');
    }
    setOutstandingLoading(false);
  };

  function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  const fetchCustomers = debounce(async (search: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      const data = await apiRequest("GET", `/api/customers?${params.toString()}`);
      setCustomerOptions(data || []);
    } catch (e) {
      setCustomerOptions([]);
    }
    setIsSearching(false);
  }, 300);

  useEffect(() => {
    if (isEditCustomerOpen) {
      fetchCustomers(customerSearch);
      setHighlightedIndex(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSearch, isEditCustomerOpen]);

  function handleCustomerSelect(id: number) {
    setCustomerId(id.toString());
    setIsEditCustomerOpen(false);
    setCustomerSearch("");

    // Auto-populate gate number from customer's others field
    const selectedCustomer = customers?.find(c => c.id === id);
    if (selectedCustomer?.others && !currentSale) {
      // Only auto-populate for new invoices, not existing ones
      setGateNumber(selectedCustomer.others);
      setIsGateNumberFromCustomer(true);
    } else if (!selectedCustomer?.others) {
      setIsGateNumberFromCustomer(false);
    }

    if (currentSale) {
      const updatedSalePayload: BackendSalePayload = {
        invoice_number: currentSale.invoiceNumber,
        customer_id: id,
        customer_type: currentSale.customerType,
        payment_status: currentSale.paymentStatus,
        subtotal: currentSale.subtotal,
        porterage: currentSale.porterage,
        vat_rate: currentSale.vatRate,
        vat_amount: currentSale.vatAmount,
        total_amount: currentSale.totalAmount,
        vehicle_details: currentSale.vehicleDetails,
        gate_number: currentSale.gateNumber,
        notes: currentSale.notes,
        status: currentSale.status,
        date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
        items: saleItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          created_at: item.createdAt,
        })),
      };
      updateSaleMutation.mutate(updatedSalePayload);
    }
  }

  useEffect(() => {
    // const queryParams = new URLSearchParams(locationStr.split('?')[1] || '');
    const params = new URLSearchParams(window.location.search);
    console.log(params)
    
    // Check for readonly parameter or if invoices are locked
    const readonlyParam = params.get('readonly') === 'true';
    setIsReadOnly(readonlyParam || isInvoiceLocked);


    const customerIdFromUrl = params.get('customerId');
    const gateNumberFromUrl = params.get('gateNumber');

    console.log(customerIdFromUrl, "bbbbbbbbb")
    if (customerIdFromUrl) {
      setCustomerId(customerIdFromUrl as any)
    }
    if (gateNumberFromUrl) {
      setGateNumber(gateNumberFromUrl);
    }
    // const vehicleDetailsFromUrl = queryParams.get('vehicleDetails');
    // const heldInvoiceIdFromUrl = queryParams.get('heldInvoiceId');

  }, [])

  // Restore draft saleItems if present and not a held invoice
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const heldInvoiceIdFromUrl = params.get('heldInvoiceId');
    if (!heldInvoiceIdFromUrl) {
      const draft = localStorage.getItem('currentInvoiceDraft');
      if (draft) {
        try {
          const items = JSON.parse(draft);
          if (Array.isArray(items) && items.length > 0) {
            setSaleItems(items);
            console.log('Restored draft saleItems:', items);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceNumber = params.get("invoiceNumber");
    if (invoiceNumber) {
      apiRequest("GET", `/api/sales/${invoiceNumber}`)
        .then((data) => {
          setCurrentSale(data);
          setSaleItems(data.items || []);
          setCustomerId(data.customerId?.toString() || "");
          setVehicleDetails(data.vehicleDetails || "");
          setGateNumber(data.gateNumber || "");
          setNotes(data.notes || "");
          // Set the editable date when loading the sale
          setEditableDate(data.date ? parseISO(data.date) : new Date());
          // Set other fields as needed
        });
    }
  }, []);

  // Fetch current stock
  const { data: currentStock = [], isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ["currentStock"],
    queryFn: async () => await apiRequest("GET", "/api/stock/current"),
  });

  // Fetch customers (needed for customer name display if not directly in sale)
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Fetch regular products
  const { data: regularProducts } = useQuery<RegularProduct[]>({
    queryKey: ["/api/regular_products"],
    queryFn: () => apiRequest("GET", "/api/regular_products"),
  });

  // Fetch non-products
  const { data: nonProducts } = useQuery<NonProduct[]>({
    queryKey: ["/api/non_products"],
    queryFn: () => apiRequest("GET", "/api/non_products"),
  });

  // Filter products by type and search (move after useQuery declarations)
  useEffect(() => {
    let list: (RegularProduct | NonProduct & { productType: 'regular' | 'non' })[] = [];
    if (selectedProductType === "regular") {
      // Only show regular products with stock > 0
      list = (regularProducts || [])
        .filter((p: any) => {
          const stock = currentStock.find(s => s.id === p.id && s.productType === 'regular');
          return stock && stock.currentStock > 0;
        })
        .map(p => ({ ...p, productType: 'regular' as const }));
    } else {
      // Show all regular and all non-regular products, tag with type
      list = [
        ...(regularProducts || []).map(p => ({ ...p, productType: 'regular' as const })),
        ...(nonProducts || []).map(p => ({ ...p, productType: 'non' as const }))
      ];
    }
    if (productSearch) {
      const term = productSearch.toLowerCase();
      list = list.filter(
        (p: any) =>
          p.productCode?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term)
      );
    }
    setProductOptions(list);
    setHighlightedProduct(-1);
  }, [productSearch, selectedProductType, regularProducts, nonProducts, currentStock]);

  // Get actual database stock (without frontend reduction)
  const getActualStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    return item ? item.currentStock : 0;
  };

  // Find current stock for a product with real-time reduction for items in current invoice
  const getCurrentStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    if (!item) return 0;

    // Only apply real-time reduction for new invoices (draft)
    // For saved invoices, show actual database stock to prevent double reduction
    if (!currentSale) {
      // Calculate real-time stock reduction based on items in current invoice (not yet saved)
      const currentInvoiceReservedQuantity = saleItems
        .filter(saleItem => {
          if (type === 'regular') {
            return saleItem.productId === productId;
          } else {
            return saleItem.nonProductId === productId;
          }
        })
        .reduce((sum, saleItem) => sum + saleItem.quantity, 0);

      // Calculate reserved quantity from all held invoices
      const heldInvoicesReservedQuantity = (heldInvoices as HeldInvoice[])
        .filter((heldInvoice: HeldInvoice) => {
          // Skip the current invoice if it's being held
          return heldInvoice.holdId !== (currentSale as any)?.holdId;
        })
        .flatMap(heldInvoice => heldInvoice.saleItems || [])
        .filter(saleItem => {
          if (type === 'regular') {
            return saleItem.productId === productId;
          } else {
            return saleItem.nonProductId === productId;
          }
        })
        .reduce((sum, saleItem) => sum + saleItem.quantity, 0);

      // Total reserved quantity = current invoice + all held invoices
      const totalReservedQuantity = currentInvoiceReservedQuantity + heldInvoicesReservedQuantity;

      return Math.max(0, item.currentStock - totalReservedQuantity);
    } else {
      // For saved invoices, return actual database stock
      return item.currentStock;
    }
  };

  // Keyboard navigation for product dropdown (match sales entry logic)
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || productOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev < productOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev > 0 ? prev - 1 : productOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedProduct >= 0 && highlightedProduct < productOptions.length) {
        const p = productOptions[highlightedProduct];
        setSelectedProductId(p.id.toString());
        setProductSearch(`${p.productCode} - ${p.description}`);
        // Remove auto-fill price - let user enter manually
        setShowProductDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  // Close dropdown on blur (with delay to allow click)
  const handleProductBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowProductDropdown(false), 100);
  };

  // When productId changes, update productSearch only (no auto-fill price)
  useEffect(() => {
    if (!selectedProductId) return;
    const list = selectedProductType === "regular" ? regularProducts || [] : nonProducts || [];
    const p = list.find((x: any) => x.id.toString() === selectedProductId);
    if (p) {
      setProductSearch(`${p.productCode} - ${p.description}`);
      // Remove auto-fill price - let user enter manually
    }
  }, [selectedProductId, selectedProductType, regularProducts, nonProducts]);

  // Extract from URL for initial values and pre-populate customer details
  // useEffect(() => {
  //   if (customerIdFromUrl) {
  //     setCustomerId(customerIdFromUrl);
  //   }
  //   if (vehicleDetailsFromUrl) {
  //     setVehicleDetails(vehicleDetailsFromUrl);
  //   }
  //   if (gateNumberFromUrl) {
  //     setGateNumber(gateNumberFromUrl);
  //   }
  // }, [customerIdFromUrl, vehicleDetailsFromUrl, gateNumberFromUrl]);

  // Get customer details for display
  const selectedCustomer = customers?.find(c => c.id === parseInt(customerId));
  const customerName = currentSale?.customerId
    ? customers?.find(c => c.id === currentSale.customerId)?.customer_name || 'N/A'
    : selectedCustomer?.customer_name || 'N/A';
  const customerType = currentSale?.customerType || "account";
  const paymentStatus = currentSale?.paymentStatus || "pending";

  // Function to update payment status
  const updatePaymentStatus = async (newStatus: string) => {
    if (!currentSale?.id) return;
    
    try {
      await apiRequest('PUT', `/api/sales/${currentSale.id}`, {
        payment_status: newStatus
      });
      
      // Update local state
      setCurrentSale(prev => prev ? { ...prev, paymentStatus: newStatus } : null);
      
      toast({
        title: "Success",
        description: "Payment status updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update payment status",
        variant: "destructive",
      });
    }
  };

  // Mutation to create a new sale
  const createSaleMutation = useMutation({
    mutationFn: (data: Partial<BackendSalePayload>) => {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      return apiRequest("POST", "/api/sales", data, { signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
    },
    onSuccess: (response) => {
      // Clear held invoice draft after successful save
      localStorage.removeItem('currentInvoiceDraft');
      // Optionally, also remove from heldInvoices if present
      const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]');
      if (held.length > 0 && response?.invoiceNumber) {
        const updated = held.filter((inv: any) => inv.invoiceNumber !== response.invoiceNumber);
        localStorage.setItem('heldInvoices', JSON.stringify(updated));
      }
      console.log("=== CREATE SALE SUCCESS ===");
      console.log("Response:", response);
      console.log("createdBy:", response.createdBy);
      console.log("createdByUsername:", response.createdByUsername);

      // Invalidate relevant queries
      const customerId = response.customer_id || response.customerId;
      queryClient.invalidateQueries({ queryKey: ["/api/sales", response.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      
      // Invalidate customer's outstanding invoices
      if (customerId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/customers", customerId.toString(), "outstanding_invoices"] 
        });
      }
      setCurrentSale(response);
      setIsCreatingSale(false);
      toast({
        title: "Success",
        description: "New sale created successfully",
      });
      return response; // Return the response for handleSaveInvoiceWithWhatsapp to use
    },
    onError: (error: any) => {
      setIsCreatingSale(false);
      let errorMessage = "Failed to create new sale";

      if (error.name === 'AbortError') {
        errorMessage = "Request timed out. Please try again.";
      } else if (error?.error) {
        errorMessage = error.error;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      return null; // Return null on error
    },
  });

  // Mutation to update sale (add/remove items, finalize)
  const updateSaleMutation = useMutation<SaleWithUser, Error, BackendSalePayload>({
    mutationFn: (payload) => apiRequest("PUT", `/api/sales/${currentSale?.id}`, payload),
    onSuccess: (data) => {
      // Clear held invoice draft after successful update
      localStorage.removeItem('currentInvoiceDraft');
      // Optionally, also remove from heldInvoices if present
      const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]');
      if (held.length > 0 && data?.invoiceNumber) {
        const updated = held.filter((inv: any) => inv.invoiceNumber !== data.invoiceNumber);
        localStorage.setItem('heldInvoices', JSON.stringify(updated));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sales", data.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      setCurrentSale(data);
      setSaleItems(data.items || []);
      // Force refresh stock data to show correct levels
      queryClient.refetchQueries({ queryKey: ["currentStock"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || error?.response?.data?.error || error.message || "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  // Add mutation for deleting the sale
  const deleteSaleMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/sales/${currentSale?.id}`),
    onSuccess: () => {
      toast({
        title: "Invoice Deleted",
        description: "The invoice has been deleted successfully.",
      });
      // Invalidate sales queries to clear cache
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      if (currentSale?.invoiceNumber) {
        queryClient.invalidateQueries({ queryKey: ["/api/sales", currentSale.invoiceNumber] });
      }
      // Reset local state to ensure new sale logic triggers
      setCurrentSale(null);
      setSaleItems([]);
      // Auto-refresh the page by redirecting and reloading
      window.location.replace("/data-entry/sales-entry");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice.",
        variant: "destructive",
      });
    },
  });

  // Helper to get product name by ID
  const getProductName = (productId: number | null, nonProductId: number | null, type: "regular" | "non_product") => {
    if (type === "regular" && productId) {
      return regularProducts?.find(p => p.id === productId)?.description || 'N/A';
    } else if (type === "non_product" && nonProductId) {
      return nonProducts?.find(p => p.id === nonProductId)?.description || 'N/A';
    }
    return 'N/A';
  };

  const handleAddItem = () => {
    if (!selectedProductId) {
      toast({
        title: "Validation Error",
        description: "Please select a product.",
        variant: "destructive",
      });
      return;
    }

    if (!itemUnitPrice || isNaN(Number(itemUnitPrice)) || itemUnitPrice.trim() === '') {
      toast({
        title: "Validation Error",
        description: "Please enter a valid unit price.",
        variant: "destructive",
      });
      return;
    }
    
    if (!itemQuantity || isNaN(Number(itemQuantity)) || itemQuantity.trim() === '') {
      toast({
        title: "Validation Error",
        description: "Please enter a valid quantity.",
        variant: "destructive",
      });
      return;
    }

    const actualStockLevel = getActualStock(parseInt(selectedProductId), selectedProductType);

    const existingQuantity = saleItems
      .filter(item => {
        if (selectedProductType === 'regular') {
          return item.productId === parseInt(selectedProductId);
        } else {
          return item.nonProductId === parseInt(selectedProductId);
        }
      })
      .reduce((sum, item) => sum + item.quantity, 0);

    const totalRequestedQuantity = existingQuantity + Number(itemQuantity);

    // Only block for regular products if not enough stock
    if (selectedProductType === 'regular' && totalRequestedQuantity > actualStockLevel) {
      const availableStock = getCurrentStock(parseInt(selectedProductId), selectedProductType);
      toast({
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available in stock. You already have ${existingQuantity} in this invoice.`,
        variant: "destructive",
      });
      return;
    }
    // For non_product, allow adding even if out of stock (stock can go negative)
    // Backend: Negative stock is allowed for sales, so no backend change is needed unless you want to log/flag negative stock events.

    let product: RegularProduct | NonProduct | undefined;
    let isRegular = false;
    if (selectedProductType === "regular") {
      product = regularProducts?.find(p => p.id === parseInt(selectedProductId));
      isRegular = true;
    } else {
      product = regularProducts?.find(p => p.id === parseInt(selectedProductId));
      if (product) {
        isRegular = true;
      } else {
        product = nonProducts?.find(p => p.id === parseInt(selectedProductId));
        isRegular = false;
      }
    }
    if (!product) {
      toast({
        title: "Error",
        description: "Selected product not found.",
        variant: "destructive",
      });
      return;
    }
    const newItem: SaleItem = {
      productId: isRegular ? product.id : null,
      nonProductId: isRegular ? null : product.id,
      quantity: Number(itemQuantity),
      unitPrice: Number(itemUnitPrice),
      totalPrice: Number(itemQuantity) * Number(itemUnitPrice),
      productName: product.description || null,
      notes: itemNotes || null,
      addedBy: currentUser?.username || 'Unknown',
      id: 0,
      saleId: currentSale?.id || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedItems = [...saleItems, newItem];
    setSaleItems(updatedItems);

    // Only update backend if invoice is already saved
    if (currentSale) {
      const updatedSalePayload: BackendSalePayload = {
        invoice_number: currentSale.invoiceNumber,
        customer_id: currentSale.customerId,
        customer_type: currentSale.customerType,
        payment_status: currentSale.paymentStatus,
        subtotal: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        porterage: currentSale.porterage,
        vat_rate: currentSale.vatRate,
        vat_amount: currentSale.vatAmount,
        total_amount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        vehicle_details: currentSale.vehicleDetails,
        gate_number: currentSale.gateNumber,
        notes: currentSale.notes,
        status: currentSale.status,
        date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
        items: updatedItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          created_at: item.createdAt,
        })),
      };
      updateSaleMutation.mutate(updatedSalePayload);
    }
    // For new invoices, stock will be reduced when the invoice is saved
    setSelectedProductId("");
    setItemQuantity("");
    setItemUnitPrice("");
    setItemNotes("");
    setProductSearch("");
  };

  // Save handler: create sale only when Save is clicked
  const [mailInvoice, setMailInvoice] = useState(false);
  const [printInvoice, setPrintInvoice] = useState(false);
  const [sendToWhatsapp, setSendToWhatsapp] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappSuccess, setWhatsappSuccess] = useState(false);
  const [additionalEmails, setAdditionalEmails] = useState<string>("");

  const handleSaveInvoice = (mailInvoice = false, printInvoice = false) => {
    if (!customerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer first.",
        variant: "destructive",
      });
      return;
    }

    if (saleItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item to the invoice.",
        variant: "destructive",
      });
      return;
    }

    skipAutoHoldRef.current = true; // Prevent auto-hold on navigation
    setIsCreatingSale(true);
    const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();
    const payload: Partial<BackendSalePayload & { mailInvoice?: boolean; emailData?: any }> = {
      customer_id: parseInt(customerId),
      customer_type: "account",
      payment_status: "pending",
      subtotal,
      total_amount: totalAmount,
      porterage: porterage,
      vat_rate: taxDetails.withTax ? parseFloat(taxDetails.taxPercentage) : 0,
      vat_amount: vatAmount,
      vehicle_details: vehicleDetails || null,
      gate_number: gateNumber || null,
      notes: notes || null,
      status: "finalized",
      date: businessDate, // Add business date to payload
      items: saleItems.map(item => ({
        product_id: item.productId,
        non_product_id: item.nonProductId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        notes: item.notes,
        created_at: item.createdAt,
      })),
      mailInvoice,
      emailData: mailInvoice ? {
        customerEmails: selectedCustomer?.email || '',
        additionalEmails: additionalEmails
      } : null,
    };
    createSaleMutation.mutate(payload, {
      onSuccess: (response) => {
        if (printInvoice && response?.invoiceNumber) {
          const printUrl = invoicePrintFormat === 'DOTMATRIX'
            ? `/print/dot-matrix-invoice/${response.invoiceNumber}`
            : invoicePrintFormat === 'A5'
              ? `/print/a5-invoice/${response.invoiceNumber}`
              : `/print/invoice/${response.invoiceNumber}`;
          window.open(printUrl, '_blank');
        }
        if (printDeliveryNote && response?.invoiceNumber) {
          window.open(`/print/delivery-note/${response.invoiceNumber}`, '_blank');
        }
        if (printPackingList && response?.invoiceNumber) {
          window.open(`/print/packing-list/${response.invoiceNumber}`, '_blank');
        }

        // Clear additional emails after successful save
        if (mailInvoice) {
          setAdditionalEmails('');
        }

        // Handle WhatsApp sending after successful save
        if (sendToWhatsapp && selectedCustomer && selectedCustomer.telephone && response?.invoiceNumber) {
          console.log('[WHATSAPP DEBUG] Invoice saved successfully, now sending to WhatsApp');
          console.log('[WHATSAPP DEBUG] Invoice number:', response.invoiceNumber);

          setWhatsappLoading(true);
          setWhatsappError(null);
          setWhatsappSuccess(false);

          // Send to WhatsApp
          const printUrl = invoicePrintFormat === 'DOTMATRIX'
            ? `/print/dot-matrix-invoice/${response.invoiceNumber}`
            : invoicePrintFormat === 'A5'
              ? `/print/a5-invoice/${response.invoiceNumber}`
              : `/print/invoice/${response.invoiceNumber}`;
          const invoiceUrl = `${window.location.origin}${printUrl}`;
          const payload = {
            phoneNumber: selectedCustomer.telephone,
            invoiceUrl,
            message: `Your invoice from Tropifruit UK Ltd.`
          };
          console.log('[WHATSAPP] Sending invoice to:', selectedCustomer.telephone);
          console.log('[WHATSAPP] Invoice URL:', invoiceUrl);
          console.log('[WHATSAPP] API request payload:', payload);

          apiRequest("POST", "/api/send/whatsapp-invoice", payload)
            .then(resp => {
              console.log('[WHATSAPP] API response:', resp);
              if (resp.messages) {
                setWhatsappSuccess(true);
              } else {
                setWhatsappError('Failed to send WhatsApp message.');
              }
            })
            .catch(err => {
              console.error('[WHATSAPP] API error:', err);
              setWhatsappError('Failed to send WhatsApp message.');
            })
            .finally(() => {
              setWhatsappLoading(false);
            });
        }

        setLocation('/data-entry/sales-entry');
      }
    });
  };

  const handleSaveInvoiceWithWhatsapp = async (mailInvoice = false, printInvoice = false) => {
    console.log('[WHATSAPP DEBUG] handleSaveInvoiceWithWhatsapp called');
    console.log('[WHATSAPP DEBUG] sendToWhatsapp:', sendToWhatsapp);
    console.log('[WHATSAPP DEBUG] selectedCustomer:', selectedCustomer);
    console.log('[WHATSAPP DEBUG] selectedCustomer.telephone:', selectedCustomer?.telephone);

    // Just call handleSaveInvoice - WhatsApp logic is now handled in the onSuccess callback
    handleSaveInvoice(mailInvoice, printInvoice);
  };

  const calculateTotalSummary = () => {
    const subtotal = saleItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const vatRate = taxDetails.withTax ? parseFloat(taxDetails.taxPercentage) : 0;
    const vatAmount = (subtotal * vatRate) / 100;
    
    // Calculate total quantity of all items
    const totalQuantity = saleItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    // Calculate porterage as (base porterage) * (total quantity)
    const porterage = (porterageDetails.withPorterage && applyPorterage) 
      ? parseFloat(porterageDetails.porterageCharge) * totalQuantity 
      : 0;
      
    const totalAmount = subtotal + vatAmount + porterage;
    return { subtotal, vatAmount, porterage, totalAmount };
  };

  const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();

  // Add this handler for closing/clearing unsaved invoice
  const handleCloseInvoice = () => {
    if (window.confirm("Are you sure you want to discard this unsaved invoice?")) {
      skipAutoHoldRef.current = true; // Prevent auto-hold on close
      setCurrentSale(null);
      setSaleItems([]);
      setCustomerId("");
      setVehicleDetails("");
      setGateNumber("");
      setNotes("");
      setStatus("draft");
      setApplyPorterage(true); // Reset porterage application
      setLocation("/data-entry/sales-entry");
    }
  };

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>([]);

  // Load held invoices from localStorage on mount
  useEffect(() => {
    setHeldInvoices(JSON.parse(localStorage.getItem('heldInvoices') || '[]') as HeldInvoice[]);
  }, []);

  // Handle held invoice resumption from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const heldInvoiceIdFromUrl = params.get('heldInvoiceId');
    console.log('Restore effect running, heldInvoiceIdFromUrl:', heldInvoiceIdFromUrl);
    if (heldInvoiceIdFromUrl) {
      const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]') as HeldInvoice[];
      const invoice = held.find(inv => inv.holdId === heldInvoiceIdFromUrl);
      if (invoice) {
        console.log('Restoring saleItems from held invoice:', invoice.saleItems);
        if (invoice.saleItems.length > 0) {
          invoice.saleItems.forEach((item, idx) => {
            console.log(`  [restore] Item ${idx}:`, item, Object.keys(item));
          });
        }
        setCustomerId(invoice.customerId);
        setVehicleDetails(invoice.vehicleDetails || "");
        setGateNumber(invoice.gateNumber || "");
        setNotes(invoice.notes);
        // If products are loaded, format items immediately
        if (regularProducts && nonProducts) {
          const formattedItems = invoice.saleItems.map((item, idx) => {
            let productName = item.productName;
            if (!productName) {
              if (item.productId) {
                const product = regularProducts.find(p => p.id === item.productId);
                productName = product?.description || `Product ${item.productId}`;
              } else if (item.nonProductId) {
                const product = nonProducts.find(p => p.id === item.nonProductId);
                productName = product?.description || `Non-Product ${item.nonProductId}`;
              }
            }
            const totalPrice = item.totalPrice || (item.quantity * item.unitPrice);
            const formatted = {
              ...item,
              productName,
              totalPrice
            };
            console.log(`[format immediate] Item ${idx}:`, formatted, Object.keys(formatted));
            return formatted;
          });
          console.log('Setting formatted saleItems:', formattedItems);
          setSaleItems(formattedItems);
        } else {
          setSaleItems(invoice.saleItems);
        }
        // Remove from held list after successful restoration
        const updated = held.filter(inv => inv.holdId !== heldInvoiceIdFromUrl);
        setHeldInvoices(updated);
        localStorage.setItem('heldInvoices', JSON.stringify(updated));
        toast({ title: "Invoice Resumed", description: "Held invoice has been loaded successfully." });
      }
    }
  }, [toast, regularProducts, nonProducts]);

  // Format sale items once products are loaded (for held invoices that were resumed before products loaded)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const heldInvoiceIdFromUrl = params.get('heldInvoiceId');
    if (regularProducts && nonProducts && saleItems.length > 0 && heldInvoiceIdFromUrl) {
      const formattedItems = saleItems.map((item, idx) => {
        let productName = item.productName;
        if (!productName) {
          if (item.productId) {
            const product = regularProducts.find(p => p.id === item.productId);
            productName = product?.description || `Product ${item.productId}`;
          } else if (item.nonProductId) {
            const product = nonProducts.find(p => p.id === item.nonProductId);
            productName = product?.description || `Non-Product ${item.nonProductId}`;
          }
        }
        const totalPrice = item.totalPrice || (item.quantity * item.unitPrice);
        const formatted = {
          ...item,
          productName,
          totalPrice
        };
        console.log(`[format after products loaded] Item ${idx}:`, formatted, Object.keys(formatted));
        return formatted;
      });
      console.log('Re-formatting saleItems after products loaded:', formattedItems);
      setSaleItems(formattedItems);
    }
  }, [regularProducts, nonProducts, saleItems.length]);

  // --- LOGGING: Before rendering table ---
  // Place this just before rendering the table
  console.log('Rendering saleItems:', saleItems);
  if (saleItems.length > 0) {
    saleItems.forEach((item, idx) => {
      console.log(`  [render] Item ${idx}:`, item, Object.keys(item));
    });
  }

  const handleHoldInvoice = () => {
    // Set skipAutoHoldRef first to prevent auto-hold on navigation
    skipAutoHoldRef.current = true;

    const holdId = Date.now().toString();
    console.log('Saving saleItems to held invoice:', saleItems);
    if (saleItems.length > 0) {
      saleItems.forEach((item, idx) => {
        console.log(`  [save] Item ${idx}:`, item, Object.keys(item));
      });
    }

    // Create invoice data with current state
    const invoiceData = {
      customerId,
      vehicleDetails,
      gateNumber,
      notes,
      saleItems,
      holdId,
      holdTime: new Date().toISOString(),
    };

    // Save to localStorage
    const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]') as HeldInvoice[];
    held.push(invoiceData);
    localStorage.setItem('heldInvoices', JSON.stringify(held));
    setHeldInvoices(held);

    // Clear current form immediately after saving
    setSaleItems([]);
    setCustomerId("");
    setVehicleDetails("");
    setGateNumber("");
    setNotes("");
    setApplyPorterage(true); // Reset porterage application

    toast({ title: "Invoice Held", description: "You can resume it later from Held Invoices." });
    setLocation('/data-entry/sales-entry');
  };

  // Handler for Customer History navigation
  const handleCustomerHistory = () => {
    if (!selectedCustomer) {
      // Optionally show a toast or alert
      return;
    }
    const today = new Date();
    const lastWeek = subDays(today, 7);
    // Pass params as query string
    const searchParams = new URLSearchParams([
      ['customerId', String(selectedCustomer.id)],
      ['fromDate', format(lastWeek, 'yyyy-MM-dd')],
      ['toDate', format(today, 'yyyy-MM-dd')],
      ['autoSearch', 'true']
    ]);
    setLocation(`/historical-reports/customer-history?${searchParams.toString()}`);
  };

  // Handler for PDF download
  const handlePdfDownload = async () => {
    if (currentSale?.invoiceNumber) {
      // For existing invoice - generate PDF directly
      try {
        toast({
          title: "Generating PDF",
          description: "Please wait while we generate your PDF...",
        });

        // Fetch invoice data
        const invoiceData = await apiRequest("GET", `/api/sales/${currentSale.invoiceNumber}/invoice`);
        
        // Generate PDF using jsPDF to match the print page layout exactly
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        // Header Section - Company Details (Left) and Logo/Invoice Title (Right)
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(invoiceData.company?.companyName || "TROPIFRUIT UK LTD", 20, 25);
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.text(invoiceData.company?.address1 || "3 Dolphin Way, Purfleet, RM19 1NZ", 20, 35);
        
        if (invoiceData.company?.compRegNo) {
          doc.setFontSize(12);
          doc.text(`Company Reg No: ${invoiceData.company.compRegNo}`, 20, 45);
        }
        if (invoiceData.company?.vatNo) {
          doc.setFontSize(12);
          doc.text(`VAT No: ${invoiceData.company.vatNo}`, 20, 55);
        }
        
        // Logo and INVOICE title on the right (matching print page)
        try {
          const logoX = pageWidth - 60;
          const logoY = 15;
          const logoWidth =50;
          const logoHeight = 30;
          
          // Add the actual logo image
          doc.addImage(logo, 'PNG', logoX, logoY, logoWidth, logoHeight);
          
          // INVOICE title below logo
          doc.setFontSize(28);
          doc.setFont("helvetica", "bold");
          doc.text("INVOICE", pageWidth - 40, logoY + logoHeight + 15, { align: 'center' });
        } catch (error) {
          console.log('Logo loading failed, using fallback');
          // Fallback: Logo placeholder and INVOICE title
          const logoX = pageWidth - 80;
          const logoY = 15;
          const logoWidth = 60;
          const logoHeight = 20;
          
          doc.setFillColor(240, 240, 240);
          doc.rect(logoX, logoY, logoWidth, logoHeight, 'F');
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text("LOGO", logoX + logoWidth/2, logoY + logoHeight/2 + 2, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          
          // INVOICE title below logo
          doc.setFontSize(28);
          doc.setFont("helvetica", "bold");
          doc.text("INVOICE", pageWidth - 40, logoY + logoHeight + 10, { align: 'center' });
        }
        
        // Horizontal line
        doc.setLineWidth(0.5);
        doc.line(20, 65, pageWidth - 20, 65);
        
        // Bill To and Invoice Details Section (Side by Side)
        let yPos = 80;
        
        // Bill To Section (Left)
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Bill to :", 20, yPos);
        
        // Customer box with border
        doc.setLineWidth(0.5);
        doc.rect(20, yPos + 5, 60, 20);
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(invoiceData.customer?.customer_name || "CUSTOMER", 25, yPos + 15);
        
        if (invoiceData.customer?.address) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          // Split address into multiple lines if too long
          const addressLines = doc.splitTextToSize(invoiceData.customer.address, 70);
          doc.text(addressLines, 25, yPos + 22);
        }
        
        // VAT Number below the box

        
        // Gate Number (bold and prominent)
        if (invoiceData.sale?.gateNumber) {
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text(`Others/Gate: ${invoiceData.sale.gateNumber}`, 20, yPos + 45);
        }
        
        // Invoice Details (Right Side)
        const rightX = pageWidth - 50;
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Date: ${new Date().toLocaleDateString()}`, rightX, yPos);
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(26, 35, 126); // Blue color for invoice number
        doc.text(`Invoice No: ${invoiceData.sale?.invoice_number || invoiceData.sale?.invoiceNumber}`, rightX, yPos + 12);
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0); // Reset to black
        doc.text(`Cust.type: ${invoiceData.sale?.customer_type || "account"}`, rightX, yPos + 24);
        
        // Items Table
        yPos = 140;
        
        // Table setup
        const tableStartX = 20;
        const tableWidth = pageWidth - 40;
        const colWidths = [100, 25, 25, 25]; // Product, Qty, U.Price, Total
        const rowHeight = 8;
        
        // Table header with background
        doc.setFillColor(245, 245, 245);
        doc.rect(tableStartX, yPos, tableWidth, rowHeight, 'F');
        
        // Header borders
        doc.setLineWidth(0.5);
        doc.rect(tableStartX, yPos, tableWidth, rowHeight);
        
        // Header text
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Product", tableStartX + 2, yPos + 6);
        doc.text("Qty", tableStartX + colWidths[0] + 8, yPos + 6, { align: 'center' });
        doc.text("U.Price", tableStartX + colWidths[0] + colWidths[1] + 8, yPos + 6, { align: 'center' });
        doc.text("Total", tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + 8, yPos + 6, { align: 'center' });
        
        // Vertical lines for header
        let headerX = tableStartX;
        colWidths.forEach((width, index) => {
          if (index > 0) {
            doc.line(headerX, yPos, headerX, yPos + rowHeight);
          }
          headerX += width;
        });
        
        yPos += rowHeight;
        doc.setFont("helvetica", "normal");
        
        // Table rows
        invoiceData.items.forEach((item: any, index: number) => {
          if (yPos > pageHeight - 60) {
            doc.addPage();
            yPos = 20;
          }
          
          // Row border
          doc.rect(tableStartX, yPos, tableWidth, rowHeight);
          
          // Product name
          doc.setFontSize(11);
          doc.text(item.productName || item.description || "-", tableStartX + 2, yPos + 6);
          
          // Notes (if any) - smaller text below product name
          if (item.notes) {
            doc.setFontSize(9);
            doc.setTextColor(102, 102, 102);
            doc.text(item.notes, tableStartX + 2, yPos + 6 + 3);
            doc.setTextColor(0, 0, 0);
          }
          
          // Quantity (centered)
          doc.setFontSize(11);
          doc.text(String(item.quantity || 0), tableStartX + colWidths[0] + 12, yPos + 6, { align: 'center' });
          
          // Unit Price (centered)
          doc.text(`${(item.unitPrice || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + 12, yPos + 6, { align: 'center' });
          
          // Total (centered)
          doc.text(`£${(item.totalPrice || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + 12, yPos + 6, { align: 'center' });
          
          // Vertical lines
          let rowX = tableStartX;
          colWidths.forEach((width, colIndex) => {
            if (colIndex > 0) {
              doc.line(rowX, yPos, rowX, yPos + rowHeight);
            }
            rowX += width;
          });
          
          yPos += rowHeight;
        });
        
        // Subtotal row
        doc.setFillColor(245, 245, 245);
        doc.rect(tableStartX, yPos, tableWidth, rowHeight, 'F');
        doc.rect(tableStartX, yPos, tableWidth, rowHeight);
        
        doc.setFont("helvetica", "bold");
        doc.text("SUB TOTAL", tableStartX + 2, yPos + 6);
        doc.text(String(invoiceData.items.reduce((a: number, b: any) => a + (b.quantity || 0), 0)), tableStartX + colWidths[0] + 12, yPos + 6, { align: 'center' });
        doc.text("X", tableStartX + colWidths[0] + colWidths[1] + 12, yPos + 6, { align: 'center' });
        doc.text(`£${(invoiceData.sale?.subtotal || 0).toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + 12, yPos + 6, { align: 'center' });
        
        // Vertical lines for subtotal
        let subtotalX = tableStartX;
        colWidths.forEach((width, colIndex) => {
          if (colIndex > 0) {
            doc.line(subtotalX, yPos, subtotalX, yPos + rowHeight);
          }
          subtotalX += width;
        });
        
        yPos += rowHeight;
        
        // Notes and Totals Section (Side by Side)
        const notesWidth = tableWidth * 0.6;
        const totalsWidth = tableWidth * 0.4;
        const totalsX = tableStartX + notesWidth;
        
        // Notes section (left side)
        doc.setFillColor(255, 255, 255);
        doc.rect(tableStartX, yPos, notesWidth, 40);
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(136, 136, 136);
        
        if (invoiceData.notes) {
          const noteLines = doc.splitTextToSize(invoiceData.notes, notesWidth - 4);
          doc.text(noteLines, tableStartX + 2, yPos + 8);
        }
        
        // Totals section (right side)
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        
        // VAT
        doc.rect(totalsX, yPos, totalsWidth, 10);
        doc.text("Vat", totalsX + 2, yPos + 7);
        doc.text(`£${(invoiceData.sale?.vat_amount || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 7, { align: 'right' });
        
        // Porterage
        doc.rect(totalsX, yPos + 10, totalsWidth, 10);
        doc.text("Porterage", totalsX + 2, yPos + 17);
        doc.text(`£${(invoiceData.sale?.porterage || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 17, { align: 'right' });
        
        // Total
        doc.setFont("helvetica", "bold");
        doc.rect(totalsX, yPos + 20, totalsWidth, 10);
        doc.text("TOTAL", totalsX + 2, yPos + 27);
        doc.text(`£${((invoiceData.sale?.total_amount || invoiceData.sale?.totalAmount) || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 27, { align: 'right' });
        
        // Payment information
        doc.setFont("helvetica", "normal");
        if (invoiceData.sale?.customer_type === "cash") {
          const paymentMode = invoiceData.sale?.payment_mode || invoiceData.sale?.paymentMode || "cash";
          const displayMode = paymentMode === 'cash' ? 'Cash' : 
                             paymentMode === 'bank' ? 'Card' :
                             paymentMode === 'bank_transfer' ? 'Bank Transfer' :
                             paymentMode === 'cheque' ? 'Cheque' : paymentMode;
          doc.rect(totalsX, yPos + 30, totalsWidth, 10);
          doc.text("PAID", totalsX + 2, yPos + 37);
          doc.text(`${displayMode} £${(invoiceData.sale?.paid_amount || invoiceData.sale?.paidAmount || 0).toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 37, { align: 'right' });
        } else {
          const accountAmount = ((invoiceData.sale?.total_amount || invoiceData.sale?.totalAmount || 0) - (invoiceData.sale?.paid_amount || invoiceData.sale?.paidAmount || 0));
          doc.rect(totalsX, yPos + 30, totalsWidth, 10);
          doc.text("ACCOUNT", totalsX + 2, yPos + 37);
          doc.text(`£${accountAmount.toFixed(2)}`, totalsX + totalsWidth - 2, yPos + 37, { align: 'right' });
        }
        
        // Footer
        yPos += 60;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(68, 68, 68);
        doc.text(`Invoice Time: ${invoiceData.sale?.date ? new Date(invoiceData.sale.date).toLocaleString() : "-"}`, 20, yPos);
        doc.text(`Current Time: ${new Date().toLocaleString()}`, 20, yPos + 10);
        
        // Save the PDF
        doc.save(`invoice-${currentSale.invoiceNumber}.pdf`);
        
        toast({
          title: "PDF Downloaded",
          description: `Invoice ${currentSale.invoiceNumber} has been downloaded as PDF.`,
        });
        
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast({
          title: "Error",
          description: "Failed to generate PDF. Please try again.",
          variant: "destructive",
        });
      }
    } else if (saleItems.length > 0) {
      // For new invoice with items - create a preview PDF
      handleCreatePreviewPdf();
    } else {
      // For empty invoice - show empty template
      handleCreateEmptyPdf();
    }
  };

  // Handler for Excel download
  const handleExcelDownload = () => {
    if (currentSale?.invoiceNumber) {
      // For existing invoice - download actual invoice data as Excel
      handleDownloadInvoiceExcel();
    } else if (saleItems.length > 0) {
      // For new invoice with items - create preview Excel
      handleCreatePreviewExcel();
    } else {
      toast({
        title: "No Data",
        description: "Please add items to the invoice before exporting to Excel.",
        variant: "destructive",
      });
    }
  };

  // Create preview PDF for unsaved invoice
  const handleCreatePreviewPdf = async () => {
    try {
      if (!customerId) {
        toast({
          title: "Missing Customer",
          description: "Please select a customer before generating PDF.",
          variant: "destructive",
        });
        return;
      }

      const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();
      
      // Create preview data structure
      const previewData = {
        customer: selectedCustomer,
        sale: {
          invoiceNumber: 'PREVIEW',
          date: new Date().toISOString(),
          customerType: 'account',
          paymentStatus: 'pending',
          subtotal,
          vatAmount,
          porterage,
          totalAmount,
          vehicleDetails: vehicleDetails || null,
          gateNumber: gateNumber || null,
          notes: notes || null,
        },
        items: saleItems,
      };

      // Send to backend to generate preview PDF using correct backend URL
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const response = await fetch(`${backendUrl}/api/generate-preview-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
        body: JSON.stringify(previewData)
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview PDF');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-preview-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF Generated",
        description: "Preview PDF downloaded successfully.",
      });

    } catch (error) {
      console.error('Error generating preview PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate preview PDF.",
        variant: "destructive",
      });
    }
  };

  // Create empty PDF template
  const handleCreateEmptyPdf = async () => {
    try {
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const response = await fetch(`${backendUrl}/api/generate-empty-invoice-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate empty PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empty-invoice-template.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF Generated",
        description: "Empty invoice template downloaded successfully.",
      });

    } catch (error) {
      console.error('Error generating empty PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate empty PDF template.",
        variant: "destructive",
      });
    }
  };

  // Download existing invoice as Excel
  const handleDownloadInvoiceExcel = async () => {
    try {
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const response = await fetch(`${backendUrl}/api/sales/${currentSale?.invoiceNumber}/excel`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate Excel file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${currentSale?.invoiceNumber}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Excel Downloaded",
        description: `Invoice ${currentSale?.invoiceNumber} exported to Excel successfully.`,
      });

    } catch (error) {
      console.error('Error downloading Excel:', error);
      toast({
        title: "Error",
        description: "Failed to download Excel file.",
        variant: "destructive",
      });
    }
  };

  // Create preview Excel for unsaved invoice
  const handleCreatePreviewExcel = async () => {
    try {
      if (!customerId) {
        toast({
          title: "Missing Customer",
          description: "Please select a customer before exporting to Excel.",
          variant: "destructive",
        });
        return;
      }

      const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();
      
      // Create preview data structure
      const previewData = {
        customer: selectedCustomer,
        sale: {
          invoiceNumber: 'PREVIEW',
          date: new Date().toISOString(),
          customerType: 'account',
          paymentStatus: 'pending',
          subtotal,
          vat_amount: vatAmount,
          porterage,
          total_amount: totalAmount,
          vehicle_details: vehicleDetails || null,
          gate_number: gateNumber || null,
          notes: notes || null,
        },
        items: saleItems,
      };

      // Send to backend to generate preview Excel using correct backend URL
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const response = await fetch(`${backendUrl}/api/generate-preview-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
        body: JSON.stringify(previewData)
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview Excel');
      }

      // Download the Excel file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-preview-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Excel Export",
        description: "Invoice preview exported as Excel file.",
      });

    } catch (error) {
      console.error('Error creating preview Excel:', error);
      toast({
        title: "Error",
        description: "Failed to create preview Excel file.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setTaxDetails({
        withTax: !!settings.withTax,
        taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : '0',
      });
      setPorterageDetails({
        withPorterage: !!settings.withPorterage,
        porterageCharge: settings.porterageCharge ? String(settings.porterageCharge) : '0.00',
      });
      setInvoicePrintFormat(settings.invoicePrintFormat || "A4");
      // Reset applyPorterage to true when settings are loaded
      setApplyPorterage(true);
    });
  }, []);

  // Create refs to hold current state for event handlers
  const stateRef = useRef({
    saleItems,
    customerId,
    vehicleDetails,
    gateNumber,
    notes,
    currentSale
  });

  // Update refs whenever state changes
  useEffect(() => {
    stateRef.current = {
      saleItems,
      customerId,
      vehicleDetails,
      gateNumber,
      notes,
      currentSale
    };
  }, [saleItems, customerId, vehicleDetails, gateNumber, notes, currentSale]);

  // --- AUTO-HOLD INVOICE ON NAVIGATION OR TAB CLOSE OR UNMOUNT ---
  useEffect(() => {
    console.log('🔧 Auto-hold effect initialized');

    // Helper to check if invoice should be held (using refs for current state)
    const shouldAutoHold = () => {
      const state = stateRef.current;
      const hasItems = state.saleItems.length > 0;
      const isUnsaved = !state.currentSale;
      const notSkipped = !skipAutoHoldRef.current;

      console.log('🔍 Auto-hold check:', {
        hasItems,
        isUnsaved,
        notSkipped,
        saleItemsCount: state.saleItems.length,
        currentSale: !!state.currentSale,
        skipAutoHold: skipAutoHoldRef.current
      });

      // Only auto-hold if there are products and invoice is not saved (no currentSale)
      return hasItems && isUnsaved && notSkipped;
    };

    // Function to create invoice data for holding (using current state from refs)
    const createInvoiceData = () => {
      const state = stateRef.current;
      return {
        customerId: state.customerId,
        vehicleDetails: state.vehicleDetails,
        gateNumber: state.gateNumber,
        notes: state.notes,
        saleItems: state.saleItems,
        holdId: Date.now().toString(),
        holdTime: new Date().toISOString(),
      };
    };

    // Function to check for duplicate invoices
    const isDuplicateInvoice = (newInvoice: any, existingInvoices: any[]) => {
      return existingInvoices.some((existingInvoice: any) =>
        existingInvoice.customerId === newInvoice.customerId &&
        existingInvoice.vehicleDetails === newInvoice.vehicleDetails &&
        existingInvoice.gateNumber === newInvoice.gateNumber &&
        existingInvoice.saleItems.length === newInvoice.saleItems.length &&
        existingInvoice.saleItems.every((existingItem: any, index: number) => {
          const newItem = newInvoice.saleItems[index];
          return existingItem.productId === newItem.productId &&
            existingItem.nonProductId === newItem.nonProductId &&
            existingItem.quantity === newItem.quantity &&
            existingItem.unitPrice === newItem.unitPrice;
        })
      );
    };

    // Function to save invoice to held list
    const saveToHeldInvoices = (invoiceData: any) => {
      const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]');

      console.log('💾 Attempting to save to held invoices:', {
        invoiceData,
        existingHeldCount: held.length
      });

      if (!isDuplicateInvoice(invoiceData, held)) {
        held.push(invoiceData);
        localStorage.setItem('heldInvoices', JSON.stringify(held));

        // Update the state as well
        setHeldInvoices(held);

        console.log('✅ Auto-held invoice with', invoiceData.saleItems.length, 'items');
        console.log('📊 Total held invoices now:', held.length);

        // Clear current draft after successful hold
        localStorage.removeItem('currentInvoiceDraft');

        // Show a toast notification
        toast({
          title: "Invoice Auto-Held",
          description: `Invoice with ${invoiceData.saleItems.length} items has been automatically saved.`,
        });

        return true;
      } else {
        console.log('⚠️ Duplicate invoice detected, not auto-holding');
        return false;
      }
    };

    // Main auto-hold function
    const autoHoldInvoice = () => {
      if (!shouldAutoHold()) return false;

      const invoiceData = createInvoiceData();
      return saveToHeldInvoices(invoiceData);
    };

    // Handle browser/tab close with confirmation
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      console.log('🚪 beforeunload event triggered');
      if (shouldAutoHold()) {
        console.log('🚪 Auto-holding invoice before unload');
        // Auto-hold the invoice
        autoHoldInvoice();

        // Show confirmation dialog (browser will show generic message)
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      } else {
        console.log('🚪 No auto-hold needed on beforeunload');
      }
    };

    // Handle visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      console.log('👁️ Visibility change event:', document.hidden ? 'hidden' : 'visible');
      if (document.hidden && shouldAutoHold()) {
        console.log('📱 Tab hidden - auto-holding invoice');
        autoHoldInvoice();
      }
    };

    // Handle page focus loss (additional safety)
    const handleBlur = () => {
      console.log('🔄 Window blur event triggered');
      if (shouldAutoHold()) {
        console.log('🔄 Page lost focus - auto-holding invoice');
        autoHoldInvoice();
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    // Cleanup: auto-hold on unmount (SPA navigation)
    return () => {
      // Remove event listeners
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);

      // Auto-hold on component unmount (use refs for current state)
      const state = stateRef.current;

      console.log('🧹 Cleanup function running - checking auto-hold conditions');
      console.log('🧹 Cleanup state from refs:', {
        saleItemsLength: state.saleItems.length,
        hasCurrentSale: !!state.currentSale,
        skipAutoHold: skipAutoHoldRef.current
      });

      // Only auto-hold if there are products and invoice is not saved
      if (state.saleItems.length > 0 && !state.currentSale && !skipAutoHoldRef.current) {
        // Create invoice data using current state from refs
        const invoiceData = {
          customerId: state.customerId,
          vehicleDetails: state.vehicleDetails,
          gateNumber: state.gateNumber,
          notes: state.notes,
          saleItems: state.saleItems,
          holdId: Date.now().toString(),
          holdTime: new Date().toISOString(),
        };

        const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]');

        if (!isDuplicateInvoice(invoiceData, held)) {
          held.push(invoiceData);
          localStorage.setItem('heldInvoices', JSON.stringify(held));
          console.log('🚀 Auto-held invoice on unmount with', state.saleItems.length, 'items');

          // Show toast notification (this might not show since component is unmounting)
          try {
            toast({
              title: "Invoice Auto-Held",
              description: `Invoice with ${currentSaleItems.length} items has been automatically saved on navigation.`,
            });
          } catch (e) {
            console.log('Toast failed during unmount (expected)');
          }
        } else {
          console.log('🚀 Duplicate detected during unmount, not auto-holding');
        }
      } else {
        console.log('🚀 No auto-hold needed during unmount');
      }
    };
  }, []); // Empty dependency array - event listeners set once, use refs for current state


  if (isCreatingSale) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Creating Invoice...</h2>
          <p className="text-gray-600">Please wait while we process your sale. This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isReadOnly && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Read-Only Mode:</strong> This invoice is locked and cannot be edited. 
                {!canEditInvoice && " Only admin users can edit locked invoices."}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="p-6">
        {/* Header Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900">INVOICE</h1>
                {currentSale && !isReadOnly && canEditInvoice && (
                  <div className="relative">
                    {isEditingDate ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={editableDate ? format(editableDate, 'yyyy-MM-dd') : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEditableDate(parseISO(e.target.value));
                            }
                          }}
                          className="w-40 text-sm h-8"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!editableDate || !currentSale) return;
                            
                            try {
                              const updatedSale = {
                                ...currentSale,
                                date: format(editableDate, 'yyyy-MM-dd'),
                              };
                              
                              await apiRequest(
                                'PATCH',
                                `/api/sales/${currentSale.invoiceNumber}`,
                                { date: format(editableDate, 'yyyy-MM-dd') }
                              );
                              
                              setCurrentSale(updatedSale);
                              setIsEditingDate(false);
                              toast({
                                title: 'Success',
                                description: 'Invoice date updated successfully',
                              });
                            } catch (error) {
                              console.error('Error updating invoice date:', error);
                              toast({
                                title: 'Error',
                                description: 'Failed to update invoice date',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditableDate(currentSale?.date ? parseISO(currentSale.date) : new Date());
                            setIsEditingDate(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-sm text-muted-foreground"
                        onClick={() => setIsEditingDate(true)}
                      >
                        {currentSale?.date ? format(parseISO(currentSale.date), 'PPP') : 'No date'}
                        <Pencil className="ml-2 h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-4">
                  <span>Date: {currentSale?.date ? format(parseISO(currentSale.date), 'PP') : new Date().toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}</span>
                  {/* Print Invoice Button */}
                  {currentSale?.invoiceNumber && (
                    <a
                      href={invoicePrintFormat === 'DOTMATRIX'
                        ? `/print/dot-matrix-invoice/${currentSale.invoiceNumber}`
                        : invoicePrintFormat === 'A5'
                          ? `/print/a5-invoice/${currentSale.invoiceNumber}`
                          : `/print/invoice/${currentSale.invoiceNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="outline" className="ml-2">
                        Print {invoicePrintFormat === 'DOTMATRIX' ? 'Dot Matrix' : invoicePrintFormat === 'A5' ? 'A5' : 'A4'}
                      </Button>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span>Invoice: {currentSale?.invoiceNumber || 'Draft'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Customer type: {customerType}</span>
                  <Badge className="bg-green-600 text-white">{paymentStatus}</Badge>
                </div>
                <div className="flex items-center">
                  <span>Customer Name: </span>
                  <span className="font-semibold ml-1">{customerName}</span>
                  <button
                    type="button"
                    className={`ml-2 flex items-center ${isReadOnly ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:underline'}`}
                    onClick={() => !isReadOnly && setIsEditCustomerOpen(true)}
                    title={isReadOnly ? "Cannot edit in read-only mode" : "Edit Customer"}
                    disabled={isReadOnly}
                  >
                    <Pencil size={16} className="mr-1" />
                    Edit
                  </button>
                </div>
                <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
                  <DialogContent>
                    <DialogTitle>Select Customer</DialogTitle>
                    <div className="relative">
                      <input
                        ref={inputRef}
                        className="w-full border rounded p-2 mt-2"
                        placeholder="Type customer code or name..."
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        onFocus={() => setHighlightedIndex(-1)}
                        onKeyDown={e => {
                          if (!customerOptions.length) return;
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlightedIndex(prev => (prev < customerOptions.length - 1 ? prev + 1 : 0));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : customerOptions.length - 1));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (highlightedIndex >= 0 && highlightedIndex < customerOptions.length) {
                              const c = customerOptions[highlightedIndex];
                              handleCustomerSelect(c.id);
                            }
                          } else if (e.key === "Escape") {
                            setIsEditCustomerOpen(false);
                          }
                        }}
                        autoComplete="off"
                      />
                      {customerOptions.length > 0 && (
                        <div ref={dropdownRef} className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow">
                          {isSearching ? (
                            <div className="p-2 text-gray-500">Searching...</div>
                          ) : (
                            customerOptions.map((c, idx) => (
                              <div
                                key={c.id}
                                className={`p-2 cursor-pointer flex items-center ${highlightedIndex === idx ? "bg-blue-100" : ""}`}
                                onMouseDown={() => handleCustomerSelect(c.id)}
                                onMouseEnter={() => setHighlightedIndex(idx)}
                              >
                                <span className="font-mono text-xs text-gray-600">{c.customer_code}</span>
                                <span className="ml-2">{c.customer_name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                {(currentSale?.vehicleDetails || vehicleDetails) && (
                  <div>
                    <span>Vehicle Details: </span>
                    <span className="font-semibold">{currentSale?.vehicleDetails || vehicleDetails}</span>
                  </div>
                )}
                {(currentSale?.gateNumber || gateNumber) && (
                  <div>
                    <span>Gate Number: </span>
                    <span className="font-semibold">{currentSale?.gateNumber || gateNumber}</span>
                    {isGateNumberFromCustomer && !currentSale && (
                      <span className="text-xs text-gray-500 ml-2">(from customer)</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end">
              <div className="text-right text-sm text-gray-600 mb-2">
                <div>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleHoldInvoice} variant="outline" size="sm" disabled={isReadOnly}>Hold Invoice</Button>

                <Button variant="destructive" size="sm" onClick={handleCloseInvoice} disabled={isReadOnly}>Cancel Ticket</Button>
              </div>
            </div>
          </div>

          {/* Product Type Selection */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="regular"
                name="productType"
                checked={selectedProductType === "regular"}
                onChange={() => setSelectedProductType("regular")}
                disabled={isReadOnly}
              />
              <label htmlFor="regular" className="text-sm">Regular Products</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="non_product"
                name="productType"
                checked={selectedProductType === "non_product"}
                onChange={() => setSelectedProductType("non_product")}
                disabled={isReadOnly}
              />
              <label htmlFor="non_product" className="text-sm">Non-Products</label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePdfDownload}
                disabled={!currentSale && saleItems.length === 0}
              >
                Pdf
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExcelDownload}
                disabled={!currentSale && saleItems.length === 0}
              >
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowOutstanding}>Cust_Outstanding</Button>
              <Button variant="outline" size="sm" onClick={handleCustomerHistory}>Customer History</Button>
            </div>
            {/* Removed More, Payment details, Options, and Search bar as requested */}
          </div>
        </div>

        {/* Products Table */}
        <Card>
          <CardContent className="p-0">
            <div className="relative w-full overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Notes</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                    <TableHead className="text-center">Added By</TableHead>
                    <TableHead className="text-center">Time Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Existing items */}
                  {saleItems.map((item, index) => (
                    editingIndex === index ? (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            className="text-center"
                            placeholder="Notes"
                            value={editItem?.notes ?? item.notes ?? ""}
                            onChange={e => setEditItem({ ...item, notes: e.target.value, createdAt: item.createdAt })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            value={editItem?.quantity ?? item.quantity}
                            onChange={e => setEditItem({ ...item, quantity: parseInt(e.target.value) || 0, createdAt: item.createdAt })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            step="0.01"
                            value={editItem?.unitPrice ?? item.unitPrice}
                            onChange={e => setEditItem({ ...item, unitPrice: parseFloat(e.target.value) || 0, createdAt: item.createdAt })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          £{((editItem?.quantity ?? item.quantity) * (editItem?.unitPrice ?? item.unitPrice)).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" onClick={() => {
                            // Save changes
                            const updatedItems = saleItems.map((it, i) => i === index ? { ...item, ...editItem, totalPrice: (editItem?.quantity ?? item.quantity) * (editItem?.unitPrice ?? item.unitPrice), createdAt: item.createdAt } : it);
                            setSaleItems(updatedItems);
                            setEditingIndex(null);
                            setEditItem(null);
                          }}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingIndex(null);
                            setEditItem(null);
                          }}>Cancel</Button>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.addedBy || "-"}
                        </TableCell>
                        <TableCell className="text-center">{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-center">{item.notes || "-"}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">£{item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{item.totalPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => {
                            setEditingIndex(index);
                            setEditItem(item);
                          }}>Edit</Button>
                          <Button size="sm" variant="destructive" disabled={isReadOnly} onClick={() => {
                            const updatedItems = saleItems.filter((_, i) => i !== index);
                            if (currentSale) {
                              const updatedSalePayload: BackendSalePayload = {
                                invoice_number: currentSale.invoiceNumber,
                                customer_id: currentSale.customerId,
                                customer_type: currentSale.customerType,
                                payment_status: currentSale.paymentStatus,
                                subtotal: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
                                porterage: currentSale.porterage,
                                vat_rate: currentSale.vatRate,
                                vat_amount: currentSale.vatAmount,
                                total_amount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
                                vehicle_details: currentSale.vehicleDetails,
                                gate_number: currentSale.gateNumber,
                                notes: currentSale.notes,
                                status: currentSale.status,
                                date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
                                items: updatedItems.map(item => ({
                                  product_id: item.productId,
                                  non_product_id: item.nonProductId,
                                  quantity: item.quantity,
                                  unit_price: item.unitPrice,
                                  total_price: item.totalPrice,
                                  notes: item.notes,
                                  created_at: item.createdAt,
                                })),
                              };
                              updateSaleMutation.mutate(updatedSalePayload);
                              setSaleItems(updatedItems);
                            } else {
                              setSaleItems(updatedItems);
                            }
                            toast({ title: "Item Removed", description: "Sale item has been removed." });
                          }}>
                            Remove
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.addedBy || "-"}
                        </TableCell>
                        <TableCell className="text-center">{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    )
                  ))}
                  {/* New item entry row */}
                  <TableRow style={{ overflow: "visible" }}>
                    <TableCell style={{ overflow: "visible", position: "relative" }}>
                      <div className="relative">
                        <Input
                          ref={productInputRef}
                          placeholder={`Type to search ${selectedProductType === 'regular' ? 'regular' : 'non'} products...`}
                          value={productSearch}
                          disabled={isReadOnly}
                          onChange={e => {
                            setProductSearch(e.target.value);
                            setShowProductDropdown(true);
                            setSelectedProductId("");
                          }}
                          onFocus={() => setShowProductDropdown(!!productSearch)}
                          onBlur={handleProductBlur}
                          onKeyDown={handleProductKeyDown}
                          autoComplete="off"
                        />
                        {showProductDropdown && productOptions.length > 0 && (
                          <div ref={productDropdownRef} className="absolute z-50 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow">
                            {productOptions.map((p, idx) => (
                              <div
                                key={p.id}
                                className={`p-2 cursor-pointer flex items-center ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                                onMouseDown={() => {
                                  setSelectedProductId(p.id.toString());
                                  setProductSearch(`${p.productCode} - ${p.description}`);
                                  // Remove auto-fill price - let user enter manually
                                  setShowProductDropdown(false);
                                }}
                                onMouseEnter={() => setHighlightedProduct(idx)}
                              >
                                <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                                <span className="ml-2">{p.description}</span>
                                <span className="ml-auto text-xs text-gray-500">Stock: {getCurrentStock(p.id, (p as RegularProduct & { productType: 'regular' | 'non' }).productType)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show current stock below input if a product is selected */}
                        {selectedProductId && (
                          <div className="text-xs text-gray-600 mt-1">Current Stock: {getCurrentStock(Number(selectedProductId), selectedProductType)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-center"
                        placeholder="Add notes (optional)"
                        value={itemNotes}
                        disabled={isReadOnly}
                        onChange={(e) => setItemNotes(e.target.value)}
                        style={{ minWidth: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-center"
                        type="text"
                        placeholder="Qty"
                        value={itemQuantity}
                        disabled={isReadOnly}
                        onChange={(e) => setItemQuantity(e.target.value)}
                        onKeyPress={(e) => {
                          // Allow numbers, decimal point, minus sign, backspace, delete, and arrow keys
                          if (!/[0-9.\-]/.test(e.key) && 
                              e.key !== 'Backspace' && 
                              e.key !== 'Delete' && 
                              !e.key.startsWith('Arrow')) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          // Allow pasting numeric content including negative numbers
                          const paste = e.clipboardData?.getData('text');
                          if (paste && !/^-?\d*\.?\d*$/.test(paste)) {
                            e.preventDefault();
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-center"
                        type="number"
                        step="0.01"
                        value={itemUnitPrice}
                        disabled={isReadOnly}
                        onChange={(e) => setItemUnitPrice(e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      £{(Number(itemQuantity || 0) * Number(itemUnitPrice || 0)).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        disabled={isReadOnly}
                        onClick={() => {
                          handleAddItem();
                        }}
                      >
                        Add
                      </Button>
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Table Summary */}
            <div className="p-4 border-t">
              <div className="flex justify-between text-sm">
                <span>{saleItems.length} Items</span>
                <span></span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Showing {saleItems.length} of {saleItems.length} entries
              </div>
              {/* Pagination (can be removed or simplified if not needed for sales items) */}
              <div className="flex justify-between items-center mt-4">
                <Button variant="outline" size="sm">◀</Button>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
                <Button variant="outline" size="sm">▶</Button>
              </div>
              {/* Add checkboxes below navigation, left side, vertically */}
              <div className="flex flex-col gap-2 mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={printPackingList}
                    onChange={e => setPrintPackingList(e.target.checked)}
                  />
                  Picking Note
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sendToWhatsapp}
                    onChange={e => setSendToWhatsapp(e.target.checked)}
                  />
                  Whatsapp Ticket
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mailInvoice}
                      onChange={e => setMailInvoice(e.target.checked)}
                    />
                    Email Ticket
                  </label>
                  {mailInvoice && (
                    <div className="ml-6 flex flex-col gap-1">
                      <label className="text-xs text-gray-600">Email addresses:</label>
                      <Input
                        placeholder="Enter additional emails (comma separated)"
                        value={additionalEmails}
                        onChange={(e) => setAdditionalEmails(e.target.value)}
                        className="text-xs"
                      />
                      {selectedCustomer?.email && (
                        <div className="text-xs text-gray-500">
                          Customer emails: {selectedCustomer.email}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Print Ticket checkbox removed */}

                {whatsappLoading && <div className="text-blue-600 text-xs">Sending to WhatsApp...</div>}
                {whatsappSuccess && <div className="text-green-600 text-xs">Invoice sent to WhatsApp!</div>}
                {whatsappError && <div className="text-red-600 text-xs">{whatsappError}</div>}

                {/* Save button for new invoices */}
                <div className="flex gap-2">
                  {/* Show Save for new, Update for edit */}
                  {!currentSale && (
                    <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => handleSaveInvoiceWithWhatsapp(mailInvoice, printInvoice)}>
                      Save Ticket
                    </Button>
                  )}
                  {currentSale && (
                    <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => {
                      skipAutoHoldRef.current = true; // Prevent auto-hold on navigation after update
                      // Build update payload and call updateSaleMutation
                      const updatedSalePayload = {
                        invoice_number: currentSale.invoiceNumber,
                        customer_id: parseInt(customerId),
                        customer_type: currentSale.customerType,
                        payment_status: currentSale.paymentStatus,
                        subtotal: saleItems.reduce((sum, item) => sum + item.totalPrice, 0),
                        porterage: currentSale.porterage,
                        vat_rate: currentSale.vatRate,
                        vat_amount: currentSale.vatAmount,
                        total_amount: saleItems.reduce((sum, item) => sum + item.totalPrice, 0),
                        vehicle_details: vehicleDetails || null,
                        gate_number: gateNumber || null,
                        notes: notes || null,
                        status: currentSale.status,
                        date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
                        items: saleItems.map(item => ({
                          product_id: item.productId,
                          non_product_id: item.nonProductId,
                          quantity: item.quantity,
                          unit_price: item.unitPrice,
                          total_price: item.totalPrice,
                          notes: item.notes,
                          created_at: item.createdAt,
                        })),
                      };
                      updateSaleMutation.mutate(updatedSalePayload);
                      setLocation('/data-entry/sales-entry');
                    }}>
                      Update Ticket
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!customerId) {
                        toast({ title: 'Validation Error', description: 'Please select a customer first.', variant: 'destructive' });
                        return;
                      }
                      if (saleItems.length === 0) {
                        toast({ title: 'Add product first', description: 'Please add at least one product before printing.' });
                        return;
                      }
                      
                      if (currentSale) {
                        // In edit/readonly mode, just print the existing invoice
                        const printUrl = invoicePrintFormat === 'DOTMATRIX'
                          ? `/print/dot-matrix-invoice/${currentSale.invoiceNumber}`
                          : invoicePrintFormat === 'A5'
                            ? `/print/a5-invoice/${currentSale.invoiceNumber}`
                            : `/print/invoice/${currentSale.invoiceNumber}`;
                        window.open(printUrl, '_blank');
                      } else {
                        // For new invoices, save and print
                        handleSaveInvoiceWithWhatsapp(mailInvoice, true);
                      }
                    }}
                    disabled={saleItems.length === 0 || isReadOnly}
                  >
                    Print Ticket
                  </Button>
                </div>

                {/* Send to WhatsApp button for existing invoices */}
                {currentSale && sendToWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start bg-green-100 hover:bg-green-200"
                    onClick={async () => {
                      if (selectedCustomer && selectedCustomer.telephone) {
                        setWhatsappLoading(true);
                        setWhatsappError(null);
                        setWhatsappSuccess(false);
                        try {
                          const invoiceUrl = `${window.location.origin}/print/invoice/${currentSale.invoiceNumber}`;
                          const payload = {
                            phoneNumber: selectedCustomer.telephone,
                            invoiceUrl,
                            message: `Your invoice from Tropifruit UK Ltd.`
                          };
                          console.log('[WHATSAPP] Sending existing invoice to:', selectedCustomer.telephone);
                          console.log('[WHATSAPP] Invoice URL:', invoiceUrl);
                          console.log('[WHATSAPP] API request payload:', payload);
                          const resp = await apiRequest("POST", "/api/send/whatsapp-invoice", payload);
                          console.log('[WHATSAPP] API response:', resp);
                          if (resp.messages) {
                            setWhatsappSuccess(true);
                          } else {
                            setWhatsappError('Failed to send WhatsApp message.');
                          }
                        } catch (err: any) {
                          console.error('[WHATSAPP] API error:', err);
                          setWhatsappError('Failed to send WhatsApp message.');
                        }
                        setWhatsappLoading(false);
                      } else {
                        toast({ title: 'No customer phone', description: 'Customer phone number not found.' });
                      }
                    }}
                    disabled={whatsappLoading}
                  >
                    {whatsappLoading ? 'Sending...' : 'Send to WhatsApp'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <div className="mt-6 flex justify-end">
          <Card className="w-96">
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                {porterageDetails.withPorterage && applyPorterage && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span>Porterage ({saleItems.reduce((sum, item) => sum + (item.quantity || 0), 0)} × £{parseFloat(porterageDetails.porterageCharge).toFixed(2)}):</span>
                      <div className="flex items-center gap-2">
                        {isEditingPorterage ? (
                          <>
                            <input
                              type="number"
                              step="0.01"
                              value={customPorterage}
                              onChange={e => setCustomPorterage(e.target.value)}
                              className="border rounded px-2 py-1 w-20 text-right"
                              onBlur={() => {
                                setPorterageDetails(prev => ({ ...prev, porterageCharge: customPorterage }));
                                setIsEditingPorterage(false);
                              }}
                              autoFocus
                            />
                            <button
                              className="text-green-600 hover:text-green-800 text-sm"
                              onClick={() => {
                                setPorterageDetails(prev => ({ ...prev, porterageCharge: customPorterage }));
                                setIsEditingPorterage(false);
                              }}
                              title="Save porterage"
                            >
                              ✓
                            </button>
                          </>
                        ) : (
                          <>
                            <span>£{porterage.toFixed(2)}</span>
                            <button
                              onClick={() => {
                                setCustomPorterage(porterageDetails.porterageCharge);
                                setIsEditingPorterage(true);
                              }}
                              className="text-blue-500 hover:text-blue-700 text-sm"
                              title="Edit porterage"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => {
                                setApplyPorterage(false);
                                toast({ title: "Porterage Removed", description: "Porterage has been removed from this invoice." });
                              }}
                              className="text-red-500 hover:text-red-700 text-sm"
                              title="Remove porterage"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {porterageDetails.withPorterage && !applyPorterage && (
                  <div className="flex justify-between items-center text-gray-500">
                    <span>Porterage:</span>
                    <div className="flex items-center gap-2">
                      <span>£0.00</span>
                      <button
                        onClick={() => {
                          setApplyPorterage(true);
                          toast({ title: "Porterage Re-enabled", description: "Porterage has been re-enabled for this invoice." });
                        }}
                        className="text-blue-500 hover:text-blue-700 text-sm"
                        title="Re-enable porterage"
                      >
                        ↻
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Sub Total:</span>
                  <span>£{subtotal.toFixed(2)}</span>
                </div>
                {taxDetails.withTax && (
                  <div className="flex justify-between">
                    <span>VAT ({taxDetails.taxPercentage}%):</span>
                    <span>£{vatAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total Amt:</span>
                  <span>£{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PaymentDetailsDrawer
        open={isPaymentDrawerOpen}
        onOpenChange={setIsPaymentDrawerOpen}
      />
      <Dialog open={showOutstanding} onOpenChange={setShowOutstanding}>
        <DialogContent className="max-w-xl bg-blue-100">
          <DialogTitle className="text-center font-bold text-lg bg-white rounded-t p-2 mb-4">CUSTOMER QUERY DETAILS</DialogTitle>
          {outstandingLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : outstandingError ? (
            <div className="text-center text-red-500 py-8">{outstandingError}</div>
          ) : outstandingData ? (
            <div className="space-y-2 text-base">
              <div><span className="text-gray-700">Selected Customer :</span> <span className="font-bold">{outstandingData.customer.customer_name}</span></div>
              <div><span className="text-gray-700">Last Payment received :</span> {outstandingData.lastPayment ? <span className="font-bold">£ {outstandingData.lastPayment.amount} <span className="text-xs text-gray-600">on ({format(new Date(outstandingData.lastPayment.paymentDate), 'dd/MM/yyyy')})</span></span> : <span className="text-gray-500">No payment found</span>}</div>
              <div><span className="text-gray-700">Credit Limit :</span> <span className="font-bold">{outstandingData.customer.credit_limit ? `£ ${Number(outstandingData.customer.credit_limit).toLocaleString()}` : <span className="text-blue-700">Pls set credit limit in Customer Table</span>}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-700">Outstanding Payment :</span> <span className="font-bold text-blue-900 text-lg">£ {Number(outstandingData.outstanding).toLocaleString()}</span></div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesInvoice;
