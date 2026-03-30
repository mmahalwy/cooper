"use client";

import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import classes from "./Hero.module.css";

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
        text: "Pulling data from Meta Ads and Google Ads\u2026",
      },
      {
        sender: "Cooper",
        time: "10:43 AM",
        text: "Analysis complete. Here's your weekly comparison:",
        card: {
          title: "Campaign Performance \u2014 Week over Week",
          rows: [
            { label: "Meta CPA", value: "\u2193 12%", good: true },
            { label: "Google ROAS", value: "\u2191 8%", good: true },
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
        text: "On it. Pulling incident details from incident.io and correlating with Datadog logs\u2026",
      },
      {
        sender: "Cooper",
        time: "2:18 PM",
        text: "Found it. Root cause identified:",
        card: {
          title: "INC-2847 \u2014 Checkout Timeout Investigation",
          rows: [
            { label: "Root cause", value: "Connection pool exhaustion", good: false },
            { label: "Affected", value: "12% of checkout requests", good: false },
            { label: "Since", value: "Deploy #4821 (2h ago)", good: false },
          ],
        },
        after: "Opened PR #392 with a fix \u2014 increases pool size and adds circuit breaker. Tests passing. Ready for review.",
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
        text: "@cooper run the weekly competitor analysis \u2014 check pricing changes, new features, and any press coverage for Acme, Globex, and Initech.",
      },
      {
        sender: "Cooper",
        time: "9:00 AM",
        text: "Scanning product pages, changelogs, press mentions, and G2 reviews\u2026",
      },
      {
        sender: "Cooper",
        time: "9:03 AM",
        text: "Weekly competitive briefing ready:",
        card: {
          title: "Competitor Moves \u2014 Mar 17\u201324",
          rows: [
            { label: "Acme", value: "Launched AI assistant", good: false },
            { label: "Globex", value: "Dropped price 20%", good: false },
            { label: "Initech", value: "No changes detected", good: false },
          ],
        },
        after: "Full report posted to Notion. 3 items flagged as high-priority \u2014 want me to create Linear tickets?",
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
        text: "Pulling your active pipeline from HubSpot\u2026",
      },
      {
        sender: "Cooper",
        time: "8:32 AM",
        text: "Here's your pipeline snapshot:",
        card: {
          title: "Q1 Pipeline \u2014 Your Deals",
          rows: [
            { label: "Open pipeline", value: "$485K (23 deals)", good: false },
            { label: "At risk", value: "4 deals, $128K", good: false },
            { label: "Stale > 14 days", value: "6 deals", good: false },
          ],
        },
        after: "Drafted 6 follow-up emails \u2014 personalized based on last activity. Ready in your drafts. Want me to also set up auto-reminders?",
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
        text: "@cooper board meeting is Thursday. Assemble the deck \u2014 pull MRR from Stripe, pipeline from HubSpot, product metrics from Amplitude, and hiring status from Ashby.",
      },
      {
        sender: "Cooper",
        time: "4:00 PM",
        text: "Connecting to 4 data sources and building your deck\u2026",
      },
      {
        sender: "Cooper",
        time: "4:04 PM",
        text: "Board deck assembled:",
        card: {
          title: "March Board Update \u2014 Summary",
          rows: [
            { label: "MRR", value: "$1.2M (\u2191 11%)", good: true },
            { label: "Pipeline", value: "$3.4M weighted", good: false },
            { label: "Headcount", value: "47 (+3 offers out)", good: false },
          ],
        },
        after: "Full deck with 14 slides ready in Google Slides. Shared with you as editor. Want me to schedule a review with the exec team?",
      },
    ],
  },
];

export function Hero() {
  const [activeExample, setActiveExample] = useState("marketing");
  const example = examples.find((e) => e.id === activeExample)!;

  return (
    <section className={classes.hero}>
      <div className={classes.container}>
        <div className={classes.badge}>
          <span className={classes.badgeDot} />
          Coming Soon
        </div>

        <h1 className={classes.title}>
          Not a chatbot.
          <br />
          <span className={classes.gradient}>An AI Teammate.</span>
        </h1>

        <p className={classes.subtitle}>
          Cooper connects to your tools, stitches together data from every
          source, and does the actual work — proactively, like a real teammate.
        </p>

        <div className={classes.platforms}>
          Works in <span className={classes.platformHighlight}>Slack</span>,
          on the <span className={classes.platformHighlight}>web</span>, or
          wherever your team operates.
        </div>

        <div className={classes.ctas}>
          <a href="#waitlist" className={classes.button}>
            Join the Waitlist
            <ArrowRightIcon size={16} />
          </a>
        </div>

        <div className={classes.social}>
          <span>Be first to know when Cooper launches.</span>
        </div>

        <div className={classes.exampleTabs}>
          {examples.map((ex) => (
            <button
              key={ex.id}
              className={`${classes.exampleTab} ${activeExample === ex.id ? classes.exampleTabActive : ""}`}
              onClick={() => setActiveExample(ex.id)}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className={classes.chatWindow}>
          <div className={classes.chatHeader}>
            <div className={classes.chatHeaderDot} />
            <span className={classes.chatHeaderTitle}>{example.channel}</span>
          </div>
          <div className={classes.chatMessages}>
            {example.messages.map((msg, i) => (
              <div className={classes.message} key={i}>
                <div className={`${classes.avatar} ${msg.sender === "Cooper" ? classes.avatarCooper : ""}`}>
                  {msg.sender === "Cooper" ? "C" : "Y"}
                </div>
                <div className={classes.messageBody}>
                  <div className={classes.messageMeta}>
                    <span className={classes.messageName}>{msg.sender}</span>
                    {msg.sender === "Cooper" && <span className={classes.messageTag}>APP</span>}
                    <span className={classes.messageTime}>{msg.time}</span>
                  </div>
                  <div className={classes.messageText}>
                    {msg.text}
                    {msg.card && (
                      <div className={classes.messageCard}>
                        <div className={classes.messageCardTitle}>{msg.card.title}</div>
                        {msg.card.rows.map((row, j) => (
                          <div className={classes.messageCardRow} key={j}>
                            <span>{row.label}</span>
                            <span className={row.good ? classes.messageCardGood : undefined}>
                              {row.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.after && <>{msg.after}</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
