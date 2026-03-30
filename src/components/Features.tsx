import {
  PlugIcon,
  BrainIcon,
  FileTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  RocketIcon,
} from "lucide-react";
import classes from "./Features.module.css";

const features = [
  {
    icon: PlugIcon,
    title: "3,000+ Integrations",
    description:
      "Connects to Slack, GitHub, Linear, HubSpot, Stripe, Google Ads, Meta, Notion, and thousands more — out of the box.",
  },
  {
    icon: FileTextIcon,
    title: "Real Deliverables",
    description:
      "Not just text. Cooper produces reports, spreadsheets, decks, dashboards, code, and deployed apps.",
  },
  {
    icon: BrainIcon,
    title: "Deep Memory",
    description:
      "Cooper learns your preferences, processes, and context over time. Never repeat yourself — it remembers what works.",
  },
  {
    icon: RefreshCwIcon,
    title: "Proactive Automation",
    description:
      "Cooper doesn't wait to be asked. It identifies repetitive workflows and suggests automations to save your team hours.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Enterprise-Grade Security",
    description:
      "SOC2 compliant, end-to-end encryption, role-based access controls, and complete audit trails for every action.",
  },
  {
    icon: RocketIcon,
    title: "Minutes to Deploy",
    description:
      "Add Cooper to Slack or Teams, connect your tools, and start delegating. No engineering tickets, no setup sprints.",
  },
];

export function Features() {
  return (
    <section className={classes.section} id="features">
      <div className={classes.container}>
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
      </div>
    </section>
  );
}
