import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { useBusinessDate } from "@/hooks/use-business-date";

interface BusinessDateDisplayProps {
  className?: string;
}

export default function BusinessDateDisplay({ className = "" }: BusinessDateDisplayProps) {
  const { currentDate, formatBusinessDate, formatShortDate, isLoading } = useBusinessDate();

  if (isLoading) {
    return (
      <Card className={`bg-blue-50 border-blue-200 ${className}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <div className="animate-pulse">
              <div className="h-4 bg-blue-200 rounded w-32"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentDate) {
    return null;
  }

  return (
    <Card className={`bg-blue-50 border-blue-200 ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">Business Date</p>
              <p className="text-xs text-blue-600">{formatShortDate(currentDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Clock className="h-3 w-3" />
            <span>{new Date().toLocaleTimeString('en-GB', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}</span>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs text-blue-700">
            All entries will use: <span className="font-medium">{formatBusinessDate(currentDate)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}