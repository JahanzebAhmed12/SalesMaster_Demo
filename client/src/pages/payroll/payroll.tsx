import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EmployeeWithAttendance } from "@shared/schema";
import AttendanceTable from "@/components/layout/attendance-table";
import { useBusinessDate } from "@/hooks/use-business-date";
import { format } from "date-fns";

// NOTE: This page shows employee attendance data
// The data is fetched from the employees endpoint which includes attendance information

export default function Payroll() {
  const { businessDate, isNextDay, isLoading: isLoadingBusinessDate } = useBusinessDate({
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const effectiveBusinessDate = businessDate ?? new Date();
  
  const { data: employees, isLoading } = useQuery<EmployeeWithAttendance[]>({
    queryKey: ["/api/employees/attendance"],
    queryFn: () => apiRequest("GET", "/api/employees/attendance")
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary to-blue-600 rounded-xl p-6 text-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Daily Attendance Management</h2>
            <p className="text-blue-100 mt-1">Track daily attendance and manage employee records</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-blue-200">Using Business Date Logic</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-100">Business Date</p>
            <p className="text-lg font-semibold">
              {isLoadingBusinessDate ? (
                "Loading..."
              ) : (
                format(effectiveBusinessDate, 'EEEE, MMMM do, yyyy')
              )}
            </p>
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-xs text-blue-200">
                Closing Time: <span>11:59 PM</span>
              </p>
              <p className="text-xs text-blue-300">
                System Date: {format(new Date(), 'dd/MM/yyyy')}
              </p>
              {isNextDay && (
                <span className="text-xs bg-yellow-500 text-yellow-900 px-2 py-1 rounded-full inline-block w-fit">
                  Next Day Available
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading attendance data...</div>
      ) : (
        <AttendanceTable 
          employees={employees || []} 
          dateRange={{ from: effectiveBusinessDate, to: effectiveBusinessDate }}
          viewMode="day"
          businessDate={effectiveBusinessDate}
        />
      )}
    </div>
  );
}
