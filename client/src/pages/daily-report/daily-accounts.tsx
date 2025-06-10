import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Book } from "lucide-react";

export default function DailyAccounts() {
  return (
    <PageLayout title="Daily Accounts" breadcrumb="Daily Accounts">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book size={20} />
            Daily Accounts Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Book className="text-gray-400 text-2xl" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Daily Accounts</h3>
            <p className="text-gray-500 mb-6">Comprehensive daily accounting summary and financial overview.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Account Summary</h4>
                <p className="text-sm text-gray-500">Daily financial summary</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Cash Flow</h4>
                <p className="text-sm text-gray-500">Daily cash movements</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Reconciliation</h4>
                <p className="text-sm text-gray-500">Account balance verification</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
