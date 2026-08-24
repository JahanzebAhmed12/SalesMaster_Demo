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
import { getApiUrl } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { formatQuantity, formatPrice } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";
import { useSalesInvalidation } from "@/hooks/useSalesInvalidation";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import type { Sale, RegularProduct, NonProduct, Customer, SaleItem } from "@shared/schema";
import { Highlighter, Lock, Pencil, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { format, parseISO, subDays } from 'date-fns';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import jsPDF from "jspdf";
import logo from "@/public/printlogo.png";
import { generateInvoicePdfBlob, sendInvoicePdfEmail } from "@/lib/invoice-pdf";
import {
  clearLegacyInvoiceDraft,
  migrateLegacyHeldInvoices,
  releaseHeldInvoice,
  saveHeldInvoice,
} from "@/lib/held-invoices";
import type { HeldInvoice } from "@/lib/held-invoices";
import { calculateAvailableStock } from "@/lib/stock-availability";
import {
  acquireInvoiceEditLock,
  InvoiceEditLockConflictError,
  releaseInvoiceEditLock,
} from "@/lib/invoice-edit-lock";
import { getInvoiceEditLockIndicator, type InvoiceEditLockOwner } from "@/lib/invoice-edit-lock-indicator";

interface BackendSalePayload {
  invoice_number: string;
  customer_id: number;
  customer_type: string;
  payment_status: string;
  subtotal: number;
  porterage: number;
  porterage_type: string;
  porterage_rate: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  vehicle_details: string | null;
  gate_number: string | null;
  notes: string | null;
  status: string;
  hold_id?: string | null;
  edit_lock_token?: string | null;
  date?: string | null; // Business date
  items: Array<{
    product_id: number | null;
    non_product_id: number | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    notes: string | null;
    added_by?: string | null;
    highlighted: boolean;
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

// Extend the Sale type to include createdBy and createdByUsername
interface SaleWithUser extends Sale {
  createdBy?: number;
  createdByUsername?: string;
  editLock?: InvoiceEditLockOwner;
}

const normalizeSaleItem = (item: SaleItem): SaleItem => ({
  ...item,
  highlighted: Boolean(item.highlighted),
});

const SalesInvoice = () => {
  const skipAutoHoldRef = useRef(false);
  const initialHoldId = new URLSearchParams(window.location.search).get('heldInvoiceId');
  const activeHoldIdRef = useRef<string | null>(initialHoldId);
  const restoredHoldIdRef = useRef<string | null>(null);
  const generatedHoldIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
  const [locationStr, setLocation] = useLocation();
  const editLockTokenRef = useRef<string | null>(null);
  const editLockSaleIdRef = useRef<number | null>(null);
  const [editLockOwner, setEditLockOwner] = useState<SaleWithUser['editLock']>();
  const [ownsEditLock, setOwnsEditLock] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const { toast } = useToast();
  const releaseActiveEditLock = async () => {
    const saleId = editLockSaleIdRef.current;
    const lockToken = editLockTokenRef.current;
    if (saleId === null || !lockToken) return;

    try {
      await releaseInvoiceEditLock(saleId, lockToken);
    } catch (error) {
      console.warn('[InvoiceLock] Failed to release edit lock:', error);
    } finally {
      editLockSaleIdRef.current = null;
      editLockTokenRef.current = null;
      setEditLockOwner(undefined);
      setOwnsEditLock(false);
    }
  };
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { currentDate: businessDate } = useBusinessDate();
  // Format business date as yyyy-MM-dd for the API — currentDate is a raw ISO string
  const businessDateForApi = businessDate ? businessDate.split('T')[0] : null;
  const { canEditInvoice, isInvoiceLocked, canEditPaymentMode, lockInvoicesEnabled } = useInvoicePermissions();
  const { invalidateAllSalesQueries, invalidateCustomerQueries } = useSalesInvalidation();
  const { broadcastInvoiceCreated, broadcastInvoiceUpdated, notifyInventoryMutation } = useCrossTabSync();
  // const navigate = useNavigate(); // Removed useNavigate

  // Use the latest location from useLocation






  // Log at the top of the component

  // State for current sale and items
  const [currentSale, setCurrentSale] = useState<SaleWithUser | null>(null);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(initialHoldId);
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
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLInputElement>(null);

  // Add this state at the top of your component (with other useState hooks)
  const [printDeliveryNote, setPrintDeliveryNote] = useState(false);
  const [printPackingList, setPrintPackingList] = useState(false);

  const [taxDetails, setTaxDetails] = useState({ withTax: false, taxPercentage: '0' });
  const [porterageDetails, setPorterageDetails] = useState({ withPorterage: false, porterageCharge: '0.00' });
  const [applyPorterage, setApplyPorterage] = useState(true); // Track if porterage should be applied to this invoice
  const [isEditingPorterage, setIsEditingPorterage] = useState(false);
  const [customPorterage, setCustomPorterage] = useState<string>(porterageDetails.porterageCharge);
  const [porterageType, setPorterageType] = useState<'per_unit' | 'fixed'>('per_unit'); // New: porterage calculation type
  const [fixedPorterageAmount, setFixedPorterageAmount] = useState<string>('0.00'); // New: fixed porterage amount
  const [invoiceDataLoaded, setInvoiceDataLoaded] = useState(false);
  const [invoicePrintFormat, setInvoicePrintFormat] = useState("A4");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isEditGateNumberOpen, setIsEditGateNumberOpen] = useState(false);
  const [editGateNumberValue, setEditGateNumberValue] = useState("");
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editableDate, setEditableDate] = useState<Date | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);

  // For new invoices, initialize the displayed date from business date, not calendar date
  useEffect(() => {
    if (!editableDate && businessDateForApi) {
      setEditableDate(parseISO(businessDateForApi));
    }
  }, [businessDateForApi]);
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
        porterage_type: 'per_unit',
        porterage_rate: Number((currentSale as any).porterageRate || 0),
        vat_rate: currentSale.vatRate,
        vat_amount: currentSale.vatAmount,
        total_amount: currentSale.totalAmount,
        vehicle_details: currentSale.vehicleDetails,
        gate_number: currentSale.gateNumber,
        notes: currentSale.notes,
        status: currentSale.status,
        date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
        edit_lock_token: editLockTokenRef.current,
        items: saleItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          added_by: item.addedBy || currentUser?.username || null,
          highlighted: item.highlighted,
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
    const invoiceNumber = params.get("invoiceNumber");
    const customerIdFromUrl = params.get('customerId');
    
    // Only restore draft if we're not loading an existing invoice and not resuming a held invoice
    if (!heldInvoiceIdFromUrl && !invoiceNumber) {
      const draft = localStorage.getItem('currentInvoiceDraft');
      if (draft) {
        try {
          const items = JSON.parse(draft);
          if (Array.isArray(items) && items.length > 0) {
            // Only restore if we have URL parameters indicating we're continuing work
            // or if the user explicitly wants to continue (we could add a confirmation here)
            if (customerIdFromUrl) {
              setSaleItems(items.map(normalizeSaleItem));
              console.log('Restored draft saleItems:', items);
            } else {
              // Clear the draft if we're starting completely fresh
              localStorage.removeItem('currentInvoiceDraft');
              console.log('Cleared stale draft for fresh invoice');
            }
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
      console.log('🔍 Loading existing invoice:', invoiceNumber);
      apiRequest("GET", `/api/sales/${invoiceNumber}`)
        .then(async (data) => {
          const readonlyParam = params.get('readonly') === 'true';
          const canRequestEdit = !readonlyParam && !(lockInvoicesEnabled && !canEditInvoice);
          if (canRequestEdit && data.id && editLockSaleIdRef.current !== data.id) {
            try {
              const lock = await acquireInvoiceEditLock(data.id);
              editLockSaleIdRef.current = data.id;
              editLockTokenRef.current = lock.lockToken;
              setEditLockOwner(lock);
              setOwnsEditLock(true);
            } catch (error) {
              setIsReadOnly(true);
              if (error instanceof InvoiceEditLockConflictError) {
                setEditLockOwner({
                  locked: true,
                  userId: error.conflict.userId,
                  username: error.conflict.username,
                  acquiredAt: error.conflict.acquiredAt,
                  updatedAt: error.conflict.updatedAt,
                });
                const owner = error.conflict.username ? ` Currently being edited by ${error.conflict.username}.` : '';
                toast({
                  title: 'Invoice is already being edited',
                  description: `${error.message}${owner} You can view it in read-only mode.`,
                  variant: 'destructive',
                });
              } else {
                throw error;
              }
            }
          }

          console.log('✅ Invoice loaded successfully:', {
            invoiceNumber: data.invoiceNumber,
            id: data.id,
            customerId: data.customerId,
            status: data.status
          });
          setCurrentSale(data);
          if (data.editLock) {
            setEditLockOwner(data.editLock);
          }
          setSaleItems((data.items || []).map(normalizeSaleItem));
          setCustomerId(data.customerId?.toString() || "");

          // Lock invoice if payment has been made — only admin can edit paid invoices
          const isPaid = data.paymentStatus === 'paid' || data.paymentStatus === 'overpaid';
          if (isPaid && currentUser?.userType !== 'admin') {
            setIsReadOnly(true);
          }
          setVehicleDetails(data.vehicleDetails || "");
          setGateNumber(data.gateNumber || "");
          setNotes(data.notes || "");
          // Set the editable date when loading the sale
          setEditableDate(data.date ? parseISO(data.date) : new Date());

          // Set porterage settings based on stored porterage_type and porterage_rate
          const hasPorterage = data.porterage && data.porterage > 0;
          setApplyPorterage(!!hasPorterage);

          if (hasPorterage) {
            const storedType = data.porterageType || 'per_unit';
            const storedRate = data.porterageRate || 0;
            setPorterageType(storedType);
            if (storedType === 'fixed') {
              setFixedPorterageAmount(storedRate.toFixed(2));
              setPorterageDetails({ withPorterage: true, porterageCharge: '0.00' });
            } else {
              setPorterageDetails({ withPorterage: true, porterageCharge: storedRate.toFixed(4) });
              setFixedPorterageAmount('0.00');
            }
          } else {
            setApplyPorterage(false);
            setPorterageType('per_unit');
            setFixedPorterageAmount('0.00');
          }

          // Set tax details based on loaded invoice data
          const hasVat = data.vatAmount && data.vatAmount > 0;
          if (hasVat) {
            setTaxDetails({
              withTax: true,
              taxPercentage: data.vatRate ? data.vatRate.toString() : '0'
            });
          }

          // Mark that invoice data has been loaded
          setInvoiceDataLoaded(true);
        })
        .catch((error) => {
          console.error('❌ Failed to load invoice:', error);
          toast({
            title: "Error",
            description: "Failed to load invoice. Please try again.",
            variant: "destructive",
          });
        });
    } else {
      console.log('🆕 Creating new invoice (no invoiceNumber in URL)');
    }
  }, [canEditInvoice, lockInvoicesEnabled, toast]);

  // Fetch server time for accurate createdAt timestamps
  useEffect(() => {
    fetch('/api/server-time')
      .then(r => r.json())
      .then(data => setServerTime(data.serverTime))
      .catch(() => setServerTime(new Date().toISOString()));
  }, []);

  useEffect(() => {
    activeHoldIdRef.current = activeHoldId;
  }, [activeHoldId]);

  // Migrate old browser-local holds once, preserving their IDs so the server
  // upsert cannot create duplicate reservations if the request is retried.
  useEffect(() => {
    migrateLegacyHeldInvoices()
      .then((migrated) => {
        if (migrated) {
          queryClient.invalidateQueries({ queryKey: ["heldInvoices"] });
          queryClient.invalidateQueries({ queryKey: ["stockReservations"] });
          notifyInventoryMutation({ source: 'sale' });
        }
      })
      .catch(() => undefined);
  }, [notifyInventoryMutation, queryClient]);

  // Fetch current stock
  const { data: currentStock = [], isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ["currentStock"],
    queryFn: async () => await apiRequest("GET", "/api/stock/current"),
  });

  const { data: heldInvoices = [] } = useQuery<HeldInvoice[]>({
    queryKey: ["heldInvoices"],
    queryFn: () => apiRequest("GET", "/api/held-invoices"),
  });

  const { data: stockReservationData = { reservations: [] } } = useQuery<{
    reservations: Array<{ productId: number; productType: 'regular' | 'non'; quantity: number }>;
  }>({
    queryKey: ["stockReservations", activeHoldId || null],
    queryFn: () => apiRequest("GET", `/api/stock/reservations${activeHoldId ? `?excludeHoldId=${encodeURIComponent(activeHoldId)}` : ""}`),
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
      const zeroStockIds = new Set(
        currentStock
          .filter(s => Number(s.currentStock) === 0)
          .map(s => s.id)
      );
      const invoiceProductIds = new Set(
        saleItems
          .filter(item => item.productId !== null)
          .map(item => item.productId)
      );
      list = (regularProducts || [])
        .map(p => ({ ...p, productType: 'regular' as const }))
        .filter(p => !zeroStockIds.has(p.id) || invoiceProductIds.has(p.id));
    } else {
      list = [
        ...(regularProducts || []).map(p => ({ ...p, productType: 'regular' as const })),
        ...(nonProducts || []).map(p => ({ ...p, productType: 'non' as const }))
      ];
    }
    if (productSearch) {
      const term = productSearch.toLowerCase();
      list = list.filter(
        (p: any) =>
          p.productCode?.toLowerCase().startsWith(term) ||
          p.description?.toLowerCase().startsWith(term)
      );
    }
    setProductOptions(list);
    setHighlightedProduct(-1);
  }, [productSearch, selectedProductType, regularProducts, nonProducts, currentStock, saleItems]);

  // Get actual database stock (without frontend reduction)
  const getActualStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    return item ? (Number(item.currentStock) || 0) : 0;
  };

  // Find current stock for a product with real-time reduction for items in current invoice
  const getCurrentStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    if (!item) return 0;

    // Calculate how much of this product is in the current saleItems list
    const currentInvoiceReservedQuantity = saleItems
      .filter(saleItem => {
        if (type === 'regular') {
          return saleItem.productId === productId;
        } else {
          return saleItem.nonProductId === productId;
        }
      })
      .reduce((sum, saleItem) => sum + (Number(saleItem.quantity) || 0), 0);

    const reservationType = stockType === 'regular' ? 'regular' : 'non';
    const sharedReservedQuantity = (stockReservationData.reservations || [])
      .filter(reservation => reservation.productId === productId && reservation.productType === reservationType)
      .reduce((sum, reservation) => sum + (Number(reservation.quantity) || 0), 0);

    const originalSavedQuantity = (currentSale?.items || [])
      .filter(item => {
        if (type === 'regular') {
          return item.productId === productId;
        } else {
          return item.nonProductId === productId;
        }
      })
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    return calculateAvailableStock({
      rawStock: Number(item.currentStock),
      currentInvoiceQuantity: currentInvoiceReservedQuantity,
      sharedReservedQuantity,
      originalSavedQuantity,
      isEditing: Boolean(currentSale),
    });
  };

  // Keyboard navigation for product dropdown with auto-focus to quantity
  // Helper: get stock for a product regardless of which mode the user is in
  // Searches both regular and non stock to find the actual entry
  const getStockForProduct = (productId: number): number => {
    const item = currentStock.find(s => s.id === productId);
    if (!item) return 0;
    return getCurrentStock(productId, item.productType === 'regular' ? 'regular' : 'non');
  };
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || productOptions.length === 0) {
      // If no dropdown is showing and user presses Enter, move to notes if available, otherwise quantity
      if (e.key === "Enter" && selectedProductId) {
        e.preventDefault();
        // Check if notes column is visible
        const showNotesColumn = editingIndex !== null || saleItems.some(item => item.notes);
        if (showNotesColumn) {
          notesInputRef.current?.focus();
        } else {
          quantityInputRef.current?.focus();
        }
        return;
      }
      return;
    }

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
        // Do NOT override selectedProductType — keep the user's radio button choice
        setProductSearch(`${p.productCode} - ${p.description}`);
        setShowProductDropdown(false);
        // Auto-focus to notes input if available, otherwise quantity
        setTimeout(() => {
          const showNotesColumn = editingIndex !== null || saleItems.some(item => item.notes);
          if (showNotesColumn) {
            notesInputRef.current?.focus();
          } else {
            quantityInputRef.current?.focus();
          }
        }, 100);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  // Keyboard handler for notes input
  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move to quantity input
      quantityInputRef.current?.focus();
    }
  };

  // Keyboard handler for quantity input
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move to price input
      priceInputRef.current?.focus();
    }
  };

  // Keyboard handler for price input
  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Add the item and return focus to product search
      handleAddItem();
    }
  };

  // Scroll highlighted product into view when navigating with keyboard
  useEffect(() => {
    const container = (productDropdownRef.current?.offsetParent ? productDropdownRef.current : null) || mobileDropdownRef.current;
    if (showProductDropdown && highlightedProduct >= 0 && container) {
      const item = container.children[highlightedProduct] as HTMLElement | undefined;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedProduct, showProductDropdown]);

  // Close dropdown on blur (with delay to allow click)
  const handleProductBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowProductDropdown(false), 100);
  };

  // When productId changes, update productSearch only (no auto-fill price)
  useEffect(() => {
    if (!selectedProductId) return;
    // Search both lists regardless of selectedProductType to avoid switching tabs
    const allProducts = [
      ...(regularProducts || []),
      ...(nonProducts || []),
    ];
    const p = allProducts.find((x: any) => x.id.toString() === selectedProductId);
    if (p) {
      setProductSearch(`${p.productCode} - ${p.description}`);
      // Remove auto-fill price - let user enter manually
    }
  }, [selectedProductId, regularProducts, nonProducts]);

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

  // Open gate number edit dialog — pre-fill with current value
  const openEditGateNumber = () => {
    setEditGateNumberValue(currentSale?.gateNumber || gateNumber || "");
    setIsEditGateNumberOpen(true);
  };

  // Save gate number — update local state only; DB persisted when Update Invoice is clicked
  const handleSaveGateNumber = () => {
    setGateNumber(editGateNumberValue);
    setIsGateNumberFromCustomer(false);
    setIsEditGateNumberOpen(false);
  };

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
      // The backend releases the matching hold in the same finalized-sale
      // transaction. Keep draft cleanup for the separate unsaved draft flow.
      clearLegacyInvoiceDraft();
      notifyInventoryMutation({ source: 'sale' });
      console.log("=== CREATE SALE SUCCESS ===");
      console.log("Response:", response);
      console.log("createdBy:", response.createdBy);
      console.log("createdByUsername:", response.createdByUsername);

      // Comprehensive query invalidation for all related data
      const customerId = response.customer_id || response.customerId;

      // Invalidate specific invoice query
      queryClient.invalidateQueries({ queryKey: ["/api/sales", response.invoiceNumber] });

      // Use the centralized invalidation hook
      invalidateAllSalesQueries();

      // Invalidate customer-specific queries
      if (customerId) {
        invalidateCustomerQueries(customerId);
      }

      // Broadcast to other tabs
      broadcastInvoiceCreated({
        invoiceNumber: response.invoiceNumber,
        customerId: customerId
      });

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
      // The backend releases the matching hold in the same finalized-sale
      // transaction. Keep draft cleanup for the separate unsaved draft flow.
      clearLegacyInvoiceDraft();
      notifyInventoryMutation({ source: 'sale' });

      // Comprehensive query invalidation for updates
      queryClient.invalidateQueries({ queryKey: ["/api/sales", data.invoiceNumber] });

      // Use the centralized invalidation hook
      invalidateAllSalesQueries();

      // Invalidate customer-specific queries if available
      const customerId = data.customerId || currentSale?.customerId;
      if (customerId) {
        invalidateCustomerQueries(customerId);
      }

      // Broadcast to other tabs
      broadcastInvoiceUpdated({
        invoiceNumber: data.invoiceNumber,
        customerId: customerId
      });

      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      setCurrentSale(data);
      setSaleItems(data.items || []);
      // Force refresh stock data to show correct levels
      queryClient.refetchQueries({ queryKey: ["currentStock"] });
      // The backend releases the edit lock in the same successful transaction.
      editLockSaleIdRef.current = null;
      editLockTokenRef.current = null;
      setEditLockOwner(undefined);
      setOwnsEditLock(false);

      // Re-check payment lock after update
      const isPaidAfterUpdate = data.paymentStatus === 'paid' || data.paymentStatus === 'overpaid';
      if (isPaidAfterUpdate && currentUser?.userType !== 'admin') {
        setIsReadOnly(true);
      }
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

  // Disable porterage when any item has a negative quantity
  useEffect(() => {
    if (saleItems.some(item => item.quantity < 0)) {
      setApplyPorterage(false);
    }
  }, [saleItems]);

  // Helper to get product name by ID
  const getProductName = (productId: number | null, nonProductId: number | null, type: "regular" | "non_product") => {
    if (type === "regular" && productId) {
      return regularProducts?.find(p => p.id === productId)?.description || 'N/A';
    } else if (type === "non_product" && nonProductId) {
      return nonProducts?.find(p => p.id === nonProductId)?.description || 'N/A';
    }
    return 'N/A';
  };

  const getSignDirection = (items: SaleItem[], excludeIndex?: number): 'positive' | 'negative' | 'none' => {
    const filtered = excludeIndex !== undefined ? items.filter((_, i) => i !== excludeIndex) : items;
    if (filtered.length === 0) return 'none';
    if (filtered.every(item => item.quantity > 0)) return 'positive';
    if (filtered.every(item => item.quantity < 0)) return 'negative';
    return 'none';
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

    if (Number(itemQuantity) === 0) {
      toast({
        title: "Validation Error",
        description: "Quantity cannot be zero.",
        variant: "destructive",
      });
      return;
    }

    const newQty = Number(itemQuantity);
    const existingSign = getSignDirection(saleItems);
    if (existingSign === 'positive' && newQty < 0) {
      toast({ title: "Validation Error", description: "Cannot add a negative quantity when positive quantity items exist.", variant: "destructive" });
      return;
    }
    if (existingSign === 'negative' && newQty > 0) {
      toast({ title: "Validation Error", description: "Cannot add a positive quantity when negative quantity items exist.", variant: "destructive" });
      return;
    }

    const actualStockLevel = getActualStock(parseInt(selectedProductId), selectedProductType);
    const currentStockLevel = getCurrentStock(parseInt(selectedProductId), selectedProductType);

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

    // Block insufficient stock ONLY in regular product mode (non-product mode allows negative stock)
    // Stock validation removed — allow selling regardless of stock level in both modes

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
      highlighted: false,
      id: 0,
      saleId: currentSale?.id || 0,
      createdAt: serverTime || new Date().toISOString(),
      updatedAt: serverTime || new Date().toISOString()
    };
    const updatedItems = [...saleItems, newItem];
    setSaleItems(updatedItems);

    // Save draft items to localStorage for new invoices
    if (!currentSale) {
      localStorage.setItem('currentInvoiceDraft', JSON.stringify(updatedItems));
    }

    // Note: Backend update will happen when user clicks "Update Ticket" button for existing invoices
    // For new invoices, stock will be reduced when the invoice is saved
    // This prevents automatic double updates

    if (currentSale) {
      toast({
        title: "Item Added",
        description: "Item added to invoice. Remember to click 'Update Ticket' to save changes to the database.",
      });
    }
    setSelectedProductId("");
    setItemQuantity("");
    setItemUnitPrice("");
    setItemNotes("");
    setProductSearch("");

    // Focus back to product input field for next item
    setTimeout(() => {
      if (productInputRef.current) {
        productInputRef.current.focus();
        productInputRef.current.select(); // Select all text for easy replacement
      }
    }, 100);
  };

  const toggleItemHighlight = (index: number) => {
    const updatedItems = saleItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, highlighted: !item.highlighted } : item
    ));
    setSaleItems(updatedItems);

    // Keep unsaved invoices and held drafts in sync with the visible editor.
    if (!currentSale) {
      localStorage.setItem('currentInvoiceDraft', JSON.stringify(updatedItems));
    }
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
    console.log('💾 handleSaveInvoice called:', {
      currentSale: currentSale ? { id: currentSale.id, invoiceNumber: currentSale.invoiceNumber } : null,
      isExistingInvoice: !!(currentSale && currentSale.id),
      customerId,
      saleItemsCount: saleItems.length
    });

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

    // Check if this is an existing invoice (update) or new invoice (create)
    if (currentSale && currentSale.id) {
      // This is an existing invoice - use UPDATE logic
      console.log('🔄 Updating existing invoice:', currentSale.invoiceNumber);
      const updatedSalePayload: BackendSalePayload = {
        invoice_number: currentSale.invoiceNumber,
        customer_id: parseInt(customerId),
        customer_type: "account",
        payment_status: currentSale.paymentStatus || "pending",
        subtotal,
        total_amount: totalAmount,
        porterage: porterage,
        porterage_type: porterageType,
        porterage_rate: porterageType === 'fixed'
          ? parseFloat(fixedPorterageAmount) || 0
          : parseFloat(porterageDetails.porterageCharge) || 0,
        vat_rate: taxDetails.withTax ? parseFloat(taxDetails.taxPercentage) : 0,
        vat_amount: vatAmount,
        vehicle_details: vehicleDetails || null,
        gate_number: gateNumber || null,
        notes: notes || null,
        status: "finalized",
        hold_id: activeHoldIdRef.current,
        date: currentSale.date ? format(new Date(currentSale.date), 'yyyy-MM-dd') : undefined, // Preserve original invoice date
        edit_lock_token: editLockTokenRef.current,
        items: saleItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          added_by: item.addedBy || currentUser?.username || null,
          highlighted: item.highlighted,
          created_at: item.createdAt,
        })),
      };

      updateSaleMutation.mutate(updatedSalePayload, {
        onSuccess: (response) => {
          console.log('✅ Invoice updated successfully:', response.invoiceNumber);
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

          if (mailInvoice && response?.invoiceNumber) {
            const extra = additionalEmails.split(',').map(e => e.trim()).filter(Boolean);
            sendInvoicePdfEmail(response.invoiceNumber, extra).catch(() => {});
            setAdditionalEmails('');
          } else if (mailInvoice) {
            setAdditionalEmails('');
          }

          // Handle WhatsApp sending after successful update
          if (sendToWhatsapp && selectedCustomer && selectedCustomer.telephone && response?.invoiceNumber) {
            console.log('[WHATSAPP DEBUG] Invoice updated successfully, now sending to WhatsApp');
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
              message: `Your updated invoice from Tropifruit UK Ltd.`
            };
            console.log('[WHATSAPP] Sending updated invoice to:', selectedCustomer.telephone);
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
        },
        onError: (error) => {
          console.error('❌ Failed to update invoice:', error);
          setIsCreatingSale(false);
        }
      });
    } else {
      // This is a new invoice - use CREATE logic
      console.log('🆕 Creating new invoice');
      const payload: Partial<BackendSalePayload & { mailInvoice?: boolean; emailData?: any }> = {
        customer_id: parseInt(customerId),
        customer_type: "account",
        payment_status: "pending",
        subtotal,
        total_amount: totalAmount,
        porterage: porterage,
        porterage_type: porterageType,
        porterage_rate: porterageType === 'fixed'
          ? parseFloat(fixedPorterageAmount) || 0
          : parseFloat(porterageDetails.porterageCharge) || 0,
        vat_rate: taxDetails.withTax ? parseFloat(taxDetails.taxPercentage) : 0,
        vat_amount: vatAmount,
        vehicle_details: vehicleDetails || null,
        gate_number: gateNumber || null,
        notes: notes || null,
        status: "finalized",
        hold_id: activeHoldIdRef.current,
        date: businessDateForApi, // Add business date to payload (yyyy-MM-dd)
        items: saleItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          added_by: item.addedBy || currentUser?.username || null,
          highlighted: item.highlighted,
          created_at: item.createdAt,
        })),
      };
      
      createSaleMutation.mutate(payload, {
        onSuccess: async (response) => {
          console.log('✅ New invoice created successfully:', response.invoiceNumber);
          if (mailInvoice && response?.invoiceNumber) {
            try {
              const extra = additionalEmails.split(',').map(e => e.trim()).filter(Boolean);
              await sendInvoicePdfEmail(response.invoiceNumber, extra);
            } catch (e: any) {
              toast({ title: "Email Warning", description: e?.error || "Invoice saved but email failed.", variant: "destructive" });
            }
          }
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
        },
        onError: (error) => {
          console.error('❌ Failed to create invoice:', error);
          setIsCreatingSale(false);
        }
      });
    }
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

    // Calculate porterage based on type
    let porterage = 0;
    if (porterageDetails.withPorterage && applyPorterage) {
      if (porterageType === 'fixed') {
        // Fixed amount regardless of quantity
        porterage = parseFloat(fixedPorterageAmount) || 0;
      } else {
        // Per unit calculation (original behavior)
        const totalQuantity = saleItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        porterage = parseFloat(porterageDetails.porterageCharge) * totalQuantity;
      }
    }

    const totalAmount = subtotal + vatAmount + porterage;
    return { subtotal, vatAmount, porterage, totalAmount };
  };

  const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();

  // Add this handler for closing/clearing unsaved invoice
  const handleCloseInvoice = async () => {
    if (window.confirm("Are you sure you want to discard this unsaved invoice?")) {
      skipAutoHoldRef.current = true; // Prevent auto-hold on close
      if (activeHoldIdRef.current) {
        try {
          await releaseHeldInvoice(activeHoldIdRef.current);
          notifyInventoryMutation({ source: 'sale' });
          setActiveHoldId(null);
          activeHoldIdRef.current = null;
        } catch (error: any) {
          toast({
            title: "Error",
            description: error?.message || "Failed to release held invoice.",
            variant: "destructive",
          });
          skipAutoHoldRef.current = false;
          return;
        }
      }
      await releaseActiveEditLock();
      setCurrentSale(null);
      setSaleItems([]);
      setCustomerId("");
      setVehicleDetails("");
      setGateNumber("");
      setNotes("");
      setStatus("draft");
      setApplyPorterage(true); // Reset porterage application
      
      // Clear the draft from localStorage to prevent it from being restored
      localStorage.removeItem('currentInvoiceDraft');
      
      setLocation("/data-entry/sales-entry");
    }
  };

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);

  // Only redirect to sales-entry if the page was loaded with NO URL params
  // (bare refresh of /data-entry/sales-invoice). Navigation from sales-entry
  // always includes ?customerId= or ?heldInvoiceId=.
  useEffect(() => {
    if (heldInvoices.length > 0 && window.location.search === '') {
      setLocation('/data-entry/sales-entry');
    }
  }, [heldInvoices.length, setLocation]);

  // Handle held invoice resumption from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const heldInvoiceIdFromUrl = params.get('heldInvoiceId');
    console.log('Restore effect running, heldInvoiceIdFromUrl:', heldInvoiceIdFromUrl);
    if (
      heldInvoiceIdFromUrl &&
      heldInvoices.length > 0 &&
      restoredHoldIdRef.current !== heldInvoiceIdFromUrl
    ) {
      const invoice = heldInvoices.find(inv => inv.holdId === heldInvoiceIdFromUrl);
      if (invoice) {
        restoredHoldIdRef.current = heldInvoiceIdFromUrl;
        console.log('🔄 Restoring held invoice:', {
          holdId: invoice.holdId,
          hasCurrentSale: !!(invoice as any).currentSale,
          currentSale: (invoice as any).currentSale,
          saleItemsCount: invoice.saleItems.length,
          fullInvoiceData: invoice, // Log the complete invoice data
          invoiceKeys: Object.keys(invoice) // Show all keys in the invoice object
        });
        
        // Keep this hold excluded from its own availability calculation while
        // it is being edited, but continue reserving it for every other client.
        setActiveHoldId(invoice.holdId);

        // Restore basic invoice data
        setCustomerId(String(invoice.customerId || ''));
        setVehicleDetails(invoice.vehicleDetails || "");
        setGateNumber(invoice.gateNumber || "");
        setNotes(invoice.notes || "");
        
        // IMPORTANT: Restore currentSale if it exists (for edited existing invoices)
        if ((invoice as any).currentSale) {
          console.log('✅ Restoring existing invoice context:', (invoice as any).currentSale.invoiceNumber);
          setCurrentSale((invoice as any).currentSale);
          // Set the editable date when restoring existing invoice
          if ((invoice as any).currentSale.date) {
            setEditableDate(parseISO((invoice as any).currentSale.date));
          }
        } else {
          console.log('🆕 No existing invoice context found in held data - this was a new invoice or currentSale was not saved');
          console.log('🔍 Available keys in invoice:', Object.keys(invoice));
          setCurrentSale(null);
        }
        
        if (invoice.saleItems.length > 0) {
          invoice.saleItems.forEach((item, idx) => {
            console.log(`  [restore] Item ${idx}:`, item, Object.keys(item));
          });
        }
        
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
              totalPrice,
              highlighted: Boolean(item.highlighted),
            };
            console.log(`[format immediate] Item ${idx}:`, formatted, Object.keys(formatted));
            return formatted;
          });
          console.log('Setting formatted saleItems:', formattedItems);
          setSaleItems(formattedItems);
        } else {
          setSaleItems(invoice.saleItems.map(normalizeSaleItem));
        }
        const isExistingInvoice = !!(invoice as any).currentSale;
        toast({ 
          title: "Invoice Resumed", 
          description: isExistingInvoice 
            ? `Resumed editing invoice ${(invoice as any).currentSale.invoiceNumber}` 
            : "Held invoice has been loaded successfully." 
        });
      } else if (heldInvoices.length > 0) {
        console.log('❌ Held invoice not found with ID:', heldInvoiceIdFromUrl);
      }
    }
  }, [toast, regularProducts, nonProducts, heldInvoices]);

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
          totalPrice,
          highlighted: Boolean(item.highlighted),
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

  const handleHoldInvoice = async () => {
    // Set skipAutoHoldRef first to prevent auto-hold on navigation
    skipAutoHoldRef.current = true;

    const holdId = activeHoldIdRef.current || generatedHoldIdRef.current;
    console.log('🔄 Manual hold - Saving saleItems to held invoice:', saleItems);
    if (saleItems.length > 0) {
      saleItems.forEach((item, idx) => {
        console.log(`  [manual save] Item ${idx}:`, item, Object.keys(item));
      });
    }

    // Create invoice data with current state - INCLUDE currentSale for existing invoices
    const invoiceData = {
      customerId,
      vehicleDetails,
      gateNumber,
      notes,
      saleItems,
      holdId,
      holdTime: new Date().toISOString(),
      // IMPORTANT: Save currentSale info to preserve existing invoice context
      currentSale: currentSale ? {
        id: currentSale.id,
        invoiceNumber: currentSale.invoiceNumber,
        customerId: currentSale.customerId,
        customerType: currentSale.customerType,
        paymentStatus: currentSale.paymentStatus,
        date: currentSale.date,
        status: currentSale.status,
        subtotal: currentSale.subtotal,
        porterage: currentSale.porterage,
        vatRate: currentSale.vatRate,
        vatAmount: currentSale.vatAmount,
        totalAmount: currentSale.totalAmount
      } : null
    };

    console.log('🔄 Manual hold - Invoice data being saved:', {
      hasCurrentSale: !!currentSale,
      currentSale: currentSale,
      invoiceDataCurrentSale: invoiceData.currentSale
    });

    try {
      await saveHeldInvoice(invoiceData);
      setActiveHoldId(holdId);
      activeHoldIdRef.current = holdId;
      notifyInventoryMutation({ source: 'sale' });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to hold invoice. Please try again.",
        variant: "destructive",
      });
      skipAutoHoldRef.current = false;
      return;
    }

    clearLegacyInvoiceDraft();

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
    skipAutoHoldRef.current = true; // Prevent auto-hold on navigation
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
      skipAutoHoldRef.current = true;
      try {
        toast({
          title: "Generating PDF",
          description: "Please wait while we generate your PDF...",
        });

        // Fetch invoice data
        const invoiceData = await apiRequest("GET", `/api/sales/${currentSale.invoiceNumber}/invoice`);

        // Generate PDF using shared function
        invoiceData.invoiceFooter = invoiceFooter;
        const pdfBlob = generateInvoicePdfBlob(invoiceData);
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${currentSale.invoiceNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);

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
      const response = await fetch(getApiUrl('/api/generate-preview-pdf'), {
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
      const response = await fetch(getApiUrl('/api/generate-empty-invoice-pdf'), {
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
    skipAutoHoldRef.current = true;
    try {
      const response = await fetch(getApiUrl(`/api/sales/${currentSale?.invoiceNumber}/excel`), {
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
      const response = await fetch(getApiUrl('/api/generate-preview-excel'), {
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
    const params = new URLSearchParams(window.location.search);
    const invoiceNumber = params.get("invoiceNumber");

    apiRequest("GET", "/api/settings").then(settings => {
      // Only load settings if invoice data hasn't been loaded yet (for new invoices)
      // or if this is definitely a new invoice (no invoiceNumber)
      if (!invoiceNumber || !invoiceDataLoaded) {
        setTaxDetails({
          withTax: !!settings.withTax,
          taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : '0',
        });

        if (!invoiceNumber) {
          setPorterageDetails({
            withPorterage: !!settings.withPorterage,
            porterageCharge: settings.porterageCharge ? String(settings.porterageCharge) : '0.00',
          });
          setApplyPorterage(true);
          // Default to per_unit for new invoices
          setPorterageType('per_unit');
          setFixedPorterageAmount('0.00');
        }
      }

      setInvoicePrintFormat(settings.invoicePrintFormat || "A4");
      setInvoiceFooter(settings.invoiceFooter || "");
    });
  }, [invoiceDataLoaded]);

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
      const notSkipped = !skipAutoHoldRef.current;

      console.log('🔍 Auto-hold check:', {
        hasItems,
        hasCurrentSale: !!state.currentSale,
        notSkipped,
        saleItemsCount: state.saleItems.length,
        currentSale: state.currentSale ? { id: state.currentSale.id, invoiceNumber: state.currentSale.invoiceNumber } : null,
        skipAutoHold: skipAutoHoldRef.current
      });

      // Auto-hold if there are items and not explicitly skipped
      // This covers both new invoices (no currentSale) and edited existing invoices (has currentSale)
      return hasItems && notSkipped;
    };

    // Function to create invoice data for holding (using current state from refs)
    const createInvoiceData = () => {
      const state = stateRef.current;
      const invoiceData = {
        customerId: state.customerId,
        vehicleDetails: state.vehicleDetails,
        gateNumber: state.gateNumber,
        notes: state.notes,
        saleItems: state.saleItems,
        holdId: activeHoldIdRef.current || generatedHoldIdRef.current,
        holdTime: new Date().toISOString(),
        // IMPORTANT: Save currentSale info to preserve existing invoice context
        currentSale: state.currentSale ? {
          id: state.currentSale.id,
          invoiceNumber: state.currentSale.invoiceNumber,
          customerId: state.currentSale.customerId,
          customerType: state.currentSale.customerType,
          paymentStatus: state.currentSale.paymentStatus,
          date: state.currentSale.date,
          status: state.currentSale.status,
          subtotal: state.currentSale.subtotal,
          porterage: state.currentSale.porterage,
          vatRate: state.currentSale.vatRate,
          vatAmount: state.currentSale.vatAmount,
          totalAmount: state.currentSale.totalAmount
        } : null
      };
      
      console.log('📦 Creating invoice data for holding:', {
        hasCurrentSale: !!state.currentSale,
        currentSale: state.currentSale,
        invoiceDataCurrentSale: invoiceData.currentSale,
        saleItemsCount: state.saleItems.length
      });
      
      return invoiceData;
    };

    // Function to create or renew the server-side reservation. Reusing the
    // same hold ID makes repeated visibility/unmount callbacks harmless.
    const saveToHeldInvoices = async (invoiceData: any, options: { keepalive?: boolean } = {}) => {
      try {
        await saveHeldInvoice(invoiceData, options);
        const holdId = invoiceData.holdId;
        setActiveHoldId(holdId);
        activeHoldIdRef.current = holdId;
        clearLegacyInvoiceDraft();
        notifyInventoryMutation({ source: 'sale' });
        toast({
          title: "Invoice Auto-Held",
          description: `Invoice with ${invoiceData.saleItems.length} items has been automatically saved.`,
        });
        return true;
      } catch (error) {
        console.error('Failed to auto-hold invoice on the server:', error);
        return false;
      }
    };

    // Main auto-hold function
    const autoHoldInvoice = async (options: { keepalive?: boolean } = {}) => {
      if (!shouldAutoHold()) return false;

      const invoiceData = createInvoiceData();
      return saveToHeldInvoices(invoiceData, options);
    };

    // Handle browser/tab close — silently hold, no confirmation popup
    const handleBeforeUnload = () => {
      console.log('🚪 beforeunload event triggered');
      if (shouldAutoHold()) {
        console.log('🚪 Auto-holding invoice before unload');
        void autoHoldInvoice({ keepalive: true });
      } else {
        console.log('🚪 No auto-hold needed on beforeunload');
      }
    };

    // Handle tab switch (browser tab) — auto-hold and redirect to sales entry
    const handleVisibilityChange = () => {
      if (document.hidden && shouldAutoHold()) {
        console.log('👁️ Tab hidden - auto-holding invoice');
        void autoHoldInvoice().then((saved) => {
          if (saved) window.location.href = '/data-entry/sales-entry';
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle browser/tab close
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup: auto-hold on unmount (SPA route navigation away from invoice page)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Auto-hold on component unmount (use refs for current state)
      const state = stateRef.current;

      console.log('🧹 Cleanup function running - checking auto-hold conditions');
      console.log('🧹 Cleanup state from refs:', {
        saleItemsLength: state.saleItems.length,
        hasCurrentSale: !!state.currentSale,
        currentSale: state.currentSale ? { id: state.currentSale.id, invoiceNumber: state.currentSale.invoiceNumber } : null,
        skipAutoHold: skipAutoHoldRef.current
      });

      // Auto-hold if there are items and not explicitly skipped. The helper
      // reads the latest state through stateRef and uses the stable hold ID.
      if (state.saleItems.length > 0 && !skipAutoHoldRef.current) {
        void saveToHeldInvoices(createInvoiceData()).then((saved) => {
          if (saved) {
            setTimeout(() => {
              window.location.href = '/data-entry/sales-entry';
            }, 50);
          }
        });
      } else {
        console.log('🚀 No auto-hold needed during unmount');
      }
    };
  }, []); // Empty dependency array - event listeners set once, use refs for current state

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + P to focus on product search
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        productInputRef.current?.focus();
        productInputRef.current?.select();
      }
      // Escape to clear current inputs and focus on product search
      if (e.key === 'Escape' && !showProductDropdown) {
        e.preventDefault();
        setSelectedProductId("");
        setItemQuantity("");
        setItemUnitPrice("");
        setItemNotes("");
        setProductSearch("");
        productInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showProductDropdown]);

  // Auto-focus product input on component mount
  useEffect(() => {
    if (productInputRef.current && !currentSale) {
      // Only auto-focus for new invoices, not when editing existing ones
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 500); // Small delay to ensure component is fully rendered
    }
  }, [currentSale]);


  const lockIndicator = getInvoiceEditLockIndicator({
    isReadOnly,
    ownsLock: ownsEditLock,
    lockOwner: editLockOwner,
    canEditInvoice,
  });

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
      {currentSale && lockIndicator?.kind === "active" && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
          <div className="flex items-center">
            <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" aria-hidden="true" />
            <div className="ml-3 text-sm text-green-800">
              <strong>{lockIndicator.title}</strong> {lockIndicator.description}
            </div>
          </div>
        </div>
      )}
      {lockIndicator?.kind === "readonly" && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>{lockIndicator.title}</strong> {lockIndicator.description}
              </p>
              {lockIndicator.protectionNote && (
                <p className="mt-1 flex items-center gap-1 text-xs text-yellow-800">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {lockIndicator.protectionNote}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="p-6">
        {/* Header Section */}
        <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm mb-6">
          <div className="flex flex-col lg:flex-row justify-between items-start mb-6 gap-4">
            <div className="w-full lg:w-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <h1 className="text-xl lg:text-2xl font-bold text-gray-900">INVOICE</h1>
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
                          className="w-32 lg:w-40 text-sm h-8"
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
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
                      <Button size="sm" variant="outline" className="text-xs">
                        Print {invoicePrintFormat === 'DOTMATRIX' ? 'Dot Matrix' : invoicePrintFormat === 'A5' ? 'A5' : 'A4'}
                      </Button>
                    </a>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span>Invoice: {currentSale?.invoiceNumber || 'Draft'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>Customer type: {customerType}</span>
                  <Badge className="bg-green-600 text-white w-fit">{paymentStatus}</Badge>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>Customer Name: </span>
                  <span className="font-semibold">{customerName}</span>
                  <button
                    type="button"
                    className={`flex items-center w-fit ${isReadOnly ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:underline'}`}
                    onClick={() => !isReadOnly && setIsEditCustomerOpen(true)}
                    title={isReadOnly ? "Cannot edit in read-only mode" : "Edit Customer"}
                    disabled={isReadOnly}
                  >
                    <Pencil size={14} className="mr-1" />
                    Edit
                  </button>
                </div>
                <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
                  <DialogContent className="w-[95vw] max-w-md">
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
                                <span className="ml-2 text-sm">{c.customer_name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                {(currentSale?.vehicleDetails || vehicleDetails) && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                    <span>Vehicle Details: </span>
                    <span className="font-semibold">{currentSale?.vehicleDetails || vehicleDetails}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span>Gate Number: </span>
                  <span className="font-semibold">{currentSale?.gateNumber || gateNumber || <span className="text-gray-400 italic">None</span>}</span>
                  <button
                    type="button"
                    className={`flex items-center w-fit ${isReadOnly ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:underline'}`}
                    onClick={() => !isReadOnly && openEditGateNumber()}
                    title={isReadOnly ? "Cannot edit in read-only mode" : "Edit Gate Number"}
                    disabled={isReadOnly}
                  >
                    <Pencil size={14} className="mr-1" />
                    Edit
                  </button>
                </div>
                <Dialog open={isEditGateNumberOpen} onOpenChange={setIsEditGateNumberOpen}>
                  <DialogContent className="w-[95vw] max-w-sm">
                    <DialogTitle>Edit Gate Number</DialogTitle>
                    <div className="space-y-4 mt-2">
                      <input
                        className="w-full border rounded p-2"
                        placeholder="Enter gate number..."
                        value={editGateNumberValue}
                        onChange={e => setEditGateNumberValue(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter") handleSaveGateNumber();
                          if (e.key === "Escape") setIsEditGateNumberOpen(false);
                        }}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsEditGateNumberOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveGateNumber}>Save</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex flex-col items-start lg:items-end w-full lg:w-auto">
              <div className="text-left lg:text-right text-sm text-gray-600 mb-2">
                <div className="text-xs lg:text-sm">TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...</div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <Button onClick={handleHoldInvoice} variant="outline" size="sm" disabled={isReadOnly} className="w-full sm:w-auto">
                  Hold Invoice
                </Button>
                <Button variant="destructive" size="sm" onClick={handleCloseInvoice} className="w-full sm:w-auto">
                  Cancel Ticket
                </Button>
              </div>
            </div>
          </div>

          {/* Product Type Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-4">
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
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePdfDownload}
                disabled={!currentSale && saleItems.length === 0}
                className="text-xs"
              >
                Pdf
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExcelDownload}
                disabled={!currentSale && saleItems.length === 0}
                className="text-xs"
              >
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowOutstanding} className="text-xs">
                Cust_Outstanding
              </Button>
              <Button variant="outline" size="sm" onClick={handleCustomerHistory} className="text-xs">
                Customer History
              </Button>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <Card>
          <CardContent className="p-0">
            {/* Mobile Add Product Form */}
            <div className="lg:hidden p-3 border-b bg-gray-50 space-y-2">
              <h3 className="text-sm font-medium">Add Product</h3>
              <Input
                ref={productInputRef}
                placeholder={`Search ${selectedProductType === 'regular' ? 'regular' : 'non'} products...`}
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
                className="w-full"
              />
              {showProductDropdown && productOptions.length > 0 && (
                <div ref={mobileDropdownRef} className="bg-white border rounded w-full max-h-48 overflow-y-auto shadow">
                  {productOptions.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`p-2 cursor-pointer ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                      onMouseDown={() => {
                        setSelectedProductId(p.id.toString());
                        setProductSearch(`${p.productCode} - ${p.description}`);
                        setShowProductDropdown(false);
                        setTimeout(() => { notesInputRef.current?.focus(); }, 100);
                      }}
                      onMouseEnter={() => setHighlightedProduct(idx)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                          <span className="ml-2 text-sm">{p.description}</span>
                        </div>
                        <span className={`text-xs ${getCurrentStock(p.id, (p as any).productType) < 0 ? 'text-red-600 font-semibold' : getCurrentStock(p.id, (p as any).productType) === 0 ? 'text-orange-500' : 'text-gray-500'}`}>
                          Stock: {getCurrentStock(p.id, (p as any).productType)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(editingIndex !== null || saleItems.some(item => item.notes)) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                  <Input ref={notesInputRef} placeholder="Notes" value={itemNotes} disabled={isReadOnly} onChange={e => setItemNotes(e.target.value)} onKeyDown={handleNotesKeyDown} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
                  <Input ref={quantityInputRef} type="text" placeholder="Qty" value={itemQuantity} disabled={isReadOnly} onChange={e => setItemQuantity(e.target.value)} onKeyDown={handleQuantityKeyDown} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                  <Input ref={priceInputRef} type="number" step="0.01" placeholder="Price" value={itemUnitPrice} disabled={isReadOnly} onChange={e => setItemUnitPrice(e.target.value)} onKeyDown={handlePriceKeyDown} />
                </div>
                <div className="flex items-end justify-between gap-2 col-span-2">
                  <span className="text-sm font-medium">£{(Number(itemQuantity || 0) * Number(itemUnitPrice || 0)).toFixed(2)}</span>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={isReadOnly} onClick={handleAddItem}>Add Item</Button>
                </div>
              </div>
            </div>

            {/* Table View */}
            <div className="relative w-full overflow-visible">
              <Table className="[&_th]:h-7 [&_th]:px-2 [&_th]:py-0 [&_td]:p-1 [&_tr]:m-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    {/* Only show Notes column if editing or if any item has notes */}
                    {(editingIndex !== null || saleItems.some(item => item.notes)) && (
                      <TableHead className="text-center">Notes</TableHead>
                    )}
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                    <TableHead className="text-center">Highlight</TableHead>
                    <TableHead className="text-center">Added By</TableHead>
                    <TableHead className="text-center">Time Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Existing items */}
                  {saleItems.map((item, index) => (
                    editingIndex === index ? (
                      <TableRow key={index} className={item.highlighted ? "bg-yellow-100 hover:bg-yellow-100" : undefined}>
                        <TableCell>{item.productName}</TableCell>
                        {/* Only show Notes cell when editing or when notes exist */}
                        {(editingIndex !== null || saleItems.some(item => item.notes)) && (
                          <TableCell className="text-center">
                            <Input
                              className="text-center h-7"
                              placeholder="Notes"
                              value={editItem?.notes ?? item.notes ?? ""}
                              onChange={e => setEditItem((prev: any) => ({ ...prev, notes: e.target.value }))}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <Input
                            className="h-7"
                            type="text"
                            placeholder="Qty"
                            value={editItem?.quantity === undefined ? item.quantity : editItem.quantity}
                            onChange={e => setEditItem((prev: any) => ({ ...prev, quantity: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            className="h-7"
                            type="text"
                            placeholder="Price"
                            value={editItem?.unitPrice === undefined ? item.unitPrice : editItem.unitPrice}
                            onChange={e => setEditItem((prev: any) => ({ ...prev, unitPrice: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          £{(Number(editItem?.quantity ?? item.quantity) * Number(editItem?.unitPrice ?? item.unitPrice)).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" onClick={() => {
                            const editedQty = Number(editItem?.quantity ?? item.quantity);
                            if (editedQty === 0) {
                              toast({ title: "Validation Error", description: "Quantity cannot be zero.", variant: "destructive" });
                              return;
                            }
                            const otherItemsSign = getSignDirection(saleItems, index);
                            if (otherItemsSign === 'positive' && editedQty < 0) {
                              toast({ title: "Validation Error", description: "Cannot set negative quantity when positive quantity items exist.", variant: "destructive" });
                              return;
                            }
                            if (otherItemsSign === 'negative' && editedQty > 0) {
                              toast({ title: "Validation Error", description: "Cannot set positive quantity when negative quantity items exist.", variant: "destructive" });
                              return;
                            }
                            // Save changes locally only - don't auto-update backend
                            const updatedItems = saleItems.map((it, i) => i === index ? { ...item, ...editItem, totalPrice: Number(editItem?.quantity ?? item.quantity) * Number(editItem?.unitPrice ?? item.unitPrice), createdAt: item.createdAt } : it);
                            setSaleItems(updatedItems);

                            // Save draft items to localStorage for new invoices
                            if (!currentSale) {
                              localStorage.setItem('currentInvoiceDraft', JSON.stringify(updatedItems));
                            }

                            // Note: Backend update will happen when user clicks "Update Ticket" button
                            // This prevents automatic double updates

                            setEditingIndex(null);
                            setEditItem(null);

                            // Show a message to remind user to save
                            if (currentSale) {
                              toast({
                                title: "Item Updated",
                                description: "Remember to click 'Update Ticket' to save changes to the database.",
                              });
                            }
                          }}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingIndex(null);
                            setEditItem(null);
                          }}>Cancel</Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={item.highlighted ? "default" : "outline"}
                            className={item.highlighted ? "bg-yellow-400 hover:bg-yellow-500 text-yellow-950" : ""}
                            disabled={isReadOnly}
                            onClick={() => toggleItemHighlight(index)}
                            title={item.highlighted ? "Remove highlight" : "Highlight product row"}
                          >
                            <Highlighter className="mr-1 h-4 w-4" />
                            {item.highlighted ? "Highlighted" : "Highlight"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.addedBy || "-"}
                        </TableCell>
                        <TableCell className="text-center">{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={index} className={item.highlighted ? "bg-yellow-100 hover:bg-yellow-100" : undefined}>
                        <TableCell>{item.productName}</TableCell>
                        {/* Only show Notes cell when editing or when notes exist */}
                        {(editingIndex !== null || saleItems.some(item => item.notes)) && (
                          <TableCell className="text-center text-sm text-gray-600" style={{ wordBreak: 'break-word', whiteSpace: 'normal', maxWidth: '200px' }}>
                            {item.notes || "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-center">{formatQuantity(item.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(item.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(item.totalPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => {
                            setEditingIndex(index);
                            setEditItem(item);
                          }}>Edit</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive" disabled={isReadOnly}>Remove</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove this item? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => {
                                  const updatedItems = saleItems.filter((_, i) => i !== index);
                                  setSaleItems(updatedItems);

                                  if (!currentSale) {
                                    localStorage.setItem('currentInvoiceDraft', JSON.stringify(updatedItems));
                                  }

                                  if (currentSale) {
                                    toast({
                                      title: "Item Removed",
                                      description: "Item removed. Remember to click 'Update Ticket' to save changes to the database."
                                    });
                                  } else {
                                    toast({ title: "Item Removed", description: "Sale item has been removed." });
                                  }
                                }}>Remove</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={item.highlighted ? "default" : "outline"}
                            className={item.highlighted ? "bg-yellow-400 hover:bg-yellow-500 text-yellow-950" : ""}
                            disabled={isReadOnly}
                            onClick={() => toggleItemHighlight(index)}
                            title={item.highlighted ? "Remove highlight" : "Highlight product row"}
                          >
                            <Highlighter className="mr-1 h-4 w-4" />
                            {item.highlighted ? "Highlighted" : "Highlight"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.addedBy || "-"}
                        </TableCell>
                        <TableCell className="text-center">{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    )
                  ))}
                  {/* New item entry row (hidden on mobile, shown on lg+) */}
                  <TableRow className="hidden lg:table-row" style={{ overflow: "visible" }}>
                    <TableCell style={{ overflow: "visible", position: "relative" }}>
                      <div className="relative">
                        <Input
                          ref={productInputRef}
                          className="h-7"
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
                                  // Do NOT override selectedProductType — keep the user's radio button choice
                                  setProductSearch(`${p.productCode} - ${p.description}`);
                                  setShowProductDropdown(false);
                                  // Auto-focus to notes input if available, otherwise quantity
                                  setTimeout(() => {
                                    const showNotesColumn = editingIndex !== null || saleItems.some(item => item.notes);
                                    if (showNotesColumn) {
                                      notesInputRef.current?.focus();
                                    } else {
                                      quantityInputRef.current?.focus();
                                    }
                                  }, 100);
                                }}
                                onMouseEnter={() => setHighlightedProduct(idx)}
                              >
                                <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                                <span className="ml-2">{p.description}</span>
                                {(() => {
                                  const stock = getCurrentStock(p.id, (p as RegularProduct & { productType: 'regular' | 'non' }).productType);
                                  return (
                                    <span className={`ml-auto text-xs ${stock < 0 ? 'text-red-600 font-semibold' : stock === 0 ? 'text-orange-500' : 'text-gray-500'}`}>
                                      Stock: {stock}
                                    </span>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show current stock below input if a product is selected */}
                        {selectedProductId && (() => {
                          const stock = getStockForProduct(Number(selectedProductId));
                          return (
                            <div className={`text-xs mt-1 ${stock < 0 ? 'text-red-600 font-semibold' : stock === 0 ? 'text-orange-500' : 'text-gray-600'}`}>
                              Current Stock: {stock}
                              {stock < 0 && <span className="ml-2 text-red-500">(Negative Stock!)</span>}
                            </div>
                          );
                        })()}
                      </div>
                    </TableCell>
                    {/* Only show Notes input when editing or when notes exist */}
                    {(editingIndex !== null || saleItems.some(item => item.notes)) && (
                      <TableCell>
                        <Input
                          ref={notesInputRef}
                          className="text-center h-7"
                          placeholder="Notes (optional)"
                          value={itemNotes}
                          disabled={isReadOnly}
                          onChange={(e) => setItemNotes(e.target.value)}
                          onKeyDown={handleNotesKeyDown}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        ref={quantityInputRef}
                        className="text-center h-7"
                        type="text"
                        placeholder="Qty"
                        value={itemQuantity}
                        disabled={isReadOnly}
                        onChange={(e) => setItemQuantity(e.target.value)}
                        onKeyDown={handleQuantityKeyDown}
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
                        ref={priceInputRef}
                        className="text-center h-7"
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={itemUnitPrice}
                        disabled={isReadOnly}
                        onChange={(e) => setItemUnitPrice(e.target.value)}
                        onKeyDown={handlePriceKeyDown}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      £{(Number(itemQuantity || 0) * Number(itemUnitPrice || 0)).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 h-7"
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
                  {(() => {
                    const isExistingInvoice = !!(currentSale && currentSale.id);
                    console.log('🔘 Button rendering:', {
                      currentSale: currentSale ? { id: currentSale.id, invoiceNumber: currentSale.invoiceNumber } : null,
                      isExistingInvoice,
                      buttonToShow: isExistingInvoice ? 'Update Invoice' : 'Save Invoice'
                    });
                    return null;
                  })()}
                  {!currentSale && (
                    <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => handleSaveInvoiceWithWhatsapp(mailInvoice, printInvoice)}>
                      Save Invoice
                    </Button>
                  )}
                  {currentSale && (
                    <Button variant="outline" size="sm" disabled={isReadOnly} onClick={() => handleSaveInvoiceWithWhatsapp(mailInvoice, printInvoice)}>
                      Update Invoice
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

                      // Both new and edit mode: save/update first, then print
                      // handleSaveInvoice with printInvoice=true handles opening the print URL
                      // in the onSuccess callback after the save/update completes.
                      handleSaveInvoiceWithWhatsapp(mailInvoice, true);
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
                  <div className="space-y-2">
                    {/* Porterage Type Selection */}
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="porterageType"
                          checked={porterageType === 'per_unit'}
                          onChange={() => setPorterageType('per_unit')}
                          disabled={isReadOnly}
                        />
                        <span>Per Unit</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="porterageType"
                          checked={porterageType === 'fixed'}
                          onChange={() => setPorterageType('fixed')}
                          disabled={isReadOnly}
                        />
                        <span>Fixed Amount</span>
                      </label>
                    </div>

                    {/* Porterage Display and Controls */}
                    <div className="flex justify-between items-center">
                      <span>
                        {porterageType === 'per_unit'
                          ? `Porterage (${formatQuantity(saleItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0))} × £${parseFloat(porterageDetails.porterageCharge).toFixed(2)}):`
                          : `Porterage (Fixed):`
                        }
                      </span>
                      <div className="flex items-center gap-2">
                        {isEditingPorterage ? (
                          <>
                            {porterageType === 'per_unit' ? (
                              <input
                                type="number"
                                step="0.01"
                                value={customPorterage}
                                onChange={e => setCustomPorterage(e.target.value)}
                                className="border rounded px-2 py-1 w-20 text-right"
                                placeholder="Per unit"
                                disabled={isReadOnly}
                                autoFocus
                              />
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={fixedPorterageAmount}
                                onChange={e => setFixedPorterageAmount(e.target.value)}
                                className="border rounded px-2 py-1 w-20 text-right"
                                placeholder="Fixed amount"
                                disabled={isReadOnly}
                                autoFocus
                              />
                            )}
                            <button
                              className="text-green-600 hover:text-green-800 text-sm"
                              onClick={() => {
                                if (porterageType === 'per_unit') {
                                  setPorterageDetails(prev => ({ ...prev, porterageCharge: customPorterage }));
                                }
                                setIsEditingPorterage(false);
                              }}
                              title="Save porterage"
                              disabled={isReadOnly}
                            >
                              ✓
                            </button>
                            <button
                              className="text-gray-500 hover:text-gray-700 text-sm"
                              onClick={() => {
                                setIsEditingPorterage(false);
                                // Reset values
                                setCustomPorterage(porterageDetails.porterageCharge);
                              }}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <span>£{porterage.toFixed(2)}</span>
                            {!isReadOnly && (
                              <>
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
