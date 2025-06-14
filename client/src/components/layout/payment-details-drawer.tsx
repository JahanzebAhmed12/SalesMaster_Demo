import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import PaymentDetails from "./payment-details";
import AdjustmentDetails from "./adjustment-details";

interface PaymentDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PaymentDetailsDrawer = ({ open, onOpenChange }: PaymentDetailsDrawerProps) => {
  const [activeTab, setActiveTab] = useState<"payments" | "adjustments">("payments");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-4xl bg-blue-600">
        <SheetHeader className="relative">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white text-xl font-semibold">
              Payment Details
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-blue-700"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex mt-4">
            <Button
              variant={activeTab === "payments" ? "secondary" : "ghost"}
              className={`rounded-t-lg rounded-b-none ${
                activeTab === "payments" 
                  ? "bg-blue-500 text-white" 
                  : "text-white hover:bg-blue-700"
              }`}
              onClick={() => setActiveTab("payments")}
            >
              Payments
            </Button>
            <Button
              variant={activeTab === "adjustments" ? "secondary" : "ghost"}
              className={`rounded-t-lg rounded-b-none ml-1 ${
                activeTab === "adjustments" 
                  ? "bg-blue-500 text-white" 
                  : "text-white hover:bg-blue-700"
              }`}
              onClick={() => setActiveTab("adjustments")}
            >
              Adjustment
            </Button>
          </div>
        </SheetHeader>

        {/* Content Area */}
        <div className="mt-6 bg-white rounded-lg p-6 h-full">
          {activeTab === "payments" && <PaymentDetails />}
          {activeTab === "adjustments" && <AdjustmentDetails />}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PaymentDetailsDrawer;
