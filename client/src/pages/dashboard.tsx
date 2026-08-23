import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { TrendingUp, AlertTriangle, Calendar, User, Settings } from "lucide-react";
import React from "react";
import { useAuth } from "@/lib/auth";
import { useBusinessDate } from "@/hooks/use-business-date";

export default function Dashboard() {
  const { user } = useAuth();
  const { businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate({
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Pagination states for each section
  const [holidayCurrentPage, setHolidayCurrentPage] = React.useState(1);
  const [holidayItemsPerPage, setHolidayItemsPerPage] = React.useState(5);
  const [holidayRequestsPage, setHolidayRequestsPage] = React.useState(1);
  const [holidayRequestsPerPage, setHolidayRequestsPerPage] = React.useState(5);
  const [documentsPage, setDocumentsPage] = React.useState(1);
  const [documentsPerPage, setDocumentsPerPage] = React.useState(5);
  const [equipmentPage, setEquipmentPage] = React.useState(1);
  const [equipmentPerPage, setEquipmentPerPage] = React.useState(5);
  // (no duplicates below)

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

  // Fetch current holiday requests
  const { data: holidayRequestsResponse, isLoading: holidayLoading } = useQuery({
    queryKey: ["/api/holiday-requests", 1, 100], // Get first 100 requests
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        per_page: "100"
      });
      const response = await apiRequest("GET", `/api/holiday-requests?${params}`);
      console.log('Holiday requests API response:', response);
      return response;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Process documents to add status - only show documents with end dates
  const processedDocs = React.useMemo(() => {
    if (!allDocs) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allDocs
      .filter((doc: any) => doc.endDate) // Only show documents with end dates
      .map((doc: any) => {
        const endDate = new Date(doc.endDate);
        endDate.setHours(0, 0, 0, 0);
        
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let status = 'valid'; // Default status (green)
        let priority = 3; // Lower number = higher priority
        
        if (diffDays <= 0) {
          status = 'expired';
          priority = 0; // Highest priority
        } else if (diffDays <= 7) {
          status = 'warning'; // Red if 1 week or less
          priority = 1;
        } else if (diffDays <= 30) {
          status = 'expiring'; // Yellow if 1 month or less
          priority = 2;
        }
        
        return {
          ...doc,
          daysUntilExpiry: Math.max(0, diffDays),
          status,
          priority
        };
      })
      .sort((a, b) => {
        // Sort by priority first (0 = highest priority), then by days until expiry
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.daysUntilExpiry - b.daysUntilExpiry;
      });
  }, [allDocs]);

  // Process equipment to add status - only show equipment with end dates
  const processedEquipment = React.useMemo(() => {
    if (!allEquipment) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allEquipment
      .filter((eq: any) => eq.endDate) // Only show equipment with end dates
      .map((eq: any) => {
        const expiryDate = new Date(eq.endDate);
        expiryDate.setHours(0, 0, 0, 0);
        
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let status = 'valid'; // Default status (green)
        let priority = 3; // Lower number = higher priority
        
        if (diffDays <= 0) {
          status = 'expired';
          priority = 0; // Highest priority
        } else if (diffDays <= 7) {
          status = 'warning'; // Red if 1 week or less
          priority = 1;
        } else if (diffDays <= 30) {
          status = 'expiring'; // Yellow if 1 month or less
          priority = 2;
        }
        
        return {
          ...eq,
          expiryDate: eq.endDate,
          daysUntilExpiry: Math.max(0, diffDays),
          status,
          priority
        };
      })
      .sort((a, b) => {
        // Sort by priority first (0 = highest priority), then by days until expiry
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.daysUntilExpiry - b.daysUntilExpiry;
      });
  }, [allEquipment]);

  // Process holiday requests to find employees currently on holiday
  const { employeesOnHoliday, allGrantedRequests } = React.useMemo(() => {
    if (!holidayRequestsResponse?.data || !businessDate) {
      console.log('No holiday requests data or business date available');
      return { employeesOnHoliday: [], allGrantedRequests: [] };
    }
    
    const today = new Date(businessDate);
    today.setHours(0, 0, 0, 0);
    console.log('Business Date (Today):', today.toDateString());
    console.log('All holiday requests:', holidayRequestsResponse.data);

    // Get all granted requests for the first section
    const allGranted = holidayRequestsResponse.data.filter((request: any) => request.status === 'granted');
    
    // Filter for employees currently on holiday
    const currentlyOnHoliday = holidayRequestsResponse.data
      .filter((request: any) => {
        console.log(`Processing request for ${request.employeeName}:`, {
          status: request.status,
          lastDateAtWork: request.lastDateAtWork,
          returnDateToWork: request.returnDateToWork
        });
        
        // Only show granted requests
        if (request.status !== 'granted') {
          console.log(`Request for ${request.employeeName} not granted (status: ${request.status})`);
          return false;
        }
        
        // Check if the holiday period includes today
        if (!request.lastDateAtWork || !request.returnDateToWork) {
          console.log(`Request for ${request.employeeName} missing dates`);
          return false;
        }
        
        const lastWorkDate = new Date(request.lastDateAtWork);
        const returnDate = new Date(request.returnDateToWork);
        lastWorkDate.setHours(0, 0, 0, 0);
        returnDate.setHours(0, 0, 0, 0);
        
        // Employee is on holiday if today is after last work date and before or equal to return date
        // The holiday period is from the day after lastDateAtWork until returnDateToWork (inclusive)
        const holidayStartDate = new Date(lastWorkDate);
        holidayStartDate.setDate(holidayStartDate.getDate() + 1); // Holiday starts the day after last work date
        
        const isOnHoliday = today >= holidayStartDate && today <= returnDate;
        
        console.log(`Date comparison for ${request.employeeName}:`, {
          lastWorkDate: lastWorkDate.toDateString(),
          holidayStartDate: holidayStartDate.toDateString(),
          returnDate: returnDate.toDateString(),
          today: today.toDateString(),
          isAfterHolidayStart: today >= holidayStartDate,
          isBeforeOrOnReturn: today <= returnDate,
          isOnHoliday: isOnHoliday
        });
        
        if (isOnHoliday) {
          console.log(`${request.employeeName} is currently on holiday`);
        }
        
        return isOnHoliday;
      })
      .map((request: any) => {
        const returnDate = new Date(request.returnDateToWork);
        returnDate.setHours(0, 0, 0, 0);
        
        const diffTime = returnDate.getTime() - today.getTime();
        const daysUntilReturn = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return {
          ...request,
          daysUntilReturn: Math.max(0, daysUntilReturn)
        };
      })
      .sort((a, b) => a.daysUntilReturn - b.daysUntilReturn); // Sort by return date (soonest first)
    
    console.log('Filtered employees on holiday:', currentlyOnHoliday);
    return { 
      employeesOnHoliday: currentlyOnHoliday, 
      allGrantedRequests: allGranted 
    };
  }, [holidayRequestsResponse, businessDate]);

  // Helper function to paginate data
  const paginateData = (data: any[], page: number, itemsPerPage: number) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      data: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      totalItems: data.length
    };
  };

  // Paginated data for each section
  const paginatedHolidayEmployees = React.useMemo(() => 
    paginateData(employeesOnHoliday, holidayCurrentPage, holidayItemsPerPage),
    [employeesOnHoliday, holidayCurrentPage, holidayItemsPerPage]
  );

  const paginatedHolidayRequests = React.useMemo(() => 
    paginateData(allGrantedRequests, holidayRequestsPage, holidayRequestsPerPage),
    [allGrantedRequests, holidayRequestsPage, holidayRequestsPerPage]
  );

  const paginatedDocuments = React.useMemo(() => 
    paginateData(processedDocs, documentsPage, documentsPerPage),
    [processedDocs, documentsPage, documentsPerPage]
  );

  const paginatedEquipment = React.useMemo(() => 
    paginateData(processedEquipment, equipmentPage, equipmentPerPage),
    [processedEquipment, equipmentPage, equipmentPerPage]
  );

  if (employeesLoading || allDocsLoading || equipmentLoading || holidayLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 gap-6">
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

        {/* 1. Equipment Section */}
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
              {equipmentLoading ? (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                  <span className="ml-2 text-gray-500">Loading equipment...</span>
                </div>
              ) : paginatedEquipment.data.length > 0 ? (
                <>
                  {paginatedEquipment.data.map((eq: any) => (
                    <div 
                      key={eq.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        eq.status === 'expired' || eq.status === 'warning' 
                          ? 'bg-red-50 border-red-200' 
                          : eq.status === 'expiring'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          eq.status === 'expired' || eq.status === 'warning' 
                            ? 'bg-red-100' 
                            : eq.status === 'expiring'
                              ? 'bg-yellow-100'
                              : 'bg-green-100'
                        }`}>
                          {eq.status === 'expired' ? (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          ) : (
                            <Settings className={`h-4 w-4 ${
                              eq.status === 'warning' 
                                ? 'text-red-600' 
                                : eq.status === 'expiring'
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                            }`} />
                          )}
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
                              eq.status === 'expired' || eq.status === 'warning' 
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
                  {paginatedEquipment.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={equipmentPage}
                        totalPages={paginatedEquipment.totalPages}
                        totalItems={paginatedEquipment.totalItems}
                        itemsPerPage={equipmentPerPage}
                        onPageChange={setEquipmentPage}
                        onItemsPerPageChange={(newSize) => {
                          setEquipmentPerPage(newSize);
                          setEquipmentPage(1);
                        }}
                        itemsPerPageOptions={[5, 10, 15, 20]}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-gray-500 py-4">No equipment with expiry dates found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Employees Currently on Holiday */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="text-green-600 h-5 w-5" />
              <CardTitle>Employees Currently on Holiday</CardTitle>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {employeesOnHoliday.length} {employeesOnHoliday.length === 1 ? 'Employee' : 'Employees'}
              </Badge>
              {!isLoadingBusinessDate && (
                <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>As of: {businessDate ? businessDate.toLocaleDateString() : 'Loading...'}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {holidayLoading || isLoadingBusinessDate ? (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-gray-500">Loading holiday information...</span>
                </div>
              ) : paginatedHolidayEmployees.data.length > 0 ? (
                <>
                  {paginatedHolidayEmployees.data.map((request: any) => (
                    <div 
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-green-50 border-green-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-green-100">
                          <User className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{request.employeeName}</p>
                          <p className="text-sm text-gray-600">{request.jobTitle || 'Employee'}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span>On Holiday</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {new Date(request.lastDateAtWork).toLocaleDateString()} - {new Date(request.returnDateToWork).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-green-600">
                          {request.daysUntilReturn === 0 
                            ? 'Returns today' 
                            : request.daysUntilReturn === 1 
                              ? 'Returns tomorrow'
                              : `Returns in ${request.daysUntilReturn} days`
                          }
                        </p>
                        <p className="text-xs text-gray-500">
                          {request.totalDaysRequested} days total
                        </p>
                      </div>
                    </div>
                  ))}
                  {paginatedHolidayEmployees.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={holidayCurrentPage}
                        totalPages={paginatedHolidayEmployees.totalPages}
                        totalItems={paginatedHolidayEmployees.totalItems}
                        itemsPerPage={holidayItemsPerPage}
                        onPageChange={setHolidayCurrentPage}
                        onItemsPerPageChange={(newSize) => {
                          setHolidayItemsPerPage(newSize);
                          setHolidayCurrentPage(1);
                        }}
                        itemsPerPageOptions={[5, 10, 15, 20]}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No employees currently on holiday</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Based on business date: {businessDate ? businessDate.toLocaleDateString() : 'Loading...'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Holiday Requests Overview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="text-blue-600 h-5 w-5" />
              <CardTitle>Holiday Requests</CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {allGrantedRequests.length} Granted
              </Badge>
              {!isLoadingBusinessDate && (
                <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span>Using Business Date: {businessDate ? businessDate.toLocaleDateString() : 'Loading...'}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {holidayLoading ? (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-500">Loading holiday requests...</span>
                </div>
              ) : paginatedHolidayRequests.data.length > 0 ? (
                <>
                  {paginatedHolidayRequests.data.map((request: any) => {
                    const lastWorkDate = new Date(request.lastDateAtWork);
                    const returnDate = new Date(request.returnDateToWork);
                    const today = businessDate ? new Date(businessDate) : new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Determine status relative to business date
                    let statusColor = 'bg-gray-50 border-gray-200';
                    let statusText = 'Scheduled';
                    
                    if (today > lastWorkDate && today < returnDate) {
                      statusColor = 'bg-green-50 border-green-200';
                      statusText = 'Currently on Holiday';
                    } else if (today >= returnDate) {
                      statusColor = 'bg-blue-50 border-blue-200';
                      statusText = 'Completed';
                    } else if (today <= lastWorkDate) {
                      statusColor = 'bg-yellow-50 border-yellow-200';
                      statusText = 'Upcoming';
                    }
                    
                    return (
                      <div key={request.id} className={`p-3 rounded-lg border ${statusColor}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{request.employeeName}</p>
                            <p className="text-sm text-gray-600">{request.jobTitle || 'Employee'}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {lastWorkDate.toLocaleDateString()} - {returnDate.toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-gray-700">
                              {statusText} • {request.totalDaysRequested} days
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {paginatedHolidayRequests.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={holidayRequestsPage}
                        totalPages={paginatedHolidayRequests.totalPages}
                        totalItems={paginatedHolidayRequests.totalItems}
                        itemsPerPage={holidayRequestsPerPage}
                        onPageChange={setHolidayRequestsPage}
                        onItemsPerPageChange={(newSize) => {
                          setHolidayRequestsPerPage(newSize);
                          setHolidayRequestsPage(1);
                        }}
                        itemsPerPageOptions={[5, 10, 15, 20]}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-gray-500 py-4">No granted holiday requests found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4. Employee Documents Section */}
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
              {allDocsLoading ? (
                <div className="flex justify-center items-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-500">Loading documents...</span>
                </div>
              ) : paginatedDocuments.data.length > 0 ? (
                <>
                  {paginatedDocuments.data.map((doc: any) => (
                    <div 
                      key={doc.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        doc.status === 'expired' || doc.status === 'warning' 
                          ? 'bg-red-50 border-red-200' 
                          : doc.status === 'expiring'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          doc.status === 'expired' || doc.status === 'warning' 
                            ? 'bg-red-100' 
                            : doc.status === 'expiring'
                              ? 'bg-yellow-100'
                              : 'bg-green-100'
                        }`}>
                          {doc.status === 'expired' ? (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          ) : (
                            <User className={`h-4 w-4 ${
                              doc.status === 'warning' 
                                ? 'text-red-600' 
                                : doc.status === 'expiring'
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                            }`} />
                          )}
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
                            doc.status === 'expired' || doc.status === 'warning' 
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
                  {paginatedDocuments.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={documentsPage}
                        totalPages={paginatedDocuments.totalPages}
                        totalItems={paginatedDocuments.totalItems}
                        itemsPerPage={documentsPerPage}
                        onPageChange={setDocumentsPage}
                        onItemsPerPageChange={(newSize) => {
                          setDocumentsPerPage(newSize);
                          setDocumentsPage(1);
                        }}
                        itemsPerPageOptions={[5, 10, 15, 20]}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-gray-500 py-4">No documents with expiry dates found</p>
              )}
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
