import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HolidayRequest } from "@shared/schema";
import { Loader2, Edit, ArrowLeft, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const HolidayRequestView = () => {
  const { id } = useParams<{ id: string }>();
  const requestId = parseInt(id!);

  const { data: request, isLoading, error } = useQuery({
    queryKey: ["holiday-request", requestId],
    queryFn: () => apiRequest("GET", `/api/holiday-requests/${requestId}`),
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading holiday request...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading holiday request: {error.message}</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500">Holiday request not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Holiday Request Details</h1>
            <p className="text-sm text-gray-500">View holiday request information</p>
          </div>
          <div className="flex space-x-2">
            <Link href="/payroll/holiday-requests">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to List
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => window.open(`/print/holiday-request/${requestId}`, '_blank')}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Form
            </Button>
            <Link href={`/payroll/holiday-requests/edit/${requestId}`}>
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                <Edit className="h-4 w-4 mr-2" />
                Edit Request
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">TROPIFRUIT U.K. HOLIDAY REQUEST FORM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Employee Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Employee Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Name of Employee</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.employeeName}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Job Title</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.jobTitle || '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Total Number of Days</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.totalDaysRequested} days
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Status</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {getStatusBadge(request.status)}
                  </div>
                </div>
              </div>
            </div>

            {/* Holiday Dates */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Holiday Dates</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Last Date at Work</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.lastDateAtWork ? format(new Date(request.lastDateAtWork), 'dd/MM/yyyy') : '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Return Date to Work</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.returnDateToWork ? format(new Date(request.returnDateToWork), 'dd/MM/yyyy') : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Signature */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Employee Signature</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Signed by Employee</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.signedByEmployee || '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">Date by Employee</label>
                  <div className="p-3 bg-gray-50 border rounded-md">
                    {request.dateByEmployee ? format(new Date(request.dateByEmployee), 'dd/MM/yyyy') : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Management Decision */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Management Decision</h3>
              
              <div className="bg-blue-50 p-4 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Days Granted</label>
                    <div className="p-3 bg-white border rounded-md">
                      {request.daysGranted || '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Days Left from Entitlement</label>
                    <div className="p-3 bg-white border rounded-md">
                      {request.daysLeftEntitlement || '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Status</label>
                    <div className="p-3 bg-white border rounded-md">
                      {getStatusBadge(request.status)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Manager Name</label>
                    <div className="p-3 bg-white border rounded-md">
                      {request.managerName || '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Signed by Manager</label>
                    <div className="p-3 bg-white border rounded-md">
                      {request.signedByManager || '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Dated by Manager</label>
                    <div className="p-3 bg-white border rounded-md">
                      {request.datedByManager ? format(new Date(request.datedByManager), 'dd/MM/yyyy') : '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-600">Manager Comments</label>
                    <div className="p-3 bg-white border rounded-md min-h-[80px]">
                      {request.managerComments || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Information */}
            <div className="bg-gray-100 p-4 rounded-md text-sm text-gray-600">
              <p className="mb-2">
                <strong>Note:</strong> You will receive a photocopy of your application with a decision & it will be signed by the manager.
              </p>
              <p>
                Keep that copy for reference as it will give you the number of days you have left from this year's entitlement.
              </p>
            </div>

            {/* Timestamps */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-500">
                <div>
                  <strong>Created:</strong> {request.createdAt ? format(new Date(request.createdAt), 'dd/MM/yyyy HH:mm') : '-'}
                </div>
                <div>
                  <strong>Last Updated:</strong> {request.updatedAt ? format(new Date(request.updatedAt), 'dd/MM/yyyy HH:mm') : '-'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HolidayRequestView;