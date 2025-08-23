import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HolidayRequest } from "@shared/schema";
import { Loader2, Plus, Eye, Edit, Trash2, Printer, Upload, FileText, CalendarIcon, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

const HolidayRequests = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entitlementEndDate, setEntitlementEndDate] = useState<Date | undefined>(new Date());
  const [showEntitlementReset, setShowEntitlementReset] = useState(false);

  const { data: holidayRequests = [], isLoading, error } = useQuery({
    queryKey: ["/api/holiday-requests"],
    queryFn: () => apiRequest("GET", "/api/holiday-requests"),
  });

  // File upload function using the same pattern as apiRequest
  const uploadFile = async (id: number, file: File) => {
    const formData = new FormData();
    formData.append('signedForm', file);

    // Use the same URL logic as apiRequest
    const useRelativeUrls = () => {
      return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    };

    const API_BASE_URL = 'http://localhost:5000';
    const url = useRelativeUrls() ? `/api/holiday-requests/${id}/upload-signed-form` : `${API_BASE_URL}/api/holiday-requests/${id}/upload-signed-form`;

    const token = localStorage.getItem('jwt_token');
    const headers: Record<string, string> = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    const responseData = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt_token');
        window.location.href = '/';
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
    }

    return responseData;
  };

  // Upload signed form mutation
  const uploadFormMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadFile(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
      setUploadingId(null);
      setSelectedFile(null);
      toast({
        title: "Success",
        description: "Signed form uploaded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload signed form",
        variant: "destructive",
      });
    }
  });

  // Reset entitlement mutation
  const resetEntitlementMutation = useMutation({
    mutationFn: (endDate: string) => apiRequest("POST", "/api/holiday-requests/reset-entitlement", { endDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
      setShowEntitlementReset(false);
      toast({
        title: "Success",
        description: "Holiday entitlements have been reset successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset entitlements",
        variant: "destructive",
      });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'granted':
        return <Badge className="bg-green-100 text-green-800">Granted</Badge>;
      case 'not_granted':
        return <Badge className="bg-red-100 text-red-800">Not Granted</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type (PDF, images)
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF or image file (JPG, PNG)",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = (id: number) => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    uploadFormMutation.mutate({ id, file: selectedFile });
  };

  const handleResetEntitlement = () => {
    if (!entitlementEndDate) {
      toast({
        title: "No date selected",
        description: "Please select an entitlement end date",
        variant: "destructive",
      });
      return;
    }

    const confirmReset = window.confirm(
      `Are you sure you want to reset all holiday entitlements? This will set the entitlement end date to ${format(entitlementEndDate, "dd/MM/yyyy")} and reset all employee holiday balances. This action cannot be undone.`
    );

    if (confirmReset) {
      resetEntitlementMutation.mutate(format(entitlementEndDate, "yyyy-MM-dd"));
    }
  };

  const handleViewSignedForm = async (request: HolidayRequest) => {
    if (request.signedFormPath) {
      try {
        // Use the same URL logic as apiRequest
        const useRelativeUrls = () => {
          return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        };

        const API_BASE_URL = 'http://localhost:5000';
        const url = useRelativeUrls() ? `/api/holiday-requests/${request.id}/signed-form` : `${API_BASE_URL}/api/holiday-requests/${request.id}/signed-form`;

        const token = localStorage.getItem('jwt_token');
        const headers: Record<string, string> = {};

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Fetch the file with authorization
        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('jwt_token');
            window.location.href = '/';
            throw new Error('Session expired. Please login again.');
          }
          throw new Error('Failed to load signed form');
        }

        // Create blob URL and open in new window
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');

        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load signed form",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "No signed form",
        description: "No signed form has been uploaded for this request",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading holiday requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading holiday requests: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Holiday Requests</h1>
            <p className="text-sm text-gray-500">Manage employee holiday requests</p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowEntitlementReset(true)}
              className="border-orange-500 text-orange-600 hover:bg-orange-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Entitlements
            </Button>
            <Link href="/payroll/holiday-requests/new">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">Holiday Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {holidayRequests.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No holiday requests found.</p>
                <Link href="/payroll/holiday-requests/new">
                  <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Request
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-2 text-left">Employee Name</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Job Title</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Days Requested</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Last Date at Work</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Return Date</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Days Granted</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Remaining Entitlement</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Signed Form</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidayRequests.map((request: HolidayRequest) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2">{request.employeeName}</td>
                        <td className="border border-gray-300 px-4 py-2">{request.jobTitle || '-'}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">{request.totalDaysRequested}</td>
                        <td className="border border-gray-300 px-4 py-2">
                          {request.lastDateAtWork ? format(new Date(request.lastDateAtWork), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {request.returnDateToWork ? format(new Date(request.returnDateToWork), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {request.daysGranted || '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {request.daysLeftEntitlement !== undefined ? request.daysLeftEntitlement : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex space-x-2">
                            {request.signedFormPath ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="View signed form"
                                onClick={() => handleViewSignedForm(request)}
                              >
                                <FileText className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Upload signed form"
                                    onClick={() => setUploadingId(request.id)}
                                  >
                                    <Upload className="h-4 w-4 text-blue-600" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Upload Signed Holiday Form</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label htmlFor="signedForm">Select signed form (PDF or Image)</Label>
                                      <Input
                                        id="signedForm"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={handleFileSelect}
                                        className="mt-2"
                                      />
                                      <p className="text-sm text-gray-500 mt-1">
                                        Accepted formats: PDF, JPG, PNG (Max 10MB)
                                      </p>
                                    </div>
                                    {selectedFile && (
                                      <div className="p-3 bg-gray-50 rounded">
                                        <p className="text-sm">
                                          <strong>Selected file:</strong> {selectedFile.name}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                          Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                      </div>
                                    )}
                                    <div className="flex justify-end space-x-2">
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          setUploadingId(null);
                                          setSelectedFile(null);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={() => handleUpload(request.id)}
                                        disabled={!selectedFile || uploadFormMutation.isPending}
                                      >
                                        {uploadFormMutation.isPending ? (
                                          <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Uploading...
                                          </>
                                        ) : (
                                          <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Upload
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex space-x-2">
                            <Link href={`/payroll/holiday-requests/view/${request.id}`}>
                              <Button variant="ghost" size="sm" title="View request">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/payroll/holiday-requests/edit/${request.id}`}>
                              <Button variant="ghost" size="sm" title="Edit request">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Print form"
                              onClick={() => window.open(`/print/holiday-request/${request.id}`, '_blank')}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Entitlement Reset Dialog */}
        <Dialog open={showEntitlementReset} onOpenChange={setShowEntitlementReset}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-orange-600">Reset Holiday Entitlements</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <RefreshCw className="h-5 w-5 text-orange-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-orange-800">
                      Warning: This action will reset all employee holiday entitlements
                    </h3>
                    <div className="mt-2 text-sm text-orange-700">
                      <ul className="list-disc list-inside space-y-1">
                        <li>All employees will have their holiday balances reset</li>
                        <li>The entitlement period will be updated</li>
                        <li>This action cannot be undone</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="entitlementEndDate" className="block text-sm font-medium mb-2">
                  New Entitlement End Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !entitlementEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {entitlementEndDate ? (
                        format(entitlementEndDate, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DayPicker
                      mode="single"
                      selected={entitlementEndDate}
                      onSelect={setEntitlementEndDate}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 5}
                      className="p-3"
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-sm text-gray-500 mt-1">
                  Select the end date for the new holiday entitlement period
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowEntitlementReset(false)}
                  disabled={resetEntitlementMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleResetEntitlement}
                  disabled={!entitlementEndDate || resetEntitlementMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {resetEntitlementMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reset Entitlements
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default HolidayRequests;