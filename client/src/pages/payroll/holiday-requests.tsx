import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HolidayRequest } from "@shared/schema";
import { Loader2, Plus, Eye, Edit, Trash2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const HolidayRequests = () => {
  const { data: holidayRequests = [], isLoading, error } = useQuery({
    queryKey: ["holiday-requests"],
    queryFn: () => apiRequest("GET", "/api/holiday-requests"),
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
      </div>
    </div>
  );
};

export default HolidayRequests;