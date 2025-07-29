import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Check, Calendar, AlertCircle, PoundSterling, CalendarDays } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { EmployeeWithAttendance } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface AttendanceTableProps {
  employees: EmployeeWithAttendance[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  onDateRangeChange?: (range: { from: Date; to: Date }) => void;
  viewMode?: 'day' | 'week' | 'month' | 'range';
  onViewModeChange?: (mode: 'day' | 'week' | 'month' | 'range') => void;
}

export default function AttendanceTable({ 
  employees: initialEmployees, 
  dateRange: initialDateRange,
  onDateRangeChange,
  viewMode: initialViewMode = 'day',
  onViewModeChange
}: AttendanceTableProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<Record<number, string>>({});
  const [leaveType, setLeaveType] = useState<Record<number, string>>({});
  const [holidayName, setHolidayName] = useState<Record<number, string>>({});
  const [dailyWage, setDailyWage] = useState<Record<number, string>>({});
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'range'>(initialViewMode);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initialDateRange || { 
      from: new Date(), 
      to: new Date() 
    }
  );

  // Sync with parent component if callbacks are provided
  useEffect(() => {
    if (onViewModeChange) {
      onViewModeChange(viewMode);
    }
  }, [viewMode, onViewModeChange]);

  useEffect(() => {
    if (onDateRangeChange && dateRange?.from && dateRange?.to) {
      onDateRangeChange({ from: dateRange.from, to: dateRange.to });
    }
  }, [dateRange, onDateRangeChange]);

  // Fetch attendance data when date range changes
  const { data: attendanceData, isLoading } = useQuery<EmployeeWithAttendance[]>({
    queryKey: ['/api/attendance', dateRange],
    queryFn: async () => {
      if (!dateRange?.from || !dateRange?.to) return [];
      
      const params = new URLSearchParams({
        from_date: format(dateRange.from, 'yyyy-MM-dd'),
        to_date: format(dateRange.to, 'yyyy-MM-dd'),
      });
      
      const response = await apiRequest("GET", `/api/attendance?${params.toString()}`);
      return response || [];
    },
    enabled: !!dateRange?.from && !!dateRange?.to,
  });

  // Merge attendance data with employee data
  const employees = initialEmployees.map(emp => {
    const attendance = attendanceData?.find(a => a.id === emp.id)?.attendance || emp.attendance;
    return { ...emp, attendance };
  });

  // Handle view mode changes
  const handleViewModeChange = (mode: 'day' | 'week' | 'month' | 'range') => {
    setViewMode(mode);
    const today = new Date();
    
    switch (mode) {
      case 'day':
        setDateRange({ from: today, to: today });
        break;
      case 'week':
        setDateRange({ from: startOfWeek(today), to: endOfWeek(today) });
        break;
      case 'month':
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
      case 'range':
        // Keep current range or default to last 7 days
        setDateRange(prev => prev || { 
          from: subDays(today, 7), 
          to: today 
        });
        break;
    }
  };

  const markAttendanceMutation = useMutation({
    mutationFn: async ({ employeeId, status, leaveType, holidayName, date }: { 
      employeeId: number; 
      status: string;
      leaveType?: string;
      holidayName?: string;
      date?: Date;
    }) => {
      return apiRequest("POST", `/api/employees/attendance/${employeeId}`, {
        status: status,
        date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        ...(status === "leave" && { leaveType: leaveType }),
        ...(status === "holiday" && { holidayName: holidayName }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/attendance"] });
      toast({
        title: "Success",
        description: "Attendance marked successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark attendance",
        variant: "destructive",
      });
    },
  });

  const updateDailyWageMutation = useMutation({
    mutationFn: async ({ employeeId, dailyWage }: { employeeId: number; dailyWage: number }) => {
      return apiRequest("PUT", `/api/employees/${employeeId}/daily-wage`, { dailyWage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/attendance"] });
      toast({
        title: "Success",
        description: "Daily wage updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update daily wage",
        variant: "destructive",
      });
    },
  });

  const handleMarkAllPresent = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    // For each day in the date range, mark all employees as present
    const days = [];
    let currentDate = new Date(dateRange.from);
    
    while (currentDate <= dateRange.to) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    employees.forEach(employee => {
      days.forEach(date => {
        markAttendanceMutation.mutate({ 
          employeeId: employee.id, 
          status: 'present',
          date: date
        });
      });
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800';
      case 'absent':
        return 'bg-red-100 text-red-800';
      case 'leave':
        return 'bg-yellow-100 text-yellow-800';
      case 'holiday':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Initialize selectedStatus from employee data only once or when employees change significantly
  useEffect(() => {
    const initialStatus: Record<number, string> = {};
    const initialLeaveType: Record<number, string> = {};
    const initialHolidayName: Record<number, string> = {};
    
    employees.forEach(emp => {
      // Only set initial status if we don't already have a selected status for this employee
      if (selectedStatus[emp.id] === undefined) {
        if (emp.attendance) {
          initialStatus[emp.id] = emp.attendance.status || 'absent';
          if (emp.attendance.leaveType) {
            initialLeaveType[emp.id] = emp.attendance.leaveType;
          }
          if (emp.attendance.holidayName) {
            initialHolidayName[emp.id] = emp.attendance.holidayName;
          }
        } else {
          initialStatus[emp.id] = 'absent'; // Default to absent if no attendance record
        }
      }
    });
    
    // Only update if we have new initial values
    if (Object.keys(initialStatus).length > 0) {
      setSelectedStatus(prev => ({ ...prev, ...initialStatus }));
    }
    if (Object.keys(initialLeaveType).length > 0) {
      setLeaveType(prev => ({ ...prev, ...initialLeaveType }));
    }
    if (Object.keys(initialHolidayName).length > 0) {
      setHolidayName(prev => ({ ...prev, ...initialHolidayName }));
    }
  }, [employees.length]); // Only depend on employees.length, not the full employees array

  const handleStatusChange = (employeeId: number, status: string) => {
    setSelectedStatus(prev => ({ ...prev, [employeeId]: status }));
    
    // Reset leave type and holiday name when status changes
    if (status !== 'leave') {
      setLeaveType(prev => ({ ...prev, [employeeId]: '' }));
    }
    if (status !== 'holiday') {
      setHolidayName(prev => ({ ...prev, [employeeId]: '' }));
    }
  };

  const handleSaveAttendance = (employeeId: number) => {
    if (!dateRange?.from) return;
    
    const status = selectedStatus[employeeId] || "absent";
    const leaveTypeValue = leaveType[employeeId];
    const holidayNameValue = holidayName[employeeId];
    
    // If it's a range, apply to all days in the range
    if (dateRange.from && dateRange.to) {
      const days = [];
      let currentDate = new Date(dateRange.from);
      
      while (currentDate <= dateRange.to) {
        days.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      days.forEach(date => {
        markAttendanceMutation.mutate({
          employeeId,
          status,
          date,
          ...(status === "leave" && { leaveType: leaveTypeValue }),
          ...(status === "holiday" && { holidayName: holidayNameValue }),
        });
      });
    } else {
      // Single day
      markAttendanceMutation.mutate({
        employeeId,
        status,
        date: dateRange.from,
        ...(status === "leave" && { leaveType: leaveTypeValue }),
        ...(status === "holiday" && { holidayName: holidayNameValue }),
      });
    }
  };

  const handleSaveDailyWage = (employeeId: number) => {
    const wage = dailyWage[employeeId];
    if (wage && !isNaN(Number(wage)) && Number(wage) >= 0) {
      updateDailyWageMutation.mutate({
        employeeId,
        dailyWage: Number(wage),
      });
    } else {
      toast({
        title: "Error",
        description: "Please enter a valid daily wage",
        variant: "destructive",
      });
    }
  };

  // Filter out inactive employees if needed (case-insensitive check)
  const activeEmployees = employees.filter(emp => emp.status?.toLowerCase() === "active");

  if (activeEmployees.length === 0) {
    return <div className="text-center py-8">No active employees found.</div>;
  }

  const formatDateRange = () => {
    if (!dateRange?.from) return 'Select date range';
    
    if (dateRange?.to) {
      if (format(dateRange.from, 'MM/dd/yyyy') === format(dateRange.to, 'MM/dd/yyyy')) {
        return format(dateRange.from, 'MMM d, yyyy');
      }
      return `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    
    return format(dateRange.from, 'MMM d, yyyy');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <CardTitle>Attendance</CardTitle>
              <div className="flex space-x-2">
                <Select 
                  value={viewMode} 
                  onValueChange={(value: 'day' | 'week' | 'month' | 'range') => handleViewModeChange(value)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="View mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="range">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "w-[300px] justify-start text-left font-normal",
                        !dateRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formatDateRange()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
                
                <Button 
                  onClick={handleMarkAllPresent} 
                  className="bg-green-600 hover:bg-green-700"
                  disabled={markAttendanceMutation.isPending || !dateRange?.from}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Mark All Present
                </Button>
              </div>
            </div>
            {dateRange?.from && dateRange?.to && (
              <div className="text-sm text-muted-foreground">
                Showing attendance from {format(dateRange.from, 'MMM d, yyyy')} to {format(dateRange.to, 'MMM d, yyyy')}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Daily Wage</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name || employee.fullName || 'N/A'}</TableCell>
                    <TableCell>{employee.title || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Select
                          value={selectedStatus[employee.id] || employee.attendance?.status || ""}
                          onValueChange={(value) => handleStatusChange(employee.id, value)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="leave">On Leave</SelectItem>
                            <SelectItem value="holiday">Holiday</SelectItem>
                          </SelectContent>
                        </Select>

                        {selectedStatus[employee.id] === "leave" && (
                          <Select
                            value={leaveType[employee.id] || ""}
                            onValueChange={(value) =>
                              setLeaveType((prev) => ({
                                ...prev,
                                [employee.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-[150px]">
                              <SelectValue placeholder="Leave type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sick">Sick Leave</SelectItem>
                              <SelectItem value="casual">Casual Leave</SelectItem>
                              <SelectItem value="annual">Annual Leave</SelectItem>
                              <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                        {selectedStatus[employee.id] === "holiday" && (
                          <Input
                            type="text"
                            placeholder="Holiday name"
                            value={holidayName[employee.id] || ""}
                            onChange={(e) =>
                              setHolidayName((prev) => ({
                                ...prev,
                                [employee.id]: e.target.value,
                              }))
                            }
                            className="w-[200px]"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <PoundSterling className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={dailyWage[employee.id] ?? employee.dailyWage ?? ""}
                            onChange={(e) =>
                              setDailyWage((prev) => ({
                                ...prev,
                                [employee.id]: e.target.value,
                              }))
                            }
                            className="pl-8 w-[120px]"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveDailyWage(employee.id)}
                          disabled={updateDailyWageMutation.isPending}
                        >
                          {updateDailyWageMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => handleSaveAttendance(employee.id)}
                        disabled={markAttendanceMutation.isPending}
                      >
                        {markAttendanceMutation.isPending ? "Saving..." : "Save Attendance"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
