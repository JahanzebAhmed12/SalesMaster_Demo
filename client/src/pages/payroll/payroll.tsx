import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EmployeeWithAttendance } from "@shared/schema";
import AttendanceTable from "@/components/layout/attendance-table";

// NOTE: This page shows employee attendance data
// The data is fetched from the employees endpoint which includes attendance information

export default function Payroll() {
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
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-100">Current Date</p>
            <p className="text-lg font-semibold">{new Date().toLocaleDateString('en-GB', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
            <p className="text-xs text-blue-200 mt-1">
              Closing Time: <span>11:59 PM</span>
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading attendance data...</div>
      ) : (
        <AttendanceTable employees={employees || []} />
      )}
    </div>
  );
}
