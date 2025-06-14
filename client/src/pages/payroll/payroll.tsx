import AttendanceTable from "@/components/layout/attendance-table";

export default function Payroll() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary to-blue-600 rounded-xl p-6 text-white">
        <div className="flex justify-between items-center">
          <div >
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

      <AttendanceTable />
    </div>
  );
}
