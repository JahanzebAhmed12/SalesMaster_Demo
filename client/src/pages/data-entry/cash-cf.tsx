import { useState, useEffect } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, DollarSign, Save, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessDate } from "@/hooks/use-business-date";
import React from "react";

export default function CashCF() {
  // Get business date
  const { businessDate } = useBusinessDate();
  
  // State
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [pounds, setPounds] = useState("");
  const [coins, setCoins] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const queryClient = useQueryClient();
  
  // Initialize date with business date when available
  useEffect(() => {
    if (businessDate) {
      setFromDate(new Date(businessDate));
    } else {
      setFromDate(new Date());
    }
  }, []);

  // Fetch C/F for selected date
  const { data, isLoading, isError } = useQuery<{ id?: number; date?: string; pounds?: number; coins?: number; createdAt?: string }>({
    queryKey: ["cash-cf", fromDate],
    queryFn: async () => {
      const dateStr = fromDate ? format(fromDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
      return apiRequest("GET", `/api/cash-cf?date=${dateStr}`);
    },
  });

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Update pounds/coins when data changes or date changes (but not right after saving)
  React.useEffect(() => {
    if (justSaved) {
      // Don't populate fields if we just saved
      return;
    }
    
    if (data && data.id && data.pounds !== undefined && data.coins !== undefined) {
      // Only populate fields if there's an existing entry
      setPounds(String(data.pounds));
      setCoins(String(data.coins));
    } else {
      // Clear fields if no entry exists for this date
      setPounds("");
      setCoins("");
    }
  }, [data, fromDate, justSaved]);

  // Reset justSaved flag when date changes
  React.useEffect(() => {
    setJustSaved(false);
  }, [fromDate]);

  // Save C/F
  const saveMutation = useMutation({
    mutationFn: async (payload: { date: string; pounds: string; coins: string }) => {
      return apiRequest("POST", "/api/cash-cf", payload);
    },
    onSuccess: () => {
      // Set flag to prevent useEffect from refilling fields
      setJustSaved(true);
      // Reset fields after successful save
      setPounds("");
      setCoins("");
      // Invalidate queries to refresh the table
      queryClient.invalidateQueries({ queryKey: ["cash-cf"] });
    },
  });

  // Delete C/F
  const deleteMutation = useMutation({
    mutationFn: async (date: string) => {
      return apiRequest("DELETE", `/api/cash-cf?date=${date}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-cf"] });
    },
  });

  const handleSave = () => {
    if ((pounds || coins) && fromDate) {
      saveMutation.mutate({
        date: format(fromDate, "yyyy-MM-dd"),
        pounds: pounds || "0",
        coins: coins || "0",
      });
    }
  };

  const handleDelete = () => {
    if (data && data.id && fromDate) {
      deleteMutation.mutate(format(fromDate, "yyyy-MM-dd"));
    }
  };

  return (
    <PageLayout title="CF Add" breadcrumb="Cash C/F">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <DollarSign size={20} />
                CF Add
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Label>From Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate ? format(fromDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={(date) => date && setFromDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => queryClient.invalidateQueries({ queryKey: ["cash-cf"] })}>
                Search
              </Button>
              <div className="ml-auto">
                <Button variant="outline" size="sm" className="rounded-full w-8 h-8 p-0">
                  ?
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash Entry Section */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : isError ? (
              <div className="text-center text-red-500 py-8">Failed to load data.</div>
            ) : (
            <div className="grid grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">Pounds</h3>
                <Input
                  type="number"
                  step="0.01"
                  value={pounds}
                  onChange={(e) => setPounds(e.target.value)}
                  className="text-center text-lg h-12"
                  placeholder="0.00"
                />
              </div>
              
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">Coins</h3>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={coins}
                    onChange={(e) => setCoins(e.target.value)}
                    className="text-center text-lg h-12"
                    placeholder="0.00"
                  />
                  <Button
                    className="bg-green-500 hover:bg-green-600 text-white h-12 px-6"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    <Save size={16} className="mr-2" />
                    {saveMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Current Entry Display */}
        {data && data.id && (
          <Card>
            <CardHeader>
              <CardTitle>Current Cash C/F Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Pounds</TableHead>
                    <TableHead className="text-right">Coins</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="w-16">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>{data.date}</TableCell>
                    <TableCell className="text-right">£{data.pounds?.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{data.coins?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">£{((data.pounds || 0) + (data.coins || 0)).toFixed(2)}</TableCell>
                    <TableCell>{data.createdAt ? format(new Date(data.createdAt), "yyyy-MM-dd HH:mm:ss") : ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}