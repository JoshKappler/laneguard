"use client";

import Link from "next/link";
import { useBench } from "@/lib/ui/useBench";

const PAGES = [
  { href: "/", key: "setup", label: "1 setup" },
  { href: "/run", key: "run", label: "2 run" },
  { href: "/results", key: "results", label: "3 results" },
  { href: "/writeup", key: "writeup", label: "writeup" },
];

const badgeClass = (v: string) =>
  v === "HUMAN" ? "human" : v === "SUSPECT" ? "suspect" : v === "BOT" ? "bot" : "na";

export function NavBar({ page }: { page: string }) {
  const { controller, config, snapshot } = useBench();
  const verdict = snapshot?.ready ? snapshot.verdict : "…";
  return (
    <nav className="navbar">
      {PAGES.map((p) => (
        <Link key={p.key} href={p.href} className={page === p.key ? "on" : ""}>
          {p.label}
        </Link>
      ))}
      <span className="right">
        <span>{config.mode}</span>
        <span>{controller ? controller.clock() : ""}</span>
        {snapshot && (
          <span className={"badge " + badgeClass(verdict)} style={{ fontSize: 10, padding: "2px 7px" }}>
            {verdict}
          </span>
        )}
      </span>
    </nav>
  );
}
