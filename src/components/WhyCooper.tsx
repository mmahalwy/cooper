import { Container } from "@mantine/core";
import {
  IconBolt,
  IconBrain,
  IconPlugConnected,
  IconShieldCheck,
  IconRefresh,
} from "@tabler/icons-react";
import classes from "./WhyCooper.module.css";

const differentiators = [
  {
    icon: IconBolt,
    title: "Executes, not just generates",
    description:
      "ChatGPT and Copilot produce text you then act on. Cooper connects to your actual tools and completes the work end-to-end — from pulling data to delivering a finished report or opening a PR.",
  },
  {
    icon: IconBrain,
    title: "Persistent context across conversations",
    description:
      "Most AI tools forget everything between sessions. Cooper builds a deep understanding of your team's processes, preferences, and history — so it gets better the more you use it.",
  },
  {
    icon: IconPlugConnected,
    title: "Native tool access, not copy-paste",
    description:
      "Other solutions require you to manually feed data in. Cooper connects directly to 3,000+ tools — Slack, GitHub, HubSpot, Stripe, Linear, Google Ads — and operates inside them natively.",
  },
  {
    icon: IconRefresh,
    title: "Proactive, not reactive",
    description:
      "Cooper doesn't just wait for instructions. It monitors your workflows, flags anomalies, suggests automations, and handles recurring tasks without being asked.",
  },
  {
    icon: IconShieldCheck,
    title: "Enterprise-grade from day one",
    description:
      "SOC2 compliant, end-to-end encryption, workspace-level data isolation, and full audit trails. Built for teams that can't compromise on security.",
    full: true,
  },
];

export function WhyCooper() {
  return (
    <section className={classes.section}>
      <Container size="lg">
        <div className={classes.label}>Why Cooper</div>
        <h2 className={classes.title}>Not another AI wrapper</h2>
        <p className={classes.subtitle}>
          Most AI tools give you text. Cooper gives you outcomes. Here&apos;s
          what makes it fundamentally different.
        </p>

        <div className={classes.grid}>
          {differentiators.map((d) => (
            <div
              className={`${classes.card} ${d.full ? classes.cardFull : ""}`}
              key={d.title}
            >
              <div className={classes.cardIcon}>
                <d.icon size={20} stroke={1.5} />
              </div>
              <div className={classes.cardTitle}>{d.title}</div>
              <div className={classes.cardDesc}>{d.description}</div>
            </div>
          ))}
        </div>

        <div className={classes.comparison}>
          <div className={classes.compTitle}>How Cooper compares</div>
          <table className={classes.table}>
            <thead className={classes.tableHead}>
              <tr>
                <th></th>
                <th>ChatGPT / Claude</th>
                <th>Copilots & Agents</th>
                <th>Cooper</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Connects to your tools</td>
                <td className={classes.dimmed}>Limited plugins</td>
                <td className={classes.dimmed}>1-2 integrations</td>
                <td className={classes.bright}>3,000+ native</td>
              </tr>
              <tr>
                <td>Executes full workflows</td>
                <td className={classes.dimmed}>No</td>
                <td className={classes.dimmed}>Partially</td>
                <td className={classes.bright}>End-to-end</td>
              </tr>
              <tr>
                <td>Remembers context</td>
                <td className={classes.dimmed}>Per session</td>
                <td className={classes.dimmed}>Per session</td>
                <td className={classes.bright}>Persistent</td>
              </tr>
              <tr>
                <td>Produces real deliverables</td>
                <td className={classes.dimmed}>Text only</td>
                <td className={classes.dimmed}>Code snippets</td>
                <td className={classes.bright}>Reports, PRs, apps</td>
              </tr>
              <tr>
                <td>Works where you work</td>
                <td className={classes.dimmed}>Separate tab</td>
                <td className={classes.dimmed}>IDE only</td>
                <td className={classes.bright}>Slack, web, API</td>
              </tr>
              <tr>
                <td>Proactive automation</td>
                <td className={classes.dimmed}>No</td>
                <td className={classes.dimmed}>No</td>
                <td className={classes.bright}>Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
