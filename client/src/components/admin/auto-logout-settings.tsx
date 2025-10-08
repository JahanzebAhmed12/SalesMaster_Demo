import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface AutoLogoutSettings {
  enabled: boolean;
  timeoutMinutes: number;
  warningMinutes: number;
}

export const AutoLogoutSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoLogoutSettings>({
    enabled: true,
    timeoutMinutes: 5,
    warningMinutes: 4,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load current settings from backend
    const loadSettings = async () => {
      try {
        const response = await apiRequest('GET', '/api/settings/auto-logout');
        if (response) {
          setSettings(response);
        }
      } catch (error) {
        console.error('Failed to load auto-logout settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiRequest('PUT', '/api/settings/auto-logout', settings);
      toast({
        title: 'Settings Saved',
        description: 'Auto-logout settings have been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save auto-logout settings.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Auto-Logout Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-logout-enabled"
            checked={settings.enabled}
            onCheckedChange={(enabled) => setSettings({ ...settings, enabled })}
          />
          <Label htmlFor="auto-logout-enabled">Enable Auto-Logout</Label>
        </div>

        {settings.enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="timeout-minutes">Logout After (minutes)</Label>
              <Input
                id="timeout-minutes"
                type="number"
                min="1"
                max="60"
                value={settings.timeoutMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    timeoutMinutes: parseInt(e.target.value) || 5,
                  })
                }
              />
              <p className="text-sm text-gray-500">
                Users will be logged out after this many minutes of inactivity.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="warning-minutes">Show Warning At (minutes)</Label>
              <Input
                id="warning-minutes"
                type="number"
                min="1"
                max={settings.timeoutMinutes - 1}
                value={settings.warningMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    warningMinutes: parseInt(e.target.value) || 4,
                  })
                }
              />
              <p className="text-sm text-gray-500">
                Show warning message at this time before logout.
              </p>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};