import React, { useEffect, useState, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  Select,
  MenuItem,
  InputAdornment,
  Chip,
  // OutlinedInput,
  Divider,
  useMediaQuery,
  // Checkbox,
  // ListItemText,
  Pagination,
  CircularProgress
} from "@mui/material";
import AppSidebar from "../AppSidebar";
// Import logo so bundler can resolve the correct public URL
import boodleLogo from '../../assets/logos/boodle-bilao.jpg';
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db, isOnline } from "../../firebase/firebase";
import { useTheme } from "@mui/material/styles";
import Autocomplete from "@mui/material/Autocomplete";
import PaymentIcon from "@mui/icons-material/PointOfSale";
import SearchIcon from "@mui/icons-material/Search";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import PaidIcon from "@mui/icons-material/Paid";
import MoneyOffIcon from "@mui/icons-material/MoneyOff";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
// import GroupIcon from "@mui/icons-material/Group";
// import ScienceIcon from "@mui/icons-material/Science";
// import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { format } from "date-fns";
import { reduceProductStock } from "../services/ServiceManagementPage"; // Import stock reducer
// import { Grid } from "@mui/material";
import { setLocal, queueSync, getAllLocal, isSyncing, onSyncStatus } from "../../utils/offlineSync";

// const VARIETIES = [ ... ]

const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "gcash", label: "GCash" },
  { key: "card", label: "Card" },
  { key: "maya", label: "Maya" }
];

// Service and Employee interfaces removed (not used in this file)

// Add quantity to PaymentRecord for product sales
interface PaymentRecord {
  id?: string;
  customerName: string;
  carName: string;
  plateNumber: string;
  variety: string;
  serviceId: string;
  serviceName: string;
  price: number;
  cashier: string;
  cashierFullName?: string;
  employees: { id: string; name: string; commission: number }[];
  referrer?: { id: string; name: string; commission: number };
  createdAt: number;
  paid?: boolean;
  paymentMethod?: string;
  amountTendered?: number;
  change?: number;
  voided?: boolean;
  serviceIds?: string[];
  serviceNames?: string[];
  manualServices?: { name: string; price: number }[];
  // Add for product sales:
  quantity?: number;
  products?: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
  }[];
  // Sales type (in-store or delivery) and delivery info
  salesType?: "in_store" | "delivery";
  delivery?: {
    fbName?: string;
    contactNumber?: string;
    address?: string;
    time?: string;
    deliveryDate?: string;
  };
  // Delivery extras
  deliveryCharge?: number;
  deliveryLandmark?: string;
  deliveryRemarks?: string;
}

interface PaymentServicesPageProps {
  onLogout?: () => void;
  onProfile?: () => void;
  firstName?: string;
  lastName?: string;
  cashierUsername: string;
}

// Add Product interface
interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  cost: number;
  available?: boolean;
}

const peso = (v: number) => `₱${v.toLocaleString()}`;

interface LoyaltyCustomer {
  id?: string;
  name: string;
  cars: { carName: string; plateNumber: string }[];
}

