"use client";

import { useState } from "react";
import { Container } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import classes from "./FAQ.module.css";

const faqs = [
  {
    q: "How is Cooper different from ChatGPT or other AI tools?",
    a: "Most AI tools generate text — Cooper generates outcomes. It connects directly to your tools (Slack, GitHub, HubSpot, Stripe, etc.), executes multi-step workflows, and delivers real results like reports, PRs, dashboards, and published content. It's not a chatbot — it's a teammate.",
  },
  {
    q: "How long does it take to set up?",
    a: "About 2 minutes. Add Cooper to Slack or Teams, connect the tools you use, and start asking. There's no onboarding sprint, no engineering tickets, and no configuration files.",
  },
  {
    q: "Is my data safe?",
    a: "Cooper is SOC2 Type II certified with end-to-end encryption (TLS in transit, AES-256 at rest). Your data is isolated per workspace, never used to train models, and every action is logged in a full audit trail.",
  },
  {
    q: "Can Cooper access all my Slack messages?",
    a: "No. Cooper only reads messages in channels it's been invited to or direct messages sent to it. It cannot access private channels or DMs it's not part of.",
  },
  {
    q: "Does Cooper work with my existing tools?",
    a: "Cooper integrates with 3,000+ tools out of the box — including Slack, Teams, GitHub, Linear, Jira, HubSpot, Salesforce, Stripe, Google Ads, Meta Ads, Notion, Google Sheets, and many more. Enterprise plans include custom integrations.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Your free plan includes $100 in credits. When they run out, you can upgrade to Pro starting at $79/seat/month. No surprises — Cooper will notify you before credits run low.",
  },
  {
    q: "Can my whole team use Cooper?",
    a: "Yes. Cooper operates at the workspace level. Anyone in the connected workspace can @cooper. Integrations are shared across the team, and Cooper learns from collective context to serve everyone better.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className={classes.section}>
      <Container size="lg">
        <div className={classes.label}>FAQ</div>
        <h2 className={classes.title}>Common questions</h2>

        <div className={classes.list}>
          {faqs.map((faq, i) => (
            <div className={classes.item} key={i}>
              <button
                className={classes.trigger}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {faq.q}
                <IconChevronDown
                  size={18}
                  className={`${classes.chevron} ${
                    openIndex === i ? classes.chevronOpen : ""
                  }`}
                />
              </button>
              <div
                className={`${classes.content} ${
                  openIndex === i ? classes.contentOpen : ""
                }`}
              >
                <div className={classes.answer}>{faq.a}</div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
