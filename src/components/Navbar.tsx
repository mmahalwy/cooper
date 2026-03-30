"use client";

import { useState } from "react";
import classes from "./Navbar.module.css";

const links = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
];

export function Navbar() {
  const [opened, setOpened] = useState(false);

  return (
    <header className={classes.header}>
      <div className={classes.container}>
        <div className={classes.inner}>
          <div className={classes.logo}>
            <div className={classes.logoIcon}>C</div>
            Cooper
          </div>

          <nav className={classes.links}>
            {links.map((link) => (
              <a key={link.label} href={link.href} className={classes.link}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className={classes.cta}>
            <a href="#waitlist" className={classes.ctaButton}>
              Join Waitlist
            </a>
          </div>

          <button
            className={classes.burger}
            onClick={() => setOpened((o) => !o)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>
      </div>

      {opened && (
        <div className={classes.mobileMenu}>
          <div className={classes.mobileMenuHeader}>
            <span className={classes.mobileMenuTitle}>Cooper</span>
            <button
              className={classes.mobileMenuClose}
              onClick={() => setOpened(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <div className={classes.mobileMenuLinks}>
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={classes.link}
                onClick={() => setOpened(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#waitlist"
              className={classes.ctaButtonFull}
              onClick={() => setOpened(false)}
            >
              Join Waitlist
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
