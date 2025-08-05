import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Calendar, ArrowRight, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BusinessDate {
  currentDate: string;
  nextDate: string;
  isNextDay: boolean;
}

export default function ClosingTime() {
  const { toast } = useToast();
  const [currentBusinessDate, setCurrentBusinessDate] = useState<string>("");
  const [nextBusinessDate, setNextBusinessDate] = useState<string>("");

  // Get current business date from backend
  const { data: businessDate, isLoading, refetch } = useQuery<BusinessDate>({
    queryKey: ['/api/business-date'],
    queryFn: () => apiRequest<BusinessDate>('GET', '/api/business-date'),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Switch to next business date mutation
  const switchDateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/business-date/switch'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business-date'] });
      toast({
        title: "Date Switched Successfully",
        description: "System has been switched to the next business date. All new entries will use the new date.",
      });
      refetch();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to switch business date. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reset business date mutation
  const resetDateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/business-date/reset'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business-date'] });
      toast({
        title: "Date Reset Successfully",
        description: "Business date has been reset to current system date.",
      });
      refetch();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset business date. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (businessDate) {
      setCurrentBusinessDate(businessDate.currentDate);
      setNextBusinessDate(businessDate.nextDate);
    }
  }, [businessDate]);

  const handleDateSwitch = () => {
    switchDateMutation.mutate();
  };

  const handleDateReset = () => {
    resetDateMutation.mutate();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-64 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Business Date Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Switching the business date will affect all new data entries. 
              All sales, purchases, and other transactions will use the new business date.
            </AlertDescription>
          </Alert>

          {/* Current System Status */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg text-blue-800">Current System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-blue-600 font-medium">Current System Time</p>
                  <p className="text-2xl font-bold text-blue-900">{getCurrentTime()}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-blue-600 font-medium">System Date</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {new Date().toLocaleDateString('en-GB', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Date Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Current Business Date */}
            <Card className="border-2 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Current Business Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-green-900 mb-2">
                    {currentBusinessDate ? formatDate(currentBusinessDate) : "Loading..."}
                  </p>
                  <p className="text-sm text-green-700">
                    All current entries are using this date
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Next Business Date */}
            <Card className="border-2 border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-orange-800 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Next Business Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-orange-900 mb-2">
                    {nextBusinessDate ? formatDate(nextBusinessDate) : "Loading..."}
                  </p>
                  <p className="text-sm text-orange-700">
                    Switch to this date for new entries
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 py-6">
            {/* Reset Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline"
                  size="lg" 
                  className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-3"
                  disabled={resetDateMutation.isPending}
                >
                  {resetDateMutation.isPending ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Reset to Current Date
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                    Reset Business Date
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <p>
                      This will reset the business date to today's system date and clear any manual overrides.
                    </p>
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                      <p><strong>Current System Date:</strong> {new Date().toLocaleDateString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</p>
                    </div>
                    <p className="text-sm text-blue-600">
                      This will make the business date match today's actual date.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDateReset}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Reset to Current Date
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Switch Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  size="lg" 
                  className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3"
                  disabled={switchDateMutation.isPending}
                >
                  {switchDateMutation.isPending ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Switching...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Switch to Next Business Date
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    Confirm Date Switch
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <p>
                      Are you sure you want to switch the business date?
                    </p>
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                      <p><strong>From:</strong> {currentBusinessDate ? formatDate(currentBusinessDate) : "Loading..."}</p>
                      <p><strong>To:</strong> {nextBusinessDate ? formatDate(nextBusinessDate) : "Loading..."}</p>
                    </div>
                    <p className="text-sm text-red-600">
                      <strong>Warning:</strong> This action will affect all new data entries. 
                      All sales, purchases, expenses, and other transactions will use the new business date.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDateSwitch}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Yes, Switch Date
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Information Card */}
          <Card className="bg-gray-50 border-gray-200">
            <CardHeader>
              <CardTitle className="text-sm text-gray-800">How Business Date Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>The business date determines which date is used for all new transactions and entries.</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Switching the date will immediately affect all data entry pages including sales, purchases, expenses, etc.</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Use this feature at the end of each business day to move to the next day.</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Saturday is a working day. Only Sunday will be skipped when switching dates.</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Use "Reset to Current Date" if you need to sync the business date with today's actual date.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
