import { useState } from "react";
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
import type { User, Attendance } from "@shared/schema";

interface MonthlyStats {
  workingDays: number;
  totalLeaves: number;
  avgAttendance: number;
}

interface UserMonthlyData {
  user: User;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  attendancePercentage: number;
  totalHours: number;
}

interface PayrollData {
  user: {
    id: number;
    username: string;
    userType: string;
    status: string;
    email: string | null;
    phone: string | null;
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
    const weekNumber = getWeekNumber(lastWeek);
    return `${lastWeek.getFullYear()}-${weekNumber}`;
  });

  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [reportType, setReportType] = useState<"attendance" | "payroll">("attendance");
  const [timeFrame, setTimeFrame] = useState<"weekly" | "monthly">("monthly");
  const [shouldFetch, setShouldFetch] = useState(false);
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [weekNumber, setWeekNumber] = useState(getWeekNumber(new Date()));
  const [weekYear, setWeekYear] = useState(new Date().getFullYear());

  // Helper function to get week number
  function getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
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

  // Generate week options for the last 6 weeks including current
  const weekOptions = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (i * 7));
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    return {
      value: `${year}-${week}`,
      label: `Week ${week}, ${year}`,
      isComplete: isWeekComplete(year, week)
    };
  }).filter(option => option.isComplete);

  // Fetch users first
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: () => apiRequest("GET", "/api/users")
  });

  console.log("Users data:", users); // Debug log

  const { data: monthlyAttendance, refetch: refetchMonthlyAttendance } = useQuery<Attendance[]>({
    queryKey: [`/api/attendance?year=${year}&month=${month}`],
    queryFn: () => apiRequest("GET", `/api/attendance?year=${year}&month=${month}`),
    enabled: timeFrame === "monthly" && shouldFetch
  });

  console.log("Monthly attendance data:", monthlyAttendance); // Debug log

  const { data: weeklyAttendance, refetch: refetchWeeklyAttendance } = useQuery<Attendance[]>({
    queryKey: [`/api/attendance?year=${weekYear}&week=${weekNumber}`],
    queryFn: () => apiRequest("GET", `/api/attendance?year=${weekYear}&week=${weekNumber}`),
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
        ? `/api/reports/payroll?year=${year}&month=${month}${selectedUser !== 'all' ? `&userId=${selectedUser}` : ''}`
        : `/api/reports/weekly-payroll?year=${weekYear}&week=${weekNumber}${selectedUser !== 'all' ? `&userId=${selectedUser}` : ''}`
    ],
    queryFn: () => apiRequest("GET", timeFrame === "monthly" 
      ? `/api/reports/payroll?year=${year}&month=${month}${selectedUser !== 'all' ? `&userId=${selectedUser}` : ''}`
      : `/api/reports/weekly-payroll?year=${weekYear}&week=${weekNumber}${selectedUser !== 'all' ? `&userId=${selectedUser}` : ''}`
    ),
    enabled: shouldFetch
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
    toast({
      title: "Print Report",
      description: "Sending report to printer...",
    });
  };

  const handlePDFExport = async () => {
    try {
      const element = document.getElementById('monthly-report-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        logging: false,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const monthName = new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      pdf.save(`${reportType}-report-${monthName.replace(' ', '-')}.pdf`);
      
      toast({
        title: "PDF Export Complete",
        description: "Report has been downloaded as PDF.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate PDF report.",
        variant: "destructive",
      });
    }
  };

  const handleExcelExport = () => {
    try {
      let data: any[] = [];
      
      if (reportType === "payroll" && payrollData) {
        data = payrollData.map(item => ({
          'User ID': item.user.id,
          'Username': item.user.username,
          'User Type': item.user.userType,
          'Present Days': item.attendance.presentDays,
          'Absent Days': item.attendance.absentDays,
          'Leave Days': item.attendance.leaveDays,
          'Holiday Days': item.attendance.holidayDays,
          'Attendance %': `${item.attendance.attendancePercentage}%`,
          'Working Days': item.payroll.workingDays,
          'Daily Wage': `£${item.payroll.dailyWage}`,
          'Gross Pay': `£${item.payroll.grossPay}`,
          'Tax': `£${item.payroll.tax}`,
          'National Insurance': `£${item.payroll.nationalInsurance}`,
          'Net Pay': `£${item.payroll.netPay}`
        }));
      } else {
        const userData = calculateUserData();
        data = userData.map(item => ({
          'User ID': item.user.id,
          'Username': item.user.username,
          'User Type': item.user.userType,
          'Present Days': item.presentDays,
          'Absent Days': item.absentDays,
          'Leave Days': item.leaveDays,
          'Holiday Days': item.holidayDays,
          'Attendance %': `${item.attendancePercentage}%`,
          'Total Hours': `${item.totalHours}h`
        }));
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${reportType} Report`);
      
      const monthName = new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      XLSX.writeFile(wb, `${reportType}-report-${monthName.replace(' ', '-')}.xlsx`);
      
      toast({
        title: "Excel Export Complete",
        description: "Report has been downloaded as Excel file.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate Excel report.",
        variant: "destructive",
      });
    }
  };

  const calculateUserData = (): UserMonthlyData[] => {
    if (!users || (!monthlyAttendance && !weeklyAttendance)) return [];

    const attendance = timeFrame === "monthly" ? monthlyAttendance : weeklyAttendance;
    
    return users.map(user => {
      if (!user) return null; // Skip if user is undefined
      
      const userAttendance = attendance?.filter(att => att.userId === user.id) || [];
      
      const presentDays = userAttendance.filter(att => att.status === 'present').length;
      const absentDays = userAttendance.filter(att => att.status === 'absent').length;
      const leaveDays = userAttendance.filter(att => att.status === 'leave').length;
      const holidayDays = userAttendance.filter(att => att.status === 'holiday').length;
      
      const totalWorkingDays = timeFrame === "monthly" 
        ? monthlyStats?.workingDays || 30
        : weeklyStats?.workingDays || 7;
      
      const attendancePercentage = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;
      const totalHours = presentDays * 8; // Assuming 8 hours per day

      return {
        user,
        presentDays,
        absentDays,
        leaveDays,
        holidayDays,
        attendancePercentage: Math.round(attendancePercentage * 10) / 10,
        totalHours,
      };
    }).filter((data): data is UserMonthlyData => data !== null); // Filter out null values
  };

  const userData = calculateUserData();

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-100 text-green-800";
    if (percentage >= 85) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6">
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
              <Select value={reportType} onValueChange={(value: "attendance" | "payroll") => {
                setReportType(value);
                setShouldFetch(false);
              }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
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
              {reportType === "payroll" && (
                <Select value={selectedUser} onValueChange={(value) => {
                  setSelectedUser(value);
                  setShouldFetch(false);
                }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {users?.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={handleFetchData} className="bg-blue-600 hover:bg-blue-700" disabled={isLoadingUsers}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {isLoadingUsers ? "Loading..." : "Fetch Data"}
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
              <h2 className="text-xl font-semibold mt-4 capitalize">{timeFrame} {reportType} Report</h2>
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

            {/* Report Content Based on Type */}
            {reportType === "payroll" ? (
              <div className="space-y-6">
                {payrollData && payrollData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1024px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-700">User</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Attendance %</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Working Days</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Daily Wage</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Gross Pay</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Tax (20%)</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">NI (12%)</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {payrollData.map((item) => {
                          if (!item || !item.user || !item.user.username) {
                            console.error("Invalid payroll data item (skipping):", item);
                            return null; // Skip rendering this item if data or user info is incomplete
                          }
                          const initials = item.user.username.split(' ').map((n: string) => n[0]).join('').toUpperCase();
                          
                          return (
                            <tr key={item.user.id} className="hover:bg-gray-50">
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                    {initials}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{item.user.username}</p>
                                    <p className="text-xs text-gray-500">{item.user.id} - {item.user.userType}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <Badge className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getAttendanceColor(item.attendance.attendancePercentage)}`}>
                                  {item.attendance.attendancePercentage}%
                                </Badge>
                              </td>
                              <td className="py-4 px-4 text-center text-sm text-gray-900 font-semibold">{item.payroll.workingDays}</td>
                              <td className="py-4 px-4 text-center text-sm text-gray-900">£{item.payroll.dailyWage}</td>
                              <td className="py-4 px-4 text-center text-sm text-green-600 font-bold">£{item.payroll.grossPay}</td>
                              <td className="py-4 px-4 text-center text-sm text-red-600">£{item.payroll.tax}</td>
                              <td className="py-4 px-4 text-center text-sm text-red-600">£{item.payroll.nationalInsurance}</td>
                              <td className="py-4 px-4 text-center text-sm text-green-700 font-bold">£{item.payroll.netPay}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No payroll data found for the selected period.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {isLoadingUsers ? (
                  <div className="text-center py-8">Loading users...</div>
                ) : (
                  <>
                    {users && users.length > 0 ? (
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
                            {userData.map((item) => {
                              if (!item || !item.user || !item.user.username) {
                                console.error("Invalid user attendance data item (skipping):", item);
                                return null; // Skip rendering this item if data or user info is incomplete
                              }
                              const initials = item.user.username.split(' ').map((n: string) => n[0]).join('').toUpperCase();
                              
                              return (
                                <tr key={item.user.id} className="hover:bg-gray-50">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                        {initials}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{item.user.username}</p>
                                        <p className="text-xs text-gray-500">{item.user.id} - {item.user.userType}</p>
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
                        {userData.length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            No attendance data found for the selected period.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        {users ? "No users found." : "Failed to load users."}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}