"use client";

import { useState, useEffect, useActionState } from "react";
import { joinWaitlist } from "@/app/actions";
import {
  PlugIcon,
  FileTextIcon,
  BrainIcon,
  ZapIcon,
  ShieldCheckIcon,
  RocketIcon,
  ChevronDownIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const examples = [
  {
    id: "marketing",
    label: "Marketing",
    channel: "#marketing",
    messages: [
      {
        sender: "You",
        time: "10:42 AM",
        text: "@cooper pull this week's campaign performance from Meta and Google Ads, compare against last week, and post a summary here",
      },
      {
        sender: "Cooper",
        time: "10:42 AM",
        text: "Pulling data from Meta Ads and Google Ads...",
      },
      {
        sender: "Cooper",
        time: "10:43 AM",
        text: "Analysis complete. Here's your weekly comparison:",
        card: {
          title: "Campaign Performance — Week over Week",
          rows: [
            { label: "Meta CPA", value: "↓ 12%", good: true },
            { label: "Google ROAS", value: "↑ 8%", good: true },
            { label: "Total Spend", value: "$12,450", good: false },
          ],
        },
        after: "Posted to #marketing. Want me to run this every Monday?",
      },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    channel: "#engineering",
    messages: [
      {
        sender: "You",
        time: "2:15 PM",
        text: "@cooper there's a P1 on incident.io about checkout timeouts. Investigate and propose a fix.",
      },
      {
        sender: "Cooper",
        time: "2:15 PM",
        text: "On it. Pulling incident details from incident.io and correlating with Datadog logs...",
      },
      {
        sender: "Cooper",
        time: "2:18 PM",
        text: "Found it. Root cause identified:",
        card: {
          title: "INC-2847 — Checkout Timeout Investigation",
          rows: [
            { label: "Root cause", value: "Connection pool exhaustion", good: false },
            { label: "Affected", value: "12% of checkout requests", good: false },
            { label: "Since", value: "Deploy #4821 (2h ago)", good: false },
          ],
        },
        after:
          "Opened PR #392 with a fix — increases pool size and adds circuit breaker. Tests passing. Ready for review.",
      },
    ],
  },
  {
    id: "competitive",
    label: "Competitive Intel",
    channel: "#strategy",
    messages: [
      {
        sender: "You",
        time: "9:00 AM",
        text: "@cooper run the weekly competitor analysis — check pricing changes, new features, and any press coverage for Acme, Globex, and Initech.",
      },
      {
        sender: "Cooper",
        time: "9:00 AM",
        text: "Scanning product pages, changelogs, press mentions, and G2 reviews...",
      },
      {
        sender: "Cooper",
        time: "9:03 AM",
        text: "Weekly competitive briefing ready:",
        card: {
          title: "Competitor Moves — Mar 17–24",
          rows: [
            { label: "Acme", value: "Launched AI assistant", good: false },
            { label: "Globex", value: "Dropped price 20%", good: false },
            { label: "Initech", value: "No changes detected", good: false },
          ],
        },
        after:
          "Full report posted to Notion. 3 items flagged as high-priority — want me to create Linear tickets?",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    channel: "#sales-team",
    messages: [
      {
        sender: "You",
        time: "8:30 AM",
        text: "@cooper pull my pipeline from HubSpot. Any deals at risk this quarter? And draft follow-up emails for anything stale over 14 days.",
      },
      {
        sender: "Cooper",
        time: "8:30 AM",
        text: "Pulling your active pipeline from HubSpot...",
      },
      {
        sender: "Cooper",
        time: "8:32 AM",
        text: "Here's your pipeline snapshot:",
        card: {
          title: "Q1 Pipeline — Your Deals",
          rows: [
            { label: "Open pipeline", value: "$485K (23 deals)", good: false },
            { label: "At risk", value: "4 deals, $128K", good: false },
            { label: "Stale > 14 days", value: "6 deals", good: false },
          ],
        },
        after:
          "Drafted 6 follow-up emails — personalized based on last activity. Ready in your drafts.",
      },
    ],
  },
  {
    id: "ops",
    label: "Board Prep",
    channel: "#exec",
    messages: [
      {
        sender: "You",
        time: "4:00 PM",
        text: "@cooper board meeting is Thursday. Assemble the deck — pull MRR from Stripe, pipeline from HubSpot, product metrics from Amplitude, and hiring status from Ashby.",
      },
      {
        sender: "Cooper",
        time: "4:00 PM",
        text: "Connecting to 4 data sources and building your deck...",
      },
      {
        sender: "Cooper",
        time: "4:04 PM",
        text: "Board deck assembled:",
        card: {
          title: "March Board Update — Summary",
          rows: [
            { label: "MRR", value: "$1.2M (↑ 11%)", good: true },
            { label: "Pipeline", value: "$3.4M weighted", good: false },
            { label: "Headcount", value: "47 (+3 offers out)", good: false },
          ],
        },
        after:
          "Full deck with 14 slides ready in Google Slides. Shared with you as editor.",
      },
    ],
  },
];

const features = [
  {
    icon: PlugIcon,
    title: "1,000+ Integrations",
    desc: "Connect Slack, HubSpot, Jira, Salesforce, GitHub, and hundreds more out of the box.",
  },
  {
    icon: FileTextIcon,
    title: "Real Deliverables",
    desc: "Cooper doesn't just answer questions — it creates PRs, decks, reports, and drafts.",
  },
  {
    icon: BrainIcon,
    title: "Deep Memory",
    desc: "Remembers your team's context, preferences, and history across every conversation.",
  },
  {
    icon: ZapIcon,
    title: "Proactive Automation",
    desc: "Set it and forget it. Cooper runs recurring tasks and alerts you when things need attention.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Enterprise Security",
    desc: "SOC 2 Type II, SSO, data residency, and granular permission controls built in.",
  },
  {
    icon: RocketIcon,
    title: "Minutes to Deploy",
    desc: "No complex setup. Invite Cooper to Slack, connect your tools, and start delegating.",
  },
];

const useCases = [
  {
    id: "engineering",
    label: "Engineering",
    description:
      "Cooper monitors your incidents, investigates root causes, opens PRs, and keeps your on-call rotation sane.",
    prompt:
      "@cooper there's a P1 on incident.io about checkout timeouts. Investigate and propose a fix.",
  },
  {
    id: "marketing",
    label: "Marketing",
    description:
      "Pull campaign data across every channel, generate performance reports, and schedule recurring summaries — without leaving Slack.",
    prompt:
      "@cooper pull this week's campaign stats from Meta and Google Ads and compare against last week.",
  },
  {
    id: "sales",
    label: "Sales",
    description:
      "Cooper reviews your pipeline, surfaces at-risk deals, and drafts personalized follow-ups so your reps stay focused on closing.",
    prompt:
      "@cooper which deals in my HubSpot pipeline have gone stale for more than 14 days? Draft follow-ups.",
  },
  {
    id: "ops",
    label: "Operations",
    description:
      "From board decks to hiring dashboards, Cooper pulls data from every tool and assembles the output you actually need.",
    prompt:
      "@cooper board meeting Thursday — pull MRR from Stripe, pipeline from HubSpot, and headcount from Ashby. Build the deck.",
  },
];

const comparisonRows = [
  { feature: "Works inside Slack", cooper: true, chatgpt: false, copilot: "partial" },
  { feature: "Connects to your tools", cooper: true, chatgpt: false, copilot: "partial" },
  { feature: "Creates real deliverables", cooper: true, chatgpt: false, copilot: false },
  { feature: "Proactive automation", cooper: true, chatgpt: false, copilot: false },
  { feature: "Team memory & context", cooper: true, chatgpt: false, copilot: false },
  { feature: "Enterprise security", cooper: true, chatgpt: "partial", copilot: true },
];

const faqs = [
  {
    q: "What is Cooper?",
    a: "Cooper is an AI teammate that lives in your Slack workspace. It connects to the tools your team already uses — like HubSpot, GitHub, Jira, and Stripe — and can take on real work: pulling reports, investigating incidents, drafting emails, building decks, and more.",
  },
  {
    q: "How is Cooper different from ChatGPT or Claude?",
    a: "General-purpose AI assistants are great for answering questions, but they can't act. Cooper has deep integrations with your real tools, remembers your team's context, and produces actual deliverables — not just text responses.",
  },
  {
    q: "Which tools does Cooper integrate with?",
    a: "Cooper supports 1,000+ integrations at launch including Slack, HubSpot, Salesforce, GitHub, Jira, Linear, Notion, Google Workspace, Stripe, Amplitude, Datadog, and many more. Custom integrations via API are also available.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. Cooper is built for enterprise from day one — SOC 2 Type II certified, with SSO, role-based access controls, audit logs, and data residency options. Your data is never used to train models.",
  },
  {
    q: "When will Cooper be available?",
    a: "We're onboarding teams in early access now. Join the waitlist and we'll reach out when a spot opens up. Priority access is given to teams with a clear use case.",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function CooperLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
        <span className="text-white font-bold text-sm">C</span>
      </div>
      <span className="font-semibold text-[#1e3a5f] text-lg tracking-tight">Cooper</span>
    </div>
  );
}

function ChatDemo() {
  const [activeTab, setActiveTab] = useState("marketing");
  const active = examples.find((e) => e.id === activeTab)!;

  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white border border-[#e8e4dd] rounded-xl p-1 w-fit mx-auto flex-wrap justify-center">
          {examples.map((ex) => (
            <button
              key={ex.id}
              onClick={() => setActiveTab(ex.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === ex.id
                  ? "bg-[#1e3a5f] text-white shadow-sm"
                  : "text-[#6b6b6b] hover:text-[#1e3a5f] hover:bg-[#f5f2ed]"
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Chat card */}
        <div className="bg-white border border-[#e8e4dd] rounded-2xl shadow-sm overflow-hidden">
          {/* Channel header */}
          <div className="px-5 py-3 border-b border-[#e8e4dd] flex items-center gap-2">
            <span className="text-[#6b6b6b] text-sm font-medium">{active.channel}</span>
          </div>

          {/* Messages */}
          <div className="p-5 space-y-5">
            {active.messages.map((msg, i) => {
              const isCooper = msg.sender === "Cooper";
              return (
                <div key={i} className="flex gap-3">
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                      isCooper
                        ? "bg-[#1e3a5f] text-white"
                        : "bg-[#e8e4dd] text-[#1e3a5f]"
                    }`}
                  >
                    {isCooper ? "C" : "Y"}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + time */}
                    <div className="flex items-baseline gap-2 mb-1">
                      <span
                        className={`text-sm font-semibold ${
                          isCooper ? "text-[#1e3a5f]" : "text-[#333]"
                        }`}
                      >
                        {msg.sender}
                      </span>
                      <span className="text-xs text-[#aaa]">{msg.time}</span>
                    </div>

                    {/* Message text */}
                    <p className="text-sm text-[#444] leading-relaxed">{msg.text}</p>

                    {/* Data card */}
                    {"card" in msg && msg.card && (
                      <div className="mt-3 bg-[#f5f2ed] border border-[#e8e4dd] rounded-xl p-4">
                        <p className="text-xs font-semibold text-[#1e3a5f] mb-3 uppercase tracking-wide">
                          {msg.card.title}
                        </p>
                        <div className="space-y-2">
                          {msg.card.rows.map((row, j) => (
                            <div key={j} className="flex items-center justify-between">
                              <span className="text-xs text-[#6b6b6b]">{row.label}</span>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  row.good
                                    ? "bg-green-50 text-green-700"
                                    : "bg-white text-[#333] border border-[#e8e4dd]"
                                }`}
                              >
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* After text */}
                    {"after" in msg && msg.after && (
                      <p className="mt-2 text-sm text-[#444] leading-relaxed">{msg.after}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function WaitlistForm() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      return await joinWaitlist(formData);
    },
    null
  );

  return (
    <section id="waitlist" className="py-20 px-6">
      <div className="max-w-xl mx-auto">
        <div className="bg-white border border-[#e8e4dd] rounded-2xl p-10 text-center shadow-sm">
          <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-3">
            Early Access
          </p>
          <h2 className="text-3xl font-bold text-[#1e3a5f] mb-3">
            Get early access to Cooper.
          </h2>
          <p className="text-[#6b6b6b] mb-8 leading-relaxed">
            We&apos;re onboarding a limited number of teams. Drop your email and
            we&apos;ll reach out when a spot opens up.
          </p>

          {state?.success ? (
            <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <CheckIcon className="w-5 h-5" />
              <span className="font-medium">You&apos;re on the list. We&apos;ll be in touch.</span>
            </div>
          ) : (
            <form action={action} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  className="flex-1 px-4 py-3 bg-[#f5f2ed] border border-[#e8e4dd] rounded-xl text-sm text-[#333] placeholder:text-[#aaa] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f]"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="px-5 py-3 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#163050] transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {pending ? "Joining..." : "Join Waitlist"}
                </button>
              </div>
              {state?.error && (
                <p className="text-sm text-red-600 text-left">{state.error}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20 px-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold text-center mb-3">
          FAQ
        </p>
        <h2 className="text-3xl font-bold text-[#1e3a5f] text-center mb-12">
          Common questions
        </h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="bg-white border border-[#e8e4dd] rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="font-semibold text-[#1e3a5f] text-sm pr-4">{faq.q}</span>
                <ChevronDownIcon
                  className={`w-4 h-4 text-[#6b6b6b] flex-shrink-0 transition-transform ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm text-[#6b6b6b] leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Page() {
  const [scrolled, setScrolled] = useState(false);
  const [chatTab, setChatTab] = useState("marketing");
  const [useCaseTab, setUseCaseTab] = useState("engineering");

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const activeUseCase = useCases.find((u) => u.id === useCaseTab)!;
  const activeChatExample = examples.find((e) => e.id === chatTab)!;

  return (
    <div className="min-h-screen bg-[#f5f2ed]">

      {/* ── Navbar ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled ? "bg-white border-b border-[#e8e4dd] shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <CooperLogo />
          <div className="hidden md:flex items-center gap-8">
            {["Features", "How It Works", "Use Cases", "FAQ"].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
                className="text-sm text-[#6b6b6b] hover:text-[#1e3a5f] transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
          <a
            href="#waitlist"
            className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-semibold rounded-lg hover:bg-[#163050] transition-colors"
          >
            Join Waitlist
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-12 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white border border-[#e8e4dd] rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-[#6b6b6b]">Coming Soon</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6 text-[#333]">
            Not a chatbot.{" "}
            <span className="text-[#1e3a5f]">An AI Teammate.</span>
          </h1>

          <p className="text-lg text-[#6b6b6b] leading-relaxed mb-4 max-w-xl mx-auto">
            Cooper is an AI that joins your team, connects to your tools, and actually
            gets work done — not just answers questions.
          </p>

          <p className="text-sm text-[#aaa] mb-10">
            Works in Slack, on the web, and anywhere your team already operates.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#waitlist"
              className="px-7 py-3.5 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#163050] transition-colors text-sm"
            >
              Join the Waitlist →
            </a>
          </div>

          <p className="mt-4 text-xs text-[#aaa]">
            Be the first to know when we launch. No spam, ever.
          </p>
        </div>
      </section>

      {/* ── Chat Demo ── */}
      <section id="how-it-works" className="py-6 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Tab bar */}
          <div className="flex gap-1 mb-6 bg-white border border-[#e8e4dd] rounded-xl p-1 w-fit mx-auto flex-wrap justify-center">
            {examples.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setChatTab(ex.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  chatTab === ex.id
                    ? "bg-[#1e3a5f] text-white shadow-sm"
                    : "text-[#6b6b6b] hover:text-[#1e3a5f] hover:bg-[#f5f2ed]"
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Chat card */}
          <div className="bg-white border border-[#e8e4dd] rounded-2xl shadow-md overflow-hidden">
            {/* Channel header */}
            <div className="px-5 py-3 border-b border-[#e8e4dd] flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="ml-2 text-[#6b6b6b] text-sm font-medium">
                {activeChatExample.channel}
              </span>
            </div>

            {/* Messages */}
            <div className="p-5 space-y-5">
              {activeChatExample.messages.map((msg, i) => {
                const isCooper = msg.sender === "Cooper";
                return (
                  <div key={i} className="flex gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                        isCooper
                          ? "bg-[#1e3a5f] text-white"
                          : "bg-[#e8e4dd] text-[#1e3a5f]"
                      }`}
                    >
                      {isCooper ? "C" : "Y"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className={`text-sm font-semibold ${
                            isCooper ? "text-[#1e3a5f]" : "text-[#333]"
                          }`}
                        >
                          {msg.sender}
                        </span>
                        <span className="text-xs text-[#aaa]">{msg.time}</span>
                      </div>
                      <p className="text-sm text-[#444] leading-relaxed">{msg.text}</p>

                      {"card" in msg && msg.card && (
                        <div className="mt-3 bg-[#f5f2ed] border border-[#e8e4dd] rounded-xl p-4">
                          <p className="text-xs font-semibold text-[#1e3a5f] mb-3 uppercase tracking-wide">
                            {msg.card.title}
                          </p>
                          <div className="space-y-2">
                            {msg.card.rows.map((row, j) => (
                              <div key={j} className="flex items-center justify-between">
                                <span className="text-xs text-[#6b6b6b]">{row.label}</span>
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    row.good
                                      ? "bg-green-50 text-green-700"
                                      : "bg-white text-[#333] border border-[#e8e4dd]"
                                  }`}
                                >
                                  {row.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {"after" in msg && msg.after && (
                        <p className="mt-2 text-sm text-[#444] leading-relaxed">{msg.after}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-3">
              Capabilities
            </p>
            <h2 className="text-3xl font-bold text-[#1e3a5f]">
              Everything a great teammate does
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="bg-white border border-[#e8e4dd] rounded-xl p-6 hover:shadow-sm transition-shadow"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#f5f2ed] flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                  <h3 className="font-semibold text-[#1e3a5f] mb-2">{f.title}</h3>
                  <p className="text-sm text-[#6b6b6b] leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-3">
              How It Works
            </p>
            <h2 className="text-3xl font-bold text-[#1e3a5f]">Up and running in minutes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Connect",
                desc: "Link your tools — Slack, HubSpot, GitHub, Jira, and 1,000+ more. Takes minutes, not days.",
              },
              {
                step: "2",
                title: "Ask",
                desc: 'Just @mention Cooper in Slack or type a request. No prompts to learn, no new interface.',
              },
              {
                step: "3",
                title: "Deliver",
                desc: "Cooper pulls the data, does the work, and posts the result — right where your team is.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#1e3a5f] text-white font-bold text-lg flex items-center justify-center mx-auto mb-4">
                  {s.step}
                </div>
                <h3 className="font-semibold text-[#1e3a5f] text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-[#6b6b6b] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section id="use-cases" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-3">
              Use Cases
            </p>
            <h2 className="text-3xl font-bold text-[#1e3a5f]">
              Built for every team
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-8 bg-white border border-[#e8e4dd] rounded-xl p-1 w-fit mx-auto">
            {useCases.map((u) => (
              <button
                key={u.id}
                onClick={() => setUseCaseTab(u.id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  useCaseTab === u.id
                    ? "bg-[#1e3a5f] text-white shadow-sm"
                    : "text-[#6b6b6b] hover:text-[#1e3a5f] hover:bg-[#f5f2ed]"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-white border border-[#e8e4dd] rounded-2xl p-8">
            <p className="text-[#6b6b6b] leading-relaxed mb-6 text-base">
              {activeUseCase.description}
            </p>
            <div className="bg-[#f5f2ed] border border-[#e8e4dd] rounded-xl p-4">
              <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-2">
                Example prompt
              </p>
              <p className="text-sm text-[#333] font-mono leading-relaxed">
                {activeUseCase.prompt}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison Table ── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-[#1e3a5f] font-semibold mb-3">
              Comparison
            </p>
            <h2 className="text-3xl font-bold text-[#1e3a5f]">
              Why not just use ChatGPT?
            </h2>
          </div>

          <div className="bg-white border border-[#e8e4dd] rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e4dd]">
                  <th className="text-left px-6 py-4 text-[#6b6b6b] font-medium">Feature</th>
                  <th className="px-6 py-4 text-[#1e3a5f] font-bold bg-[#f5f2ed]">Cooper</th>
                  <th className="px-6 py-4 text-[#6b6b6b] font-medium">ChatGPT / Claude</th>
                  <th className="px-6 py-4 text-[#6b6b6b] font-medium">Copilots</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#e8e4dd] last:border-0 ${
                      i % 2 === 0 ? "" : "bg-[#fafaf8]"
                    }`}
                  >
                    <td className="px-6 py-4 text-[#333] font-medium">{row.feature}</td>
                    <td className="px-6 py-4 text-center bg-[#f5f2ed]">
                      {row.cooper === true ? (
                        <CheckIcon className="w-5 h-5 text-green-600 mx-auto" />
                      ) : row.cooper === false ? (
                        <XIcon className="w-4 h-4 text-red-400 mx-auto" />
                      ) : (
                        <span className="text-xs text-[#aaa]">Partial</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {row.chatgpt === true ? (
                        <CheckIcon className="w-5 h-5 text-green-600 mx-auto" />
                      ) : row.chatgpt === false ? (
                        <XIcon className="w-4 h-4 text-red-400 mx-auto" />
                      ) : (
                        <span className="text-xs text-[#aaa]">Partial</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {row.copilot === true ? (
                        <CheckIcon className="w-5 h-5 text-green-600 mx-auto" />
                      ) : row.copilot === false ? (
                        <XIcon className="w-4 h-4 text-red-400 mx-auto" />
                      ) : (
                        <span className="text-xs text-[#aaa]">Partial</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA / Waitlist ── */}
      <WaitlistForm />

      {/* ── FAQ ── */}
      <section id="faq">
        <FAQ />
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#e8e4dd] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <CooperLogo />
          <p className="text-xs text-[#aaa]">
            © {new Date().getFullYear()} Cooper. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
