import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider,
  TextField,
  Select,
  MenuItem,
  Button,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  useMediaQuery,
  createTheme,
  ThemeProvider,
  CssBaseline,
  CircularProgress,
  InputAdornment,
  Pagination
} from "@mui/material";
import AppSidebar from "./AppSidebar";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  HistoryToggleOff as VoidIcon,
  Search as SearchIcon,
  FilterAlt as FilterIcon,
  Refresh as RefreshIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon
} from "@mui/icons-material";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

// Custom Material-UI Theme
const theme = createTheme({
  typography: {
    fontFamily: '"Inter", sans-serif',
    h3: {
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 800,
      letterSpacing: 1.5,
    },
    h4: {
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 800,
      letterSpacing: 1.5,
    },
    h5: {
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 700,
      letterSpacing: 1.2,
    },
    h6: {
      fontFamily: '"Poppins", sans-serif',
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
    },
  },
  palette: {
    primary: {
      main: '#ef5350',
      light: '#ff8a80',
      dark: '#d32f2f',
    },
    secondary: {
      main: '#424242',
    },
    background: {
      default: '#f0f2f5',
      paper: 'rgba(255,255,255,0.95)',
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '24px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '16px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
          transition: 'all 0.3s cubic-bezier(.25,.8,.25,1)',
          '&:hover': {
            boxShadow: '0 12px 35px rgba(0,0,0,0.15)',
            transform: 'translateY(-5px)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '16px',
          textTransform: 'none',
          fontWeight: 700,
          letterSpacing: 0.5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          fontWeight: 600,
        },
      },
    },
  },
});

interface PaymentRecord {
  id?: string;
  customerName: string;
  productName?: string;
  serviceName?: string;
  price: number;
  quantity?: number;
  cashier: string;
  cashierFullName?: string;
  createdAt: number;
  paid?: boolean;
  paymentMethod?: string;
  voided?: boolean;
  voidedAt?: number;
  voidedBy?: string;
  products?: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
  }[];
}

