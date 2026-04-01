'use client';

import { useEffect, useState, useTransition } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { checkOnboardingAction, completeOnboardingAction } from '@/app/actions';
import { SparklesIcon, ArrowRightIcon, RocketIcon, PlugIcon, GlobeIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

const TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland',
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return 'America/Los_Angeles'; }
  });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    startTransition(async () => {
      const result = await checkOnboardingAction();
      if (!result.completed) {
        setOpen(true);
        if (result.name) setName(result.name);
        if (result.timezone) setTimezone(result.timezone);
      }
    });
  }, []);

  async function handleComplete() {
    startTransition(async () => {
      await completeOnboardingAction({ name, timezone });
      setOpen(false);
    });
  }

  const steps = [
    // Welcome
    <div key="welcome" className="flex flex-col items-center gap-4 py-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <SparklesIcon className="size-8 text-primary" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Welcome to Cooper</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Cooper is your AI teammate. He connects to your tools, learns how you work,
          and helps you get things done faster.
        </p>
      </div>
      <Button onClick={() => setStep(1)} className="gap-2">
        Get Started <ArrowRightIcon className="size-4" />
      </Button>
    </div>,

    // Profile
    <div key="profile" className="space-y-4 py-4">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">Quick Setup</h2>
        <p className="text-sm text-muted-foreground">Help Cooper work better with you</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Your name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should Cooper call you?"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium flex items-center gap-1">
            <GlobeIcon className="size-3.5" /> Timezone
          </label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
        <Button onClick={() => setStep(2)} disabled={!name.trim()}>Next</Button>
      </div>
    </div>,

    // Ready
    <div key="ready" className="flex flex-col items-center gap-4 py-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-green-500/10">
        <RocketIcon className="size-8 text-green-600" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">You&apos;re all set, {name.split(' ')[0]}!</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Start chatting or connect your tools to unlock Cooper&apos;s full potential.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={() => { handleComplete(); router.push('/connections'); }}>
          <PlugIcon className="size-4" /> Connect Tools
        </Button>
        <Button className="gap-2" onClick={handleComplete}>
          <SparklesIcon className="size-4" /> Start Chatting
        </Button>
      </div>
    </div>,
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 mb-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? 'w-6 bg-primary' : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>
        {steps[step]}
      </DialogContent>
    </Dialog>
  );
}
