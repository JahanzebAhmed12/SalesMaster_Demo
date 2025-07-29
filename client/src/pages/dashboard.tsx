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
    queryFn: () => apiRequest("GET", `/api/dashboard/charts?range=${range}&profitRange=${profitRange}`),
  });

  const { data: expiringDocs, isLoading: expiringDocsLoading } = useQuery({
    queryKey: ["/api/employees/documents/expiring"],
    queryFn: () => apiRequest("GET", "/api/employees/documents/expiring"),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const { data: expiringEquipment, isLoading: expiringEquipmentLoading } = useQuery({
    queryKey: ["/api/equipment/expiring"],
    queryFn: () => apiRequest("GET", "/api/equipment/expiring"),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

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

        {/* Employee Document Expiration Alerts */}
        {!expiringDocsLoading && expiringDocs && expiringDocs.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-orange-600 h-5 w-5" />
                <CardTitle className="text-orange-800">Document Expiration Alerts</CardTitle>
                <Badge variant="secondary" className="bg-orange-200 text-orange-800">
                  {expiringDocs.length} {expiringDocs.length === 1 ? 'Alert' : 'Alerts'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expiringDocs.slice(0, 5).map((alert: any) => (
                  <div 
                    key={alert.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      alert.isExpiringSoon 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        alert.isExpiringSoon ? 'bg-red-100' : 'bg-yellow-100'
                      }`}>
                        <User className={`h-4 w-4 ${
                          alert.isExpiringSoon ? 'text-red-600' : 'text-yellow-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{alert.employeeName}</p>
                        <p className="text-sm text-gray-600">{alert.documentName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(alert.endDate).toLocaleDateString()}</span>
                      </div>
                      <p className={`text-sm font-medium ${
                        alert.isExpiringSoon ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {alert.daysUntilExpiry === 0 
                          ? 'Expires today' 
                          : alert.daysUntilExpiry === 1 
                            ? 'Expires tomorrow'
                            : `Expires in ${alert.daysUntilExpiry} days`
                        }
                      </p>
                    </div>
                  </div>
                ))}
                {expiringDocs.length > 5 && (
                  <div className="text-center pt-2">
                    <p className="text-sm text-gray-600">
                      And {expiringDocs.length - 5} more documents expiring soon...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Equipment Expiration Alerts */}
        {!expiringEquipmentLoading && expiringEquipment && expiringEquipment.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-red-600 h-5 w-5" />
                <CardTitle className="text-red-800">Equipment Expiration Alerts</CardTitle>
                <Badge variant="secondary" className="bg-red-200 text-red-800">
                  {expiringEquipment.length} {expiringEquipment.length === 1 ? 'Alert' : 'Alerts'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expiringEquipment.slice(0, 5).map((alert: any) => (
                  <div 
                    key={alert.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      alert.isExpiringSoon 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        alert.isExpiringSoon ? 'bg-red-100' : 'bg-yellow-100'
                      }`}>
                        <Settings className={`h-4 w-4 ${
                          alert.isExpiringSoon ? 'text-red-600' : 'text-yellow-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{alert.description}</p>
                        <p className="text-sm text-gray-600">Equipment</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(alert.endDate).toLocaleDateString()}</span>
                      </div>
                      <p className={`text-sm font-medium ${
                        alert.isExpiringSoon ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {alert.daysUntilExpiry === 0 
                          ? 'Expires today' 
                          : alert.daysUntilExpiry === 1 
                            ? 'Expires tomorrow'
                            : `Expires in ${alert.daysUntilExpiry} days`
                        }
                      </p>
                    </div>
                  </div>
                ))}
                {expiringEquipment.length > 5 && (
                  <div className="text-center pt-2">
                    <p className="text-sm text-gray-600">
                      And {expiringEquipment.length - 5} more equipment expiring soon...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
