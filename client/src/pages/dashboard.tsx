import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
// Dashboard page content without layout wrapper
import SalesPurchaseChart from "@/components/charts/sales-purchase-chart";
import ProfitTrendChart from "@/components/charts/profit-trend-chart";
import { DollarSign, ShoppingCart, Percent, Package, TrendingUp, TrendingDown, AlertTriangle, Calendar, User, Settings } from "lucide-react";
import React from "react";
import { useAuth } from "@/lib/auth";

export default function Dashboard() {
  const [range, setRange] = React.useState("7days");
  const [profitRange, setProfitRange] = React.useState("month");
  const [showProfit, setShowProfit] = React.useState(true);
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => apiRequest("GET", "/api/dashboard/stats")
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["/api/dashboard/charts", range, profitRange],
    queryFn: () => apiRequest("GET", `/api/dashboard/charts?range=${range}&profitRange=${profitRange}`)
  });

  // Fetch all employee documents
  const { data: allEmployees, isLoading: employeesLoading } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const data = await apiRequest("GET", "/api/employees");
      return data;
    },
  });

  // Fetch documents for all employees
  const { data: allDocs, isLoading: allDocsLoading } = useQuery({
    queryKey: ["all-employee-documents", allEmployees],
    queryFn: async () => {
      if (!allEmployees) return [];
      
      console.log('All employees data:', allEmployees);
      
      // Create a map of employee IDs to names for quick lookup
      const employeeMap = new Map(
        allEmployees.map((emp: any) => {
          console.log(`Employee ${emp.id} fields:`, Object.keys(emp));
          return [emp.id, emp.fullName || emp.full_name || emp.name || 'Unknown'];
        })
      );
      
      // Fetch documents for each employee
      const docsPromises = allEmployees.map((emp: any) => {
        console.log(`Fetching documents for employee ${emp.id} (${emp.fullName || emp.full_name || emp.name || 'Unknown'})`);
        return apiRequest("GET", `/api/employees/${emp.id}/documents`)
          .then(docs => {
            console.log(`Documents for employee ${emp.id}:`, docs);
            if (!Array.isArray(docs)) {
              console.warn(`Expected array of documents for employee ${emp.id}, got:`, docs);
              return [];
            }
            return docs.map((doc: any) => {
              const docData = {
                ...doc,
                employeeId: emp.id,
                employeeName: employeeMap.get(emp.id) || 'Unknown Employee',
                documentName: doc.documentName || doc.document_name || 'Unnamed Document',
                endDate: doc.endDate || doc.end_date || null
              };
              console.log(`Processed document for employee ${emp.id}:`, docData);
              return docData;
            });
          })
          .catch((error) => {
            console.error(`Error fetching documents for employee ${emp.id}:`, error);
            return [];
          });
      });
      
      const docsArrays = await Promise.all(docsPromises);
      const allDocs = docsArrays.flat();
      console.log('All processed documents:', allDocs);
      return allDocs;
    },
    enabled: !!allEmployees && allEmployees.length > 0,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const { data: allEquipment, isLoading: equipmentLoading } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: () => apiRequest("GET", "/api/equipment"),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Process documents to add status
  const processedDocs = React.useMemo(() => {
    if (!allDocs) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allDocs.map((doc: any) => {
      if (!doc.endDate) return { ...doc, status: 'valid' };
      
      const endDate = new Date(doc.endDate);
      endDate.setHours(0, 0, 0, 0);
      
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status = 'valid'; // Default status (green)
      if (diffDays <= 7) status = 'warning'; // Red if 1 week or less
      else if (diffDays <= 30) status = 'expiring'; // Yellow if 1 month or less
      
      return {
        ...doc,
        daysUntilExpiry: Math.max(0, diffDays),
        status
      };
    });
  }, [allDocs]);

  // Process equipment to add status
  const processedEquipment = React.useMemo(() => {
    if (!allEquipment) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allEquipment.map((eq: any) => {
      if (!eq.endDate) return { ...eq, expiryDate: null, status: 'valid' };
      
      const expiryDate = new Date(eq.endDate);
      expiryDate.setHours(0, 0, 0, 0);
      
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status = 'valid'; // Default status (green)
      if (diffDays <= 7) status = 'warning'; // Red if 1 week or less
      else if (diffDays <= 30) status = 'expiring'; // Yellow if 1 month or less
      
      return {
        ...eq,
        expiryDate: eq.endDate,
        daysUntilExpiry: Math.max(0, diffDays),
        status
      };
    });
  }, [allEquipment]);

  React.useEffect(() => {
    const getApiUrl = (endpoint: string) => {
      return useRelativeUrls() ? endpoint : `${API_BASE_URL}${endpoint}`;
    };
    
    fetch(getApiUrl("/api/settings"))
      .then(res => res.json())
      .then(settings => setShowProfit(settings.showProfit !== false));
  }, []);

  if (statsLoading || chartLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Welcome back, {user?.username || 'User'}!</h2>
              <p className="text-blue-100">Here's what's happening with your business today.</p>
            </div>
            <div className="text-6xl opacity-20">
              <TrendingUp />
            </div>
          </div>
        </div>

        {/* Employee Documents Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="text-blue-600 h-5 w-5" />
              <CardTitle>Employee Documents</CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {processedDocs.length} {processedDocs.length === 1 ? 'Document' : 'Documents'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processedDocs.map((doc: any) => (
                <div 
                  key={doc.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    doc.status === 'warning' 
                      ? 'bg-red-50 border-red-200' 
                      : doc.status === 'expiring'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      doc.status === 'warning' 
                        ? 'bg-red-100' 
                        : doc.status === 'expiring'
                          ? 'bg-yellow-100'
                          : 'bg-green-100'
                    }`}>
                      <User className={`h-4 w-4 ${
                        doc.status === 'warning' 
                          ? 'text-red-600' 
                          : doc.status === 'expiring'
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{doc.employeeName || 'Unknown Employee'}</p>
                      <p className="text-sm text-gray-600">{doc.documentName || 'Unnamed Document'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span>{doc.endDate ? new Date(doc.endDate).toLocaleDateString() : 'No expiry'}</span>
                    </div>
                    {doc.endDate && (
                      <p className={`text-sm font-medium ${
                        doc.status === 'warning' 
                          ? 'text-red-600' 
                          : doc.status === 'expiring'
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`}>
                        {doc.daysUntilExpiry === 0 
                          ? 'Expires today' 
                          : doc.daysUntilExpiry === 1 
                            ? 'Expires tomorrow'
                            : doc.daysUntilExpiry < 0
                              ? 'Expired'
                              : `Expires in ${doc.daysUntilExpiry} days`
                        }
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {processedDocs.length === 0 && (
                <p className="text-center text-gray-500 py-4">No documents found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Equipment Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings className="text-purple-600 h-5 w-5" />
              <CardTitle>Equipment</CardTitle>
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                {processedEquipment.length} {processedEquipment.length === 1 ? 'Item' : 'Items'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processedEquipment.map((eq: any) => (
                <div 
                  key={eq.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    eq.status === 'warning' 
                      ? 'bg-red-50 border-red-200' 
                      : eq.status === 'expiring'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      eq.status === 'warning' 
                        ? 'bg-red-100' 
                        : eq.status === 'expiring'
                          ? 'bg-yellow-100'
                          : 'bg-green-100'
                    }`}>
                      <Settings className={`h-4 w-4 ${
                        eq.status === 'warning' 
                          ? 'text-red-600' 
                          : eq.status === 'expiring'
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{eq.description || 'No Description'}</p>
                      <p className="text-sm text-gray-600">Equipment</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {eq.expiryDate ? (
                      <>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(eq.expiryDate).toLocaleDateString()}</span>
                        </div>
                        <p className={`text-sm font-medium ${
                          eq.status === 'warning' 
                            ? 'text-red-600' 
                            : eq.status === 'expiring'
                              ? 'text-yellow-600'
                              : 'text-green-600'
                        }`}>
                          {eq.daysUntilExpiry === 0 
                            ? 'Expires today' 
                            : eq.daysUntilExpiry === 1 
                              ? 'Expires tomorrow'
                              : eq.daysUntilExpiry < 0
                                ? 'Expired'
                                : `Expires in ${eq.daysUntilExpiry} days`
                          }
                        </p>
                      </>
                    ) : (
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1 text-sm text-gray-400">
                          <Calendar className="h-4 w-4 opacity-50" />
                          <span>No expiry</span>
                        </div>
                        <p className="text-xs text-gray-400">No expiration date set</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {processedEquipment.length === 0 && (
                <p className="text-center text-gray-500 py-4">No equipment found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Today's Sales</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${stats?.todaySales?.toLocaleString() || '0'}
                  </p>
                  <p className="text-green-600 text-sm mt-1">
                    <TrendingUp className="inline w-4 h-4 mr-1" />
                    +12.5% from yesterday
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Purchases</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${stats?.totalPurchases?.toLocaleString() || '0'}
                  </p>
                  <p className="text-orange-600 text-sm mt-1">
                    <TrendingDown className="inline w-4 h-4 mr-1" />
                    -3.2% from yesterday
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {showProfit && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm font-medium">Profit Margin</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {typeof stats?.profitMargin === "number"
                        ? stats.profitMargin.toFixed(1)
                        : "0"
                      }%
                    </p>
                    <p className="text-green-600 text-sm mt-1">
                      <TrendingUp className="inline w-4 h-4 mr-1" />
                      +1.8% from last week
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Percent className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Stock Items</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.stockItems?.toLocaleString() || '0'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    No change
                  </p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Package className="text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sales vs Purchases</CardTitle>
                <Select value={range} onValueChange={val => setRange(val)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">Last 7 days</SelectItem>
                    <SelectItem value="30days">Last 30 days</SelectItem>
                    <SelectItem value="3months">Last 3 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {chartData?.salesPurchase && (
                <SalesPurchaseChart data={chartData.salesPurchase} />
              )}
            </CardContent>
          </Card>

          {showProfit && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profit Trend</CardTitle>
                  <Select value={profitRange} onValueChange={val => setProfitRange(val)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastmonth">Last Month</SelectItem>
                      <SelectItem value="quarter">This Quarter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {chartData?.profitTrend && (
                  <ProfitTrendChart data={chartData.profitTrend} showProfit={showProfit} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Transactions</CardTitle>
              <a href="#" className="text-primary hover:text-blue-700 text-sm font-medium">
                View All
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer/Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats?.recentTransactions?.slice(0, 5).map((transaction: any, index: number) => (
                  <TableRow key={transaction.id || index}>
                    <TableCell className="font-medium">#{transaction.id}</TableCell>
                    <TableCell>Sale</TableCell>
                    <TableCell>{transaction.customerName}</TableCell>
                    <TableCell className="font-medium text-green-600">
                      +${parseFloat(transaction.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {new Date(transaction.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {transaction.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )) || (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </div>
  );
}
