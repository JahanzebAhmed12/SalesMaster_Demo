import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Header from "@/components/layout/header";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserRestriction, User } from "@shared/schema";

const restrictionSections = [
  { key: "data_entry", label: "DATA ENTRY" },
  { key: "daily_reports", label: "DAILY REPORTS" },
  { key: "historical_reports", label: "HISTORICAL REPORTS" },
  { key: "payments", label: "PAYMENTS" },
  { key: "admin_setup", label: "ADMIN SET UP" },
];

const AdminFunctions = () => {
  const [userWorkTime, setUserWorkTime] = useState({
    admin: { start: "00:01", end: "23:59" },
    cashier: { start: "00:01", end: "23:59" },
    burhan: { start: "00:01", end: "23:59" },
    butt: { start: "00:01", end: "23:59" }
  });

  const [userRestrictions, setUserRestrictions] = useState({
    admin: {
      dataEntry: { show: true, hide: false },
      dailyReports: { show: false, hide: true },
      historicalReports: { show: true, hide: false },
      payments: { show: true, hide: false },
      admin: { show: true, hide: false },
      others: { show: true, hide: false }
    },
    cashier: {
      dataEntry: { show: true, hide: false },
      dailyReports: { show: false, hide: true },
      historicalReports: { show: true, hide: false },
      payments: { show: true, hide: false },
      admin: { show: true, hide: false },
      others: { show: true, hide: false }
    },
    burhan: {
      dataEntry: { show: true, hide: false },
      dailyReports: { show: false, hide: true },
      historicalReports: { show: true, hide: false },
      payments: { show: true, hide: false },
      admin: { show: true, hide: false },
      others: { show: true, hide: false }
    },
    butt: {
      dataEntry: { show: true, hide: false },
      dailyReports: { show: false, hide: true },
      historicalReports: { show: true, hide: false },
      payments: { show: true, hide: false },
      admin: { show: true, hide: false },
      others: { show: true, hide: false }
    }
  });

  const [backDateOptions, setBackDateOptions] = useState<Record<number, { editing: boolean; deleting: boolean }>>({});

  const [stockRestriction, setStockRestriction] = useState("sell");
  const [currentDateEditing, setCurrentDateEditing] = useState<Record<number, boolean>>({});

  const [emailConfig, setEmailConfig] = useState({
    MAIL_EMAIL: "",
    MAIL_PASSWORD: "",
    MAIL_DEFAULT_SENDER: ""
  });
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);

  const [showHideProfit, setShowHideProfit] = useState({
    admin: { show: true, hide: false },
    cashier: { show: false, hide: true },
    burhan: { show: false, hide: true },
    butt: { show: false, hide: true }
  });

  const [taxDetails, setTaxDetails] = useState({
    withTax: false,
    taxPercentage: "0"
  });
  const [savingTaxDetails, setSavingTaxDetails] = useState(false);

  const [porterageDetails, setPorterageDetails] = useState({
    withPorterage: false,
    porterageCharge: "0.00"
  });
  const [savingPorterageDetails, setSavingPorterageDetails] = useState(false);

  const [dailyBookType, setDailyBookType] = useState<Record<number, { showAll: boolean; showOnly: boolean }>>({});
  const [savingDailyBookType, setSavingDailyBookType] = useState(false);

  const [recordsPerInvoice, setRecordsPerInvoice] = useState("0");
  const [showOutstandingBalance, setShowOutstandingBalance] = useState(false);
  const [savingOutstandingBalance, setSavingOutstandingBalance] = useState(false);
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [savingInvoiceFooter, setSavingInvoiceFooter] = useState(false);
  const [invoicePrintFormat, setInvoicePrintFormat] = useState("A4");
  const [deliveryNoteWithPrice, setDeliveryNoteWithPrice] = useState(false);
  const [savingDeliveryNoteWithPrice, setSavingDeliveryNoteWithPrice] = useState(false);
  const [showNameOnDeliveryNote, setShowNameOnDeliveryNote] = useState("name");
  const [deliveryAcknowledgement, setDeliveryAcknowledgement] = useState(false);
  const [showDashboardInfo, setShowDashboardInfo] = useState(false);
  const [brandingEmail, setBrandingEmail] = useState(false);
  const [currencyRates, setCurrencyRates] = useState({
    INR: "0.01",
    USD: "0.74",
    GBP: "1",
    EUR: "0.91",
    PKR: "0.0046",
    FRP: "0.84",
    EGP: "0.047",
    TRY: "0.096",
    UGX: "0.0002",
    OMR: "1.92",
    CAD: "0.58"
  });
  const [savingCurrencyRates, setSavingCurrencyRates] = useState(false);

  const [showProfit, setShowProfit] = useState(true);
  const [savingShowProfit, setSavingShowProfit] = useState(false);

  const [savingShowDashboardInfo, setSavingShowDashboardInfo] = useState(false);

  const [companyAddress, setCompanyAddress] = useState("");
  const [savingCompanyAddress, setSavingCompanyAddress] = useState(false);

  const queryClient = useQueryClient();

  // Fetch all users
  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest<User[]>("GET", "/api/users"),
  });
  // Fetch all user restrictions
  const { data: allRestrictions = [], isLoading: loadingRestrictions } = useQuery<UserRestriction[]>({
    queryKey: ["/api/user-restrictions"],
    queryFn: () => apiRequest<UserRestriction[]>("GET", "/api/user-restrictions"),
  });

  // Local state for editing
  const [editRestrictions, setEditRestrictions] = useState<Record<number, Record<string, boolean>>>({});

  // Initialize editRestrictions from backend data
  useEffect(() => {
    if (Array.isArray(users) && Array.isArray(allRestrictions)) {
      const map: Record<number, Record<string, boolean>> = {};
      users.forEach((user: User) => {
        map[user.id] = {};
        restrictionSections.forEach((section) => {
          const found = allRestrictions.find((r: UserRestriction) => r.user_id === user.id && r.section === section.key);
          map[user.id][section.key] = found ? found.allowed : true; // default true
        });
      });
      setEditRestrictions(map);
    }
  }, [users, allRestrictions]);

  // Save handler
  const { mutate: saveRestrictions, isPending: saving } = useMutation({
    mutationFn: async (userId: number) => {
      const payload = restrictionSections.map(section => ({
        section: section.key,
        allowed: editRestrictions[userId][section.key],
      }));
      await apiRequest("PUT", `/api/user-restrictions/${userId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-restrictions"] });
    },
  });

  const { data: allBackDateOptions = [] } = useQuery({
    queryKey: ["/api/user-backdate-options"],
    queryFn: () => apiRequest("GET", "/api/user-backdate-options"),
  });

  useEffect(() => {
    if (Array.isArray(users) && Array.isArray(allBackDateOptions)) {
      const map: Record<number, { editing: boolean; deleting: boolean }> = {};
      users.forEach((user: User) => {
        const found = allBackDateOptions.find((opt: any) => opt.userId === user.id);
        map[user.id] = {
          editing: found ? found.editing : false,
          deleting: found ? found.deleting : false,
        };
      });
      setBackDateOptions(map);
    }
  }, [users, allBackDateOptions]);

  const { mutate: saveBackDateOptions, isPending: savingBackDate } = useMutation({
    mutationFn: async (userId: number) => {
      const payload = {
        editing: backDateOptions[userId]?.editing ?? false,
        deleting: backDateOptions[userId]?.deleting ?? false,
      };
      await apiRequest("PUT", `/api/user-backdate-options/${userId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-backdate-options"] });
    },
  });

  useEffect(() => {
    if (Array.isArray(users) && Array.isArray(allBackDateOptions)) {
      const map: Record<number, boolean> = {};
      users.forEach((user: any) => {
        const found = allBackDateOptions.find((opt: any) => opt.userId === user.id);
        map[user.id] = found ? found.current_editing : true;
      });
      setCurrentDateEditing(map);
    }
  }, [users, allBackDateOptions]);

  const { mutate: saveCurrentDateEditing, isPending: savingCurrentDate } = useMutation({
    mutationFn: async (userId: number) => {
      const payload = {
        current_editing: currentDateEditing[userId],
      };
      await apiRequest("PUT", `/api/user-backdate-options/${userId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-backdate-options"] });
    },
  });

  const [invoiceRestriction, setInvoiceRestriction] = useState<Record<number, boolean>>({});
  const [savingInvoiceRestriction, setSavingInvoiceRestriction] = useState(false);

  // Fetch all invoice restrictions ONCE on mount
  useEffect(() => {
    async function fetchInvoiceRestrictions() {
      const res = await apiRequest("GET", "/api/user-invoice-restriction");
      if (Array.isArray(res)) {
        const map: Record<number, boolean> = {};
        res.forEach((opt: any) => {
          map[opt.userId] = !!opt.restricted;
        });
        setInvoiceRestriction(map);
      }
    }
    fetchInvoiceRestrictions();
  }, []); // Only on mount

  // Save handler
  const saveInvoiceRestriction = async (userId: number) => {
    setSavingInvoiceRestriction(true);
    await apiRequest("PUT", `/api/user-invoice-restriction/${userId}`, { restricted: invoiceRestriction[userId] });
    setSavingInvoiceRestriction(false);
  };

  // Fetch all daily book type settings ONCE on mount
  useEffect(() => {
    async function fetchDailyBookTypes() {
      const res = await apiRequest("GET", "/api/user-daily-book-type");
      if (Array.isArray(res)) {
        const map: Record<number, { showAll: boolean; showOnly: boolean }> = {};
        res.forEach((opt: any) => {
          map[opt.userId] = { showAll: !!opt.showAll, showOnly: !!opt.showOnly };
        });
        setDailyBookType(map);
      }
    }
    fetchDailyBookTypes();
  }, []); // Only on mount

  // Save handler
  const saveDailyBookType = async (userId: number) => {
    setSavingDailyBookType(true);
    await apiRequest("PUT", `/api/user-daily-book-type/${userId}`, dailyBookType[userId]);
    setSavingDailyBookType(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then((settings) => {
      setShowOutstandingBalance(!!settings.showOutstandingBalance);
    });
  }, []);

  const saveShowOutstandingBalance = async () => {
    setSavingOutstandingBalance(true);
    await apiRequest("PUT", "/api/settings", { showOutstandingBalance });
    setSavingOutstandingBalance(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then((settings) => {
      setInvoiceFooter(settings.invoiceFooter || "");
    });
  }, []);

  const saveInvoiceFooter = async () => {
    setSavingInvoiceFooter(true);
    await apiRequest("PUT", "/api/settings", { invoiceFooter });
    setSavingInvoiceFooter(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then((settings) => {
      setDeliveryNoteWithPrice(!!settings.deliveryNoteWithPrice);
      setShowNameOnDeliveryNote(settings.deliveryNoteNameOrCode || "name");
      setDeliveryAcknowledgement(!!settings.deliveryAcknowledgement);
    });
  }, []);

  const saveDeliveryNoteWithPrice = async () => {
    setSavingDeliveryNoteWithPrice(true);
    await apiRequest("PUT", "/api/settings", { deliveryNoteWithPrice });
    setSavingDeliveryNoteWithPrice(false);
  };

  const saveShowNameOnDeliveryNote = async () => {
    await apiRequest("PUT", "/api/settings", { deliveryNoteNameOrCode: showNameOnDeliveryNote });
  };

  const saveDeliveryAcknowledgement = async () => {
    await apiRequest("PUT", "/api/settings", { deliveryAcknowledgement });
  };

  useEffect(() => {
    apiRequest("GET", "/api/email-config").then(config => setEmailConfig({
      MAIL_EMAIL: config.MAIL_EMAIL || "",
      MAIL_PASSWORD: config.MAIL_PASSWORD || "",
      MAIL_DEFAULT_SENDER: config.MAIL_DEFAULT_SENDER || ""
    }));
  }, []);

  const saveEmailConfig = async () => {
    setSavingEmailConfig(true);
    await apiRequest("PUT", "/api/email-config", emailConfig);
    setSavingEmailConfig(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => setShowProfit(settings.showProfit !== false));
  }, []);

  const saveShowProfit = async () => {
    setSavingShowProfit(true);
    await apiRequest("PUT", "/api/settings", { showProfit });
    setSavingShowProfit(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setTaxDetails({
        withTax: !!settings.withTax,
        taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : "0"
      });
    });
  }, []);

  const saveTaxDetails = async () => {
    setSavingTaxDetails(true);
    await apiRequest("PUT", "/api/settings", {
      withTax: taxDetails.withTax,
      taxPercentage: taxDetails.taxPercentage
    });
    setSavingTaxDetails(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setPorterageDetails({
        withPorterage: !!settings.withPorterage,
        porterageCharge: settings.porterageCharge ? String(settings.porterageCharge) : "0.00"
      });
    });
  }, []);

  const savePorterageDetails = async () => {
    setSavingPorterageDetails(true);
    await apiRequest("PUT", "/api/settings", {
      withPorterage: porterageDetails.withPorterage,
      porterageCharge: porterageDetails.porterageCharge
    });
    setSavingPorterageDetails(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => setShowDashboardInfo(!!settings.showDashboardInfo));
  }, []);

  const saveShowDashboardInfo = async () => {
    setSavingShowDashboardInfo(true);
    await apiRequest("PUT", "/api/settings", { showDashboardInfo });
    setSavingShowDashboardInfo(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      if (settings.currencyRates) setCurrencyRates(settings.currencyRates);
    });
  }, []);

  const saveCurrencyRates = async () => {
    setSavingCurrencyRates(true);
    await apiRequest("PUT", "/api/settings", { currencyRates });
    setSavingCurrencyRates(false);
  };

  useEffect(() => {
    apiRequest("GET", "/api/company-details").then(details => {
      setCompanyAddress(details.address || "");
    });
  }, []);

  const saveCompanyAddress = async () => {
    setSavingCompanyAddress(true);
    await apiRequest("PUT", "/api/company-details", { address: companyAddress });
    setSavingCompanyAddress(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin setup</h1>
          <div className="text-sm text-gray-500 mt-1">
            {companyAddress}
          </div>
        </div>

        {/* User Restriction */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  User Restriction
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg bg-white">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        {restrictionSections.map(section => (
                          <th key={section.key} className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{section.label}</th>
                        ))}
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          {restrictionSections.map(section => (
                            <td key={section.key} className="px-6 py-4 text-center">
                              <label className="inline-flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={editRestrictions[user.id]?.[section.key] ?? true}
                                  onChange={e => setEditRestrictions(prev => ({
                                    ...prev,
                                    [user.id]: {
                                      ...prev[user.id],
                                      [section.key]: e.target.checked,
                                    },
                                  }))}
                                  className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                                />
                                <span className="text-xs text-gray-700">{editRestrictions[user.id]?.[section.key] ? "Show" : "Hide"}</span>
                              </label>
                            </td>
                          ))}
                          <td className="px-6 py-4 text-center">
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                              disabled={saving}
                              onClick={() => saveRestrictions(user.id)}
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Back Date Editing/Deleting */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Back Date Editing/Deleting
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg bg-white">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Editing</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deleting</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={backDateOptions[user.id]?.editing ?? false}
                              onChange={e =>
                                setBackDateOptions(prev => ({
                                  ...prev,
                                  [user.id]: {
                                    ...prev[user.id],
                                    editing: e.target.checked,
                                  },
                                }))
                              }
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={backDateOptions[user.id]?.deleting ?? false}
                              onChange={e =>
                                setBackDateOptions(prev => ({
                                  ...prev,
                                  [user.id]: {
                                    ...prev[user.id],
                                    deleting: e.target.checked,
                                  },
                                }))
                              }
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                              disabled={savingBackDate}
                              onClick={() => saveBackDateOptions(user.id)}
                            >
                              {savingBackDate ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Current Date Editing */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Current Date Editing
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg bg-white">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Editing</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={currentDateEditing[user.id] ?? true}
                              onChange={e => setCurrentDateEditing(prev => ({ ...prev, [user.id]: e.target.checked }))}
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                              disabled={savingCurrentDate}
                              onClick={() => saveCurrentDateEditing(user.id)}
                            >
                              {savingCurrentDate ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Invoice Restriction */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Invoice Restriction
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg bg-white">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Restricted</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={invoiceRestriction[user.id] ?? false}
                              onChange={e => setInvoiceRestriction(prev => ({ ...prev, [user.id]: e.target.checked }))}
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                              disabled={savingInvoiceRestriction}
                              onClick={() => saveInvoiceRestriction(user.id)}
                            >
                              {savingInvoiceRestriction ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Daily Book Type */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Daily Book Type
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="text-xs mb-2">Daily Book Type</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg bg-white">
                    <thead>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Show all Invoice</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Show Only user's Invoice</th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={dailyBookType[user.id]?.showAll ?? false}
                              onChange={e => setDailyBookType(prev => ({ ...prev, [user.id]: { ...prev[user.id], showAll: e.target.checked } }))}
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={dailyBookType[user.id]?.showOnly ?? false}
                              onChange={e => setDailyBookType(prev => ({ ...prev, [user.id]: { ...prev[user.id], showOnly: e.target.checked } }))}
                              className="form-checkbox h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
                              disabled={savingDailyBookType}
                              onClick={() => saveDailyBookType(user.id)}
                            >
                              {savingDailyBookType ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Show Outstanding Bal in invoice
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Show outstanding balance on invoice</div>
                  <RadioGroup value={showOutstandingBalance ? "yes" : "no"} onValueChange={v => setShowOutstandingBalance(v === "yes")}> 
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="yes-outstanding" />
                      <Label htmlFor="yes-outstanding" className="text-sm">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="no-outstanding" />
                      <Label htmlFor="no-outstanding" className="text-sm">No</Label>
                    </div>
                  </RadioGroup>
                </div>
                <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveShowOutstandingBalance} disabled={savingOutstandingBalance}>
                  {savingOutstandingBalance ? "Saving..." : "Save"}
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Invoice Footer */}
        <Card className="shadow-sm border border-gray-200 mb-10">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer bg-blue-500 text-white">
                <CardTitle className="flex items-center justify-between text-sm">
                  Invoice Footer
                  <ChevronDown className="h-4 w-4" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-4">
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Invoice Footer Text</div>
                  <Textarea
                    value={invoiceFooter}
                    onChange={e => setInvoiceFooter(e.target.value)}
                    rows={3}
                    className="w-full text-sm"
                  />
                </div>
                <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveInvoiceFooter} disabled={savingInvoiceFooter}>
                  {savingInvoiceFooter ? "Saving..." : "Save"}
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Delivery Note with Price, Delivery Note with Name or Code, Delivery acknowledgement */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Delivery Note with Price */}
          <Card className="shadow-sm border border-gray-200 mb-10">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Delivery Note with Price
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Show price on delivery note</div>
                    <RadioGroup value={deliveryNoteWithPrice ? "yes" : "no"} onValueChange={v => setDeliveryNoteWithPrice(v === "yes")}> 
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="yes-delivery-price" />
                        <Label htmlFor="yes-delivery-price" className="text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="no-delivery-price" />
                        <Label htmlFor="no-delivery-price" className="text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveDeliveryNoteWithPrice} disabled={savingDeliveryNoteWithPrice}>
                    {savingDeliveryNoteWithPrice ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Delivery Note with Name or Code */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Delivery Note with Name or Code
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Show Name on Delivery Note</div>
                    <RadioGroup value={showNameOnDeliveryNote} onValueChange={setShowNameOnDeliveryNote}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="name" id="customer-name" />
                        <Label htmlFor="customer-name" className="text-sm">Show Customer Name</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="code" id="customer-code" />
                        <Label htmlFor="customer-code" className="text-sm">Show Customer Code</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveShowNameOnDeliveryNote}>
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Delivery acknowledgement */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Delivery acknowledgement
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Show acknowledgement on Delivery Note</div>
                    <RadioGroup value={deliveryAcknowledgement ? "yes" : "no"} onValueChange={(value) => setDeliveryAcknowledgement(value === "yes")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="yes-acknowledgement" />
                        <Label htmlFor="yes-acknowledgement" className="text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="no-acknowledgement" />
                        <Label htmlFor="no-acknowledgement" className="text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveDeliveryAcknowledgement}>
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Other Settings */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">OTHER SETTINGS</h2>
        </div>

        {/* E-Mail configuration, Show/Hide Profit, Product Search Type */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* E-Mail configuration */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    E-Mail configuration
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Change Email Credentials</div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Email:</Label>
                        <Input type="email" value={emailConfig.MAIL_EMAIL} onChange={e => setEmailConfig(prev => ({ ...prev, MAIL_EMAIL: e.target.value }))} className="text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Password:</Label>
                        <Input type="password" value={emailConfig.MAIL_PASSWORD} onChange={e => setEmailConfig(prev => ({ ...prev, MAIL_PASSWORD: e.target.value }))} className="text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Default Sender:</Label>
                        <Input type="text" value={emailConfig.MAIL_DEFAULT_SENDER} onChange={e => setEmailConfig(prev => ({ ...prev, MAIL_DEFAULT_SENDER: e.target.value }))} className="text-xs" />
                      </div>
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveEmailConfig} disabled={savingEmailConfig}>
                    {savingEmailConfig ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Show/Hide Profit */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Show/Hide Profit
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="text-xs mb-2">Show/Hide Profit</div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs">Show</span>
                    <Switch checked={showProfit} onCheckedChange={setShowProfit} />
                    <span className="text-xs">Hide</span>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2" onClick={saveShowProfit} disabled={savingShowProfit}>
                    {savingShowProfit ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Tax Details
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-xs text-gray-600 mb-2">(Tax should be in percent without % symbol, e.x: 12.5)</div>
                    <RadioGroup value={taxDetails.withTax ? "with" : "without"} onValueChange={(value) => setTaxDetails(prev => ({ ...prev, withTax: value === "with" }))}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="with" id="with-tax" />
                        <Label htmlFor="with-tax" className="text-sm">With Tax</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="without" id="without-tax" />
                        <Label htmlFor="without-tax" className="text-sm">Without Tax</Label>
                      </div>
                    </RadioGroup>
                    <div className="mt-2">
                      <Label className="text-xs">Tax Percentage(%):</Label>
                      <Input
                        type="number"
                        value={taxDetails.taxPercentage}
                        onChange={(e) => setTaxDetails(prev => ({ ...prev, taxPercentage: e.target.value }))}
                        className="text-xs w-20"
                      />
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveTaxDetails} disabled={savingTaxDetails}>
                    {savingTaxDetails ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

        </div>

        {/* Manage Search Days, Tax Details, Porterage Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Tax Details */}
   

          {/* Porterage Details */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Porterage Details
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Porterage details</div>
                    <RadioGroup value={porterageDetails.withPorterage ? "with" : "without"} onValueChange={(value) => setPorterageDetails(prev => ({ ...prev, withPorterage: value === "with" }))}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="with" id="with-porterage" />
                        <Label htmlFor="with-porterage" className="text-sm">With Porterage</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="without" id="without-porterage" />
                        <Label htmlFor="without-porterage" className="text-sm">Without Porterage</Label>
                      </div>
                    </RadioGroup>
                    <div className="mt-2">
                      <Label className="text-xs">Porterage Charge:</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={porterageDetails.porterageCharge}
                        onChange={(e) => setPorterageDetails(prev => ({ ...prev, porterageCharge: e.target.value }))}
                        className="text-xs w-20"
                      />
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={savePorterageDetails} disabled={savingPorterageDetails}>
                    {savingPorterageDetails ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>



          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Show Dashboard Info
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Show Dashboard Info</div>
                    <RadioGroup value={showDashboardInfo ? "yes" : "no"} onValueChange={(value) => setShowDashboardInfo(value === "yes")}> 
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="yes-dashboard" />
                        <Label htmlFor="yes-dashboard" className="text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="no-dashboard" />
                        <Label htmlFor="no-dashboard" className="text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveShowDashboardInfo} disabled={savingShowDashboardInfo}>
                    {savingShowDashboardInfo ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Currency Exchange */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Currency Exchange
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Currency</TableHead>
                          <TableHead>Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(currencyRates).map(([cur, rate]) => (
                          <TableRow key={cur}>
                            <TableCell>{cur}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.0001"
                                value={rate}
                                onChange={e => setCurrencyRates(prev => ({ ...prev, [cur]: e.target.value }))}
                                className="w-24 text-xs"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1" onClick={saveCurrencyRates} disabled={savingCurrencyRates}>
                    {savingCurrencyRates ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

        </div>

        {/* Show Dashboard Info, Branding, Currency Exchange */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Show Dashboard Info */}
          
        </div>
      </main>
    </div>
  );
};

export default AdminFunctions;
