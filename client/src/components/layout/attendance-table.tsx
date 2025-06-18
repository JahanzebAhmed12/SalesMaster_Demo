import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Check, Calendar, AlertCircle, PoundSterling } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { UserWithAttendance } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface AttendanceTableProps {
  users: UserWithAttendance[];
}

export default function AttendanceTable({ users }: AttendanceTableProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<Record<number, string>>({});
  const [leaveType, setLeaveType] = useState<Record<number, string>>({});
  const [holidayName, setHolidayName] = useState<Record<number, string>>({});
  const [dailyWage, setDailyWage] = useState<Record<number, string>>({});

  const markAttendanceMutation = useMutation({
    mutationFn: async ({ userId, status, leaveType, holidayName }: { 
      userId: number; 
      status: string;
      leaveType?: string;
      holidayName?: string;
    }) => {
      return apiRequest("POST", `/api/users/attendance/${userId}`, {
        status,
        leaveType,
        holidayName
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/attendance"] });
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
    mutationFn: async ({ userId, dailyWage }: { userId: number; dailyWage: number }) => {
      return apiRequest("PUT", `/api/users/${userId}/daily-wage`, {
        dailyWage
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/attendance"] });
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
    users.forEach(user => {
      if (user.attendance.status !== 'present') {
        markAttendanceMutation.mutate({ 
          userId: user.id, 
          status: 'present' 
        });
      }
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

  const handleStatusChange = (userId: number, status: string) => {
    setSelectedStatus(prev => ({ ...prev, [userId]: status }));
    
    // Reset leave type and holiday name when status changes
    if (status !== 'leave') {
      setLeaveType(prev => ({ ...prev, [userId]: '' }));
    }
    if (status !== 'holiday') {
      setHolidayName(prev => ({ ...prev, [userId]: '' }));
    }
  };

  const handleSaveStatus = (userId: number) => {
    const status = selectedStatus[userId] || 'absent';
    const leaveTypeValue = status === 'leave' ? leaveType[userId] : undefined;
    const holidayNameValue = status === 'holiday' ? holidayName[userId] : undefined;

    markAttendanceMutation.mutate({ 
      userId, 
      status,
      leaveType: leaveTypeValue,
      holidayName: holidayNameValue
    });
  };

  const handleUpdateDailyWage = (userId: number) => {
    const wage = parseFloat(dailyWage[userId]);
    if (isNaN(wage) || wage < 0) {
      toast({
        title: "Error",
        description: "Please enter a valid daily wage",
        variant: "destructive",
      });
      return;
    }

    updateDailyWageMutation.mutate({ userId, dailyWage: wage });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Daily Attendance</CardTitle>
            <div className="flex space-x-3">
              <Button 
                onClick={handleMarkAllPresent} 
                className="bg-green-600 hover:bg-green-700"
                disabled={markAttendanceMutation.isPending}
              >
                <Check className="w-4 h-4 mr-2" />
                Mark All Present
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Daily Wage</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        getStatusColor(user.attendance.status)
                      }`}>
                        {user.attendance.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.attendance.status === 'leave' && user.attendance.leaveType && (
                        <span className="text-sm text-yellow-600">
                          {user.attendance.leaveType} Leave
                        </span>
                      )}
                      {user.attendance.status === 'holiday' && user.attendance.holidayName && (
                        <span className="text-sm text-blue-600">
                          {user.attendance.holidayName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <PoundSterling className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                          <Input
                            type="number"
                            placeholder="Daily wage"
                            className="pl-8 w-32"
                            value={dailyWage[user.id] || user.dailyWage || ''}
                            onChange={(e) => setDailyWage(prev => ({ ...prev, [user.id]: e.target.value }))}
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateDailyWage(user.id)}
                          disabled={updateDailyWageMutation.isPending}
                        >
                          Save
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Select
                          value={selectedStatus[user.id] || user.attendance.status}
                          onValueChange={(value) => handleStatusChange(user.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="leave">Leave</SelectItem>
                            <SelectItem value="holiday">Holiday</SelectItem>
                          </SelectContent>
                        </Select>

                        {selectedStatus[user.id] === 'leave' && (
                          <Select
                            value={leaveType[user.id] || ''}
                            onValueChange={(value) => setLeaveType(prev => ({ ...prev, [user.id]: value }))}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Leave type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="annual">Annual</SelectItem>
                              <SelectItem value="sick">Sick</SelectItem>
                              <SelectItem value="unpaid">Unpaid</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                        {selectedStatus[user.id] === 'holiday' && (
                          <input
                            type="text"
                            placeholder="Holiday name"
                            className="px-2 py-1 border rounded"
                            value={holidayName[user.id] || ''}
                            onChange={(e) => setHolidayName(prev => ({ ...prev, [user.id]: e.target.value }))}
                          />
                        )}

                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSaveStatus(user.id)}
                          disabled={markAttendanceMutation.isPending}
                        >
                          Save
                        </Button>
                      </div>
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
