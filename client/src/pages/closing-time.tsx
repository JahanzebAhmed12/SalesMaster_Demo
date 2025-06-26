// import PageLayout from "@/components/common/page-layout";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Settings, Users, Database, Shield, Bell, Palette } from "lucide-react";

// export default function AdminSetup() {
//   return (
//     <PageLayout title="Admin Setup" breadcrumb="Admin Setup">
//       <div className="space-y-6">
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-2">
//               <Settings size={20} />
//               System Administration
//             </CardTitle>
//           </CardHeader>
//           <CardContent>
//             <div className="text-center py-8">
//               <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
//                 <Settings className="text-gray-400 text-2xl" />
//               </div>
//               <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Setup</h3>
//               <p className="text-gray-500 mb-8">Configure system settings, manage users, and customize your POS system.</p>
//             </div>
//           </CardContent>
//         </Card>

//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
//                   <Users className="text-blue-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">User Management</h4>
//                   <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
//                   <Database className="text-green-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">Data Management</h4>
//                   <p className="text-sm text-gray-500">Backup, restore, and data settings</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
//                   <Shield className="text-orange-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">Security Settings</h4>
//                   <p className="text-sm text-gray-500">Configure security and access controls</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
//                   <Bell className="text-purple-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">Notifications</h4>
//                   <p className="text-sm text-gray-500">Set up alerts and notifications</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
//                   <Palette className="text-pink-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">Customization</h4>
//                   <p className="text-sm text-gray-500">Customize appearance and branding</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>

//           <Card className="hover:shadow-md transition-shadow cursor-pointer">
//             <CardContent className="p-6">
//               <div className="flex items-center gap-4">
//                 <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
//                   <Settings className="text-gray-600" size={24} />
//                 </div>
//                 <div>
//                   <h4 className="font-semibold text-gray-900">System Settings</h4>
//                   <p className="text-sm text-gray-500">General system configuration</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </PageLayout>
//   );
// }
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Save, RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SystemSettings } from "@shared/schema";

export default function AdminSetup() {
  const { toast } = useToast();
  const [closingTime, setClosingTime] = useState("23:59");
  const [timezone, setTimezone] = useState("Europe/London");
  const [autoDateSwitch, setAutoDateSwitch] = useState(true);
  const [weekendHandling, setWeekendHandling] = useState("skip");

  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/settings'],
    queryFn: () => apiRequest<SystemSettings>('GET', '/api/settings'),
  });

  useEffect(() => {
    if (settings) {
      setClosingTime(settings.closingTime);
      setTimezone(settings.timezone);
      setAutoDateSwitch(settings.autoDateSwitch);
      setWeekendHandling(settings.weekendHandling);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<SystemSettings>) => {
      const response = await apiRequest('PUT', '/api/settings', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      if (data.closingTime) setClosingTime(data.closingTime);
      if (data.timezone) setTimezone(data.timezone);
      if (typeof data.autoDateSwitch === 'boolean') setAutoDateSwitch(data.autoDateSwitch);
      if (data.weekendHandling) setWeekendHandling(data.weekendHandling);
      toast({
        title: "Settings Updated",
        description: "System configuration has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update system settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      closingTime,
      timezone,
      autoDateSwitch,
      weekendHandling,
    });
  };

  const handleReset = () => {
    setClosingTime("23:59");
    setTimezone("Europe/London");
    setAutoDateSwitch(true);
    setWeekendHandling("skip");
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getNextBusinessDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getTimeUntilSwitch = () => {
    const now = new Date();
    const [hours, minutes] = closingTime.split(':').map(Number);
    const closingToday = new Date();
    closingToday.setHours(hours, minutes, 0, 0);
    
    if (now > closingToday) {
      closingToday.setDate(closingToday.getDate() + 1);
    }
    
    const diff = closingToday.getTime() - now.getTime();
    const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hoursLeft}h ${minutesLeft}m`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-64 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Closing Time Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> After the closing time, all new entries will be recorded with the next business date.
              This ensures accurate date tracking across different shifts and operations.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="closingTime">Daily Closing Time</Label>
              <Input
                id="closingTime"
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
              />
              <p className="text-xs text-gray-500">Time when system switches to next business date</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Time Zone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/London">GMT (London)</SelectItem>
                  <SelectItem value="Europe/Paris">CET (Paris)</SelectItem>
                  <SelectItem value="America/New_York">EST (New York)</SelectItem>
                  <SelectItem value="Asia/Dubai">GST (Dubai)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoDateSwitch"
                checked={autoDateSwitch}
                onCheckedChange={(checked) => setAutoDateSwitch(checked === true)}
              />
              <Label htmlFor="autoDateSwitch">
                Automatically switch to next business date after closing time
              </Label>
            </div>
            <p className="text-xs text-gray-500 ml-6">
              When enabled, all entries after closing time will use the next business date
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weekendHandling">Weekend Handling</Label>
            <Select value={weekendHandling} onValueChange={setWeekendHandling}>
              <SelectTrigger>
                <SelectValue placeholder="Select weekend handling" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip to next Monday</SelectItem>
                <SelectItem value="saturday">Include Saturday</SelectItem>
                <SelectItem value="both">Include Saturday & Sunday</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">How to handle date switching on weekends</p>
          </div>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-sm text-blue-800">Current System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-600">Current System Date:</p>
                  <p className="font-medium text-blue-900">
                    {new Date().toLocaleDateString('en-GB', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600">Current Time:</p>
                  <p className="font-medium text-blue-900">{getCurrentTime()}</p>
                </div>
                <div>
                  <p className="text-blue-600">Next Business Date:</p>
                  <p className="font-medium text-blue-900">{getNextBusinessDate()}</p>
                </div>
                <div>
                  <p className="text-blue-600">Time Until Switch:</p>
                  <p className="font-medium text-blue-900">{getTimeUntilSwitch()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Default
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
