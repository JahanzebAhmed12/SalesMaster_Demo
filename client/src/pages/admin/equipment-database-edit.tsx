import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Save, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Equipment, InsertEquipment } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";

export default function EquipmentDatabaseEdit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get equipment ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const equipmentId = urlParams.get("id");
  const isEditing = !!equipmentId;

  // Form state
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  // Fetch equipment data if editing
  const { data: equipment, isLoading } = useQuery<Equipment>({
    queryKey: ["/api/equipment", equipmentId],
    queryFn: () => apiRequest("GET", `/api/equipment/${equipmentId}`),
    enabled: isEditing,
  });

  // Populate form when editing
  useEffect(() => {
    if (equipment) {
      setDescription(equipment.description);
      setStartDate(new Date(equipment.startDate));
      setEndDate(new Date(equipment.endDate));
    }
  }, [equipment]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: InsertEquipment) => {
      if (isEditing) {
        return apiRequest("PUT", `/api/equipment/${equipmentId}`, data);
      } else {
        return apiRequest("POST", "/api/equipment", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: "Success",
        description: `Equipment ${isEditing ? "updated" : "created"} successfully`,
      });
      setLocation("/admin/equipment-database");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || `Failed to ${isEditing ? "update" : "create"} equipment`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!description.trim()) {
      toast({
        title: "Validation Error",
        description: "Description is required",
        variant: "destructive",
      });
      return;
    }

    if (!endDate) {
      toast({
        title: "Validation Error",
        description: "End date is required",
        variant: "destructive",
      });
      return;
    }

    if (startDate && endDate <= startDate) {
      toast({
        title: "Validation Error",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    const equipmentData = {
      description: description.trim(),
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate: format(endDate, "yyyy-MM-dd"),
      isActive: '1',
    };

    saveMutation.mutate(equipmentData);
  };

  const handleBack = () => {
    setLocation("/admin/equipment-database");
  };

  if (isEditing && isLoading) {
    return (
      <PageLayout title="Loading..." breadcrumb="Admin / Equipment Database / Edit">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading equipment data...</div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title={isEditing ? "Edit Equipment" : "Add New Equipment"} 
      breadcrumb={`Admin / Equipment Database / ${isEditing ? "Edit" : "Add"}`}
    >
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{isEditing ? "Edit Equipment" : "Add New Equipment"}</CardTitle>
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to List
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter equipment description"
                  required
                />
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      fromYear={2000}
                      toYear={2050}
                      captionLayout="dropdown-buttons"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      fromYear={2000}
                      toYear={2050}
                      captionLayout="dropdown-buttons"
                      disabled={(date) => startDate ? date <= startDate : false}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={handleBack}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={saveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending 
                    ? (isEditing ? "Updating..." : "Creating...") 
                    : (isEditing ? "Update Equipment" : "Create Equipment")
                  }
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}