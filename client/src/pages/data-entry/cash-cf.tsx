import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, DollarSign, Save } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import React from "react";

export default function CashCF() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [pounds, setPounds] = useState("");
  const [coins, setCoins] = useState("");
  const queryClient = useQueryClient();

  // Fetch C/F for selected date
  const { data, isLoading, isError } = useQuery<{ pounds?: number; coins?: number } | undefined>({
    queryKey: ["cash-cf", fromDate],
    queryFn: async () => {
      const dateStr = format(fromDate, "yyyy-MM-dd");
      return apiRequest("GET", `/api/cash-cf?date=${dateStr}`);
    },
  });

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Update pounds/coins when data changes
  React.useEffect(() => {
    if (data) {
      setPounds(data.pounds !== undefined ? String(data.pounds) : "");
      setCoins(data.coins !== undefined ? String(data.coins) : "");
    }
  }, [data]);

  // Save C/F
  const mutation = useMutation({
    mutationFn: async (payload: { date: string; pounds: string; coins: string }) => {
      return apiRequest("POST", "/api/cash-cf", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-cf"] });
    },
  });

  const handleSave = () => {
    if (pounds || coins) {
      mutation.mutate({
        date: format(fromDate, "yyyy-MM-dd"),
        pounds: pounds || "0",
        coins: coins || "0",
      });
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
                    disabled={mutation.isPending}
                  >
                    <Save size={16} className="mr-2" />
                    {mutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}