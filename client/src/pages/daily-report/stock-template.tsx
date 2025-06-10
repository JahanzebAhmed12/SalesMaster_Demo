import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { File } from "lucide-react";

export default function StockTemplate() {
  return (
    <PageLayout title="Stock Template" breadcrumb="Stock Template">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <File size={20} />
            Stock Template & Sales Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <File className="text-gray-400 text-2xl" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Stock Template</h3>
            <p className="text-gray-500 mb-6">Print-ready stock templates and sales analysis reports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Template Design</h4>
                <p className="text-sm text-gray-500">Customizable stock templates</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Print Options</h4>
                <p className="text-sm text-gray-500">Various print formats</p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Sales Analysis</h4>
                <p className="text-sm text-gray-500">Integrated sales insights</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
