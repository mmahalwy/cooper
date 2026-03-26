import { Container, Button } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import classes from "./Pricing.module.css";

const plans = [
  {
    name: "Starter",
    description: "For individuals and small teams getting started",
    price: "Free",
    priceUnit: "",
    priceNote: "$100 in credits included. No card required.",
    featured: false,
    features: [
      "All core features",
      "3,000+ integrations",
      "Slack & Teams support",
      "Reports & dashboards",
      "5 automations",
      "Community support",
    ],
    cta: "Get Started Free",
    ctaVariant: "default" as const,
  },
  {
    name: "Pro",
    description: "For growing teams that need Cooper every day",
    price: "$79",
    priceUnit: "/seat/mo",
    priceNote: "Billed annually. $99 monthly.",
    featured: true,
    features: [
      "Everything in Starter",
      "Unlimited automations",
      "Deep memory & context",
      "Code contributions & PRs",
      "Priority support",
      "Custom integrations",
    ],
    cta: "Start Free Trial",
    ctaVariant: "gradient" as const,
  },
  {
    name: "Enterprise",
    description: "For organizations with advanced security needs",
    price: "Custom",
    priceUnit: "",
    priceNote: "Volume pricing available.",
    featured: false,
    features: [
      "Everything in Pro",
      "SOC2 & SSO",
      "Role-based access controls",
      "Dedicated account manager",
      "Custom SLA",
      "On-prem deployment option",
    ],
    cta: "Talk to Sales",
    ctaVariant: "default" as const,
  },
];

export function Pricing() {
  return (
    <section className={classes.section} id="pricing">
      <Container size="lg">
        <div className={classes.label}>Pricing</div>
        <h2 className={classes.title}>Start free. Scale as you grow.</h2>
        <p className={classes.subtitle}>
          Every plan includes all core features and 3,000+ integrations. No
          hidden fees.
        </p>

        <div className={classes.cards}>
          {plans.map((plan) => (
            <div
              className={`${classes.card} ${
                plan.featured ? classes.featured : ""
              }`}
              key={plan.name}
            >
              {plan.featured && (
                <div className={classes.featuredBadge}>Most Popular</div>
              )}
              <div className={classes.planName}>{plan.name}</div>
              <div className={classes.planDesc}>{plan.description}</div>
              <div className={classes.price}>
                {plan.price}
                {plan.priceUnit && (
                  <span className={classes.priceUnit}>{plan.priceUnit}</span>
                )}
              </div>
              <div className={classes.priceNote}>{plan.priceNote}</div>

              <ul className={classes.features}>
                {plan.features.map((feature) => (
                  <li className={classes.feature} key={feature}>
                    <IconCheck size={16} className={classes.featureIcon} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                fullWidth
                size="md"
                variant={plan.ctaVariant}
                gradient={
                  plan.ctaVariant === "gradient"
                    ? { from: "blue", to: "violet" }
                    : undefined
                }
                styles={
                  plan.ctaVariant === "default"
                    ? {
                        root: {
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#fff",
                        },
                      }
                    : undefined
                }
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