const PaymentServicesPage: React.FC<PaymentServicesPageProps> = ({
  onLogout,
  onProfile,
  firstName,
  lastName,
  cashierUsername
}) => {
  // Replace services with products for product sales
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" | "info" });
  const snackbarPending = useRef<{ open: boolean; message: string; severity: "success" | "error" | "info" } | null>(null);

  // New: Multi-product sale state
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id?: string; name: string } | null>(null);
  const [customerInput, setCustomerInput] = useState(""); // For manual entry
  const [loyaltyCustomers, setLoyaltyCustomers] = useState<LoyaltyCustomer[]>([]);
  // Sales type and delivery fields
  const [salesType, setSalesType] = useState<"in_store" | "delivery">("in_store");
  const [deliveryFbName, setDeliveryFbName] = useState("");
  const [deliveryContactNumber, setDeliveryContactNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState<number | "">("");
  const [deliveryRemarks, setDeliveryRemarks] = useState("");
  const [deliveryLandmark, setDeliveryLandmark] = useState("");
  const [saleDate, setSaleDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [formPaymentMethod, setFormPaymentMethod] = useState(PAYMENT_METHODS[0].key);
  const [amountTendered, setAmountTendered] = useState<number | "">("");
  const [change, setChange] = useState<number>(0);
  const [payLater, setPayLater] = useState(false);
  const [payingRecordId, setPayingRecordId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [lastPrintedRecord, setLastPrintedRecord] = useState<PaymentRecord | null>(null);

  // Search/filter state
  const [searchCustomer, setSearchCustomer] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "paid" | "unpaid">("");

  // Add filter states
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [serviceFilter, setServiceFilter] = useState<string>("");

  // New: Product selection dialog state
  const [productSelectDialogOpen, setProductSelectDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filtered available products for selection dialog
  const availableProducts = products.filter(
    p =>
      (p.available !== false) &&
      (!productSearch ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(productSearch.toLowerCase())))
  );

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Syncing state
  const [syncing, setSyncing] = useState(isSyncing());

  // Listen for offline sync status and refresh records after sync
  useEffect(() => {
    const handler = (status: "start" | "end") => {
      setSyncing(status === "start");
      if (status === "end" && isOnline()) {
        fetchRecords(true);
      }
    };
    onSyncStatus(handler);
    setSyncing(isSyncing());
    // Listen for browser online event to show sync loading immediately
    const onlineHandler = () => {
      setSyncing(true); // Always show loading immediately when going online
      // Force a re-check of syncing state after a short delay (in case sync is very fast)
      setTimeout(() => setSyncing(isSyncing()), 500);
    };
    window.addEventListener("online", onlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
    };
  }, []);

  // --- NEW: force update to trigger re-render for snackbar and dialog close in offline mode ---
  const [, forceUpdate] = useState(0);

  // --- FIX: Always show snackbar after dialogs close, if one is pending ---
  useEffect(() => {
    if (snackbarPending.current && !addDialogOpen && !processDialogOpen) {
      setSnackbar(snackbarPending.current);
      snackbarPending.current = null;
    }
    // eslint-disable-next-line
  }, [addDialogOpen, processDialogOpen]);

  // --- FIX: Show snackbar and close dialogs immediately in offline mode ---
  useEffect(() => {
    if (snackbar.open && (addDialogOpen || processDialogOpen)) {
      setAddDialogOpen(false);
      setProcessDialogOpen(false);
      // force re-render to ensure dialog closes and snackbar shows
      setTimeout(() => forceUpdate(v => v + 1), 0);
    }
    // eslint-disable-next-line
  }, [snackbar.open]);

  // --- FIX: Always show sync overlay when syncing, even after going online ---
  useEffect(() => {
    const handler = (status: "start" | "end") => {
      setSyncing(status === "start");
      if (status === "end" && isOnline()) {
        fetchRecords(true);
      }
    };
    onSyncStatus(handler);
    setSyncing(isSyncing());
    // Listen for browser online event to show sync loading immediately
    const onlineHandler = () => {
      setSyncing(true); // Always show loading immediately when going online
      setTimeout(() => setSyncing(isSyncing()), 500);
    };
    window.addEventListener("online", onlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
    };
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchRecords();
    fetchLoyaltyCustomers();
  }, []);

  // Fetch loyalty customers from Firestore
  const fetchLoyaltyCustomers = async () => {
    try {
      const snapshot = await getDocs(collection(db, "loyaltyCustomers"));
      setLoyaltyCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LoyaltyCustomer[]);
    } catch (error) {
      setLoyaltyCustomers([]);
    }
  };

  const fetchProducts = async () => {
    const snapshot = await getDocs(collection(db, "products"));
    setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
  };

  // fetchRecords: add clearLocal option to clear offline cache after sync
  const fetchRecords = async (clearLocal = false) => {
    if (isOnline()) {
      const snapshot = await getDocs(collection(db, "payments"));
      const firestoreRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PaymentRecord[];
      setRecords(firestoreRecords);
      if (clearLocal) {
        // Remove all offline records that start with 'offline-'
        const localRecords = await getAllLocal("payments");
        for (const rec of localRecords) {
          if (rec.id && typeof rec.id === "string" && rec.id.startsWith("offline-")) {
            await setLocal("payments", { ...rec, deleted: true }); // Mark as deleted
          }
        }
        // Optionally, actually delete them:
        // for (const rec of localRecords) {
        //   if (rec.id && typeof rec.id === "string" && rec.id.startsWith("offline-")) {
        //     await deleteLocal("payments", rec.id);
        //   }
        // }
      }
    } else {
      let localRecords = await getAllLocal("payments");
      // Filter out deleted/cleared records
      localRecords = localRecords.filter((rec: any) => !rec.deleted);
      setRecords(localRecords as PaymentRecord[]);
    }
  };

  // Calculate total price for all selected products
  const calcTotalPrice = () => {
    const productsTotal = selectedProducts.reduce((sum, sp) => {
      const product = products.find(p => p.id === sp.productId);
      return sum + (product ? product.price * sp.quantity : 0);
    }, 0);
    const dc = salesType === "delivery" ? (typeof deliveryCharge === "number" ? deliveryCharge : 0) : 0;
    return productsTotal + dc;
  };

  // Validate delivery fields
  const isDeliveryValid = () => {
    if (salesType !== "delivery") return true;
    return Boolean(deliveryFbName.trim() && deliveryContactNumber.trim() && deliveryAddress.trim() && deliveryTime.trim());
  };

  // Update change when amountTendered or total price changes
  useEffect(() => {
    // Compute total inline (same logic as calcTotalPrice) to avoid missing hook dependency
    const productsTotal = selectedProducts.reduce((sum, sp) => {
      const product = products.find(p => p.id === sp.productId);
      return sum + (product ? product.price * sp.quantity : 0);
    }, 0);
    const dc = salesType === "delivery" ? (typeof deliveryCharge === "number" ? deliveryCharge : 0) : 0;
    const total = productsTotal + dc;
    if (typeof amountTendered === "number" && !isNaN(amountTendered)) {
      setChange(amountTendered - total);
    } else {
      setChange(0);
    }
  }, [amountTendered, selectedProducts, products, salesType, deliveryCharge]);

  // Helper to render a simple receipt HTML (sized for ~80mm thermal receipt)
  const renderReceiptHtml = (r: PaymentRecord) => {
    // Helper to compute continuous order number starting at 1
    const getOrderNumber = (rec: PaymentRecord) => {
      try {
        const all = Array.isArray(records) ? records.slice() : [];
        // include current record if not present
        if (!all.some(a => a.id && rec.id && a.id === rec.id)) {
          all.push(rec as PaymentRecord);
        }
        all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        // prefer exact id match
        if (rec.id) {
          const idx = all.findIndex(x => x.id === rec.id);
          if (idx !== -1) return idx + 1;
        }
        // fallback: match by createdAt and price
        const idx2 = all.findIndex(x => (x.createdAt || 0) === (rec.createdAt || 0) && (x.price || 0) === (rec.price || 0));
        if (idx2 !== -1) return idx2 + 1;
        // ultimate fallback: count records with createdAt <= this
        return all.filter(x => (x.createdAt || 0) <= (rec.createdAt || 0)).length || 1;
      } catch {
        return 1;
      }
    };
  // Receipt header updated per request
  const storeName = 'Boodle Bilao Food Hub';
  const branch = 'Imus Branch';
  const addressLine = '#16 Anabu Road, Anabu 2-E,';
  const cityLine = 'Imus City, Cavite 4103';
  // Logo path: use imported asset so bundler resolves correct URL
  const logoPath = boodleLogo;
    // Format createdAt: date as MM/DD/YYYY (Asia/Manila)
    let dateStr = '';
    try {
      const created = r.createdAt ? new Date(r.createdAt) : new Date();
      dateStr = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).format(created);
    } catch {
      dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
    }
    const items = Array.isArray(r.products) ? r.products : [];
    const paymentMethod = PAYMENT_METHODS.find(m => m.key === r.paymentMethod)?.label || r.paymentMethod || "-";
  const formatMoney = (v: number) => `Php${v.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  const amountTenderedStr = typeof r.amountTendered === 'number' ? formatMoney(r.amountTendered) : '-';
  const changeStr = typeof r.change === 'number' ? formatMoney(r.change) : '-';
  const deliveryChargeValue = typeof r.deliveryCharge === 'number' ? r.deliveryCharge : 0;
    const deliveryInfo = r.salesType === 'delivery' && r.delivery ? r.delivery : null;
    const htmlItems = items.map(it => `
      <tr>
        <td style="padding:4px 0">${it.productName}</td>
        <td style="padding:4px 0" align="right">${it.quantity} x Php${it.price.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td style="padding:4px 0" align="right">Php${(it.price * it.quantity).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      </tr>
    `).join('\n');

    // Ticket #: BBFH001 continuous
    const orderNumber = getOrderNumber(r);
    const ticketNum = `BBFH${String(orderNumber).padStart(3, '0')}`;

    // Font size adjustment
    const fontSize = 14;

    // Show client name if delivery
    const clientNameLine = r.salesType === 'delivery' && r.customerName ? `<div class="center" style="font-size:${fontSize}px"><b>Client: ${r.customerName}</b></div>` : '';

    // Extra fields after address (moved)
    const extraFields = `<div style="font-size:${fontSize}px;text-align:left;margin-top:4px;">
      DP:<br />
      BAL:<br />
      FREE DC:<br />
      RIDER'S NAME:<br />
    </div>`;

    return `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt</title>
        <style>
          body { font-family: monospace; width: 300px; margin: 0; padding: 6px; font-size: ${fontSize}px; line-height: 1.15; }
          .center { text-align: center; }
          .small { font-size: ${fontSize-2}px; }
          .muted { color: #444; }
          table { width: 100%; border-collapse: collapse; font-size: ${fontSize-2}px; }
          td { vertical-align: top; padding: 2px 0; }
          .right { text-align: right; }
          .total { font-weight: 700; font-size: ${fontSize+2}px; }
          hr { border: none; border-top: 1px dashed #444; margin: 6px 0; }
          img.logo { display:block; margin:0 auto 6px auto; max-width:64px; max-height:64px; }
          .label { font-weight:700; }
        </style>
      </head>
      <body>
        <img src="${logoPath}" class="logo" alt="Logo" />
        <div class="center"><b>${storeName}</b></div>
        <div class="center small">${branch}</div>
  <div class="center small">${addressLine}</div>
    <div class="center small">${cityLine}</div>
        <div style="height:6px"></div>
        <div style="display:flex;justify-content:space-between"><div>Order #: ${orderNumber}</div><div>${r.salesType === 'delivery' ? 'Delivery' : ''}</div></div>
        <div style="display:flex;justify-content:space-between"><div>Transact #: ${ticketNum}</div><div>${dateStr}</div></div>
        <hr />
        <table>
          ${htmlItems}
          ${deliveryChargeValue > 0 ? `
            <tr>
              <td style="padding:4px 0">Delivery Charge</td>
              <td style="padding:4px 0" align="right">&nbsp;</td>
              <td style="padding:4px 0" align="right">${formatMoney(deliveryChargeValue)}</td>
            </tr>
          ` : ''}
        </table>
        <hr />
        <div style="display:flex;justify-content:space-between"><div class="total">TOTAL:</div><div class="total">${formatMoney((r.price || 0))}</div></div>
        <div style="display:flex;justify-content:space-between" class="small"><div>Payment</div><div>${paymentMethod}</div></div>
        <div style="display:flex;justify-content:space-between" class="small"><div>Amount Tendered</div><div>${amountTenderedStr}</div></div>
        <div style="display:flex;justify-content:space-between" class="small"><div>Change</div><div>${changeStr}</div></div>
        ${deliveryInfo ? `
          <hr />
          ${clientNameLine}
          <div class="small"><span class="label">FB Name:</span> ${deliveryInfo.fbName || '-'}</div>
          <div class="small"><span class="label">Contact:</span> ${deliveryInfo.contactNumber || '-'}</div>
          <div class="small"><span class="label">Address:</span> ${deliveryInfo.address || '-'}</div>
          ${extraFields}
          <div class="small"><span class="label">Delivery Time:</span> ${formatDeliveryTime(deliveryInfo.time)}</div>
          ${deliveryInfo.deliveryDate ? `<div class="small"><span class="label">Delivery Date:</span> ${deliveryInfo.deliveryDate}</div>` : ''}
        ` : ''}
        <hr />
        <div class="center small muted">THIS IS NOT AN OFFICIAL RECEIPT</div>
        <div style="height:8px"></div>
        <script>
          // Auto-cut: try to trigger cut if supported
          window.onload = function() {
            if (window.matchMedia('print').matches) {
              setTimeout(function(){window.close();}, 1000);
            }
          };
        </script>
      </body>
      </html>`;
  };

  // Print helper: opens a new window with receipt HTML sized for thermal receipt and triggers print
  const handlePrintRecord = (r: PaymentRecord | null) => {
    if (!r) return;
    try {
      const html = renderReceiptHtml(r);
      const w = window.open('', '_blank', 'width=360,height=640');
      if (!w) {
        setSnackbar({ open: true, message: 'Failed to open print window (popup blocked).', severity: 'error' });
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      // Give the window a moment to layout before print
      setTimeout(() => {
        try { w.print(); } catch (e) { /* ignore */ }
      }, 500);
    } catch (e) {
      console.error('[Payments] print error', e);
      setSnackbar({ open: true, message: 'Failed to print receipt', severity: 'error' });
    }
  };

  // Add or update a product in the selectedProducts array
  const handleProductSelect = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev.some(p => p.productId === productId)) return prev;
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const handleProductQuantityChange = (productId: string, quantity: number) => {
    setSelectedProducts(prev =>
      prev.map(p => p.productId === productId ? { ...p, quantity: Math.max(1, quantity) } : p)
    );
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.productId !== productId));
  };

  // Open process payment dialog
  const handleProcessPayment = () => {
    setProcessDialogOpen(true);
    setAmountTendered(calcTotalPrice());
    setPayLater(false);
    setPayingRecordId(null);
  };

  // Add this helper to extract products from a PaymentRecord (for unpaid records)
  function getProductsFromRecord(record: PaymentRecord): { productId: string; quantity: number }[] {
    if (Array.isArray(record.products) && record.products.length > 0) {
      return record.products.map(p => ({
        productId: p.productId,
        quantity: p.quantity,
      }));
    }
    // Fallback for legacy single-product records
    if (record.serviceId) {
      return [{ productId: record.serviceId, quantity: record.quantity || 1 }];
    }
    return [];
  }

  // Safely read delivery fields (delivery may be an object or a JSON string in some records)
  function getDeliveryField(record: PaymentRecord, key: keyof NonNullable<PaymentRecord['delivery']>) {
    const d: any = (record && (record as any).delivery) || null;
    if (!d) return "-";
    if (typeof d === "string") {
      try {
        const parsed = JSON.parse(d);
        return parsed?.[key] ?? "-";
      } catch {
        return d || "-";
      }
    }
    return d[key] ?? "-";
  }

  // Safely format timestamp or date string to a readable local string, fallback to '-' when invalid
  function safeDateTime(value: any) {
    if (!value && value !== 0) return '-';
    try {
      const d = value instanceof Date ? value : (typeof value === 'number' ? new Date(value) : new Date(String(value)));
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString();
    } catch {
      return '-';
    }
  }

  // Format delivery time into PH local time (Asia/Manila) with AM/PM.
  // Accepts time in forms: 'HH:mm', ISO string, numeric timestamp, or Date.
  function formatDeliveryTime(value: any) {
    if (!value || value === "-") return "-";
    // If it's already a Date
    let date: Date | null = null;
    if (value instanceof Date) date = value;
    if (typeof value === "number") date = new Date(value);
    if (typeof value === "string") {
      // time-only like '13:30' -> convert to 12-hour string without timezone adjustment
      if (/^\d{1,2}:\d{2}$/.test(value)) {
        const [hhStr, mmStr] = value.split(":");
        const hh = Number(hhStr);
        const mm = Number(mmStr);
        if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
          const suffix = hh >= 12 ? "PM" : "AM";
          const displayHour = ((hh + 11) % 12) + 1;
          return `${displayHour}:${mm.toString().padStart(2, "0")} ${suffix}`;
        }
      }
      // try parsing ISO or full datetime
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) date = new Date(parsed);
    }
    if (!date) return String(value);
    try {
      const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
      return fmt.format(date);
    } catch {
      // fallback: format using local timezone
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
  }

  // Safely format delivery date (MM/DD/YYYY) or return '-' when invalid
  function formatDeliveryDate(value: any) {
    if (!value || value === "-") return "-";
    let date: Date | null = null;
    if (value instanceof Date) date = value;
    if (typeof value === "number") date = new Date(value);
    if (typeof value === "string") {
      // Accept 'YYYY-MM-DD' and other ISO formats
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) date = new Date(parsed);
      else {
        // Try adding time to date-only strings
        const isoTry = value + 'T00:00:00';
        const parsed2 = Date.parse(isoTry);
        if (!Number.isNaN(parsed2)) date = new Date(parsed2);
      }
    }
    if (!date) return "-";
    try {
      return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  // Save payment (multi-product, single transaction)
  const handleAddPayment = async () => {
    try {
      // If processing an unpaid record, update the existing record
      let productsForSale = selectedProducts;
      if ((!productsForSale || productsForSale.length === 0) && payingRecordId && selectedRecord) {
        productsForSale = getProductsFromRecord(selectedRecord);
      }
      // If no customer name, store as "N/A"
      let customerName = selectedCustomer?.name || customerInput.trim() || (selectedRecord?.customerName ?? "");
      if (!customerName) customerName = "N/A";
      if (!productsForSale || productsForSale.length === 0) {
        setSnackbar({ open: true, message: "Please select at least one product.", severity: "error" });
        return;
      }
      const productsDetails = productsForSale.map(sp => {
        const product = products.find(p => p.id === sp.productId);
        return {
          productId: product?.id || "",
          productName: product?.name || "",
          price: product?.price || 0,
          quantity: sp.quantity
        };
      });
  const productsTotal = productsDetails.reduce((sum, p) => sum + (p.price * p.quantity), 0);
  const dc = salesType === "delivery" ? (typeof deliveryCharge === "number" ? deliveryCharge : 0) : 0;
  const totalPrice = productsTotal + dc;

      let cashier = cashierUsername;
      let cashierFullName = [firstName, lastName].filter(Boolean).join(" ");
      try {
        const userInfoStr = localStorage.getItem("userInfo");
        if (userInfoStr) {
          const userInfo = JSON.parse(userInfoStr);
          if (userInfo.username) cashier = userInfo.username;
          if (userInfo.firstName || userInfo.lastName) {
            cashierFullName = [userInfo.firstName, userInfo.lastName].filter(Boolean).join(" ");
          }
        }
      } catch { /* fallback to props */ }

  if (payingRecordId && selectedRecord) {
        // Build delivery payload cleaned
        const deliveryRaw = salesType === "delivery" ? {
          fbName: deliveryFbName,
          contactNumber: deliveryContactNumber,
          address: deliveryAddress,
          time: deliveryTime,
          deliveryDate: deliveryDate || undefined,
        } : undefined;
        const deliveryClean = deliveryRaw ? JSON.parse(JSON.stringify(deliveryRaw)) : undefined;

        const updatePayload: any = {
          id: payingRecordId,
          paid: true,
          paymentMethod: formPaymentMethod,
          amountTendered: typeof amountTendered === "number" ? amountTendered : undefined,
          change: typeof amountTendered === "number" ? amountTendered - totalPrice : undefined,
          cashier,
          cashierFullName,
          // Persist price including delivery charge so receipts show correct TOTAL
          price: totalPrice,
          products: productsDetails,
          customerName,
          salesType,
          deliveryCharge: salesType === "delivery" ? (typeof deliveryCharge === "number" ? deliveryCharge : undefined) : undefined,
          deliveryLandmark: salesType === "delivery" ? (deliveryLandmark || undefined) : undefined,
          deliveryRemarks: salesType === "delivery" ? (deliveryRemarks || undefined) : undefined,
          createdAt: saleDate ? new Date(`${saleDate}T00:00:00`).getTime() : selectedRecord.createdAt, // use saleDate if provided
        };
  if (deliveryClean !== undefined) updatePayload.delivery = deliveryClean;

        // Clean payload to remove undefined
        const finalUpdate = JSON.parse(JSON.stringify(updatePayload));

        if (isOnline()) {
          // Online: update directly in Firestore
          await updateDoc(doc(db, "payments", payingRecordId), finalUpdate);

          // Reduce stock for each product sold
          for (const prod of productsDetails) {
            if (prod.productId && prod.quantity > 0) {
              await reduceProductStock(prod.productId, prod.quantity);
            }
          }

          snackbarPending.current = { open: true, message: "Payment recorded!", severity: "success" };
          // Show receipt modal and allow printing for updated record
          setLastPrintedRecord({ ...selectedRecord, ...finalUpdate });
          setReceiptModalOpen(true);
        } else {
          // Offline: either update the existing offline 'add' entry, or queue an 'update' for a real Firestore id
          try {
            if (String(payingRecordId).startsWith("offline-")) {
              // Update local offline record and replace queued 'add' entry with updated object
              const offlineRecord = { ...selectedRecord, ...finalUpdate };
              // Ensure id remains the offline id
              offlineRecord.id = payingRecordId;
              const offlineClean = JSON.parse(JSON.stringify(offlineRecord));
              await setLocal("payments", offlineClean);
              // Replace queued 'add' (idb.put will overwrite by key)
              await queueSync("add", "payments", offlineClean);

              // Show receipt modal and snackbar
              setLastPrintedRecord(offlineClean as PaymentRecord);
              setReceiptModalOpen(true);
              setSnackbar({ open: true, message: "Payment recorded offline. It will be synced when you are online.", severity: "info" });
            } else {
              // The record has a real Firestore id but we're offline: queue an update
              const updateObj = { ...finalUpdate };
              // queueSync will put an entry keyed by 'payments:<id>' with action 'update'
              await queueSync("update", "payments", updateObj);
              // Also update local cache for immediate UI
              const localCopy = { ...selectedRecord, ...finalUpdate };
              await setLocal("payments", JSON.parse(JSON.stringify(localCopy)));

              setLastPrintedRecord(localCopy as PaymentRecord);
              setReceiptModalOpen(true);
              setSnackbar({ open: true, message: "Payment queued and will sync when online.", severity: "info" });
            }
          } catch (err) {
            console.error('[Payments] offline update error', err);
            setSnackbar({ open: true, message: 'Failed to queue offline payment update.', severity: 'error' });
            return;
          }
        }
    
  } else {
        // Create new record (normal flow)
  // Use saleDate (YYYY-MM-DD) if provided, otherwise now
  const now = saleDate ? new Date(`${saleDate}T00:00:00`).getTime() : Date.now();
        // Remove the id field from the record when adding online!
        const record: PaymentRecord = {
          customerName,
          carName: "",
          plateNumber: "",
          variety: "",
          serviceId: "",
          serviceName: "",
          // Persist price including delivery charge
          price: totalPrice,
          cashier,
          cashierFullName,
          employees: [],
          createdAt: now,
          paid: !payLater,
          ...(payLater ? {} : {
            paymentMethod: formPaymentMethod,
            amountTendered: typeof amountTendered === "number" ? amountTendered : undefined,
            change: typeof amountTendered === "number" ? amountTendered - totalPrice : undefined
          }),
          products: productsDetails,
          salesType,
          delivery: salesType === "delivery" ? {
            fbName: deliveryFbName,
            contactNumber: deliveryContactNumber,
            address: deliveryAddress,
            time: deliveryTime,
            deliveryDate: deliveryDate || undefined,
          } : undefined,
          deliveryCharge: salesType === "delivery" ? (typeof deliveryCharge === "number" ? deliveryCharge : undefined) : undefined,
          deliveryLandmark: salesType === "delivery" ? (deliveryLandmark || undefined) : undefined,
          deliveryRemarks: salesType === "delivery" ? (deliveryRemarks || undefined) : undefined,
          // id: isOnline() ? undefined : `offline-${now}-${Math.floor(Math.random() * 100000)}` // <-- REMOVE id for online
        };

        if (isOnline()) {
          console.debug("[Payments] Adding record online", { record, payLater });
          // Clean record (remove undefined) before sending to Firestore
          const finalRecord = JSON.parse(JSON.stringify(record));
          await addDoc(collection(db, "payments"), finalRecord);
          snackbarPending.current = { open: true, message: payLater ? "Products recorded as unpaid." : "Payment recorded!", severity: "success" };
          // Show receipt modal for newly added record
          setLastPrintedRecord(finalRecord as PaymentRecord);
          setReceiptModalOpen(true);
        } else {
          console.debug("[Payments] Offline - queuing record", { record });
          // For offline, add id field and clean it before storing/queueing
          const offlineRecord = { ...record, id: `offline-${now}-${Math.floor(Math.random() * 100000)}` };
          const offlineRecordClean = JSON.parse(JSON.stringify(offlineRecord));
          await setLocal("payments", offlineRecordClean);
          await queueSync("add", "payments", offlineRecordClean);
          // Show receipt modal for offline record
          setLastPrintedRecord(offlineRecordClean as PaymentRecord);
          setReceiptModalOpen(true);
          // IMMEDIATELY show snackbar and close dialogs in offline mode
          setSnackbar({
            open: true,
            message: "Sale added offline. It will be synced when you are online.",
            severity: "info"
          });
          setAddDialogOpen(false);
          setProcessDialogOpen(false);
          setPayLater(false);
          setPayingRecordId(null);
          setSelectedProducts([]);
          setSelectedCustomer(null);
          setCustomerInput("");
          // reset delivery fields
          setSalesType("in_store");
          setDeliveryFbName("");
          setDeliveryContactNumber("");
          setDeliveryAddress("");
          setDeliveryTime("");
          setFormPaymentMethod(PAYMENT_METHODS[0].key);
          setAmountTendered("");
          setChange(0);
          fetchRecords();
          setTimeout(() => forceUpdate(v => v + 1), 0);
          return;
        }

        // Reduce stock for each product sold (only online, or optionally offline if you have offline stock logic)
        if (isOnline()) {
          for (const prod of productsDetails) {
            if (prod.productId && prod.quantity > 0) {
              await reduceProductStock(prod.productId, prod.quantity);
            }
          }
        }
      }
      // Close dialogs and reset state AFTER snackbar is set (for online mode)
      setAddDialogOpen(false);
      setProcessDialogOpen(false);
      setPayLater(false);
      setPayingRecordId(null);
      setSelectedProducts([]);
      setSelectedCustomer(null);
      setCustomerInput("");
  // reset delivery fields
  setSalesType("in_store");
  setDeliveryFbName("");
  setDeliveryContactNumber("");
  setDeliveryAddress("");
  setDeliveryTime("");
      setFormPaymentMethod(PAYMENT_METHODS[0].key);
      setAmountTendered("");
      setChange(0);
      fetchRecords();
    } catch (err) {
      console.error("[Payments] handleAddPayment error:", err);
      const msg = err && (err as any).message ? (err as any).message : String(err);
      setSnackbar({ open: true, message: `Failed to record payment: ${msg}`, severity: "error" });
    }
  };

  // Quick amount buttons (inline constant used in UI below)

  // Handle row click to show details or process payment if unpaid
  const handleRowClick = (record: PaymentRecord) => {
    if (record.voided) {
      setSelectedRecord(record);
      setDetailsDialogOpen(true);
    } else if (record.paid) {
      setSelectedRecord(record);
      setDetailsDialogOpen(true);
    } else {
      // For unpaid, set selectedProducts from record.products (multi-product) or fallback
      setSelectedProducts(getProductsFromRecord(record));
      setSelectedCustomer({ name: record.customerName }); // Set customer from record
      setCustomerInput(record.customerName || "");
      setSelectedRecord(record);
      // Populate delivery fields if present
      if (record.salesType === "delivery" && record.delivery) {
        setSalesType("delivery");
        setDeliveryFbName(record.delivery.fbName || "");
        setDeliveryContactNumber(record.delivery.contactNumber || "");
        setDeliveryAddress(record.delivery.address || "");
        setDeliveryTime(record.delivery.time || "");
      } else {
        setSalesType("in_store");
        setDeliveryFbName("");
        setDeliveryContactNumber("");
        setDeliveryAddress("");
        setDeliveryTime("");
      }
      setProcessDialogOpen(true);
      setAmountTendered(record.price);
      setPayLater(false);
      setPayingRecordId(record.id || null);
      setDetailsDialogOpen(false);
    }
  };

  // Today's date string for filtering
  const [viewDate, setViewDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Daily records only (for stats and table) - respect viewDate
  const dailyRecords = records.filter(r => {
    const created = new Date(r.createdAt);
    const createdStr = format(created, 'yyyy-MM-dd');
    return createdStr === viewDate;
  });

  // Stats: daily only
  const totalPayments = dailyRecords.length;
  const totalPaid = dailyRecords.filter(r => r.paid && !r.voided).length;
  const totalUnpaid = dailyRecords.filter(r => !r.paid && !r.voided).length;
  const totalSales = dailyRecords
    .filter(r => r.paid && !r.voided)
    .reduce((sum, r) => sum + (typeof r.price === "number" ? r.price : 0), 0);

  // Most-availed computation removed (not used in UI)

  // Unique customers and products for filter dropdowns (daily only)
  const uniqueCustomers = Array.from(new Set(dailyRecords.map(r => r.customerName).filter(Boolean)));
  const uniqueServices = Array.from(new Set(dailyRecords.map(r => r.serviceName).filter(Boolean)));

  // Filtered records for table (sort by latest first, daily only)
  const filteredRecords = dailyRecords
    .filter(r => {
      // Date filter
      if (dateFrom && r.createdAt < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
      if (dateTo && r.createdAt > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      // Customer filter
      if (customerFilter && r.customerName !== customerFilter) return false;
      // Product filter
      if (serviceFilter && r.serviceName !== serviceFilter) return false;
      // Status filter
      if (statusFilter === "paid" && (!r.paid || r.voided)) return false;
      if (statusFilter === "unpaid" && (r.paid || r.voided)) return false;
      // Search
      if (searchCustomer && !r.customerName.toLowerCase().includes(searchCustomer.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt); // Latest first

  // Pagination logic
  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
  const paginatedRecords = filteredRecords.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Reset page if filters change or filteredRecords shrink
  React.useEffect(() => {
    setPage(1);
  }, [searchCustomer, statusFilter, customerFilter, serviceFilter, dateFrom, dateTo, records.length]);

  return (
    <AppSidebar
      role="cashier"
      firstName={firstName}
      lastName={lastName}
      onLogout={onLogout}
      onProfile={onProfile}
    >
      {/* Sync loading overlay */}
      {syncing && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            bgcolor: "rgba(255,255,255,0.7)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column"
          }}
        >
          <CircularProgress color="primary" size={48} />
          <Typography variant="h6" color="primary" sx={{ mt: 2 }}>
            Syncing offline sales data...
          </Typography>
        </Box>
      )}
      <Box sx={{ maxWidth: 900, mx: "auto", mt: 2, px: { xs: 1, sm: 2 }, pb: 6 }}>
        {/* Stats Section */}
        <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
          <Paper elevation={3} sx={{
            flex: 1, minWidth: 180, p: 2, display: "flex", alignItems: "center", gap: 2,
            borderLeft: "5px solid #1976d2", bgcolor: "background.paper"
          }}>
            <PaymentIcon color="primary" sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Transactions Today</Typography>
              <Typography variant="h6" fontWeight={700}>{totalPayments}</Typography>
            </Box>
          </Paper>
          <Paper elevation={3} sx={{
            flex: 1, minWidth: 180, p: 2, display: "flex", alignItems: "center", gap: 2,
            borderLeft: "5px solid #43a047", bgcolor: "background.paper"
          }}>
            <PaidIcon color="success" sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Sales Today</Typography>
              <Typography variant="h6" fontWeight={700}>{peso(totalSales)}</Typography>
            </Box>
          </Paper>
          <Paper elevation={3} sx={{
            flex: 1, minWidth: 180, p: 2, display: "flex", alignItems: "center", gap: 2,
            borderLeft: "5px solid #1976d2", bgcolor: "background.paper"
          }}>
            <AttachMoneyIcon color="primary" sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Paid Today</Typography>
              <Typography variant="h6" fontWeight={700}>{totalPaid}</Typography>
            </Box>
          </Paper>
          <Paper elevation={3} sx={{
            flex: 1, minWidth: 180, p: 2, display: "flex", alignItems: "center", gap: 2,
            borderLeft: "5px solid #fbc02d", bgcolor: "background.paper"
          }}>
            <MoneyOffIcon color="warning" sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Unpaid Today</Typography>
              <Typography variant="h6" fontWeight={700}>{totalUnpaid}</Typography>
            </Box>
          </Paper>
        </Box>
        {/* Header Section */}
        <Paper sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          display: "flex",
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          borderRadius: 3,
          boxShadow: 3,
          background: "linear-gradient(90deg, #f8fafc 60%, #e3f2fd 100%)"
        }}>
          <Box>
            <Typography variant={isMobile ? "h6" : "h5"} fontWeight={700}>
              Product Sales
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage and process all product sales
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={() => setAddDialogOpen(true)}
            sx={{
              minWidth: 140,
              borderRadius: 2,
              fontWeight: 600,
              bgcolor: "primary.main",
              ":hover": { bgcolor: "primary.dark" }
            }}
          >
            New Sale
          </Button>
        </Paper>

        {/* Search and Filter Controls */}
        <Paper sx={{
          p: { xs: 2, sm: 2 },
          mb: 2,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap"
        }}>
          <FilterAltIcon color="primary" sx={{ mr: 1 }} />
          <TextField
            label="From"
            type="date"
            size="small"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <Select
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            size="small"
            displayEmpty
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Customers</MenuItem>
            {uniqueCustomers.map(c => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
          <Select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            size="small"
            displayEmpty
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All Products</MenuItem>
            {uniqueServices.map(s => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
          <TextField
            label="Search Customer"
            value={searchCustomer}
            onChange={e => setSearchCustomer(e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
            InputProps={{
              startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "action.active" }} />
            }}
          />
          {/* View date navigator: Prev / Today / Next and date picker bound to viewDate */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button size="small" onClick={() => {
              const d = new Date(viewDate);
              d.setDate(d.getDate() - 1);
              setViewDate(format(d, 'yyyy-MM-dd'));
            }}>Prev</Button>
            <Button size="small" onClick={() => setViewDate(format(new Date(), 'yyyy-MM-dd'))}>Today</Button>
            <Button size="small" onClick={() => {
              const d = new Date(viewDate);
              d.setDate(d.getDate() + 1);
              setViewDate(format(d, 'yyyy-MM-dd'));
            }}>Next</Button>
            <TextField
              label="View Date"
              type="date"
              size="small"
              value={viewDate}
              onChange={e => setViewDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
          </Box>
          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as "" | "paid" | "unpaid")}
            size="small"
            displayEmpty
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All Status</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
          </Select>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => fetchRecords()}
            sx={{ ml: "auto", borderRadius: 2, minWidth: 44, px: 2, py: 1 }}
            startIcon={<RefreshIcon />}
          >
            Refresh
          </Button>
        </Paper>
        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: 2 }}>
          <Table size={isMobile ? "small" : "medium"}>
            <TableHead>
              <TableRow>
                <TableCell>Customer Name</TableCell>
                <TableCell>Products</TableCell>
                <TableCell>Quantities</TableCell>
                <TableCell>Total Price</TableCell>
                <TableCell>Cashier</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Payment Method</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedRecords.map(r => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{
                    cursor: "pointer",
                    transition: "background 0.2s",
                    "&:hover": { background: theme.palette.action.hover }
                  }}
                  onClick={() => handleRowClick(r)}
                >
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>
                    {/* Show all products in this transaction */}
                    {Array.isArray((r as any).products)
                      ? (r as any).products.map((p: any) => p.productName).join(", ")
                      : r.serviceName}
                  </TableCell>
                  <TableCell>
                    {Array.isArray((r as any).products)
                      ? (r as any).products.map((p: any) => p.quantity).join(", ")
                      : (r.quantity || 1)}
                  </TableCell>
                  <TableCell>{peso(r.price)}</TableCell>
                  <TableCell>
                    {r.cashierFullName
                      ? r.cashierFullName
                      : r.cashier}
                  </TableCell>
                  <TableCell>
                    {r.voided ? (
                      <Chip
                        label="Voided"
                        color="error"
                        size="small"
                        onClick={ev => ev.stopPropagation()}
                      />
                    ) : (
                      <Chip
                        label={r.paid ? "Paid" : "Unpaid"}
                        color={r.paid ? "success" : "warning"}
                        size="small"
                        onClick={ev => ev.stopPropagation()}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>{safeDateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    {PAYMENT_METHODS.find(m => m.key === r.paymentMethod)?.label || r.paymentMethod || "-"}
                  </TableCell>
                </TableRow>
              ))}
              {filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">No sales records found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {/* Pagination controls */}
        {filteredRecords.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
              mt: 2,
              gap: 2
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Rows per page:
              </Typography>
              <Select
                size="small"
                value={rowsPerPage}
                onChange={e => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(1);
                }}
                sx={{ width: 80, borderRadius: 2, fontWeight: 500 }}
              >
                {[5, 10, 20, 50, 100].map(n => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </Box>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
              shape="rounded"
              showFirstButton
              showLastButton
              siblingCount={isMobile ? 0 : 1}
              boundaryCount={1}
              sx={{
                mx: "auto",
                "& .MuiPaginationItem-root": {
                  borderRadius: 2,
                  fontWeight: 600,
                  minWidth: 36,
                  minHeight: 36,
                }
              }}
            />
            <Box sx={{ minWidth: 120, textAlign: { xs: "left", sm: "right" } }}>
              <Typography variant="body2" color="text.secondary">
                Page {page} of {totalPages}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
      {/* Add Product Sale Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Product Sale</DialogTitle>
        <DialogContent>
          {/* Customer selection: Autocomplete from loyaltyCustomers, or manual entry */}
          <Autocomplete
            options={loyaltyCustomers}
            getOptionLabel={option => typeof option === "string" ? option : option.name}
            value={selectedCustomer}
            onChange={(_, value) => {
              if (typeof value === "string") {
                setSelectedCustomer({ name: value });
                setCustomerInput(value);
              } else {
                setSelectedCustomer(value);
                setCustomerInput("");
              }
            }}
            inputValue={customerInput}
            onInputChange={(_, value, reason) => {
              setCustomerInput(value);
              if (!value) setSelectedCustomer(null);
            }}
            renderInput={params => (
              <TextField
                {...params}
                label="Customer (Select from Loyalty or type manually)"
                margin="normal"
                fullWidth
                helperText="Select a registered customer or type a name manually"
              />
            )}
            freeSolo
            sx={{ mb: 2 }}
          />
          {/* Manual input fallback if user wants to enter a name directly */}
          <TextField
            label="Customer Name (Manual Entry)"
            fullWidth
            margin="normal"
            value={customerInput}
            onChange={e => {
              setCustomerInput(e.target.value);
              setSelectedCustomer(null);
            }}
            placeholder="Type customer name if not in the list"
            sx={{ mb: 2 }}
          />

          {/* Sale date selector - allow manual sale date */}
          <TextField
            label="Sale Date"
            type="date"
            size="small"
            value={saleDate}
            onChange={e => setSaleDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />

          {/* Sale type selector (in-store or delivery) */}
          <Select
            value={salesType}
            onChange={e => setSalesType(e.target.value as "in_store" | "delivery")}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value="in_store">In-Store / Walk-in</MenuItem>
            <MenuItem value="delivery">Delivery</MenuItem>
          </Select>

          {salesType === "delivery" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                label="FB Name"
                fullWidth
                margin="normal"
                value={deliveryFbName}
                onChange={e => setDeliveryFbName(e.target.value)}
              />
              <TextField
                label="Contact Number"
                fullWidth
                margin="normal"
                value={deliveryContactNumber}
                onChange={e => setDeliveryContactNumber(e.target.value)}
              />
              <TextField
                label="Address"
                fullWidth
                margin="normal"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
              />
              <TextField
                label="Preferred Time"
                type="time"
                fullWidth
                margin="normal"
                value={deliveryTime}
                onChange={e => setDeliveryTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Delivery Date"
                type="date"
                fullWidth
                margin="normal"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Delivery Charge"
                fullWidth
                margin="normal"
                type="number"
                value={deliveryCharge}
                onChange={e => setDeliveryCharge(e.target.value === "" ? "" : Number(e.target.value))}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              />
              <TextField
                label="Landmark"
                fullWidth
                margin="normal"
                value={deliveryLandmark}
                onChange={e => setDeliveryLandmark(e.target.value)}
              />
              <TextField
                label="Remarks"
                fullWidth
                margin="normal"
                value={deliveryRemarks}
                onChange={e => setDeliveryRemarks(e.target.value)}
              />
            </Box>
          )}

          {/* Product selection: Button to open product grid dialog */}
          <Button
            variant="outlined"
            fullWidth
            sx={{ my: 2 }}
            onClick={() => setProductSelectDialogOpen(true)}
          >
            {selectedProducts.length === 0
              ? "Select Products"
              : `Selected: ${selectedProducts.map(sp => {
                  const prod = products.find(p => p.id === sp.productId);
                  return prod?.name || "";
                }).filter(Boolean).join(", ")}`}
          </Button>

          {/* For each selected product, show quantity input */}
          {selectedProducts.map(sp => {
            const product = products.find(p => p.id === sp.productId);
            return (
              <Box key={sp.productId} sx={{ display: "flex", alignItems: "center", mb: 1, gap: 2 }}>
                <Typography sx={{ minWidth: 120 }}>{product?.name}</Typography>
                <TextField
                  label="Quantity"
                  type="number"
                  size="small"
                  value={sp.quantity}
                  onChange={e => handleProductQuantityChange(sp.productId, Number(e.target.value))}
                  InputProps={{ inputProps: { min: 1 } }}
                  sx={{ width: 100 }}
                />
                <Typography sx={{ minWidth: 80 }}>
                  {peso((product?.price || 0) * sp.quantity)}
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={() => handleRemoveProduct(sp.productId)}
                >
                  Remove
                </Button>
              </Box>
            );
          })}

          <TextField
            label="Total Price"
            fullWidth
            margin="normal"
            value={calcTotalPrice()}
            InputProps={{
              startAdornment: <InputAdornment position="start">₱</InputAdornment>,
              readOnly: true
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleProcessPayment}
            disabled={
              selectedProducts.length === 0 ||
              calcTotalPrice() <= 0 ||
              !isDeliveryValid()
            }
          >
            Process Payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product Selection Grid Dialog */}
      <Dialog
        open={productSelectDialogOpen}
        onClose={() => setProductSelectDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Select Products</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            placeholder="Search products..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: "action.active" }} />
            }}
            sx={{ mb: 2 }}
          />
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              justifyContent: availableProducts.length === 0 ? "center" : "flex-start",
              minHeight: 120
            }}
          >
            {availableProducts.length === 0 && (
              <Box sx={{ width: "100%" }}>
                <Typography align="center" color="text.secondary">
                  No available products found.
                </Typography>
              </Box>
            )}
            {availableProducts.map(product => {
              const isSelected = selectedProducts.some(sp => sp.productId === product.id);
              return (
                <Box
                  key={product.id}
                  sx={{
                    width: { xs: "100%", sm: "47%", md: "30%" },
                    minWidth: 220,
                    maxWidth: 340,
                    flex: "1 1 220px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Paper
                    elevation={isSelected ? 6 : 1}
                    sx={{
                      p: 2,
                      border: isSelected ? "2px solid #1976d2" : "1px solid #e0e0e0",
                      bgcolor: isSelected ? "primary.50" : "background.paper",
                      cursor: "pointer",
                      transition: "box-shadow 0.2s, border 0.2s",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between"
                    }}
                    onClick={() => {
                      if (isSelected) {
                        handleRemoveProduct(product.id);
                      } else {
                        handleProductSelect(product.id);
                      }
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        {product.name}
                      </Typography>
                      {product.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {product.description}
                        </Typography>
                      )}
                      <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
                        {peso(product.price)}
                      </Typography>
                    </Box>
                    <Box sx={{ mt: 1 }}>
                      <Button
                        variant={isSelected ? "contained" : "outlined"}
                        color={isSelected ? "primary" : "inherit"}
                        size="small"
                        fullWidth
                        sx={{ fontWeight: 600 }}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                    </Box>
                  </Paper>
                </Box>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductSelectDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
      {/* Process Payment Dialog */}
      <Dialog open={processDialogOpen} onClose={() => { setProcessDialogOpen(false); setPayLater(false); setPayingRecordId(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Process Payment</DialogTitle>
        <DialogContent>
          {!payLater && (
            <>
              <Select
                label="Payment Method"
                fullWidth
                value={formPaymentMethod}
                onChange={e => setFormPaymentMethod(e.target.value)}
                sx={{ mb: 2, mt: 1 }}
              >
                {PAYMENT_METHODS.map(m => (
                  <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
                ))}
              </Select>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Total Amount: <b>{peso(calcTotalPrice())}</b>
              </Typography>
              <TextField
                label="Amount Tendered"
                fullWidth
                margin="normal"
                type="number"
                value={amountTendered}
                onChange={e => setAmountTendered(Number(e.target.value))}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₱</InputAdornment>
                }}
              />
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {[100, 200, 300, 500, 1000].map(q => (
                  <Button
                    key={q}
                    variant="outlined"
                    onClick={() => setAmountTendered(q)}
                    sx={{ minWidth: 80 }}
                  >
                    {peso(q)}
                  </Button>
                ))}
              </Box>
              <TextField
                label="Change"
                fullWidth
                margin="normal"
                value={change >= 0 ? peso(change) : "₱0"}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                  readOnly: true
                }}
              />
            </>
          )}
          {!payingRecordId && (
            <Box sx={{ mt: 2 }}>
              <Button
                variant={payLater ? "contained" : "outlined"}
                color="warning"
                fullWidth
                onClick={() => setPayLater(v => !v)}
              >
                {payLater ? "Pay Later Selected" : "Pay Later (Record as Unpaid)"}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {payLater
                  ? "This will record the sale as unpaid. You can process payment later."
                  : "Or choose to pay later if payment will be collected after delivery."}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setProcessDialogOpen(false); setPayLater(false); setPayingRecordId(null); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddPayment}
            disabled={
              !isDeliveryValid() || (payLater
                ? false
                : typeof amountTendered !== "number" ||
                  isNaN(amountTendered) ||
                  amountTendered < calcTotalPrice())
            }
          >
            {payLater ? "Record as Unpaid" : "Confirm Payment"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Payment Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>Payment & Product Details</DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 1, sm: 3 } }}>
          {selectedRecord && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: 2,
                flexWrap: "wrap"
              }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Customer Name</Typography>
                  <Typography>{selectedRecord.customerName}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Date</Typography>
                  <Typography>{safeDateTime(selectedRecord.createdAt)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Cashier</Typography>
                  <Typography>
                    {selectedRecord.cashierFullName
                      ? selectedRecord.cashierFullName
                      : selectedRecord.cashier}
                  </Typography>
                </Box>
              </Box>
              <Divider />
              {/* Products Table */}
              {Array.isArray(selectedRecord.products) && selectedRecord.products.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Products in this Transaction
                  </Typography>
                  <TableContainer component={Paper} sx={{ boxShadow: 0, mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Product Name</TableCell>
                          <TableCell align="right">Quantity</TableCell>
                          <TableCell align="right">Unit Price</TableCell>
                          <TableCell align="right">Subtotal</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedRecord.products.map((prod, idx) => (
                          <TableRow key={prod.productId || idx}>
                            <TableCell>{prod.productName}</TableCell>
                            <TableCell align="right">{prod.quantity}</TableCell>
                            <TableCell align="right">{peso(prod.price)}</TableCell>
                            <TableCell align="right">{peso(prod.price * prod.quantity)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ) : (
                // Single product/service fallback (legacy)
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">Product</Typography>
                    <Typography>{selectedRecord.serviceName}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">Quantity</Typography>
                    <Typography>{selectedRecord.quantity || 1}</Typography>
                  </Box>
                </Box>
              )}
              <Divider />
              <Box sx={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: 2,
                flexWrap: "wrap"
              }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Total Price</Typography>
                  <Typography>{peso(selectedRecord.price)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                  {selectedRecord.voided ? (
                    <Chip label="Voided" color="error" size="small" />
                  ) : (
                    <Chip
                      label={selectedRecord.paid ? "Paid" : "Unpaid"}
                      color={selectedRecord.paid ? "success" : "warning"}
                      size="small"
                    />
                  )}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Payment Method</Typography>
                  <Typography>
                    {PAYMENT_METHODS.find(m => m.key === selectedRecord.paymentMethod)?.label || selectedRecord.paymentMethod || "-"}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">Sales Type</Typography>
                  <Typography>{selectedRecord.salesType === "delivery" ? "Delivery" : "In-Store"}</Typography>
                </Box>
              </Box>
              {selectedRecord.salesType === "delivery" && (selectedRecord.delivery || (selectedRecord as any).delivery) && (
                <Box sx={{ mt: 2 }}>
                  <Divider />
                  <Typography variant="subtitle2" color="text.secondary">Delivery Details</Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
                    <Typography><b>FB Name:</b> {getDeliveryField(selectedRecord, 'fbName')}</Typography>
                    <Typography><b>Contact Number:</b> {getDeliveryField(selectedRecord, 'contactNumber')}</Typography>
                    <Typography><b>Address:</b> {getDeliveryField(selectedRecord, 'address')}</Typography>
                    <Typography><b>Time:</b> {formatDeliveryTime(getDeliveryField(selectedRecord, 'time'))}</Typography>
                    {getDeliveryField(selectedRecord, 'deliveryDate') ? (
                      <Typography><b>Delivery Date:</b> {formatDeliveryDate(getDeliveryField(selectedRecord, 'deliveryDate'))}</Typography>
                    ) : null}
                    <Typography><b>Delivery Charge:</b> {typeof (selectedRecord.deliveryCharge) === 'number' ? peso(selectedRecord.deliveryCharge) : '-'}</Typography>
                    <Typography><b>Landmark:</b> {selectedRecord.deliveryLandmark || '-'}</Typography>
                    <Typography><b>Remarks:</b> {selectedRecord.deliveryRemarks || '-'}</Typography>
                  </Box>
                </Box>
              )}
              {selectedRecord.paid && (
                <Box sx={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  gap: 2,
                  flexWrap: "wrap"
                }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">Amount Tendered</Typography>
                    <Typography>
                      {typeof selectedRecord.amountTendered === "number"
                        ? peso(selectedRecord.amountTendered)
                        : "-"}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">Change</Typography>
                    <Typography>
                      {typeof selectedRecord.change === "number"
                        ? peso(selectedRecord.change)
                        : "-"}
                    </Typography>
                  </Box>
                </Box>
              )}
              {selectedRecord.paid && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" onClick={() => handlePrintRecord(selectedRecord)}>Reprint Receipt</Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Receipt</DialogTitle>
        <DialogContent dividers>
          {lastPrintedRecord ? (
            <Box sx={{ fontFamily: 'monospace' }}>
              <div dangerouslySetInnerHTML={{ __html: renderReceiptHtml(lastPrintedRecord) }} />
            </Box>
          ) : (
            <Typography>No receipt available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiptModalOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => handlePrintRecord(lastPrintedRecord)}>Print</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AppSidebar>
  );
};

export default PaymentServicesPage;
