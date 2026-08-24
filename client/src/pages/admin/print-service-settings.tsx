import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Info, Printer, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/config";

interface PrintServiceSettings {
  salesMasterUrl: string;
  printerName: string;
  pollIntervalMs: number;
}

const DEFAULT_SETTINGS: PrintServiceSettings = {
  salesMasterUrl: "https://tropifruituk.net",
  printerName: "EPSON LQ-350 ESC/P2",
  pollIntervalMs: 10000,
};

export default function PrintServiceSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PrintServiceSettings>(DEFAULT_SETTINGS);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data, isLoading } = useQuery<PrintServiceSettings>({
    queryKey: ["/api/print-service/settings"],
    queryFn: () => apiRequest<PrintServiceSettings>("GET", "/api/print-service/settings"),
  });

  useEffect(() => {
    if (data) {
      setForm({
        salesMasterUrl: data.salesMasterUrl || DEFAULT_SETTINGS.salesMasterUrl,
        printerName: data.printerName || DEFAULT_SETTINGS.printerName,
        pollIntervalMs: Number(data.pollIntervalMs) || DEFAULT_SETTINGS.pollIntervalMs,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (settings: PrintServiceSettings) => apiRequest<PrintServiceSettings>("PUT", "/api/print-service/settings", settings),
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.setQueryData(["/api/print-service/settings"], saved);
      toast({ title: "Settings saved", description: "These values will be embedded in the next package downloaded for this PC." });
    },
    onError: (error: any) => {
      toast({ title: "Unable to save settings", description: error?.message || "Please check the values and try again.", variant: "destructive" });
    },
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(getApiUrl("/api/print-service/package"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/zip",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          pollIntervalMs: Number(form.pollIntervalMs),
        }),
      });

      if (!response.ok) {
        let message = "Failed to create the print-service package.";
        try {
          const errorData = await response.json();
          message = errorData.error || message;
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "salesmaster-print-service.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      toast({ title: "Package downloaded", description: "Run INSTALL-SERVICE.bat as Administrator on the target Windows PC." });
    } catch (error: any) {
      toast({ title: "Package download failed", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const updateField = (field: keyof PrintServiceSettings, value: string) => {
    setForm(current => ({
      ...current,
      [field]: field === "pollIntervalMs" ? Number(value) : value,
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Print Service Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prepare a configuration package for one Windows print PC.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Per-PC connection settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="salesMasterUrl">SalesMaster URL</Label>
              <Input
                id="salesMasterUrl"
                value={form.salesMasterUrl}
                onChange={event => updateField("salesMasterUrl", event.target.value)}
                placeholder="https://your-salesmaster-domain.example"
                disabled={isLoading || saveMutation.isPending || isDownloading}
              />
              <p className="text-xs text-muted-foreground">The Windows service polls this URL for pending print jobs.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="printerName">Windows printer name</Label>
              <Input
                id="printerName"
                value={form.printerName}
                onChange={event => updateField("printerName", event.target.value)}
                placeholder="EPSON LQ-350 ESC/P2"
                disabled={isLoading || saveMutation.isPending || isDownloading}
              />
              <p className="text-xs text-muted-foreground">This must exactly match the printer name shown in Windows.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pollIntervalMs">Polling interval (milliseconds)</Label>
              <Input
                id="pollIntervalMs"
                type="number"
                min={1000}
                max={3600000}
                step={1000}
                value={form.pollIntervalMs}
                onChange={event => updateField("pollIntervalMs", event.target.value)}
                disabled={isLoading || saveMutation.isPending || isDownloading}
              />
              <p className="text-xs text-muted-foreground">Allowed range: 1,000 ms to 3,600,000 ms. The default is 10,000 ms.</p>
            </div>

            <div className="flex flex-wrap gap-3 border-t pt-5">
              <Button type="button" onClick={() => saveMutation.mutate(form)} disabled={isLoading || saveMutation.isPending || isDownloading}>
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              <Button type="button" variant="outline" onClick={handleDownload} disabled={isLoading || saveMutation.isPending || isDownloading}>
                <Download className="mr-2 h-4 w-4" />
                {isDownloading ? "Preparing package..." : "Download Windows Package"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex gap-3 p-5 text-sm text-blue-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold">One active print-service poller</p>
              <p>The current print queue is shared. Run only one installed print service against it at a time; multiple PCs polling the same queue can compete for jobs.</p>
              <p>The downloaded ZIP contains the configured settings, installer and uninstaller scripts, and the service source. The target Windows PC still needs Node.js 18+, Google Chrome, the printer driver, and SumatraPDF.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
