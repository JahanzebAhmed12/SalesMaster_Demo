import { type CSSProperties, type ReactNode, type MutableRefObject } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangeFilterProps {
  from: Date;
  to: Date;
  onFromChange: (date: Date) => void;
  onToChange: (date: Date) => void;
  fromLabel?: string;
  toLabel?: string;
  dateFormat?: string;
  disabled?: boolean;
  fromManuallyChanged?: MutableRefObject<boolean>;
  toManuallyChanged?: MutableRefObject<boolean>;
  buttonClassName?: string;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  children?: ReactNode;
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel = "From Date:",
  toLabel = "To Date:",
  dateFormat = "yyyyMMdd",
  disabled = false,
  fromManuallyChanged,
  toManuallyChanged,
  buttonClassName,
  wrapperClassName,
  wrapperStyle,
  children,
}: DateRangeFilterProps) {
  return (
    <>
      <div className={wrapperClassName} style={wrapperStyle}>
        <Label className="text-sm font-medium">{fromLabel}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal h-10",
                !from && "text-muted-foreground",
                buttonClassName
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {from ? format(from, dateFormat) : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={from}
              onSelect={(date) => {
                if (date) {
                  if (fromManuallyChanged) fromManuallyChanged.current = true;
                  onFromChange(date);
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className={wrapperClassName} style={wrapperStyle}>
        <Label className="text-sm font-medium">{toLabel}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal h-10",
                !to && "text-muted-foreground",
                buttonClassName
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {to ? format(to, dateFormat) : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={to}
              onSelect={(date) => {
                if (date) {
                  if (toManuallyChanged) toManuallyChanged.current = true;
                  onToChange(date);
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {children}
    </>
  );
}
