"use client";

import { useState } from "react";
import { Container } from "@mantine/core";
import {
  IconChartBar,
  IconCode,
  IconSpeakerphone,
  IconSettings,
  IconReportAnalytics,
  IconGitPullRequest,
  IconBug,
  IconServer,
  IconTargetArrow,
  IconArticle,
  IconUsers,
  IconFileSpreadsheet,
  IconPresentationAnalytics,
  IconFileInvoice,
  IconTrendingUp,
  IconArrowsShuffle,
} from "@tabler/icons-react";
import classes from "./UseCases.module.css";

const roles = [
  {
    id: "founders",
    label: "Founders & CEOs",
    cases: [
      {
        icon: IconChartBar,
        title: "Live Business Pulse",
        description:
          "MRR, churn, CAC delivered to Slack daily. Always know where you stand without digging through dashboards.",
      },
      {
        icon: IconPresentationAnalytics,
        title: "Investor Updates on Autopilot",
        description:
          "Monthly board decks assembled from live data — Stripe, CRM, product metrics — formatted and ready to send.",
      },
      {
        icon: IconTargetArrow,
        title: "Outbound That Runs Itself",
        description:
          "Lead lists built, enriched, and sequenced. Cooper handles prospecting so you can focus on closing.",
      },
      {
        icon: IconSettings,
        title: "Internal Tools in Minutes",
        description:
          "Dashboards, admin panels, approval workflows — deployed and working without engineering tickets.",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Growth",
    cases: [
      {
        icon: IconReportAnalytics,
        title: "Full-Funnel Ad Intelligence",
        description:
          "Spend, CAC, and ROAS across all channels — with alerts when metrics drift outside targets.",
      },
      {
        icon: IconArticle,
        title: "Content Engine",
        description:
          "Blog posts, email copy, social content — written, formatted, and published directly to your CMS.",
      },
      {
        icon: IconUsers,
        title: "Pipeline Builder",
        description:
          "Prospect lists from Apollo to HubSpot, enriched and sequenced with personalized outbound.",
      },
      {
        icon: IconSpeakerphone,
        title: "Stakeholder Reporting",
        description:
          "Polished PDF performance reports assembled and distributed on schedule. No manual work.",
      },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    cases: [
      {
        icon: IconBug,
        title: "Intelligent Bug Triage",
        description:
          "Monitors support channels, categorizes issues, and opens scoped tickets in Linear or Jira automatically.",
      },
      {
        icon: IconGitPullRequest,
        title: "Code Contributions",
        description:
          "Cooper clones the repo, writes fixes, runs tests, and opens PRs. You review — it does the rest.",
      },
      {
        icon: IconCode,
        title: "Full-Stack Internal Tools",
        description:
          "Dashboards, admin panels, and data views — built and deployed without context-switching.",
      },
      {
        icon: IconServer,
        title: "Incident Response",
        description:
          "Queries logs, summarizes root cause, drafts post-mortems, and follows up on action items.",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations & Finance",
    cases: [
      {
        icon: IconFileSpreadsheet,
        title: "Board Pack Assembly",
        description:
          "Stripe, CRM, Google Sheets data pulled and formatted into polished board-ready updates.",
      },
      {
        icon: IconFileInvoice,
        title: "Document Processing",
        description:
          "PDF reading, invoice matching, line-item extraction — automated end-to-end.",
      },
      {
        icon: IconTrendingUp,
        title: "Forecast & Model Refresh",
        description:
          "Financial models updated with live data, variance analysis highlighted, shared with stakeholders.",
      },
      {
        icon: IconArrowsShuffle,
        title: "Cross-Team Automation",
        description:
          "Track inputs across teams, nudge owners, sync data between tools — zero manual coordination.",
      },
    ],
  },
];

export function UseCases() {
  const [activeRole, setActiveRole] = useState("founders");
  const currentRole = roles.find((r) => r.id === activeRole)!;

  return (
    <section className={classes.section} id="use-cases">
      <Container size="lg">
        <div className={classes.label}>Use Cases</div>
        <h2 className={classes.title}>Built for every team</h2>
        <p className={classes.subtitle}>
          Whether you&apos;re a founder, marketer, engineer, or ops lead —
          Cooper handles the work so you can focus on what matters.
        </p>

        <div className={classes.tabs}>
          {roles.map((role) => (
            <button
              key={role.id}
              className={`${classes.tab} ${
                activeRole === role.id ? classes.tabActive : ""
              }`}
              onClick={() => setActiveRole(role.id)}
            >
              {role.label}
            </button>
          ))}
        </div>

        <div className={classes.grid}>
          {currentRole.cases.map((useCase) => (
            <div className={classes.card} key={useCase.title}>
              <div className={classes.cardIcon}>
                <useCase.icon size={24} />
              </div>
              <div className={classes.cardTitle}>{useCase.title}</div>
              <div className={classes.cardDesc}>{useCase.description}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
