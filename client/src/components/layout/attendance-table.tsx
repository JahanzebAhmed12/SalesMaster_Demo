import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, CheckCircle, Calendar, XCircle, Save, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Employee, Attendance } from "@shared/schema";

interface DashboardStats {
  totalStaff: number;
  presentToday: number;
  onLeave: number;
  absent: number;
}

export default function AttendanceTable() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [attendanceData, setAttendanceData] = useState<Record<number, string>>({});
  
  const today = new Date().toISOString().split('T')[0];

  const { data: employees, isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: todayAttendance, isLoading: loadingAttendance } = useQuery<Attendance[]>({
    queryKey: [`/api/attendance?date=${today}`],
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
  });

  const saveAttendanceMutation = useMutation({
    mutationFn: async (attendanceList: any[]) => {
      const response = await apiRequest('POST', '/api/attendance/bulk', { attendanceList });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: "Attendance Saved",
        description: "All attendance records have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save attendance records.",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (employeeId: number, status: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [employeeId]: status
    }));
  };

  const handleMarkAllPresent = () => {
    if (!employees) return;
    const newData: Record<number, string> = {};
    employees.forEach(emp => {
      newData[emp.id] = 'present';
    });
    setAttendanceData(newData);
  };

  const handleSaveAttendance = () => {
    if (!employees) return;
    
    const attendanceList = employees.map(emp => ({
      employeeId: emp.id,
      attendanceDate: today,
      status: attendanceData[emp.id] || 'absent',
      checkInTime: attendanceData[emp.id] === 'present' ? '09:00' : null,
      checkOutTime: null,
      remarks: null,
    }));

    saveAttendanceMutation.mutate(attendanceList);
  };

  const getEmployeeStatus = (employeeId: number) => {
    if (attendanceData[employeeId]) {
      return attendanceData[employeeId];
    }
    
    const existingAttendance = todayAttendance?.find(att => att.employeeId === employeeId);
    return existingAttendance?.status || 'absent';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="status-badge-present">Present</Badge>;
      case 'absent':
        return <Badge className="status-badge-absent">Absent</Badge>;
      case 'leave':
        return <Badge className="status-badge-leave">Leave</Badge>;
      case 'holiday':
        return <Badge className="status-badge-holiday">Holiday</Badge>;
      default:
        return <Badge className="status-badge-absent">Absent</Badge>;
    }
  };

  const filteredEmployees = employees?.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || emp.department.toLowerCase() === departmentFilter;
    return matchesSearch && matchesDepartment;
  }) || [];

  if (loadingEmployees || loadingAttendance) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Staff</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalStaff}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-600 text-xl" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">Total employees</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Present Today</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{stats.presentToday}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600 text-xl" />
                </div>
              </div>
              <p className="text-xs text-green-600 mt-3">Currently at work</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">On Leave</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{stats.onLeave}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Calendar className="text-orange-600 text-xl" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">Scheduled leaves</p>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Absent</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{stats.absent}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="text-red-600 text-xl" />
                </div>
              </div>
              <p className="text-xs text-red-600 mt-3">Unplanned absences</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attendance Marking Interface */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Daily Attendance</CardTitle>
            <div className="flex space-x-3">
              <Button onClick={handleMarkAllPresent} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 mr-2" />
                Mark All Present
              </Button>
              <Button 
                onClick={handleSaveAttendance}
                disabled={saveAttendanceMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Attendance
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Search and Filter */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex space-x-4">
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="administration">Administration</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-500">
              Showing attendance for: <span className="font-medium text-gray-900">
                {new Date(today).toLocaleDateString('en-GB', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </span>
            </div>
          </div>

          {/* Employee Attendance Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Employee ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Department</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Check In</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Check Out</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmployees.map((employee) => {
                  const status = getEmployeeStatus(employee.id);
                  const initials = employee.name.split(' ').map(n => n[0]).join('').toUpperCase();
                  
                  return (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm text-gray-900">{employee.employeeId}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                            {initials}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{employee.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-600">{employee.department}</td>
                      <td className="py-4 px-4 text-sm text-gray-900">
                        {status === 'present' ? '09:00 AM' : '--:--'}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-900">--:--</td>
                      <td className="py-4 px-4">
                        {getStatusBadge(status)}
                      </td>
                      <td className="py-4 px-4">
                        <Select 
                          value={status} 
                          onValueChange={(value) => handleStatusChange(employee.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="leave">Leave</SelectItem>
                            <SelectItem value="holiday">Holiday</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No employees found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
