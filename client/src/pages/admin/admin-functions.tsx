import { useState } from "react";
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

  const [backDateOptions, setBackDateOptions] = useState({
    admin: { editing: true, deleting: false },
    cashier: { editing: true, deleting: false },
    burhan: { editing: true, deleting: false },
    butt: { editing: true, deleting: false }
  });

  const [invoiceType, setInvoiceType] = useState("basic");
  const [stockRestriction, setStockRestriction] = useState("sell");
  const [currentDateEditing, setCurrentDateEditing] = useState({
    admin: { editing: true },
    cashier: { editing: false },
    burhan: { editing: false },
    butt: { editing: true }
  });

  const [emailConfig, setEmailConfig] = useState({
    emailId: "info@tropifruittuk.com",
    password: "••••••••••••"
  });

  const [showHideProfit, setShowHideProfit] = useState({
    admin: { show: true, hide: false },
    cashier: { show: false, hide: true },
    burhan: { show: false, hide: true },
    butt: { show: false, hide: true }
  });

  const [productSearchType, setProductSearchType] = useState("all");
  const [searchDays, setSearchDays] = useState("1");
  const [taxDetails, setTaxDetails] = useState({
    withTax: false,
    taxPercentage: "0"
  });
  const [porterageDetails, setPorterageDetails] = useState({
    withPorterage: true,
    porterageCharge: "0.07"
  });

  const [dailyBookType, setDailyBookType] = useState({
    admin: { showAll: true, showOnly: false },
    cashier: { showAll: true, showOnly: false },
    burhan: { showAll: true, showOnly: false },
    butt: { showAll: true, showOnly: false }
  });

  const [recordsPerInvoice, setRecordsPerInvoice] = useState("0");
  const [showOutstandingBalance, setShowOutstandingBalance] = useState(false);
  const [invoiceFooter, setInvoiceFooter] = useState("NO COMPLAINTS OR RETURN");
  const [invoicePrintFormat, setInvoicePrintFormat] = useState("A4");
  const [recordsPerPage, setRecordsPerPage] = useState("All");
  const [deliveryNoteWithPrice, setDeliveryNoteWithPrice] = useState(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin setup</h1>
          <div className="text-sm text-gray-500 mt-1">
            TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">MANAGE USERS</h2>
        </div>

        {/* User Work Time */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    (User) Work Time
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="text-sm text-gray-600 mb-4">
                    Working Time (24 hours format)
                  </div>
                  {Object.entries(userWorkTime).map(([user, times]) => (
                    <div key={user} className="mb-4">
                      <div className="font-medium text-sm mb-2">• {user}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Start Time:</Label>
                          <Input
                            type="time"
                            value={times.start}
                            onChange={(e) => setUserWorkTime(prev => ({
                              ...prev,
                              [user]: { ...prev[user], start: e.target.value }
                            }))}
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">End Time:</Label>
                          <Input
                            type="time"
                            value={times.end}
                            onChange={(e) => setUserWorkTime(prev => ({
                              ...prev,
                              [user]: { ...prev[user], end: e.target.value }
                            }))}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* User Restriction */}
          <Card className="shadow-sm border border-gray-200">
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
                  <div className="text-xs mb-2">User Restriction</div>
                  <div className="grid grid-cols-6 gap-1 text-xs mb-2">
                    <div className="font-medium">USERS</div>
                    <div className="text-center">DATA ENTRY</div>
                    <div className="text-center">DAILY REPORTS</div>
                    <div className="text-center">HISTORICAL REPORTS</div>
                    <div className="text-center">PAYMENTS</div>
                    <div className="text-center">ADMIN SET UP</div>
                    <div className="text-center">OTHERS</div>
                  </div>
                  {Object.keys(userRestrictions).map((user) => (
                    <div key={user} className="grid grid-cols-6 gap-1 mb-2 text-xs">
                      <div className="font-medium">• {user}</div>
                      {['dataEntry', 'dailyReports', 'historicalReports', 'payments', 'admin', 'others'].map((permission) => (
                        <div key={permission} className="flex flex-col items-center">
                          <div className="flex items-center gap-1">
                            <input type="radio" name={`${user}-${permission}`} className="w-2 h-2" />
                            <span className="text-xs">Show</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input type="radio" name={`${user}-${permission}`} className="w-2 h-2" />
                            <span className="text-xs">Hide</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Back Date Editing/Deleting */}
          <Card className="shadow-sm border border-gray-200">
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
                  <div className="text-xs mb-2">BackDate Edit/Delete Options (For previous Date)</div>
                  <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                    <div className="font-medium">USERS</div>
                    <div className="text-center">EDITING</div>
                    <div className="text-center">DELETING</div>
                  </div>
                  {Object.keys(backDateOptions).map((user) => (
                    <div key={user} className="grid grid-cols-4 gap-2 mb-2 text-xs items-center">
                      <div className="font-medium">• {user}</div>
                      <div className="flex justify-center">
                        <input type="checkbox" className="w-3 h-3" />
                        <span className="ml-1">Yes</span>
                      </div>
                      <div className="flex justify-center">
                        <input type="checkbox" className="w-3 h-3" />
                        <span className="ml-1">Yes</span>
                      </div>
                      <div className="flex justify-center">
                        <input type="checkbox" className="w-3 h-3" />
                        <span className="ml-1">No</span>
                      </div>
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Invoice Type, Invoice Restriction, Current Date Editing */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Invoice Type */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Invoice Type
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Manage Invoice Type</div>
                    <RadioGroup value={invoiceType} onValueChange={setInvoiceType}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="basic" id="basic" />
                        <Label htmlFor="basic" className="text-sm">Basic Invoice</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="full" id="full" />
                        <Label htmlFor="full" className="text-sm">Full Invoice</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Stock Restriction</div>
                    <RadioGroup value={stockRestriction} onValueChange={setStockRestriction}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sell" id="sell" />
                        <Label htmlFor="sell" className="text-sm">Sell Any Stock</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="available" id="available" />
                        <Label htmlFor="available" className="text-sm">Sell Available Stock</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Invoice Restriction */}
          <Card className="shadow-sm border border-gray-200">
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
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Lock CASH Invoice(All CASH invoices of current date will be LOCKED)</div>
                    <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mb-4">
                      Lock CASH Invoice
                    </Button>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Lock all Invoice(All invoice of current date will be LOCKED)</div>
                    <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mb-4">
                      Lock all
                    </Button>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Auto Lock Cash Invoice</div>
                    <div className="text-xs text-gray-600 mb-2">(Cash Invoice will be locked)</div>
                    <div className="flex gap-2">
                      <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                        Lock Cash Invoices
                      </Button>
                      <Button variant="outline" className="text-xs px-4 py-1">
                        UnLock
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Current Date Editing */}
          <Card className="shadow-sm border border-gray-200">
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
                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div className="font-medium">USERS</div>
                    <div className="text-center">EDITING</div>
                  </div>
                  {Object.keys(currentDateEditing).map((user) => (
                    <div key={user} className="grid grid-cols-2 gap-2 mb-2 text-xs items-center">
                      <div className="font-medium">• {user}</div>
                      <div className="flex justify-center">
                        <input type="checkbox" className="w-3 h-3" />
                        <span className="ml-1">Yes</span>
                        <input type="checkbox" className="w-3 h-3 ml-2" />
                        <span className="ml-1">No</span>
                      </div>
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Daily Book Type, No.of Records per Invoice, Show Outstanding Bal in invoice */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Daily Book Type */}
          <Card className="shadow-sm border border-gray-200">
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
                  <div className="grid grid-cols-3 gap-1 text-xs mb-2">
                    <div className="font-medium">USERS</div>
                    <div className="text-center">Show all Invoice</div>
                    <div className="text-center">Show Only user's Invoice</div>
                  </div>
                  {Object.keys(dailyBookType).map((user) => (
                    <div key={user} className="grid grid-cols-3 gap-1 mb-2 text-xs items-center">
                      <div className="font-medium">• {user}</div>
                      <div className="flex justify-center">
                        <Checkbox />
                        <span className="ml-1 text-xs">Yes</span>
                      </div>
                      <div className="flex justify-center">
                        <Checkbox />
                        <span className="ml-1 text-xs">Yes</span>
                      </div>
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* No.of Records per Invoice */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    No.of Records per Invoice
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-xs text-gray-600 mb-2">No of Records per Invoice(Note: 0 for unlimited records.)</div>
                    <div>
                      <Label className="text-xs">No.Of Records per Invoice:</Label>
                      <Input
                        type="number"
                        value={recordsPerInvoice}
                        onChange={(e) => setRecordsPerInvoice(e.target.value)}
                        className="text-xs w-20 mt-1"
                      />
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Show Outstanding Bal in invoice */}
          <Card className="shadow-sm border border-gray-200">
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
                    <RadioGroup value={showOutstandingBalance ? "yes" : "no"} onValueChange={(value) => setShowOutstandingBalance(value === "yes")}>
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Invoice Footer, Invoice Print Format, Records per page */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Invoice Footer */}
          <Card className="shadow-sm border border-gray-200">
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
                    <div className="text-xs text-gray-600 mb-2">Invoice Footer(Note: This statement will be display on all invoice print.)</div>
                    <div>
                      <Label className="text-xs">Invoice footer notes:</Label>
                      <Textarea
                        value={invoiceFooter}
                        onChange={(e) => setInvoiceFooter(e.target.value)}
                        className="text-xs mt-1"
                        rows={3}
                      />
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Invoice Print Format */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Invoice Print Format
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Invoice Print Format</div>
                    <RadioGroup value={invoicePrintFormat} onValueChange={setInvoicePrintFormat}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="A4" id="a4" />
                        <Label htmlFor="a4" className="text-sm">A4</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="A5" id="a5" />
                        <Label htmlFor="a5" className="text-sm">A5</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Records per page */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Records per page
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Records per page</div>
                    <select 
                      value={recordsPerPage} 
                      onChange={(e) => setRecordsPerPage(e.target.value)}
                      className="w-full p-2 border rounded text-xs"
                    >
                      <option value="All">All</option>
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Delivery Note with Price, Delivery Note with Name or Code, Delivery acknowledgement */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Delivery Note with Price */}
          <Card className="shadow-sm border border-gray-200">
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
                    <div className="text-sm font-medium mb-2">Delivery note with Price</div>
                    <RadioGroup value={deliveryNoteWithPrice ? "yes" : "no"} onValueChange={(value) => setDeliveryNoteWithPrice(value === "yes")}>
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
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
                    <div className="text-sm font-medium mb-2">Change Email-Id and Password (Note: Email id should be of same domain)</div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Email-Id:</Label>
                        <Input
                          type="email"
                          value={emailConfig.emailId}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, emailId: e.target.value }))}
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Password:</Label>
                        <Input
                          type="password"
                          value={emailConfig.password}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, password: e.target.value }))}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
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
                  {Object.keys(showHideProfit).map((user) => (
                    <div key={user} className="flex items-center justify-between mb-2">
                      <span className="text-xs">• {user}</span>
                      <div className="flex items-center gap-2">
                        <input type="radio" name={`profit-${user}`} className="w-3 h-3" />
                        <span className="text-xs">Show</span>
                        <input type="radio" name={`profit-${user}`} className="w-3 h-3" />
                        <span className="text-xs">Hide</span>
                      </div>
                    </div>
                  ))}
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 mt-2">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Product Search Type */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Product Search Type
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Product Search Type</div>
                    <RadioGroup value={productSearchType} onValueChange={setProductSearchType}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="available" id="available-products" />
                        <Label htmlFor="available-products" className="text-sm">Available Products</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="all-products" />
                        <Label htmlFor="all-products" className="text-sm">All Products</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Manage Search Days, Tax Details, Porterage Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Manage Search Days */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Manage Search Days
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">No of days to search for available products</div>
                    <div>
                      <Label className="text-xs">Search Days:</Label>
                      <Input
                        type="number"
                        value={searchDays}
                        onChange={(e) => setSearchDays(e.target.value)}
                        className="text-xs w-20"
                      />
                    </div>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Tax Details */}
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

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
                    <div className="text-sm font-medium mb-2">porterage details</div>
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Show Dashboard Info, Branding, Currency Exchange */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Show Dashboard Info */}
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
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Branding */}
          <Card className="shadow-sm border border-gray-200">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-blue-500 text-white">
                  <CardTitle className="flex items-center justify-between text-sm">
                    Branding
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-4">
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Branding of Email / Print</div>
                    <RadioGroup value={brandingEmail ? "yes" : "no"} onValueChange={(value) => setBrandingEmail(value === "yes")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="yes-branding" />
                        <Label htmlFor="yes-branding" className="text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="no-branding" />
                        <Label htmlFor="no-branding" className="text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
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
                          <TableHead className="text-xs">Currency Code</TableHead>
                          <TableHead className="text-xs">Exchange Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(currencyRates).map(([currency, rate]) => (
                          <TableRow key={currency}>
                            <TableCell className="text-xs">{currency}</TableCell>
                            <TableCell className="text-xs">
                              <Input
                                type="number"
                                step="0.0001"
                                value={rate}
                                onChange={(e) => setCurrencyRates(prev => ({ ...prev, [currency]: e.target.value }))}
                                className="text-xs w-20"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1">
                    Save
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AdminFunctions;
