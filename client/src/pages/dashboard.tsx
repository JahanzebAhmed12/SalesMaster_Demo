import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
// Dashboard page content without layout wrapper
import SalesPurchaseChart from "@/components/charts/sales-purchase-chart";
import ProfitTrendChart from "@/components/charts/profit-trend-chart";
import { DollarSign, ShoppingCart, Percent, Package, TrendingUp, TrendingDown } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["/api/dashboard/charts"],
  });

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
              <h2 className="text-2xl font-bold mb-2">Welcome back, Admin!</h2>
              <p className="text-blue-100">Here's what's happening with your business today.</p>
            </div>
            <div className="text-6xl opacity-20">
              <TrendingUp />
            </div>
          </div>
        </div>

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

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Profit Margin</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.profitMargin?.toFixed(1) || '0'}%
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
                <Select defaultValue="7days">
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

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Profit Trend</CardTitle>
                <Select defaultValue="month">
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
                <ProfitTrendChart data={chartData.profitTrend} />
              )}
            </CardContent>
          </Card>
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
    </div>
  );
}
