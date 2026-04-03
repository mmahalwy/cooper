'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSettingsAction, updateProfileAction, updateOrgAction } from '@/app/actions';
import { UserIcon, BuildingIcon, GlobeIcon, CpuIcon, CheckIcon } from 'lucide-react';

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const MODELS = [
  { id: 'auto', label: 'Auto (recommended)' },
  { id: 'gemini-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-pro', label: 'Gemini 2.5 Pro' },
];

export function SettingsView() {
  const [profile, setProfile] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [model, setModel] = useState('auto');
  const [orgName, setOrgName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const data = await getSettingsAction();
      if (data.profile) {
        setProfile(data.profile);
        setName(data.profile.name || '');
        setTimezone(data.profile.timezone || 'America/Los_Angeles');
        setModel(data.profile.model_preference || 'auto');
      }
      if (data.org) {
        setOrg(data.org);
        setOrgName(data.org.name || '');
      }
    });
  }, []);

  function showSaved(section: string) {
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  async function saveProfile() {
    startTransition(async () => {
      await updateProfileAction({ name, timezone, model_preference: model });
      showSaved('profile');
    });
  }

  async function saveOrg() {
    startTransition(async () => {
      await updateOrgAction({ name: orgName });
      showSaved('org');
    });
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and workspace</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <UserIcon className="size-4" />
              Profile
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <GlobeIcon className="size-3" /> Timezone
                </label>
                <Select value={timezone} onValueChange={(value) => setTimezone(value || 'America/Los_Angeles')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <CpuIcon className="size-3" /> Default Model
                </label>
                <Select value={model} onValueChange={(value) => setModel(value || 'auto')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {saved === 'profile' && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckIcon className="size-3" /> Saved
                </span>
              )}
              <Button size="sm" onClick={saveProfile} disabled={isPending}>
                Save Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Organization */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <BuildingIcon className="size-4" />
              Workspace
            </h3>

            <div>
              <label className="text-xs text-muted-foreground">Organization Name</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Your organization"
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {saved === 'org' && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckIcon className="size-3" /> Saved
                </span>
              )}
              <Button size="sm" onClick={saveOrg} disabled={isPending}>
                Save Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
