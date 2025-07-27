import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Printer, FileText, Download, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import type { Employee, EmployeeWithAttendance } from "@shared/schema";
import React from "react";

interface MonthlyStats {
  workingDays: number;
  totalLeaves: number;
  avgAttendance: number;
}

interface EmployeeMonthlyData {
  employee: Employee;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  attendancePercentage: number;
  totalHours: number;
}

interface PayrollData {
  employee: {
    id: number;
    fullName: string;
    title: string | null;
    status: string;
    dailyWage: number | null;
  };
  attendance: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    attendancePercentage: number;
  };
  payroll: {
    workingDays: number;
    dailyWage: number;
    grossPay: number;
    tax: number;
    nationalInsurance: number;
    netPay: number;
  };
}

export default function MonthlyReports() {
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const lastWeek = new Date(now);
    lastWeek.setDate(now.getDate() - 7);
    const weekNumber = getISOWeekNumber(lastWeek);
    return `${lastWeek.getFullYear()}-${weekNumber}`;
  });

  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [timeFrame, setTimeFrame] = useState<"weekly" | "monthly">("monthly");
  const [shouldFetch, setShouldFetch] = useState(false);
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [weekNumber, setWeekNumber] = useState(getISOWeekNumber(new Date()));
  const [weekYear, setWeekYear] = useState(new Date().getFullYear());

  // Simple payroll section state
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [selectedPayrollEmployee, setSelectedPayrollEmployee] = useState<string>("all");
  const [payrollSearchClicked, setPayrollSearchClicked] = useState(false);

  // Replace getWeekNumber with ISO week calculation
  function getISOWeekNumber(date: Date): number {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year
    tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
    // January 4 is always in week 1
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count number of weeks from date to week1
    return (
      1 +
      Math.round(
        ((tempDate.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7
      )
    );
  }

  // Helper function to check if a week is complete
  function isWeekComplete(year: number, week: number): boolean {
    const now = new Date();
    const weekStart = new Date(year, 0, 1 + (week - 1) * 7);
    return weekStart <= now;
  }

  // Helper function to check if a month is complete
  function isMonthComplete(year: number, month: number): boolean {
    const now = new Date();
    const monthStart = new Date(year, month - 1, 1);
    return monthStart <= now;
  }

  // Generate month options for the last 6 months including current
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return {
      value: `${year}-${String(month).padStart(2, '0')}`,
      label: `${date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
      isComplete: isMonthComplete(year, month)
    };
  }).filter(option => option.isComplete);

  // Build previous 6 weeks (including current)
  const weekOptionsRaw: { value: string; label: string; isComplete: boolean }[] = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (i * 7));
    const year = date.getFullYear();
    const week = getISOWeekNumber(date);
    return {
      value: `${year}-${week}`,
      label: `Week ${week}, ${year}`,
      isComplete: isWeekComplete(year, week)
    };
  });
  // Calculate the next week (future week)
  const now = new Date();
  const nextWeekDate = new Date(now);
  nextWeekDate.setDate(now.getDate() + 7);
  const nextWeekYear = nextWeekDate.getFullYear();
  const nextWeekNumber = getISOWeekNumber(nextWeekDate);
  const nextWeekOption = {
    value: `${nextWeekYear}-${nextWeekNumber}`,
    label: `Week ${nextWeekNumber}, ${nextWeekYear}`,
    isComplete: isWeekComplete(nextWeekYear, nextWeekNumber)
  };
  // Add the next week if not already present
  const weekOptions: { value: string; label: string; isComplete: boolean }[] = [
    ...weekOptionsRaw,
    ...(!weekOptionsRaw.some(opt => opt.value === nextWeekOption.value) ? [nextWeekOption] : [])
  ];

  // Fetch employees first
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: () => apiRequest("GET", "/api/employees"),
    select: (data) => data.filter((emp: Employee) => emp.status === "active"),
  });

  console.log("Employees data:", employees); // Debug log

  const { data: monthlyAttendance, refetch: refetchMonthlyAttendance } = useQuery<EmployeeWithAttendance[]>({
    queryKey: [`/api/attendance/monthly?year=${year}&month=${month}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`],
    queryFn: () => apiRequest("GET", `/api/attendance/monthly?year=${year}&month=${month}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`),
    enabled: timeFrame === "monthly" && shouldFetch
  });

  console.log("Monthly attendance data:", monthlyAttendance); // Debug log

  const { data: weeklyAttendance, refetch: refetchWeeklyAttendance } = useQuery<EmployeeWithAttendance[]>({
    queryKey: [`/api/attendance/weekly?year=${weekYear}&week=${weekNumber}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`],
    queryFn: () => apiRequest("GET", `/api/attendance/weekly?year=${weekYear}&week=${weekNumber}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`),
    enabled: timeFrame === "weekly" && shouldFetch
  });

  console.log("Weekly attendance data:", weeklyAttendance); // Debug log

  const { data: monthlyStats, refetch: refetchMonthlyStats } = useQuery<MonthlyStats>({
    queryKey: [`/api/reports/monthly-stats?year=${year}&month=${month}`],
    queryFn: () => apiRequest("GET", `/api/reports/monthly-stats?year=${year}&month=${month}`),
    enabled: timeFrame === "monthly" && shouldFetch
  });

  const { data: weeklyStats, refetch: refetchWeeklyStats } = useQuery<MonthlyStats>({
    queryKey: [`/api/reports/weekly-stats?year=${weekYear}&week=${weekNumber}`],
    queryFn: () => apiRequest("GET", `/api/reports/weekly-stats?year=${weekYear}&week=${weekNumber}`),
    enabled: timeFrame === "weekly" && shouldFetch
  });

  const { data: payrollData, refetch: refetchPayroll } = useQuery<PayrollData[]>({
    queryKey: [
      timeFrame === "monthly" 
        ? `/api/reports/payroll?year=${year}&month=${month}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`
        : `/api/reports/weekly-payroll?year=${weekYear}&week=${weekNumber}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`
    ],
    queryFn: () => apiRequest("GET", timeFrame === "monthly" 
      ? `/api/reports/payroll?year=${year}&month=${month}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`
      : `/api/reports/weekly-payroll?year=${weekYear}&week=${weekNumber}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`
    ),
    enabled: shouldFetch
  });

  // Helper to get year/month from date
  function getYearMonth(date: Date) {
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }

  // Fetch payroll data (simple logic)
  const { data: payrollDataSimple = [], isLoading: loadingPayroll } = useQuery<PayrollData[]>({
    queryKey: [
      "simple-employee-payroll",
      fromDate?.toISOString(),
      toDate?.toISOString(),
      selectedPayrollEmployee,
      payrollSearchClicked
    ],
    queryFn: async () => {
      if (!fromDate || !toDate) return [];
      let url = `/api/reports/payroll?from_date=${fromDate.toISOString().slice(0,10)}&to_date=${toDate.toISOString().slice(0,10)}`;
      if (selectedPayrollEmployee !== "all") url += `&employeeId=${selectedPayrollEmployee}`;
      return apiRequest("GET", url);
    },
    enabled: !!payrollSearchClicked && !!fromDate && !!toDate,
  });

  const handleFetchData = async () => {
    console.log("Fetching data..."); // Debug log
    setShouldFetch(true);
    try {
      if (timeFrame === "monthly") {
        console.log("Fetching monthly data..."); // Debug log
        await refetchMonthlyAttendance();
        await refetchMonthlyStats();
      } else {
        console.log("Fetching weekly data..."); // Debug log
        await refetchWeeklyAttendance();
        await refetchWeeklyStats();
      }
      await refetchPayroll();
      toast({
        title: "Success",
        description: "Data fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching data:", error); // Debug log
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setShouldFetch(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDFExport = async () => {
    // TODO: Implement PDF export logic
  };

  const handleExcelExport = () => {
    // TODO: Implement Excel export logic
  };

  const calculateUserData = (): EmployeeMonthlyData[] => {
    if (!employees || (!monthlyAttendance && !weeklyAttendance)) return [];

    const attendance = timeFrame === "monthly" ? monthlyAttendance : weeklyAttendance;
    
    return employees.map(employee => {
      if (!employee) return null; // Skip if employee is undefined
      
      const userAttendance = attendance?.filter(att => att.id === employee.id) || [];
      
      const presentDays = userAttendance.filter(att => att.attendance?.status === 'present').length;
      const absentDays = userAttendance.filter(att => att.attendance?.status === 'absent').length;
      const leaveDays = userAttendance.filter(att => att.attendance?.status === 'on_leave').length;
      const holidayDays = userAttendance.filter(att => att.attendance?.status === 'holiday').length;
      
      const totalWorkingDays = timeFrame === "monthly" 
        ? monthlyStats?.workingDays || 30
        : weeklyStats?.workingDays || 7;
      
      const attendancePercentage = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;
      const totalHours = presentDays * 8; // Assuming 8 hours per day

      return {
        employee,
        presentDays,
        absentDays,
        leaveDays,
        holidayDays,
        attendancePercentage: Math.round(attendancePercentage * 10) / 10,
        totalHours,
      };
    }).filter((data): data is EmployeeMonthlyData => data !== null); // Filter out null values
  };

  const employeeData = calculateUserData();

  // Add this after employeeData is calculated
  const hasAttendanceData = employeeData.some(item => item.presentDays > 0);

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-100 text-green-800";
    if (percentage >= 85) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  // Add this effect to reset shouldFetch when selection changes
  useEffect(() => {
    setShouldFetch(false);
  }, [selectedMonth, selectedWeek, timeFrame, selectedEmployee]);

  // Generate a key for attendance table to force remount on selection change
  const attendanceTableKey = `${timeFrame}-${selectedMonth}-${selectedWeek}-${selectedEmployee}`;

  // Add this effect after the state declarations for year, month, selectedMonth
  useEffect(() => {
    if (selectedMonth) {
      const [y, m] = selectedMonth.split('-');
      setYear(Number(y));
      setMonth(Number(m));
    }
  }, [selectedMonth]);

  // Add this effect after the state declarations for weekNumber, weekYear, selectedWeek
  useEffect(() => {
    if (selectedWeek) {
      const [y, w] = selectedWeek.split('-');
      setWeekYear(Number(y));
      setWeekNumber(Number(w));
    }
  }, [selectedWeek]);

  return (
    <div className="space-y-6">
      {/* Print-only CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payroll-print-area, #payroll-print-area * { visibility: visible !important; }
          #payroll-print-area { position: absolute !important; left: 0; top: 0; width: 100vw; background: white; box-shadow: none; }
        }
      `}</style>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4 overflow-x-auto">
            <CardTitle className="flex-shrink-0">Reports & Payroll</CardTitle>
            <div className="flex flex-wrap gap-3 items-center ml-auto">
              <Select value={timeFrame} onValueChange={(value: "monthly" | "weekly") => {
                setTimeFrame(value);
                setShouldFetch(false);
              }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Time Frame" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {timeFrame === "monthly" ? (
                <Select value={selectedMonth} onValueChange={(value) => {
                  setSelectedMonth(value);
                  setShouldFetch(false);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={selectedWeek} onValueChange={(value) => {
                  setSelectedWeek(value);
                  setShouldFetch(false);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={handleFetchData} className="bg-blue-600 hover:bg-blue-700" disabled={isLoadingEmployees}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {isLoadingEmployees ? "Loading..." : "Fetch Data"}
              </Button>
              <Button onClick={handlePrint} className="no-print">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button onClick={handlePDFExport} variant="outline" className="no-print bg-red-600 text-white hover:bg-red-700">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button onClick={handleExcelExport} variant="outline" className="no-print bg-green-600 text-white hover:bg-green-700">
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div id="monthly-report-content">
            {/* Report Header */}
            <div className="text-center mb-6 print-only hidden">
              <h1 className="text-2xl font-bold">TROPHFRUIT UK LTD</h1>
              <p className="text-gray-600">3 Dolphin Way, Purfleet, RM19 1NZ</p>
              <h2 className="text-xl font-semibold mt-4 capitalize">{timeFrame} Attendance Report</h2>
              <p className="text-gray-600">
                {timeFrame === "monthly" 
                  ? new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                  : `Week ${weekNumber}, ${weekYear}`
                }
              </p>
            </div>

            {/* Summary Cards */}
            {(monthlyStats || weeklyStats) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Working Days</h4>
                    <p className="text-3xl font-bold mt-2">
                      {timeFrame === "monthly" ? monthlyStats?.workingDays : weeklyStats?.workingDays}
                    </p>
                    <p className="text-green-100 text-sm mt-1">All days are working days</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Average Attendance</h4>
                    <p className="text-3xl font-bold mt-2">
                      {timeFrame === "monthly" ? monthlyStats?.avgAttendance : weeklyStats?.avgAttendance}%
                    </p>
                    <p className="text-blue-100 text-sm mt-1">{timeFrame} average</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Leave Days</h4>
                    <p className="text-3xl font-bold mt-2">
                      {timeFrame === "monthly" ? monthlyStats?.totalLeaves : weeklyStats?.totalLeaves}
                    </p>
                    <p className="text-purple-100 text-sm mt-1">Approved leaves</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Attendance Table (above) */}
            <div key={attendanceTableKey}>
              {isLoadingEmployees ? (
                <div className="text-center py-8">Loading employees...</div>
              ) : shouldFetch && !hasAttendanceData ? (
                <div className="text-center py-8 text-gray-500">
                  No attendance data found for the selected period.
                </div>
              ) : hasAttendanceData ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">User</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Present Days</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Absent Days</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Leave Days</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Holiday Days</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Attendance %</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-700">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {employeeData.map((item) => {
                        if (!item || !item.employee) {
                          console.error("Invalid employee attendance data item (skipping):", item);
                          return null;
                        }
                        const name = item.employee.name || item.employee.fullName || 'Unknown';
                        const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
                        return (
                          <tr key={item.employee.id} className="hover:bg-gray-50">
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                  {initials}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{name}</p>
                                  <p className="text-xs text-gray-500">{item.employee.title || 'No Title'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900 font-semibold">{item.presentDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.absentDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.leaveDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.holidayDays}</td>
                            <td className="py-4 px-4 text-center">
                              <Badge className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getAttendanceColor(item.attendancePercentage)}`}>
                                {item.attendancePercentage}%
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.totalHours}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {employees ? "No employees found." : "Failed to load employees."}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Simple Payroll Section */}
      <div className="bg-white rounded-xl shadow p-0 mt-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold">Simple Payroll (Present Days × Daily Wage)</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handlePrint} title="Print"><Printer className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handlePDFExport} title="Export PDF"><FileText className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handleExcelExport} title="Export Excel"><Download className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="px-6 pt-4 pb-6" id="payroll-print-area">
          <div className="flex flex-wrap gap-4 mb-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">From Date</label>
              <input type="date" value={fromDate ? fromDate.toISOString().slice(0, 10) : ""} onChange={e => setFromDate(e.target.value ? new Date(e.target.value) : null)} className="border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">To Date</label>
              <input type="date" value={toDate ? toDate.toISOString().slice(0, 10) : ""} onChange={e => setToDate(e.target.value ? new Date(e.target.value) : null)} className="border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">User</label>
              <select value={selectedPayrollEmployee} onChange={e => setSelectedPayrollEmployee(e.target.value)} className="border rounded px-2 py-1">
                <option value="all">All Employees</option>
                {employees && employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name || emp.fullName || `Employee ${emp.id}`}</option>
                ))}
              </select>
            </div>
            <Button className="bg-blue-600 text-white" onClick={() => setPayrollSearchClicked(v => !v)}>
              Search
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-blue-50">
                  <th className="text-center px-2 py-2">Employee</th>
                  <th className="text-center px-2 py-2">Present Days</th>
                  <th className="text-center px-2 py-2">Daily Wage</th>
                  <th className="text-center px-2 py-2">Pay</th>
                  <th className="text-center px-2 py-2">Present Dates</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayroll ? (
                  <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                ) : payrollDataSimple.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8">No data</td></tr>
                ) : payrollDataSimple.map((item: any) => (
                  <tr key={item.employee.id} className="hover:bg-blue-50">
                    <td className="text-center px-2 py-2 font-medium">{item.employee.name || item.employee.fullName || `Employee ${item.employee.id}`}</td>
                    <td className="text-center px-2 py-2">{item.presentDays}</td>
                    <td className="text-center px-2 py-2">£{item.employee.salary || item.employee.dailyWage || '0.00'}</td>
                    <td className="text-center px-2 py-2 font-bold text-green-700">£{item.pay}</td>
                    <td className="text-center px-2 py-2 text-xs">{(item.presentDates || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}