const peso = (v: number) => `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const VoidTransactionsPage: React.FC = () => {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const currentTheme = useTheme();
  const isSm = useMediaQuery(currentTheme.breakpoints.down("sm"));

  // Filters
  const [searchCustomer, setSearchCustomer] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [voidedByFilter, setVoidedByFilter] = useState<string>("");

  // Details dialog
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);

  const fetchRecords = async () => {
    setRefreshing(true);
    try {
      const snap = await getDocs(collection(db, "payments"));
      const allRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PaymentRecord[];
      // Only show voided transactions
      setRecords(allRecords.filter(r => r.voided === true));
    } catch (error) {
      console.error("Error fetching records:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Get role and unique voided-by users
  const rawRole = (localStorage.getItem('role') || '').toLowerCase();
  const role = (rawRole === 'admin' ? 'admin' : 'cashier') as 'admin' | 'cashier';
  
  const uniqueVoidedBy = Array.from(
    new Set(records.map(r => r.voidedBy).filter(Boolean))
  );

  // Quick stats
  const totalVoided = records.length;
  const totalVoidedAmount = records.reduce((sum, r) => sum + (typeof r.price === "number" ? r.price : 0), 0);

  // Filtered records
  const filteredRecords = records
    .filter(r => {
      const customerMatch = r.customerName.toLowerCase().includes(searchCustomer.toLowerCase());
      const dateMatch = dateFilter
        ? (() => { try { return format(new Date(r.voidedAt || r.createdAt), 'yyyy-MM-dd') === dateFilter; } catch { return false; } })()
        : true;
      const voidedByMatch = voidedByFilter ? r.voidedBy === voidedByFilter : true;
      return customerMatch && dateMatch && voidedByMatch;
    })
    .sort((a, b) => (b.voidedAt || b.createdAt) - (a.voidedAt || a.createdAt));

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
  const paginatedRecords = filteredRecords.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [searchCustomer, dateFilter, voidedByFilter, records.length]);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const handleRowClick = (record: PaymentRecord) => {
    setSelectedRecord(record);
    setDetailsDialogOpen(true);
  };

  // Safe date formatter
  const safeDateTime = (value: any) => {
    if (!value && value !== 0) return '-';
    try {
      const d = value instanceof Date ? value : (typeof value === 'number' ? new Date(value) : new Date(String(value)));
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString();
    } catch {
      return '-';
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppSidebar role={role} onLogout={handleLogout}>
        <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1400, mx: "auto", width: "100%" }}>
          {/* Header */}
          <motion.div initial="hidden" animate="visible" variants={itemVariants}>
            <Paper
              elevation={4}
              sx={{
                p: { xs: 2.5, sm: 4 },
                mb: 4,
                display: "flex",
                alignItems: { xs: "flex-start", sm: "center" },
                justifyContent: "space-between",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
                borderRadius: 4,
                boxShadow: currentTheme.shadows[6],
                background: `linear-gradient(135deg, ${currentTheme.palette.error.light} 0%, ${currentTheme.palette.error.main} 100%)`,
                color: "#fff",
              }}
            >
              <Box>
                <Typography variant={isSm ? "h5" : "h3"} fontWeight={700} gutterBottom>
                  <VoidIcon sx={{ mr: 1, verticalAlign: "middle", fontSize: isSm ? 30 : 40 }} />
                  Void Transactions History
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  View all voided transactions and their details
                </Typography>
              </Box>
              <Tooltip title="Refresh data">
                <Button
                  onClick={fetchRecords}
                  variant="contained"
                  color="secondary"
                  sx={{
                    borderRadius: 2.5,
                    fontWeight: 600,
                    minWidth: 120,
                    px: 3,
                    py: 1.5,
                  }}
                  startIcon={refreshing ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </Tooltip>
            </Paper>
          </motion.div>

          {/* Stats Cards */}
          <motion.div initial="hidden" animate="visible" variants={itemVariants}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 3, mb: 4 }}>
              <Card elevation={4} sx={{ borderLeft: `6px solid ${currentTheme.palette.error.main}` }}>
                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
                  <VoidIcon sx={{ fontSize: 48, color: currentTheme.palette.error.main }} />
                  <Box>
                    <Typography variant="subtitle1" color="text.secondary" fontWeight={500}>
                      Total Voided Transactions
                    </Typography>
                    <Typography variant="h5" fontWeight={700} color={currentTheme.palette.error.dark}>
                      {loading ? <CircularProgress size={24} /> : totalVoided}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
              <Card elevation={4} sx={{ borderLeft: `6px solid ${currentTheme.palette.error.dark}` }}>
                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 3 }}>
                  <VoidIcon sx={{ fontSize: 48, color: currentTheme.palette.error.dark }} />
                  <Box>
                    <Typography variant="subtitle1" color="text.secondary" fontWeight={500}>
                      Total Voided Amount
                    </Typography>
                    <Typography variant="h5" fontWeight={700} color={currentTheme.palette.error.dark}>
                      {loading ? <CircularProgress size={24} /> : peso(totalVoidedAmount)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </motion.div>

          {/* Filters */}
          <motion.div initial="hidden" animate="visible" variants={itemVariants}>
            <Paper elevation={4} sx={{ mb: 3, borderRadius: 3, p: { xs: 2.5, sm: 3.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <FilterIcon sx={{ mr: 1.5, fontSize: 28 }} />
                <Typography variant="h6" fontWeight={700}>Filters</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
                <TextField
                  fullWidth
                  label="Search Customer"
                  value={searchCustomer}
                  onChange={e => setSearchCustomer(e.target.value)}
                  size="medium"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Void Date"
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  size="medium"
                  InputLabelProps={{ shrink: true }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CalendarIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Select
                  fullWidth
                  value={voidedByFilter}
                  onChange={e => setVoidedByFilter(e.target.value)}
                  size="medium"
                  displayEmpty
                >
                  <MenuItem value="">All Voided By</MenuItem>
                  {uniqueVoidedBy.map(vb => (
                    <MenuItem key={vb} value={vb}>{vb}</MenuItem>
                  ))}
                </Select>
              </Box>
            </Paper>
          </motion.div>

          {/* Table */}
          <motion.div initial="hidden" animate="visible" variants={itemVariants}>
            <Card elevation={4} sx={{ borderRadius: 3, p: { xs: 2.5, sm: 3.5 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" fontWeight={700}>Voided Transactions</Typography>
                <Typography variant="body2" color="text.secondary">
                  Showing {filteredRecords.length} records
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />

              {refreshing && <LinearProgress sx={{ mb: 2 }} />}

              <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: "none", border: `1px solid ${currentTheme.palette.divider}` }}>
                <Table size="medium">
                  <TableHead>
                    <TableRow sx={{ bgcolor: currentTheme.palette.grey[100] }}>
                      <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Voided By</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Voided At</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Original Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                          <CircularProgress color="primary" />
                          <Typography sx={{ mt: 2, color: "text.secondary" }}>Loading...</Typography>
                        </TableCell>
                      </TableRow>
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <VoidIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
                          <Typography color="text.secondary">No voided transactions found</Typography>
                          <Button
                            variant="text"
                            size="small"
                            sx={{ mt: 1 }}
                            onClick={() => {
                              setSearchCustomer("");
                              setDateFilter("");
                              setVoidedByFilter("");
                            }}
                          >
                            Clear filters
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRecords.map((r) => (
                        <TableRow
                          key={r.id}
                          hover
                          onClick={() => handleRowClick(r)}
                          sx={{
                            cursor: "pointer",
                            bgcolor: currentTheme.palette.error.light,
                            opacity: 0.7,
                            '&:hover': { opacity: 1 }
                          }}
                        >
                          <TableCell>
                            <Typography fontWeight={500}>{r.customerName}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {r.cashierFullName || r.cashier}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {Array.isArray(r.products) && r.products.length > 0
                              ? r.products.map(p => p.productName).join(", ")
                              : (r.productName || r.serviceName || "-")}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={500}>{peso(r.price)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={r.voidedBy || "Unknown"}
                              size="small"
                              icon={<PersonIcon />}
                              sx={{ bgcolor: currentTheme.palette.secondary.light, color: "#fff" }}
                            />
                          </TableCell>
                          <TableCell>{safeDateTime(r.voidedAt)}</TableCell>
                          <TableCell>{safeDateTime(r.createdAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {totalPages > 1 && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(_, value) => setPage(value)}
                    color="primary"
                    size={isSm ? "small" : "medium"}
                  />
                </Box>
              )}
            </Card>
          </motion.div>
        </Box>

        {/* Details Dialog */}
        <Dialog
          open={detailsDialogOpen}
          onClose={() => setDetailsDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Voided Transaction Details</DialogTitle>
          <DialogContent dividers>
            {selectedRecord && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Customer Name</Typography>
                  <Typography>{selectedRecord.customerName}</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Products</Typography>
                  {Array.isArray(selectedRecord.products) && selectedRecord.products.length > 0 ? (
                    selectedRecord.products.map((p, idx) => (
                      <Typography key={idx}>
                        {p.productName} - Qty: {p.quantity} - {peso(p.price * p.quantity)}
                      </Typography>
                    ))
                  ) : (
                    <Typography>{selectedRecord.productName || selectedRecord.serviceName || "-"}</Typography>
                  )}
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Total Amount</Typography>
                  <Typography variant="h6" color="error.main">{peso(selectedRecord.price)}</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Voided By</Typography>
                  <Typography>{selectedRecord.voidedBy || "Unknown"}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Voided At</Typography>
                  <Typography>{safeDateTime(selectedRecord.voidedAt)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Original Transaction Date</Typography>
                  <Typography>{safeDateTime(selectedRecord.createdAt)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Cashier</Typography>
                  <Typography>{selectedRecord.cashierFullName || selectedRecord.cashier}</Typography>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </AppSidebar>
    </ThemeProvider>
  );
};

export default VoidTransactionsPage;
