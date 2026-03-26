import { Container } from "@mantine/core";
import {
  IconShieldLock,
  IconLock,
  IconEye,
  IconCertificate,
} from "@tabler/icons-react";
import classes from "./Security.module.css";

const items = [
  {
    icon: IconCertificate,
    title: "SOC2 Compliant",
    description: "Type II certified with annual audits and continuous monitoring.",
  },
  {
    icon: IconLock,
    title: "End-to-End Encryption",
    description:
      "TLS in transit, AES-256 at rest. Your data is always encrypted.",
  },
  {
    icon: IconEye,
    title: "Full Audit Trail",
    description:
      "Every action Cooper takes is logged and reviewable by your team.",
  },
  {
    icon: IconShieldLock,
    title: "Role-Based Access",
    description:
      "Granular permissions. Control exactly what Cooper can access and do.",
  },
];

export function Security() {
  return (
    <section className={classes.section} id="security">
      <Container size="lg">
        <div className={classes.label}>Security</div>
        <h2 className={classes.title}>Enterprise-grade by default</h2>
        <p className={classes.subtitle}>
          Cooper is built for teams that take security seriously. Your data never
          trains models and is isolated per workspace.
        </p>

        <div className={classes.grid}>
          {items.map((item) => (
            <div className={classes.card} key={item.title}>
              <div className={classes.cardIcon}>
                <item.icon size={28} />
              </div>
              <div className={classes.cardTitle}>{item.title}</div>
              <div className={classes.cardDesc}>{item.description}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
