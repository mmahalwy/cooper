import { Container } from "@mantine/core";
import {
  IconPlug,
  IconBrain,
  IconFileText,
  IconRefresh,
  IconShieldCheck,
  IconRocket,
} from "@tabler/icons-react";
import classes from "./Features.module.css";

const features = [
  {
    icon: IconPlug,
    title: "3,000+ Integrations",
    description:
      "Connects to Slack, GitHub, Linear, HubSpot, Stripe, Google Ads, Meta, Notion, and thousands more — out of the box.",
  },
  {
    icon: IconFileText,
    title: "Real Deliverables",
    description:
      "Not just text. Cooper produces reports, spreadsheets, decks, dashboards, code, and deployed apps.",
  },
  {
    icon: IconBrain,
    title: "Deep Memory",
    description:
      "Cooper learns your preferences, processes, and context over time. Never repeat yourself — it remembers what works.",
  },
  {
    icon: IconRefresh,
    title: "Proactive Automation",
    description:
      "Cooper doesn't wait to be asked. It identifies repetitive workflows and suggests automations to save your team hours.",
  },
  {
    icon: IconShieldCheck,
    title: "Enterprise-Grade Security",
    description:
      "SOC2 compliant, end-to-end encryption, role-based access controls, and complete audit trails for every action.",
  },
  {
    icon: IconRocket,
    title: "Minutes to Deploy",
    description:
      "Add Cooper to Slack or Teams, connect your tools, and start delegating. No engineering tickets, no setup sprints.",
  },
];

export function Features() {
  return (
    <section className={classes.section} id="features">
      <Container size="lg">
        <div className={classes.label}>Capabilities</div>
        <h2 className={classes.title}>Everything a great teammate does</h2>
        <p className={classes.subtitle}>
          Cooper doesn&apos;t just answer questions. It connects, executes, learns,
          and delivers — across every tool in your stack.
        </p>

        <div className={classes.grid}>
          {features.map((feature) => (
            <div className={classes.card} key={feature.title}>
              <div className={classes.icon}>
                <feature.icon size={24} />
              </div>
              <div className={classes.cardTitle}>{feature.title}</div>
              <div className={classes.cardDesc}>{feature.description}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
